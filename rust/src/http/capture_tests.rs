//! Port of `server/src/http/capture.test.ts`. Log assertions filter on a
//! path unique to each test because tests run in parallel.

use super::*;
use crate::shared::errors::{bad_request_error, not_found_error};
use axum::Router;
use axum::extract::Request;
use serde_json::json;
use std::sync::Arc;

type Handler = Arc<dyn Fn() -> Result<Reply, AppError> + Send + Sync>;

async fn serve(handler: Handler, is_production: bool) -> String {
    let tarpit = Arc::new(Tarpit::new());
    let app = Router::new().fallback(move |request: Request| {
        let handler = handler.clone();
        let tarpit = tarpit.clone();
        async move {
            let req = RequestInfo {
                method: request.method().to_string(),
                url: request.uri().to_string(),
            };
            handle(handler(), &req, is_production, &tarpit)
        }
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    url
}

async fn get(url: &str, path: &str) -> (u16, String) {
    let response = crate::utils::http_client::client()
        .get(format!("{url}{path}"))
        .send()
        .await
        .unwrap();
    let status = response.status().as_u16();
    (status, response.text().await.unwrap())
}

fn error_lines(capture: &log::Capture, path: &str) -> Vec<String> {
    capture.matching(log::Level::Error, &format!("| {path}"))
}

mod capture_handle {
    use super::*;

    #[tokio::test]
    async fn passes_through_object_and_array_results() {
        let capture = log::capture();
        let url = serve(Arc::new(|| Ok(Reply::Json(json!({"ok": true})))), false).await;
        let (_, text) = get(&url, "/pass-object").await;
        assert_eq!(
            serde_json::from_str::<Value>(&text).unwrap(),
            json!({"ok": true})
        );
        let url = serve(Arc::new(|| Ok(Reply::Json(json!([1, 2])))), false).await;
        let (_, text) = get(&url, "/pass-array").await;
        assert_eq!(serde_json::from_str::<Value>(&text).unwrap(), json!([1, 2]));
        assert!(error_lines(&capture, "/pass-").is_empty());
    }

    #[tokio::test]
    async fn rejects_handler_results_that_are_not_objects() {
        let capture = log::capture();
        let url = serve(Arc::new(|| Ok(Reply::Json(json!("text")))), false).await;
        let (status, text) = get(&url, "/thing-invalid?x=1").await;
        assert_eq!(status, 500);
        let body: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(body["errorCode"], "request.invalid_handler_response");
        assert_eq!(body["url"], "/thing-invalid?x=1");
        assert_eq!(
            error_lines(&capture, "/thing-invalid?x=1")[0],
            "[error] | 500 | Internal Server Error | GET | /thing-invalid?x=1 | Request handler may only return an object or an array but got string."
        );
    }

    #[tokio::test]
    async fn returns_serialised_errors_with_debug_details_outside_production() {
        let capture = log::capture();
        let url = serve(
            Arc::new(|| {
                Err(bad_request_error(
                    "Bad   thing\n happened",
                    ErrorOptions::code("thing.bad").with_details(json!({"field": "x"})),
                ))
            }),
            false,
        )
        .await;
        let (status, text) = get(&url, "/bad").await;
        assert_eq!(status, 400);
        let body: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(body["errorCode"], "thing.bad");
        assert_eq!(body["message"], "Bad   thing\n happened");
        assert_eq!(body["details"], json!({"field": "x"}));
        assert_eq!(body["url"], "/bad");
        assert_eq!(
            error_lines(&capture, "/bad")[0],
            "[error] | 400 | Bad Request | GET | /bad | Bad thing happened"
        );
    }

    #[tokio::test]
    async fn does_not_log_not_found_errors() {
        let capture = log::capture();
        let url = serve(
            Arc::new(|| {
                Err(not_found_error(
                    "Missing.",
                    ErrorOptions::code("thing.missing"),
                ))
            }),
            false,
        )
        .await;
        let (status, _) = get(&url, "/not-found-quiet").await;
        assert_eq!(status, 404);
        assert!(error_lines(&capture, "/not-found-quiet").is_empty());
    }

    #[tokio::test]
    async fn redacts_internal_messages_and_details_in_production() {
        let capture = log::capture();
        let url = serve(
            Arc::new(|| {
                Err(internal_error(
                    Some("database password is hunter2"),
                    ErrorOptions::default().with_details(json!({"secret": true})),
                ))
            }),
            true,
        )
        .await;
        let (status, text) = get(&url, "/redacted").await;
        assert_eq!(status, 500);
        assert!(!text.contains("hunter2"));
        assert!(!text.contains("secret"));
        assert_eq!(error_lines(&capture, "/redacted").len(), 1);
    }

    #[tokio::test]
    async fn answers_errors_that_carry_a_tarpit_plan_through_the_tarpit() {
        let capture = log::capture();
        let url = serve(
            Arc::new(|| {
                Err(bad_request_error(
                    "Suspicious.",
                    ErrorOptions::default()
                        .with_tarpit(json!({"body": "Go away.", "dripIntervalMs": 1000, "holdMs": 5, "statusCode": 418})),
                ))
            }),
            false,
        )
        .await;
        let (status, text) = get(&url, "/wp-admin").await;
        assert_eq!(status, 418);
        assert_eq!(text, " Go away.");
        assert_eq!(
            error_lines(&capture, "/wp-admin")[0],
            "[error] | 400 | Bad Request | GET | /wp-admin | Suspicious."
        );
    }

    #[tokio::test]
    async fn does_not_log_tarpitted_not_found_errors() {
        let capture = log::capture();
        let url = serve(
            Arc::new(|| {
                Err(not_found_error(
                    "Probe.",
                    ErrorOptions::default()
                        .with_tarpit(json!({"body": "No.", "dripIntervalMs": 1000, "holdMs": 5, "statusCode": 404})),
                ))
            }),
            false,
        )
        .await;
        let (status, text) = get(&url, "/tarpit-quiet").await;
        assert_eq!(status, 404);
        assert_eq!(text, " No.");
        assert!(error_lines(&capture, "/tarpit-quiet").is_empty());
    }

    #[tokio::test]
    async fn ignores_an_incomplete_tarpit_plan() {
        let url = serve(
            Arc::new(|| {
                Err(bad_request_error(
                    "Half plan.",
                    ErrorOptions::default().with_tarpit(json!({"body": "x", "holdMs": 5})),
                ))
            }),
            false,
        )
        .await;
        let (status, text) = get(&url, "/half-plan").await;
        assert_eq!(status, 400);
        assert_eq!(
            serde_json::from_str::<Value>(&text).unwrap()["message"],
            "Half plan."
        );
    }
}

mod capture_format_log_line {
    use super::*;

    #[test]
    fn falls_back_to_placeholders_without_a_request() {
        let pretty = PrettyLine {
            status_code: 500,
            status: String::new(),
            message: "  ".into(),
            url: None,
        };
        assert_eq!(
            format_log_line(&pretty, None),
            "[error] | 500 | Unknown | UNKNOWN | /"
        );
    }

    #[test]
    fn uses_the_request_method_and_url_when_the_error_has_no_url() {
        let req = RequestInfo {
            method: "POST".into(),
            url: "/from-request".into(),
        };
        let pretty = PrettyLine {
            status_code: 409,
            status: "Conflict".into(),
            message: "Taken".into(),
            url: None,
        };
        assert_eq!(
            format_log_line(&pretty, Some(&req)),
            "[error] | 409 | Conflict | POST | /from-request | Taken"
        );
    }
}
