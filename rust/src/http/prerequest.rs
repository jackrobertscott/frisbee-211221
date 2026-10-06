//! Port of `server/src/http/prerequest.ts`: answers preflight and
//! infrastructure paths, screens the request, then insists on known routes
//! and POST before handing over to the endpoint.

use super::capture::Reply;
use super::intrusion::{InspectOptions, get_pathname};
use super::request_handler::{self, Request};
use crate::app::AppState;
use crate::shared::errors::{AppResult, ErrorOptions, method_not_allowed_error, not_found_error};
use axum::http::Method;
use serde_json::json;

pub async fn handle(state: &AppState, request: Request) -> AppResult<Reply> {
    if request.method == Method::OPTIONS {
        return Ok(Reply::Json(json!({})));
    }

    let pathname = get_pathname(Some(&request.url));

    match pathname.as_str() {
        "/" => {
            return Ok(Reply::Json(json!({
                "env": if state.config.is_production { "production" } else { "development" },
                "now": crate::js::date::now_iso(),
            })));
        }
        "/health" => {
            return Ok(Reply::Json(
                json!({"ok": true, "now": crate::js::date::now_iso()}),
            ));
        }
        "/robots.txt" | "/favicon.ico" => return Ok(Reply::Empty),
        _ => {}
    }

    let known_route = state.has_endpoint(&pathname);

    // check origin host of request
    let request_origin = super::headers::header(&request.headers, "origin");
    let threat = state.intrusion.inspect(
        &request.client,
        &InspectOptions {
            pathname: &pathname,
            known_route,
            origin_allowed: state.origin.is_allowed(request_origin.as_deref()),
            origin: request_origin.as_deref(),
        },
    );
    if let Some(threat) = threat {
        return Err(threat);
    }

    if !known_route {
        return Err(not_found_error(
            "Not found.",
            ErrorOptions::code("request.route_not_found"),
        ));
    }

    if request.method != Method::POST {
        return Err(method_not_allowed_error(
            "Server only accepts POST requests.",
            ErrorOptions::code("request.method_not_allowed"),
        ));
    }

    request_handler::handle(state, request).await
}
