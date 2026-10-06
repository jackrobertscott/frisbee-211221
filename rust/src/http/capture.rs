//! Port of `server/src/http/capture.ts`: turns a handler's result into the
//! HTTP response, and every error into the serialised JSON error body (or a
//! tarpit when the error carries a tarpit plan), logging as the TS server does.

use super::tarpit::{Tarpit, TarpitPlan};
use crate::log;
use crate::shared::errors::{
    AppError, ErrorOptions, SerializeOptions, get_status_text, http_status, internal_error,
    serialize_error,
};
use axum::body::Body;
use axum::http::{HeaderValue, Response, StatusCode};
use serde_json::Value;

/// What a handler produced (the value micro would `send`).
pub enum Reply {
    /// An object or array, sent as JSON with status 200.
    Json(Value),
    /// `null`/`undefined`: an empty 204.
    Empty,
    /// A response the handler built itself (e.g. a file download).
    Response(Response<Body>),
}

impl std::fmt::Debug for Reply {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Reply::Json(value) => write!(f, "Reply::Json({value})"),
            Reply::Empty => write!(f, "Reply::Empty"),
            Reply::Response(response) => write!(f, "Reply::Response({})", response.status()),
        }
    }
}

/// The request details the log line and error body mention.
#[derive(Clone, Debug, Default)]
pub struct RequestInfo {
    pub method: String,
    /// The raw request target (`req.url`).
    pub url: String,
}

/// The fields of a serialised error the log line uses.
#[derive(Clone, Debug, Default)]
pub struct PrettyLine {
    pub status_code: u16,
    pub status: String,
    pub message: String,
    pub url: Option<String>,
}

/// `capture.shouldLogError(error)`: everything except 404s.
pub fn should_log_error(error: &AppError) -> bool {
    error.status_code != http_status::NOT_FOUND
}

/// `capture.formatLogLine(pretty, req)`.
pub fn format_log_line(pretty: &PrettyLine, req: Option<&RequestInfo>) -> String {
    let status = if pretty.status.is_empty() {
        "Unknown".to_string()
    } else {
        pretty.status.clone()
    };
    let method = req
        .map(|r| r.method.clone())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "UNKNOWN".into());
    let url = pretty
        .url
        .clone()
        .filter(|u| !u.is_empty())
        .or_else(|| req.map(|r| r.url.clone()).filter(|u| !u.is_empty()))
        .unwrap_or_else(|| "/".into());
    let mut parts = vec![
        "[error]".to_string(),
        pretty.status_code.to_string(),
        status,
        method,
        url,
    ];
    let message =
        crate::js::trim(&crate::js::replace_whitespace_runs(&pretty.message, " ")).to_string();
    if !message.is_empty() {
        parts.push(message);
    }
    parts.join(" | ")
}

/// `capture.pretty(error, req)`: the serialised error plus the request url.
pub fn pretty(error: &AppError, req: &RequestInfo, is_production: bool) -> Value {
    let include_debug_details = !is_production;
    let serialized = serialize_error(
        error.clone().into(),
        SerializeOptions {
            redact_internal_message: is_production,
            include_details: include_debug_details,
            include_meta: include_debug_details,
            include_stack_lines: include_debug_details,
        },
    );
    let mut value = serialized.to_value();
    if let Value::Object(map) = &mut value {
        map.insert("url".into(), Value::String(req.url.clone()));
    }
    value
}

fn pretty_line(value: &Value) -> PrettyLine {
    PrettyLine {
        status_code: value
            .get("statusCode")
            .and_then(Value::as_u64)
            .unwrap_or(500) as u16,
        status: value
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        message: value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        url: value.get("url").and_then(Value::as_str).map(str::to_string),
    }
}

/// micro's `send(res, code, obj)` for JSON values.
pub fn json_response(status_code: u16, value: &Value) -> Response<Body> {
    let text = crate::js::stringify(value);
    let length = text.len();
    let mut response = Response::new(Body::from(text));
    *response.status_mut() =
        StatusCode::from_u16(status_code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let headers = response.headers_mut();
    headers.insert(
        "content-type",
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    headers.insert("content-length", HeaderValue::from(length));
    response
}

/// micro's `send(res, 204, null)`.
pub fn empty_response() -> Response<Body> {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = StatusCode::NO_CONTENT;
    response
}

/// Logs and renders an error response (`capture.handle`'s catch block).
pub fn error_response(
    error: AppError,
    req: &RequestInfo,
    is_production: bool,
    tarpit: &Tarpit,
) -> Response<Body> {
    if let Some(plan) = TarpitPlan::from_value(error.tarpit.as_ref()) {
        if should_log_error(&error) {
            let pretty = pretty(&error, req, is_production);
            log::error(format_log_line(&pretty_line(&pretty), Some(req)));
        }
        return tarpit.respond(&plan);
    }
    let pretty = pretty(&error, req, is_production);
    let line = pretty_line(&pretty);
    if should_log_error(&error) {
        log::error(format_log_line(&line, Some(req)));
    }
    json_response(line.status_code, &pretty)
}

/// `capture.handle(handler)`: renders the handler's result, rejecting
/// results that are not objects, arrays or null.
pub fn handle(
    result: Result<Reply, AppError>,
    req: &RequestInfo,
    is_production: bool,
    tarpit: &Tarpit,
) -> Response<Body> {
    let result = result.and_then(|reply| match reply {
        Reply::Json(Value::Null) => Ok(Reply::Empty),
        Reply::Json(value @ (Value::Object(_) | Value::Array(_))) => Ok(Reply::Json(value)),
        Reply::Json(other) => {
            let kind = match other {
                Value::String(_) => "string",
                Value::Number(_) => "number",
                _ => "boolean",
            };
            Err(internal_error(
                Some(&format!(
                    "Request handler may only return an object or an array but got {kind}."
                )),
                ErrorOptions::code("request.invalid_handler_response"),
            ))
        }
        other => Ok(other),
    });
    match result {
        Ok(Reply::Json(value)) => json_response(200, &value),
        Ok(Reply::Empty) => empty_response(),
        Ok(Reply::Response(response)) => response,
        Err(error) => error_response(error, req, is_production, tarpit),
    }
}

/// The status text for a code, as `serializeError` reports it.
pub fn status_text(status_code: u16) -> &'static str {
    get_status_text(status_code)
}

#[cfg(test)]
#[path = "capture_tests.rs"]
mod tests;
