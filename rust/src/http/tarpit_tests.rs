//! Port of `server/src/http/tarpit.test.ts`.

use super::*;
use axum::Router;
use axum::extract::{Path, State};
use axum::routing::get;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Clone)]
struct TestState {
    tarpit: Arc<Tarpit>,
    plans: Arc<Mutex<HashMap<String, TarpitPlan>>>,
}

async fn handler(State(state): State<TestState>, Path(path): Path<String>) -> Response<Body> {
    let plan = state.plans.lock().unwrap().get(&path).cloned();
    match plan {
        Some(plan) => state.tarpit.respond(&plan),
        None => Response::new(Body::from("missing plan")),
    }
}

async fn start() -> (String, TestState) {
    let state = TestState {
        tarpit: Arc::new(Tarpit::new()),
        plans: Arc::new(Mutex::new(HashMap::new())),
    };
    let app = Router::new()
        .route("/{*path}", get(handler))
        .with_state(state.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    (url, state)
}

fn plan(body: &str, drip_interval_ms: u64, hold_ms: u64, status_code: u16) -> TarpitPlan {
    TarpitPlan {
        body: body.into(),
        drip_interval_ms,
        hold_ms,
        status_code,
    }
}

fn default_plan() -> TarpitPlan {
    plan("Too many requests.", 20, 90, 429)
}

fn client() -> reqwest::Client {
    crate::utils::http_client::builder()
        .pool_max_idle_per_host(0)
        .build()
        .unwrap()
}

struct Done {
    status: u16,
    headers: reqwest::header::HeaderMap,
    body: String,
}

async fn request(url: &str, state: &TestState, path: &str, plan: TarpitPlan) -> Done {
    state
        .plans
        .lock()
        .unwrap()
        .insert(path.trim_start_matches('/').to_string(), plan);
    let response = client().get(format!("{url}{path}")).send().await.unwrap();
    let status = response.status().as_u16();
    let headers = response.headers().clone();
    let body = response.text().await.unwrap();
    Done {
        status,
        headers,
        body,
    }
}

mod tarpit_respond {
    use super::*;

    #[tokio::test]
    async fn drips_spaces_until_the_hold_time_ends_then_sends_the_body() {
        let (url, state) = start().await;
        let started_at = std::time::Instant::now();
        let result = request(&url, &state, "/drip", default_plan()).await;
        assert!(started_at.elapsed().as_millis() >= 80);
        assert_eq!(result.status, 429);
        assert_eq!(result.headers["content-type"], "text/plain; charset=utf-8");
        assert_eq!(result.headers["cache-control"], "no-store, max-age=0");
        assert_eq!(result.headers["x-content-type-options"], "nosniff");
        assert_eq!(result.headers["transfer-encoding"], "chunked");
        let spaces = result.body.len() - "Too many requests.".len();
        assert!(
            result.body.ends_with("Too many requests.") && (2..=5).contains(&spaces),
            "{:?}",
            result.body
        );
        assert!(result.body[..spaces].chars().all(|c| c == ' '));
    }

    #[tokio::test]
    async fn sends_only_the_body_when_the_hold_is_shorter_than_a_drip() {
        let (url, state) = start().await;
        let result = request(
            &url,
            &state,
            "/short",
            plan("Too many requests.", 1000, 5, 429),
        )
        .await;
        assert_eq!(result.body, " Too many requests.");
    }

    // "does nothing for a response that has already ended" has no Rust
    // counterpart: respond() builds the response, so it cannot run twice.

    #[tokio::test]
    async fn answers_immediately_once_too_many_tarpits_are_open_and_recovers() {
        let (url, state) = start().await;
        let mut held = Vec::new();
        for index in 0..MAX_CONCURRENT_TARPITS {
            let path = format!("held-{index}");
            state
                .plans
                .lock()
                .unwrap()
                .insert(path.clone(), plan("Too many requests.", 25, 60_000, 429));
            let mut response = client().get(format!("{url}/{path}")).send().await.unwrap();
            // wait for the first byte so the tarpit is open
            let first = response.chunk().await.unwrap();
            assert_eq!(first.as_deref(), Some(&b" "[..]));
            held.push(response);
        }
        assert_eq!(state.tarpit.active(), MAX_CONCURRENT_TARPITS);

        let started_at = std::time::Instant::now();
        let overflow = request(&url, &state, "/overflow", plan("Blocked.", 20, 60_000, 403)).await;
        assert!(started_at.elapsed().as_millis() < 1_000);
        assert_eq!(overflow.status, 403);
        assert_eq!(overflow.body, "Blocked.");
        assert!(overflow.headers.get("transfer-encoding").is_none());
        assert_eq!(overflow.headers["connection"], "close");

        // closed connections stop their tarpit and free its slot
        drop(held);
        tokio::time::sleep(Duration::from_millis(150)).await;
        let after = request(
            &url,
            &state,
            "/after",
            plan("Too many requests.", 20, 30, 429),
        )
        .await;
        assert!(
            after.body.starts_with(' ') && after.body.trim_start() == "Too many requests.",
            "{:?}",
            after.body
        );
    }
}
