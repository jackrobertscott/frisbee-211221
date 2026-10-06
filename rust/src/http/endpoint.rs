//! Port of `server/src/http/createEndpoint.ts`: binds a handler to an
//! endpoint definition, checks the request origin, reads the `{payload}`
//! body and validates it against the definition's payload schema.
//!
//! ```ignore
//! Endpoint::new(&contract::season::SEASON_CREATE, |payload: SeasonCreatePayload, ctx: Ctx| async move {
//!     ctx.require_access().await?;
//!     SEASON.create_one(ctx.db(), payload).await
//! })
//! ```

use super::body::read_json;
use super::capture::Reply;
use super::headers::header;
use super::intrusion::{ClientInfo, get_client_ip};
use crate::app::AppState;
use crate::config::Config;
use crate::db::Db;
use crate::shared::auth_access::AuthPoint;
use crate::shared::errors::{
    AppError, AppResult, ErrorOptions, bad_request_error, forbidden_error,
    get_validation_user_message, internal_error, validation_error,
};
use crate::shared::schemas::{Session, User};
use crate::shared::utils::endpoint_def::EndpointDef;
use crate::utils::is_record::is_record;
use axum::body::Body;
use axum::http::{HeaderMap, Method};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

/// Everything a handler can see about its request (the TS `req`).
pub struct Ctx {
    pub state: AppState,
    pub def: &'static EndpointDef,
    pub method: Method,
    /// The raw request target (`req.url`).
    pub url: String,
    pub headers: HeaderMap,
    pub client: ClientInfo,
    body: Option<Body>,
}

impl Ctx {
    pub fn new(
        state: AppState,
        def: &'static EndpointDef,
        method: Method,
        url: String,
        headers: HeaderMap,
        client: ClientInfo,
        body: Option<Body>,
    ) -> Ctx {
        Ctx {
            state,
            def,
            method,
            url,
            headers,
            client,
            body,
        }
    }

    pub fn db(&self) -> &Db {
        &self.state.db
    }

    pub fn config(&self) -> &Config {
        &self.state.config
    }

    /// `req.headers[name]`, Node style.
    pub fn header(&self, name: &str) -> Option<String> {
        header(&self.headers, name)
    }

    /// `intrusion.getClientIp(req)`, as rate limits and logs use it.
    pub fn client_ip(&self) -> String {
        get_client_ip(&self.client)
    }

    /// The unread request body (multipart endpoints only).
    pub fn take_body(&mut self) -> Option<Body> {
        self.body.take()
    }

    /// The endpoint's declared access point (the TS handler's `access`).
    pub fn access(&self) -> Option<AuthPoint> {
        self.def.access
    }

    /// `requireUser(req)`.
    pub async fn require_user(&self) -> AppResult<(User, Session)> {
        crate::auth::require::require_user(self).await
    }

    /// `requireAccess(req, access)` for the endpoint's declared access point.
    pub async fn require_access(&self) -> AppResult<(User, Session)> {
        let point = self.def.access.ok_or_else(|| {
            internal_error(
                Some(&format!(
                    "Endpoint {} declares no access point.",
                    self.def.path
                )),
                ErrorOptions::default(),
            )
        })?;
        crate::auth::require::require_access(self, point).await
    }

    /// `requireAccess(req, point)` for an explicit point.
    pub async fn require_access_point(&self, point: AuthPoint) -> AppResult<(User, Session)> {
        crate::auth::require::require_access(self, point).await
    }
}

pub type HandlerFuture = Pin<Box<dyn Future<Output = AppResult<Reply>> + Send>>;
type Handler = Arc<dyn Fn(Value, Ctx) -> HandlerFuture + Send + Sync>;

/// A registered endpoint (`createEndpoint({...def, handler})`).
#[derive(Clone)]
pub struct Endpoint {
    pub def: &'static EndpointDef,
    /// Skip the origin check (`unsafe: true`).
    pub unsafe_origin: bool,
    handler: Handler,
}

/// Converts a handler's serialisable result into a reply.
pub fn json_reply<R: Serialize>(result: R) -> AppResult<Reply> {
    let mut value = serde_json::to_value(result).map_err(AppError::internal_from)?;
    crate::js::normalize_numbers(&mut value);
    Ok(Reply::Json(value))
}

impl Endpoint {
    /// An endpoint whose handler returns a serialisable value: objects and
    /// arrays become JSON, `()` / `None` become an empty 204.
    pub fn new<P, R, F, Fut>(def: &'static EndpointDef, handler: F) -> Endpoint
    where
        P: DeserializeOwned + Send + 'static,
        R: Serialize + Send + 'static,
        F: Fn(P, Ctx) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = AppResult<R>> + Send + 'static,
    {
        let handler = Arc::new(handler);
        Endpoint {
            def,
            unsafe_origin: false,
            handler: Arc::new(move |payload: Value, ctx: Ctx| {
                let handler = handler.clone();
                Box::pin(async move {
                    let payload: P =
                        serde_json::from_value(payload).map_err(AppError::internal_from)?;
                    json_reply(handler(payload, ctx).await?)
                })
            }),
        }
    }

    /// An endpoint whose handler builds its own [`Reply`] (e.g. a file download).
    pub fn raw<P, F, Fut>(def: &'static EndpointDef, handler: F) -> Endpoint
    where
        P: DeserializeOwned + Send + 'static,
        F: Fn(P, Ctx) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = AppResult<Reply>> + Send + 'static,
    {
        let handler = Arc::new(handler);
        Endpoint {
            def,
            unsafe_origin: false,
            handler: Arc::new(move |payload: Value, ctx: Ctx| {
                let handler = handler.clone();
                Box::pin(async move {
                    let payload: P =
                        serde_json::from_value(payload).map_err(AppError::internal_from)?;
                    handler(payload, ctx).await
                })
            }),
        }
    }

    /// `unsafe: true`: accept requests from any origin.
    pub fn unsafe_origin(mut self) -> Endpoint {
        self.unsafe_origin = true;
        self
    }

    /// Runs the endpoint: origin check, body, payload validation, handler.
    pub async fn call(&self, mut ctx: Ctx, body: Body) -> AppResult<Reply> {
        let request_origin = ctx.header("origin");
        if !self.unsafe_origin && !ctx.state.origin.is_allowed(request_origin.as_deref()) {
            return Err(forbidden_error(
                "Request origin not valid.",
                ErrorOptions::code("request.origin_invalid"),
            ));
        }
        let body_value = if self.def.multipart {
            ctx.body = Some(body);
            Value::Object(Default::default())
        } else {
            read_json(&ctx.headers, body).await?
        };
        let payload = match self.def.payload {
            Some(schema) => extract_payload(&schema(), &body_value)?,
            None => Value::Null,
        };
        (self.handler)(payload, ctx).await
    }
}

/// `{payload}` extraction and validation with the TS "pretty" error.
pub fn extract_payload(schema: &crate::shared::torva::Io, body: &Value) -> AppResult<Value> {
    let payload = match body {
        Value::Object(map) if map.contains_key("payload") => map.get("payload"),
        _ => None,
    };
    let Some(payload) = payload.filter(|_| is_record(Some(body))) else {
        return Err(bad_request_error(
            "Body missing payload.",
            ErrorOptions::code("request.payload_missing"),
        ));
    };
    schema
        .validate_opt(Some(payload))
        .map(|v| v.unwrap_or(Value::Null))
        .map_err(|error| {
            let pretty = pretty_validation_message(&error);
            let details = Value::String(error);
            validation_error(
                pretty,
                ErrorOptions::default()
                    .with_user_message(get_validation_user_message(Some(&details)))
                    .with_details(details),
            )
        })
}

/// `An error occurred: field message` from `[field]: Message`.
pub fn pretty_validation_message(error: &str) -> String {
    if !error.contains(':') {
        return "The input provided is invalid.".into();
    }
    let mut parts = error.split(':');
    let first = parts
        .next()
        .unwrap_or("")
        .replacen('[', "", 1)
        .replacen(']', "", 1);
    let rest = crate::js::trim(&parts.collect::<Vec<_>>().join("")).to_lowercase();
    format!("An error occurred: {first} {rest}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn prettifies_validation_errors() {
        assert_eq!(
            pretty_validation_message("[email]: Value is not a valid email."),
            "An error occurred: email value is not a valid email."
        );
        assert_eq!(
            pretty_validation_message("[list]: [1]: [id]: X"),
            "An error occurred: list [1] [id] x"
        );
        assert_eq!(
            pretty_validation_message("Value is not a number."),
            "The input provided is invalid."
        );
    }

    #[test]
    fn requires_the_payload_wrapper() {
        let schema = crate::shared::torva::io::object([("a", crate::shared::torva::io::number())]);
        let error = extract_payload(&schema, &json!({})).unwrap_err();
        assert_eq!(
            (error.status_code, error.error_code.as_str()),
            (400, "request.payload_missing")
        );
        assert!(extract_payload(&schema, &json!([1])).is_err());
        let invalid = extract_payload(&schema, &json!({"payload": {"a": "x"}})).unwrap_err();
        assert_eq!(invalid.status_code, 422);
        assert_eq!(
            invalid.message,
            "An error occurred: a value is not a number."
        );
        assert_eq!(invalid.details, Some(json!("[a]: Value is not a number.")));
        assert_eq!(invalid.user_message, "Please check a and try again.");
        assert_eq!(
            extract_payload(&schema, &json!({"payload": {"a": 1}})).unwrap(),
            json!({"a": 1})
        );
    }
}
