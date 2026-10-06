//! Port of `server/src/http/requestHandler.ts`: the full request pipeline —
//! CORS, error capture, request screening, then the endpoint.

use super::capture::{self, Reply, RequestInfo};
use super::intrusion::{get_pathname, ClientInfo};
use super::{cors, headers, prerequest};
use crate::app::AppState;
use crate::http::endpoint::Ctx;
use crate::shared::errors::{not_found_error, AppResult, ErrorOptions};
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, Method, Response};
use std::net::SocketAddr;

/// An incoming request, as the pipeline sees it.
pub struct Request {
    pub method: Method,
    /// The raw request target (`req.url`).
    pub url: String,
    pub headers: HeaderMap,
    pub client: ClientInfo,
    pub body: Body,
}

impl Request {
    pub fn from_http(request: axum::extract::Request, remote: Option<SocketAddr>) -> Request {
        let (parts, body) = request.into_parts();
        let remote = remote.or_else(|| parts.extensions.get::<ConnectInfo<SocketAddr>>().map(|info| info.0));
        let forwarded_for = headers::header(&parts.headers, "x-forwarded-for");
        Request {
            method: parts.method,
            url: parts.uri.to_string(),
            client: ClientInfo::new(remote.map(|addr| addr.ip().to_string()).as_deref(), forwarded_for.as_deref()),
            headers: parts.headers,
            body,
        }
    }
}

/// The innermost handler: dispatches to the endpoint for the path.
pub async fn handle(state: &AppState, request: Request) -> AppResult<Reply> {
    let pathname = get_pathname(Some(&request.url));
    let Some(endpoint) = state.endpoints.get(pathname.as_str()) else {
        return Err(not_found_error(
            format!("Url {} is not supported.", request.url),
            ErrorOptions::code("request.route_not_found"),
        ));
    };
    let ctx = Ctx::new(
        state.clone(),
        endpoint.def,
        request.method,
        request.url,
        request.headers,
        request.client,
        None,
    );
    endpoint.call(ctx, request.body).await
}

/// `cors()(capture.handle(prerequest(handler)))` for one request.
pub async fn respond(state: AppState, request: Request) -> Response<Body> {
    let request_origin = headers::header(&request.headers, "origin");
    let info = RequestInfo { method: request.method.to_string(), url: request.url.clone() };
    let result = prerequest::handle(&state, request).await;
    let mut response = capture::handle(result, &info, state.config.is_production, &state.tarpit);
    cors::attach(response.headers_mut(), request_origin.as_deref(), &state.origin);
    response
}

/// The axum router: one fallback handler runs the whole pipeline.
pub fn router(state: AppState) -> axum::Router {
    axum::Router::new().fallback(move |ConnectInfo(remote): ConnectInfo<SocketAddr>, request: axum::extract::Request| {
        let state = state.clone();
        async move { respond(state, Request::from_http(request, Some(remote))).await }
    })
}
