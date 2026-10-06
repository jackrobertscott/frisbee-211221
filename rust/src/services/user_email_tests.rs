//! Port of `server/src/services/userEmail.test.ts`.

use super::*;
use crate::shared::schemas::GenderMatching;
use crate::testing::TestApp;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

async fn create_user(app: &TestApp, emails: Vec<UserEmail>) -> User {
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    USER.create_one(
        app.db(),
        json!({
            "firstName": format!("First{counter}"),
            "lastName": "Last",
            "genderMatching": GenderMatching::Female,
            "termsAccepted": true,
            "emails": emails,
        }),
    )
    .await
    .unwrap()
}

fn email(app: &TestApp, value: &str) -> UserEmail {
    create(&app.state.config.jwt_secret, value, false, Some("ABCD1234")).unwrap()
}

fn with(mut email: UserEmail, adjust: impl FnOnce(&mut UserEmail)) -> UserEmail {
    adjust(&mut email);
    email
}

fn eleven_minutes_ago() -> String {
    js::date::to_iso_string(js::date::now_ms() - 11 * 60 * 1000)
}

mod user_email_sanitize {
    use super::*;

    #[test]
    fn returns_no_emails_for_anything_but_an_array() {
        assert!(sanitize(None).is_empty());
        assert!(sanitize(Some(&json!({"value": "a@example.com"}))).is_empty());
    }

    #[test]
    fn drops_invalid_entries_trims_values_and_keeps_the_existing_primary() {
        let app = TestApp::new(vec![]);
        let first = serde_json::to_value(email(&app, "first@example.com")).unwrap();
        let second = serde_json::to_value(with(email(&app, "second@example.com"), |e| {
            e.primary = true
        }))
        .unwrap();
        let with_value = |value: Value| {
            let mut entry = first.as_object().cloned().unwrap();
            entry.insert("value".into(), value);
            Value::Object(entry)
        };
        let sanitized = sanitize(Some(&json!([
            null,
            "a@example.com",
            with_value(json!("  first@example.com ")),
            with_value(json!("not-an-email")),
            with_value(json!(42)),
            second.clone(),
        ])));
        assert_eq!(
            sanitized,
            vec![with_value(json!("first@example.com")), second]
        );
    }

    #[test]
    fn makes_the_first_email_primary_when_none_is() {
        let app = TestApp::new(vec![]);
        let emails = json!([email(&app, "a@example.com"), email(&app, "b@example.com")]);
        let primaries: Vec<Value> = sanitize(Some(&emails))
            .iter()
            .map(|e| e["primary"].clone())
            .collect();
        assert_eq!(primaries, [json!(true), json!(false)]);
    }
}

mod user_email_sanitize_value {
    use super::*;

    #[test]
    fn trims_valid_emails_and_rejects_invalid_ones() {
        assert_eq!(
            sanitize_value("  a@example.com ").as_deref(),
            Some("a@example.com")
        );
        assert_eq!(sanitize_value("   "), None);
        assert_eq!(
            assert_value_valid("nope").unwrap_err().error_code,
            "user.email_invalid"
        );
    }
}

mod user_email_code_send {
    use super::*;

    #[tokio::test]
    async fn emails_a_formatted_code_with_the_first_name_escaped_in_production() {
        let app = TestApp::with_config(vec![], |config| config.is_production = true);
        let code = code_send(
            &app.state,
            "to@example.com",
            "<b>Tom & \"Jo\"</b>",
            "Login Code",
        )
        .await
        .unwrap();
        assert!(
            code.len() == 8
                && code
                    .bytes()
                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit()),
            "{code}"
        );
        let sent = app.transport.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(
            sent[0]["Destination"]["ToAddresses"],
            json!(["to@example.com"])
        );
        assert_eq!(
            sent[0]["Content"]["Simple"]["Subject"]["Data"],
            "Login Code"
        );
        let html = sent[0]["Content"]["Simple"]["Body"]["Html"]["Data"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(html.contains("Hey &lt;b&gt;Tom &amp; &quot;Jo&quot;&lt;/b&gt;,<br/><br/>"));
        assert!(html.contains(&format!("<strong>{}-{}</strong>", &code[..4], &code[4..])));
        // template indentation is stripped from every line
        assert!(html.split('\n').all(|line| line == js::trim(line)));
        assert!(app.state.security_codes.all().is_empty());
    }

    #[tokio::test]
    async fn logs_the_code_instead_of_emailing_outside_production() {
        let app = TestApp::new(vec![]);
        let capture = log::capture();
        let code = code_send(&app.state, "dev@example.com", "Dev", "Verify Email")
            .await
            .unwrap();
        assert!(app.transport.sent.lock().unwrap().is_empty());
        assert_eq!(
            capture.matching(log::Level::Log, "dev@example.com"),
            [format!(
                "[security-code] Verify Email dev@example.com {}-{} (email delivery skipped in development)",
                &code[..4],
                &code[4..]
            )]
        );
        assert_eq!(
            app.state.security_codes.latest("dev@example.com"),
            Some(format!("{}-{}", &code[..4], &code[4..]))
        );
    }
}

mod user_email_assert_code_valid {
    use super::*;

    #[tokio::test]
    async fn accepts_a_current_code_in_any_spacing_or_case() {
        let app = TestApp::new(vec![]);
        let user = create_user(
            &app,
            vec![with(email(&app, "valid@example.com"), |e| e.primary = true)],
        )
        .await;
        assert_code_valid(
            &app.state,
            &user,
            "VALID@example.com",
            "abcd - 1234",
            "1.1.1.1",
            "Expired",
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn rejects_an_incorrect_code() {
        let app = TestApp::new(vec![]);
        let user = create_user(
            &app,
            vec![with(email(&app, "wrong@example.com"), |e| e.primary = true)],
        )
        .await;
        let error = assert_code_valid(
            &app.state,
            &user,
            "wrong@example.com",
            "ABCD1235",
            "1.1.1.1",
            "Expired",
        )
        .await
        .unwrap_err();
        assert_eq!(error.error_code, "user.code_invalid");
    }

    #[tokio::test]
    async fn compares_legacy_plain_text_codes_directly() {
        let app = TestApp::new(vec![]);
        let legacy = with(email(&app, "legacy@example.com"), |e| {
            e.primary = true;
            e.code = "PLAIN123".into();
        });
        let user = create_user(&app, vec![legacy]).await;
        let secret = &app.state.config.jwt_secret;
        assert!(is_code_equal(secret, &user, "legacy@example.com", "plain-123").unwrap());
        assert!(!is_code_equal(secret, &user, "legacy@example.com", "PLAIN124").unwrap());
        assert_eq!(
            is_code_equal(secret, &user, "other@example.com", "x")
                .unwrap_err()
                .error_code,
            "user.email_not_found"
        );
    }

    #[tokio::test]
    async fn replaces_an_expired_code_with_a_new_one_and_reports_it_expired() {
        let app = TestApp::new(vec![]);
        let created_on = eleven_minutes_ago();
        let expired = with(email(&app, "expired@example.com"), |e| {
            e.primary = true;
            e.created_on = created_on.clone();
        });
        let user = create_user(&app, vec![expired]).await;
        let capture = log::capture();

        let error = assert_code_valid(
            &app.state,
            &user,
            "expired@example.com",
            "ABCD1234",
            "2.2.2.2",
            "New Code",
        )
        .await
        .unwrap_err();
        assert_eq!(error.error_code, "user.code_expired");
        assert_eq!(
            error.message,
            "Your code has expired. A new code has been sent to your email."
        );

        let sent = capture.matching(log::Level::Log, "expired@example.com");
        assert!(
            sent[0].starts_with("[security-code] New Code expired@example.com "),
            "{}",
            sent[0]
        );
        let words: Vec<&str> = sent[0].split(' ').collect();
        let new_code = words[words.len() - 6];
        let stored = USER.get_one(app.db(), User::ID.eq(&user.id)).await.unwrap();
        assert_eq!(
            stored.emails[0].code,
            hash::digest(&app.state.config.jwt_secret, &new_code.replace('-', ""))
        );
        assert!(js::date::parse(&stored.emails[0].created_on) > js::date::parse(&created_on));
        assert!(!is_code_expired(&stored, "expired@example.com").unwrap());
    }

    #[tokio::test]
    async fn stops_re_sending_expired_codes_once_the_delivery_limit_is_reached() {
        let app = TestApp::new(vec![]);
        let created_on = eleven_minutes_ago();
        let limited = with(email(&app, "limited@example.com"), |e| {
            e.primary = true;
            e.created_on = created_on.clone();
        });
        let user = create_user(&app, vec![limited]).await;
        for _ in 0..3 {
            let error = assert_code_valid(
                &app.state,
                &user,
                "limited@example.com",
                "ABCD1234",
                "3.3.3.3",
                "Code",
            )
            .await
            .unwrap_err();
            assert_eq!(error.error_code, "user.code_expired");
        }
        let error = assert_code_valid(
            &app.state,
            &user,
            "limited@example.com",
            "ABCD1234",
            "3.3.3.3",
            "Code",
        )
        .await
        .unwrap_err();
        assert_eq!(error.error_code, "user.code_delivery_rate_limited");
    }
}

mod user_email_remove {
    use super::*;

    #[tokio::test]
    async fn moves_primary_to_the_next_email_when_the_primary_is_removed() {
        let app = TestApp::new(vec![]);
        let user = create_user(
            &app,
            vec![
                with(email(&app, "one@example.com"), |e| e.primary = true),
                email(&app, "two@example.com"),
            ],
        )
        .await;
        let updated = remove(app.db(), &user, "ONE@example.com").await.unwrap();
        let pairs: Vec<(String, bool)> = updated
            .emails
            .iter()
            .map(|e| (e.value.clone(), e.primary))
            .collect();
        assert_eq!(pairs, [("two@example.com".to_string(), true)]);
        assert_eq!(
            remove(app.db(), &updated, "two@example.com")
                .await
                .unwrap_err()
                .error_code,
            "user.email_required"
        );
    }

    #[tokio::test]
    async fn finds_users_by_email_ignoring_case() {
        let app = TestApp::new(vec![]);
        let user = create_user(&app, vec![email(&app, "Case@Example.com")]).await;
        let found = maybe_user(app.db(), " case@example.COM ")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(found.id, user.id);
        assert_eq!(found.emails[0].value, "Case@Example.com");
        assert!(
            maybe_user(app.db(), "other@example.com")
                .await
                .unwrap()
                .is_none()
        );
    }
}
