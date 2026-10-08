//! Ports of `server/src/index.ts` (bootstrap) and the meaningful parts of
//! `server/src/cluster.ts` (graceful draining on shutdown).
//!
//! Node's cluster (forked workers scaled by load) is replaced by tokio's
//! multi-threaded runtime in one process. What carries over is the drain:
//! on SIGTERM/SIGINT the server stops accepting connections, lets in-flight
//! requests finish (responses close their connections) and exits, forcing
//! the exit after a 30 second drain timeout.

use crate::app::AppState;
use crate::config::Config;
use crate::db::Db;
use crate::http::request_handler::router;
use crate::log;
use crate::utils::mail::Mailer;
use std::future::Future;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;

/// `HTTP_CLUSTER_DRAIN_TIMEOUT_MS`.
pub const DRAIN_TIMEOUT: Duration = Duration::from_secs(30);

/// Serves `state` on `listener` until `shutdown` resolves, then drains
/// in-flight requests for at most `drain_timeout`.
pub async fn serve(
    listener: TcpListener,
    state: AppState,
    shutdown: impl Future<Output = ()> + Send + 'static,
    drain_timeout: Duration,
) -> std::io::Result<()> {
    let (started_tx, started_rx) = tokio::sync::oneshot::channel::<()>();
    let graceful = async move {
        shutdown.await;
        let _ = started_tx.send(());
    };
    let app = router(state).into_make_service_with_connect_info::<SocketAddr>();
    let server = axum::serve(listener, app).with_graceful_shutdown(graceful);
    let force = async move {
        if started_rx.await.is_ok() {
            tokio::time::sleep(drain_timeout).await;
        } else {
            std::future::pending::<()>().await;
        }
    };
    tokio::select! {
        result = server => result,
        _ = force => Ok(()),
    }
}

/// Resolves on SIGTERM or SIGINT.
pub async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

/// Binds `PORT` on all interfaces (IPv6 dual-stack when available, like Node).
pub async fn bind(port: u16) -> std::io::Result<TcpListener> {
    match TcpListener::bind(("::", port)).await {
        Ok(listener) => Ok(listener),
        Err(_) => TcpListener::bind(("0.0.0.0", port)).await,
    }
}

/// `bootstrap()`: config, database, startup tasks, scheduler, then listen.
pub async fn bootstrap() -> Result<(), String> {
    let config = Arc::new(Config::load()?);
    let db = Db::open(&config.sqlite_path).map_err(|error| error.message.clone())?;
    crate::startup::run_startup_tasks(&crate::startup::startup_tasks(&db), config.is_production)
        .await
        .map_err(|error| error.to_string())?;
    let mailer = Mailer::ses(config.clone());
    let state = AppState::new(config.clone(), db, mailer, crate::endpoints::all());
    crate::gameday::scheduler::start_gameday_import_scheduler(&state);
    let listener = bind(config.port).await.map_err(|error| error.to_string())?;
    let env_name = if config.is_production { "prod" } else { "dev" };
    log::log(format!(
        "Server listening on http://localhost:{} ({env_name})",
        config.port
    ));
    serve(listener, state, shutdown_signal(), DRAIN_TIMEOUT)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::endpoint::{Ctx, Endpoint};
    use crate::shared::utils::endpoint_def::EndpointDef;
    use crate::testing::TestApp;

    static SLOW: EndpointDef = EndpointDef::new("Slow", "/Slow");

    fn slow_endpoint(delay_ms: u64) -> Endpoint {
        Endpoint::new(&SLOW, move |_: (), _ctx: Ctx| async move {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            Ok(serde_json::json!({"done": true}))
        })
    }

    async fn start(
        app: &TestApp,
        drain_timeout: Duration,
    ) -> (
        String,
        tokio::sync::oneshot::Sender<()>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let state = app.state.clone();
        let handle = tokio::spawn(async move {
            let _ = serve(
                listener,
                state,
                async move {
                    let _ = rx.await;
                },
                drain_timeout,
            )
            .await;
        });
        (url, tx, handle)
    }

    fn post(url: &str) -> reqwest::RequestBuilder {
        crate::utils::http_client::client()
            .post(format!("{url}/Slow"))
            .header("origin", "http://localhost:3000")
            .header("content-type", "application/json")
            .body("{}")
    }

    // attachWorkerClusterLifecycle (cluster.test.ts): drains on shutdown and
    // exits once closed or after a timeout

    #[tokio::test]
    async fn drains_in_flight_requests_before_exiting() {
        let app = TestApp::new(vec![slow_endpoint(200)]);
        let (url, shutdown, handle) = start(&app, Duration::from_secs(5)).await;
        let request = tokio::spawn(post(&url).send());
        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = shutdown.send(());
        let response = request.await.unwrap().unwrap();
        assert_eq!(response.status().as_u16(), 200);
        assert_eq!(response.text().await.unwrap(), r#"{"done":true}"#);
        tokio::time::timeout(Duration::from_secs(2), handle)
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn exits_after_the_drain_timeout_when_requests_hang() {
        let app = TestApp::new(vec![slow_endpoint(60_000)]);
        let (url, shutdown, handle) = start(&app, Duration::from_millis(100)).await;
        let _request = tokio::spawn(post(&url).send());
        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = shutdown.send(());
        tokio::time::timeout(Duration::from_secs(2), handle)
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn stops_accepting_new_connections_after_shutdown() {
        let app = TestApp::new(vec![slow_endpoint(0)]);
        let (url, shutdown, handle) = start(&app, Duration::from_secs(5)).await;
        assert_eq!(post(&url).send().await.unwrap().status().as_u16(), 200);
        let _ = shutdown.send(());
        tokio::time::timeout(Duration::from_secs(2), handle)
            .await
            .unwrap()
            .unwrap();
        assert!(post(&url).send().await.is_err());
    }
}
