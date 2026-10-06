//! Port of `server/test/integration/security.test.ts`.

mod common;

use common::actors::{SignUp, create_season, sign_up, unique_email};
use common::{CallOptions, Response, TestServer, assert_match};
use frisbee::shared::schemas::Session;
use frisbee::tables::SESSION;
use serde_json::{Value, json};

async fn set_password(server: &TestServer, email: &str, password: &str) -> Response {
    server
        .post(
            "/SecurityVerify",
            json!({"email": email, "code": server.latest_code(email), "newPassword": password}),
        )
        .await
}

mod security_endpoints {
    use super::*;

    #[tokio::test]
    async fn reports_the_status_of_unknown_passwordless_and_verified_accounts() {
        let server = TestServer::start().await;
        let unknown = unique_email("user");
        assert_eq!(
            server
                .post("/SecurityStatus", json!({"email": unknown}))
                .await
                .body,
            json!({"status": "unknown", "email": unknown})
        );

        let actor = sign_up(
            &server,
            SignUp {
                first_name: Some("Pat".into()),
                ..Default::default()
            },
        )
        .await;
        let passwordless = server
            .post("/SecurityStatus", json!({"email": actor.email}))
            .await;
        assert_eq!(
            passwordless.body,
            json!({"status": "password", "email": actor.email, "firstName": "Pat"})
        );

        assert_eq!(
            set_password(&server, &actor.email, "hunter22").await.status,
            200
        );
        let verified = server
            .post("/SecurityStatus", json!({"email": actor.email}))
            .await;
        assert_eq!(
            verified.body,
            json!({"status": "good", "email": actor.email, "firstName": "Pat"})
        );
    }

    #[tokio::test]
    async fn signs_up_a_user_without_exposing_secrets() {
        let server = TestServer::start().await;
        let email = unique_email("user");
        let response = server
            .post(
                "/SecuritySignUp",
                json!({
                    "email": email,
                    "firstName": "Sam",
                    "lastName": "Lee",
                    "genderMatching": "Female Matching",
                    "termsAccepted": true,
                }),
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body["user"],
            &json!({
                "firstName": "Sam",
                "lastName": "Lee",
                "genderMatching": "female",
                "termsAccepted": true,
            }),
        );
        assert!(response.body["user"].get("password").is_none());
        assert_match(
            &response.body["user"]["emails"],
            &json!([{"value": email, "primary": true, "verified": false}]),
        );
        assert!(response.body["user"]["emails"][0].get("code").is_none());
        assert!(response.body["session"]["token"].is_string());
    }

    #[tokio::test]
    async fn rejects_sign_up_without_terms_or_with_an_existing_email() {
        let server = TestServer::start().await;
        let terms = server
            .post(
                "/SecuritySignUp",
                json!({
                    "email": unique_email("user"),
                    "firstName": "A",
                    "lastName": "B",
                    "genderMatching": "male",
                    "termsAccepted": false,
                }),
            )
            .await;
        assert_eq!(terms.status, 400);
        assert_eq!(terms.body["errorCode"], "auth.terms_required");

        for gender_matching in ["non-binary", "other"] {
            let unmatched = server
                .post(
                    "/SecuritySignUp",
                    json!({
                        "email": unique_email("user"),
                        "firstName": "A",
                        "lastName": "B",
                        "genderMatching": gender_matching,
                        "termsAccepted": true,
                    }),
                )
                .await;
            assert_eq!(unmatched.status, 422);
        }

        let actor = sign_up(&server, SignUp::default()).await;
        let duplicate = server
            .post(
                "/SecuritySignUp",
                json!({
                    "email": actor.email.to_uppercase(),
                    "firstName": "A",
                    "lastName": "B",
                    "genderMatching": "male",
                    "termsAccepted": true,
                }),
            )
            .await;
        assert_eq!(duplicate.status, 409);
        assert_eq!(duplicate.body["errorCode"], "user.email_exists");
    }

    #[tokio::test]
    async fn logs_in_with_a_password_and_rejects_wrong_passwords() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        set_password(&server, &actor.email, "correct-horse").await;

        let wrong = server
            .post(
                "/SecurityLogin",
                json!({"email": actor.email, "password": "wrong-horse"}),
            )
            .await;
        assert_eq!(wrong.status, 401);
        assert_eq!(wrong.body["errorCode"], "auth.invalid_login");

        let missing = server
            .post(
                "/SecurityLogin",
                json!({"email": unique_email("user"), "password": "whatever"}),
            )
            .await;
        assert_eq!(missing.status, 401);
        assert_eq!(missing.body["errorCode"], "auth.invalid_login");

        let right = server
            .post(
                "/SecurityLogin",
                json!({"email": actor.email, "password": "correct-horse"}),
            )
            .await;
        assert_eq!(right.status, 200);
        assert_eq!(right.body["user"]["id"], json!(actor.user_id));
    }

    #[tokio::test]
    async fn rate_limits_repeated_failed_logins_from_one_client() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        set_password(&server, &actor.email, "correct-horse").await;
        let mut statuses = Vec::new();
        for _ in 0..6 {
            let response = server
                .post(
                    "/SecurityLogin",
                    json!({"email": actor.email, "password": "wrong"}),
                )
                .await;
            statuses.push(response.status);
        }
        assert_eq!(statuses[..5], [401, 401, 401, 401, 401]);
        assert_eq!(statuses[5], 429);
        let blocked = server
            .post(
                "/SecurityLogin",
                json!({"email": actor.email, "password": "correct-horse"}),
            )
            .await;
        assert_eq!(blocked.status, 429);
        assert_eq!(blocked.body["errorCode"], "auth.login_rate_limited");
    }

    #[tokio::test]
    async fn rejects_incorrect_verification_codes() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let response = server
            .post(
                "/SecurityVerify",
                json!({"email": actor.email, "code": "ZZZZ-ZZZZ", "newPassword": "abcdef"}),
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "user.code_invalid");
    }

    #[tokio::test]
    async fn rejects_short_passwords_on_verify() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let response = set_password(&server, &actor.email, "abc").await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "user.password_too_short");
    }

    #[tokio::test]
    async fn verifies_the_email_and_ends_other_sessions_when_the_password_is_reset() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let verified = set_password(&server, &actor.email, "first-pass").await;
        assert_eq!(verified.status, 200);
        assert_eq!(verified.body["user"]["emails"][0]["verified"], true);
        // the sign up session was ended by the password change
        let stale = server
            .post_as("/UserCurrentUpdate", json!({}), &actor.token)
            .await;
        assert_eq!(stale.status, 401);
        let fresh = server
            .post_as(
                "/UserCurrentUpdate",
                json!({"firstName": "Renamed"}),
                verified.body["session"]["token"].as_str().unwrap(),
            )
            .await;
        assert_eq!(fresh.status, 200);
        assert_eq!(fresh.body["firstName"], "Renamed");
    }

    #[tokio::test]
    async fn sends_a_restore_code_for_forgotten_passwords_without_revealing_accounts() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        set_password(&server, &actor.email, "first-pass").await;
        assert_eq!(
            server
                .post("/SecurityForgot", json!(actor.email))
                .await
                .status,
            204
        );
        assert_eq!(
            server
                .post("/SecurityForgot", json!(unique_email("user")))
                .await
                .status,
            204
        );
        let reset = set_password(&server, &actor.email, "second-pass").await;
        assert_eq!(reset.status, 200);
        let login = server
            .post(
                "/SecurityLogin",
                json!({"email": actor.email, "password": "second-pass"}),
            )
            .await;
        assert_eq!(login.status, 200);
    }

    #[tokio::test]
    async fn returns_the_current_season_and_auth_falling_back_to_the_newest_season() {
        let server = TestServer::start().await;
        let admin = sign_up(
            &server,
            SignUp {
                admin: true,
                ..Default::default()
            },
        )
        .await;
        let older = create_season(&server, &admin, json!({"name": "Older"})).await;
        // keep the creation times apart (the TS server is slower than a millisecond)
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        let newer = create_season(&server, &admin, json!({"name": "Newer"})).await;

        let anonymous = server.post("/SecurityCurrent", json!({})).await;
        assert_eq!(anonymous.status, 200);
        assert_eq!(anonymous.body["season"]["id"], newer["id"]);
        assert!(anonymous.body.get("auth").is_none());

        let chosen = server
            .post_as(
                "/SecurityCurrent",
                json!({"seasonId": older["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(chosen.body["season"]["id"], older["id"]);
        assert_eq!(chosen.body["auth"]["user"]["id"], json!(admin.user_id));
        assert_eq!(chosen.body["auth"]["user"]["admin"], true);

        // an invalid token is ignored rather than rejected
        let bogus = server
            .post_as("/SecurityCurrent", json!({}), "bogus")
            .await;
        assert_eq!(bogus.status, 200);
        assert!(bogus.body.get("auth").is_none());
    }

    #[tokio::test]
    async fn ends_the_session_on_logout() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        assert_eq!(
            server
                .call("/SecurityLogout", None, CallOptions::token(&actor.token))
                .await
                .status,
            204
        );
        let session = SESSION
            .get_one(server.db(), Session::USER_ID.eq(&actor.user_id))
            .await
            .unwrap();
        assert_eq!(session.ended, Some(true));
        let after = server
            .post_as("/UserCurrentUpdate", json!({}), &actor.token)
            .await;
        assert_eq!(after.status, 401);
        assert_eq!(after.body["errorCode"], "auth.token_invalid");
    }

    #[tokio::test]
    async fn distinguishes_missing_and_invalid_tokens() {
        let server = TestServer::start().await;
        let missing = server.post("/UserCurrentUpdate", json!({})).await;
        assert_eq!(missing.status, 401);
        assert_eq!(missing.body["errorCode"], "auth.token_missing");
        let invalid = server
            .post_as("/UserCurrentUpdate", json!({}), "abc")
            .await;
        assert_eq!(invalid.status, 401);
        assert_eq!(invalid.body["errorCode"], Value::from("auth.token_invalid"));
    }
}
