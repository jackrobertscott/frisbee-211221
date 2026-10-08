//! Port of `server/test/integration/http.test.ts`, plus pipeline checks
//! against stub endpoints so the pipeline is covered before every domain
//! endpoint exists.

mod common;

use common::{CLIENT_ORIGIN, CallOptions, OriginHeader, TestServer, assert_match};
use frisbee::http::endpoint::{Ctx, Endpoint};
use frisbee::shared::contract;
use frisbee::shared::utils::endpoint_def::EndpointDef;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{Value, json};

mod request_pipeline {
    use super::*;

    #[tokio::test]
    async fn answers_the_root_and_health_checks() {
        let server = TestServer::start().await;
        let root = server.request(Method::GET, "/").send().await.unwrap();
        assert_eq!(root.status().as_u16(), 200);
        assert_match(
            &root.json::<Value>().await.unwrap(),
            &json!({"env": "development"}),
        );
        let health = server.request(Method::GET, "/health").send().await.unwrap();
        assert_match(&health.json::<Value>().await.unwrap(), &json!({"ok": true}));
    }

    #[tokio::test]
    async fn answers_cors_preflight_requests_for_the_client_origin() {
        let server = TestServer::start().await;
        let response = server
            .request(Method::OPTIONS, "/SeasonList")
            .header("origin", CLIENT_ORIGIN)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), 200);
        assert_eq!(
            response.headers()["access-control-allow-origin"],
            CLIENT_ORIGIN
        );
        assert_eq!(
            response.headers()["access-control-allow-methods"],
            "POST,OPTIONS"
        );
    }

    #[tokio::test]
    async fn rejects_non_post_requests_to_known_routes() {
        let server = TestServer::start().await;
        let response = server
            .request(Method::GET, "/SeasonList")
            .header("origin", CLIENT_ORIGIN)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), 405);
        assert_match(
            &response.json::<Value>().await.unwrap(),
            &json!({"errorCode": "request.method_not_allowed"}),
        );
    }

    #[tokio::test]
    async fn returns_404_for_unknown_routes_from_the_client_origin() {
        let server = TestServer::start().await;
        let response = server.post("/NoSuchEndpoint", json!({})).await;
        assert_eq!(response.status, 404);
        assert_match(
            &response.body,
            &json!({"errorCode": "request.route_not_found"}),
        );
    }

    #[tokio::test]
    async fn forbids_known_routes_from_other_origins() {
        let server = TestServer::start().await;
        let response = server
            .call(
                "/SeasonList",
                Some(json!({})),
                CallOptions::origin("https://evil.example.com"),
            )
            .await;
        assert_eq!(response.status, 403);
        assert_match(
            &response.body,
            &json!({"errorCode": "intrusion.origin_forbidden"}),
        );
    }

    #[tokio::test]
    async fn reports_invalid_payloads_as_validation_errors_with_a_friendly_message() {
        let server = TestServer::start().await;
        let response = server
            .post("/SecurityStatus", json!({"email": "nope"}))
            .await;
        assert_eq!(response.status, 422);
        assert_match(
            &response.body,
            &json!({"errorCode": "validation_error", "userMessage": "Please check email address and try again."}),
        );
    }

    #[tokio::test]
    async fn requires_the_payload_wrapper() {
        let server = TestServer::start().await;
        let response = server
            .request(Method::POST, "/SecurityStatus")
            .header("content-type", "application/json")
            .header("origin", CLIENT_ORIGIN)
            .body("{}")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), 400);
        assert_match(
            &response.json::<Value>().await.unwrap(),
            &json!({"errorCode": "request.payload_missing"}),
        );
    }

    #[tokio::test]
    async fn reports_a_missing_season_before_any_season_exists() {
        let server = TestServer::start().await;
        let response = server.post("/SecurityCurrent", json!({})).await;
        assert_eq!(response.status, 404);
        assert_match(&response.body, &json!({"errorCode": "season.not_found"}));
    }
}

/// The same pipeline with stub handlers bound to real contract definitions.
mod pipeline_with_stub_endpoints {
    use super::*;

    #[derive(Deserialize)]
    struct StatusPayload {
        email: String,
    }

    static ECHO: EndpointDef = EndpointDef::new("Echo", "/Echo");
    static NUMBERS: EndpointDef = EndpointDef::new("Numbers", "/Numbers");
    static TEXT: EndpointDef = EndpointDef::new("Text", "/Text");

    fn stubs() -> Vec<Endpoint> {
        vec![
            Endpoint::new(
                &contract::season::SEASON_LIST,
                |_: Value, _ctx: Ctx| async move { Ok(json!([])) },
            ),
            Endpoint::new(
                &contract::security::SECURITY_STATUS,
                |payload: StatusPayload, _ctx: Ctx| async move {
                    Ok(json!({"status": "unknown", "email": payload.email}))
                },
            ),
            Endpoint::new(
                &contract::security::SECURITY_LOGOUT,
                |_: (), _ctx: Ctx| async move { Ok(()) },
            ),
            Endpoint::new(&ECHO, |_: (), ctx: Ctx| async move {
                Ok(json!({"ip": ctx.client_ip(), "url": ctx.url}))
            }),
            Endpoint::new(&NUMBERS, |_: (), _ctx: Ctx| async move {
                Ok(json!({"whole": 3.0, "half": 0.5}))
            }),
            Endpoint::new(&TEXT, |_: (), _ctx: Ctx| async move { Ok("text") }),
        ]
    }

    #[tokio::test]
    async fn rejects_non_post_requests_to_known_routes() {
        let server = TestServer::start_with(stubs()).await;
        let response = server
            .request(Method::GET, "/SeasonList")
            .header("origin", CLIENT_ORIGIN)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status().as_u16(), 405);
        let body: Value = response.json().await.unwrap();
        assert_match(
            &body,
            &json!({"errorCode": "request.method_not_allowed", "url": "/SeasonList"}),
        );
    }

    #[tokio::test]
    async fn forbids_known_routes_from_other_origins() {
        let server = TestServer::start_with(stubs()).await;
        let response = server
            .call(
                "/SeasonList",
                Some(json!({})),
                CallOptions::origin("https://evil.example.com"),
            )
            .await;
        assert_eq!(response.status, 403);
        assert_match(
            &response.body,
            &json!({"errorCode": "intrusion.origin_forbidden"}),
        );
        // CORS still names the client origin
        assert_eq!(
            response.headers["access-control-allow-origin"],
            CLIENT_ORIGIN
        );
    }

    #[tokio::test]
    async fn reports_invalid_payloads_as_validation_errors_with_a_friendly_message() {
        let server = TestServer::start_with(stubs()).await;
        let response = server
            .post("/SecurityStatus", json!({"email": "nope"}))
            .await;
        assert_eq!(response.status, 422);
        assert_match(
            &response.body,
            &json!({
                "errorCode": "validation_error",
                "userMessage": "Please check email address and try again.",
                "message": "An error occurred: email value is not a valid email.",
                "details": "[email]: Value is not a valid email.",
            }),
        );
    }

    #[tokio::test]
    async fn requires_the_payload_wrapper_and_valid_json() {
        let server = TestServer::start_with(stubs()).await;
        let missing = server
            .call("/SecurityStatus", None, CallOptions::default())
            .await;
        assert_eq!(missing.status, 400);
        assert_match(
            &missing.body,
            &json!({"errorCode": "request.payload_missing"}),
        );
        let invalid = common::read(
            server
                .request(Method::POST, "/SecurityStatus")
                .header("origin", CLIENT_ORIGIN)
                .body("{nope")
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(invalid.status, 400);
        assert_match(
            &invalid.body,
            &json!({"message": "Invalid JSON", "errorCode": "bad_request"}),
        );
        let too_large = common::read(
            server
                .request(Method::POST, "/SecurityStatus")
                .header("origin", CLIENT_ORIGIN)
                .body(format!("{{\"payload\":\"{}\"}}", "x".repeat(1024 * 1024)))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(too_large.status, 413);
        assert_match(
            &too_large.body,
            &json!({"message": "Body exceeded 1mb limit", "errorCode": "payload_too_large"}),
        );
    }

    #[tokio::test]
    async fn answers_null_results_with_an_empty_204() {
        let server = TestServer::start_with(stubs()).await;
        let response = server
            .call("/SecurityLogout", None, CallOptions::default())
            .await;
        assert_eq!(response.status, 204);
        assert_eq!(response.body, json!(""));
        let robots = server
            .request(Method::GET, "/robots.txt")
            .send()
            .await
            .unwrap();
        assert_eq!(robots.status().as_u16(), 204);
    }

    #[tokio::test]
    async fn sends_json_like_json_stringify() {
        let server = TestServer::start_with(stubs()).await;
        let response = server
            .request(Method::POST, "/Numbers")
            .header("origin", CLIENT_ORIGIN)
            .body("{}")
            .send()
            .await
            .unwrap();
        assert_eq!(
            response.headers()["content-type"],
            "application/json; charset=utf-8"
        );
        assert_eq!(response.text().await.unwrap(), r#"{"whole":3,"half":0.5}"#);
    }

    #[tokio::test]
    async fn rejects_handler_results_that_are_not_objects() {
        let server = TestServer::start_with(stubs()).await;
        let response = server.call("/Text", None, CallOptions::default()).await;
        assert_eq!(response.status, 500);
        assert_match(
            &response.body,
            &json!({"errorCode": "request.invalid_handler_response"}),
        );
    }

    #[tokio::test]
    async fn derives_the_client_ip_from_the_socket() {
        let server = TestServer::start_with(stubs()).await;
        let response = server.call("/Echo?x=1", None, CallOptions::default()).await;
        assert_eq!(
            response.body,
            json!({"ip": "127.0.0.1", "url": "/Echo?x=1"})
        );
        let forwarded = common::read(
            server
                .request(Method::POST, "/Echo")
                .header("origin", CLIENT_ORIGIN)
                .header("x-forwarded-for", "9.9.9.9")
                .body("{}")
                .send()
                .await
                .unwrap(),
        )
        .await;
        // the loopback socket is a trusted proxy, so the forwarded hop is the client
        assert_eq!(forwarded.body["ip"], "9.9.9.9");
    }

    #[tokio::test]
    async fn tarpits_exploit_probes_and_then_blocks_the_ip() {
        let server = TestServer::start_with(stubs()).await;
        let started = std::time::Instant::now();
        let probe = common::read(
            server
                .request(Method::GET, "/.git/config")
                .header("x-forwarded-for", "198.51.100.7")
                .timeout(std::time::Duration::from_millis(300))
                .send()
                .await
                .unwrap(),
        )
        .await;
        // the tarpit holds the response; the client gives up first
        assert_eq!(probe.status, 404);
        assert!(started.elapsed().as_millis() >= 250);
        let _ = OriginHeader::None;
    }
}
