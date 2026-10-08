//! Integration test harness — port of `server/test/harness.ts` and
//! `server/test/actors.ts`.
//!
//! Every test starts the real app (the full request pipeline and every
//! registered endpoint) on an ephemeral port with its own fresh SQLite
//! database, so tests run in parallel without sharing state.

#![allow(dead_code)]

pub mod actors;

use frisbee::db::Db;
use frisbee::http::endpoint::Endpoint;
use frisbee::testing::TestApp;
use serde_json::Value;
use std::net::SocketAddr;
use tokio::net::TcpListener;

pub const CLIENT_ORIGIN: &str = "http://localhost:3000";

/// `TResponse`: status and parsed JSON body (or the raw text when not JSON).
#[derive(Clone, Debug)]
pub struct Response {
    pub status: u16,
    pub body: Value,
    pub headers: reqwest::header::HeaderMap,
}

/// Which `Origin` header a call sends.
#[derive(Clone, Debug, Default)]
pub enum OriginHeader {
    /// The client origin (`http://localhost:3000`), as the browser sends it.
    #[default]
    Client,
    /// No `Origin` header (`origin: null`).
    None,
    Custom(String),
}

/// `call` options.
#[derive(Clone, Debug, Default)]
pub struct CallOptions {
    pub token: Option<String>,
    pub origin: OriginHeader,
}

impl CallOptions {
    pub fn token(token: &str) -> Self {
        CallOptions {
            token: Some(token.to_string()),
            ..Default::default()
        }
    }
    pub fn origin(origin: &str) -> Self {
        CallOptions {
            origin: OriginHeader::Custom(origin.to_string()),
            ..Default::default()
        }
    }
}

/// A running test server (`TTestServer`).
pub struct TestServer {
    pub url: String,
    pub app: TestApp,
    client: reqwest::Client,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
    }
}

impl TestServer {
    /// The real app with every registered endpoint.
    pub async fn start() -> TestServer {
        TestServer::start_with(frisbee::endpoints::all()).await
    }

    /// The real pipeline serving `endpoints`.
    pub async fn start_with(endpoints: Vec<Endpoint>) -> TestServer {
        frisbee::log::set_quiet(std::env::var("FRISBEE_LOG_VERBOSE").is_err());
        let app = TestApp::new(endpoints);
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test server");
        let addr: SocketAddr = listener.local_addr().expect("test server address");
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let state = app.state.clone();
        tokio::spawn(async move {
            let shutdown = async move {
                let _ = rx.await;
            };
            let _ = frisbee::server::serve(
                listener,
                state,
                shutdown,
                std::time::Duration::from_secs(1),
            )
            .await;
        });
        TestServer {
            url: format!("http://{addr}"),
            app,
            client: reqwest::Client::builder().build().expect("http client"),
            shutdown: Some(tx),
        }
    }

    pub fn db(&self) -> &Db {
        self.app.db()
    }

    /// POSTs `{payload}` to an endpoint the way the browser does. `None`
    /// sends `{}` (the TS `payload: undefined`).
    pub async fn call(&self, path: &str, payload: Option<Value>, options: CallOptions) -> Response {
        let mut body = serde_json::Map::new();
        if let Some(payload) = payload {
            body.insert("payload".into(), payload);
        }
        let mut request = self
            .client
            .post(format!("{}{path}", self.url))
            .header("content-type", "application/json")
            .body(serde_json::to_string(&Value::Object(body)).expect("serialise payload"));
        match &options.origin {
            OriginHeader::Client => request = request.header("origin", CLIENT_ORIGIN),
            OriginHeader::None => {}
            OriginHeader::Custom(origin) => request = request.header("origin", origin),
        }
        if let Some(token) = &options.token {
            request = request.header("authorization", token);
        }
        read(request.send().await.expect("send request")).await
    }

    /// `call(path, payload)` from the client origin without a token.
    pub async fn post(&self, path: &str, payload: Value) -> Response {
        self.call(path, Some(payload), CallOptions::default()).await
    }

    /// `call(path, payload, {token})`.
    pub async fn post_as(&self, path: &str, payload: Value, token: &str) -> Response {
        self.call(path, Some(payload), CallOptions::token(token))
            .await
    }

    /// A raw request for pipeline tests (`fetch(url, init)`).
    pub fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.client.request(method, format!("{}{path}", self.url))
    }

    /// The latest security code sent to `email` (logged, not emailed, in tests).
    pub fn latest_code(&self, email: &str) -> String {
        self.app
            .state
            .security_codes
            .latest(email)
            .unwrap_or_else(|| panic!("No security code was sent to {email}."))
    }
}

/// Reads a response like the TS harness: JSON when the content type says so.
pub async fn read(response: reqwest::Response) -> Response {
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let is_json = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("application/json"));
    let text = response.text().await.unwrap_or_default();
    let body = if is_json && !text.is_empty() {
        serde_json::from_str(&text).unwrap_or(Value::String(text))
    } else {
        Value::String(text)
    };
    Response {
        status,
        body,
        headers,
    }
}

/// Asserts that `actual` contains every key/value of `expected` (vitest's
/// `toMatchObject`), recursively for objects.
#[track_caller]
pub fn assert_match(actual: &Value, expected: &Value) {
    fn matches(actual: &Value, expected: &Value) -> bool {
        match (actual, expected) {
            (Value::Object(actual), Value::Object(expected)) => expected
                .iter()
                .all(|(key, value)| actual.get(key).is_some_and(|a| matches(a, value))),
            (Value::Array(actual), Value::Array(expected)) => {
                actual.len() == expected.len()
                    && actual.iter().zip(expected).all(|(a, e)| matches(a, e))
            }
            _ => actual == expected,
        }
    }
    assert!(
        matches(actual, expected),
        "expected {actual} to match {expected}"
    );
}
