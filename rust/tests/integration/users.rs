//! Port of `server/test/integration/users.test.ts`.
//!
//! The TS suite shares one server and creates its admin (and the UserList
//! fixtures) in `beforeAll`; here every test starts its own server, admin
//! and fixtures.

use crate::common::actors::{Actor, SignUp, create_season, create_team, sign_up, unique_email};
use crate::common::{CallOptions, TestServer, assert_match};
use frisbee::db::Patch;
use frisbee::shared::schemas::{Member, Report, Session, User, UserEmail};
use frisbee::tables::{MEMBER, REPORT, SESSION, USER};
use frisbee::utils::random::{generate_id, random_string};
use serde_json::{Value, json};
use std::time::Duration;

async fn wait(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms)).await;
}

fn tag() -> String {
    random_string(8).to_lowercase()
}

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

async fn admin(server: &TestServer) -> Actor {
    sign_up(
        server,
        SignUp {
            admin: true,
            ..Default::default()
        },
    )
    .await
}

#[derive(Default)]
struct NewUser<'a> {
    email: Option<String>,
    first_name: Option<&'a str>,
    last_name: Option<&'a str>,
    gender_matching: Option<&'a str>,
}

async fn create_user(server: &TestServer, admin: &Actor, user: NewUser<'_>) -> Value {
    let response = server
        .post_as(
            "/UserCreate",
            json!({
                "email": user.email.unwrap_or_else(|| unique_email("user")),
                "firstName": user.first_name.unwrap_or("Created"),
                "lastName": user.last_name.unwrap_or("User"),
                "genderMatching": user.gender_matching.unwrap_or("female"),
                "termsAccepted": false,
            }),
            &admin.token,
        )
        .await;
    assert_eq!(
        response.status, 200,
        "User create failed: {}",
        response.body
    );
    response.body
}

/// Sets a password via the logged verification code and returns the fresh session token.
async fn set_password(server: &TestServer, email: &str, password: &str) -> String {
    let response = server
        .post(
            "/SecurityVerify",
            json!({"email": email, "code": server.latest_code(email), "newPassword": password}),
        )
        .await;
    assert_eq!(response.status, 200, "Verify failed: {}", response.body);
    response.body["session"]["token"]
        .as_str()
        .unwrap()
        .to_string()
}

async fn login(server: &TestServer, email: &str, password: &str) -> String {
    let response = server
        .post(
            "/SecurityLogin",
            json!({"email": email, "password": password}),
        )
        .await;
    assert_eq!(response.status, 200, "Login failed: {}", response.body);
    response.body["session"]["token"]
        .as_str()
        .unwrap()
        .to_string()
}

async fn get_user(server: &TestServer, user_id: &str) -> User {
    USER.get_one(server.db(), User::ID.eq(user_id))
        .await
        .unwrap()
}

mod user_list {
    use super::*;

    struct Fixture {
        server: TestServer,
        admin: Actor,
        t: String,
        u1: Value,
        u2: Value,
        u3: Value,
    }

    async fn setup() -> Fixture {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let t = tag();
        let u1 = create_user(
            &server,
            &admin,
            NewUser {
                first_name: Some("Cara"),
                last_name: Some(&format!("Beta{t}")),
                email: Some(format!("alpha.{t}@example.com")),
                gender_matching: Some("female"),
            },
        )
        .await;
        wait(5).await;
        let u2 = create_user(
            &server,
            &admin,
            NewUser {
                first_name: Some("Abe"),
                last_name: Some(&format!("Gamma{t}")),
                email: Some(format!("charlie.{t}@example.com")),
                gender_matching: Some("male"),
            },
        )
        .await;
        wait(5).await;
        let u3 = create_user(
            &server,
            &admin,
            NewUser {
                first_name: Some("Bob"),
                last_name: Some(&format!("Alpha{t}")),
                email: Some(format!("bravo.{t}@example.com")),
                gender_matching: Some("male"),
            },
        )
        .await;
        // u2 gains a non-primary email that would sort first if it were used
        server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": u2["id"], "email": format!("aaa.{t}@example.com")}),
                &admin.token,
            )
            .await;
        // u3's primary email moves to one that sorts last
        server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": u3["id"], "email": format!("zulu.{t}@example.com")}),
                &admin.token,
            )
            .await;
        server
            .post_as(
                "/UserEmailPrimarySet",
                json!({"userId": u3["id"], "email": format!("zulu.{t}@example.com")}),
                &admin.token,
            )
            .await;
        Fixture {
            server,
            admin,
            t,
            u1,
            u2,
            u3,
        }
    }

    async fn list(f: &Fixture, payload: Value) -> Value {
        let response = f.server.post_as("/UserList", payload, &f.admin.token).await;
        assert_eq!(response.status, 200, "{}", response.body);
        response.body
    }

    fn ids(result: &Value) -> Vec<String> {
        result["users"].as_array().unwrap().iter().map(id).collect()
    }

    fn of(users: &[&Value]) -> Vec<String> {
        users.iter().map(|u| id(u)).collect()
    }

    #[tokio::test]
    async fn is_admin_only() {
        let f = setup().await;
        let player = sign_up(&f.server, SignUp::default()).await;
        let response = f
            .server
            .post_as("/UserList", json!({}), &player.token)
            .await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["errorCode"], "auth.admin_required");
        let anonymous = f.server.post("/UserList", json!({})).await;
        assert_eq!(anonymous.status, 401);
    }

    #[tokio::test]
    async fn searches_first_name_last_name_and_any_email_case_insensitively() {
        let f = setup().await;
        let t = &f.t;
        let all = list(&f, json!({"search": t})).await;
        assert_eq!(all["count"], 3);
        let mut found = ids(&all);
        found.sort();
        let mut expected = of(&[&f.u1, &f.u2, &f.u3]);
        expected.sort();
        assert_eq!(found, expected);

        let by_last = list(&f, json!({"search": format!("gamma{t}").to_uppercase()})).await;
        assert_eq!(ids(&by_last), of(&[&f.u2]));

        let by_secondary_email = list(&f, json!({"search": format!("aaa.{t}")})).await;
        assert_eq!(ids(&by_secondary_email), of(&[&f.u2]));

        let first_name = format!("First{}", tag());
        let named = create_user(
            &f.server,
            &f.admin,
            NewUser {
                first_name: Some(&first_name),
                last_name: Some("Plain"),
                ..Default::default()
            },
        )
        .await;
        let by_first = list(&f, json!({"search": first_name.to_lowercase()})).await;
        assert_eq!(ids(&by_first), of(&[&named]));

        // regex characters are escaped
        let escaped = list(&f, json!({"search": format!(".*{t}")})).await;
        assert_eq!(escaped["count"], 0);
    }

    #[tokio::test]
    async fn returns_safe_user_fields() {
        let f = setup().await;
        let t = &f.t;
        let result = list(&f, json!({"search": format!("charlie.{t}")})).await;
        let user = &result["users"][0];
        assert!(user.get("password").is_none());
        let values: Vec<&str> = user["emails"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["value"].as_str().unwrap())
            .collect();
        assert_eq!(
            values,
            [
                format!("charlie.{t}@example.com"),
                format!("aaa.{t}@example.com")
            ]
        );
        for email in user["emails"].as_array().unwrap() {
            assert!(email.get("code").is_none());
        }
    }

    #[tokio::test]
    async fn defaults_to_created_on_descending() {
        let f = setup().await;
        let result = list(&f, json!({"search": f.t})).await;
        assert_eq!(ids(&result), of(&[&f.u3, &f.u2, &f.u1]));
    }

    /// `it.each(...)('sorts by %s %s')`: one test per case.
    async fn sorts_by(sort_by: &str, direction: &str, expected: fn(&Fixture) -> Vec<String>) {
        let f = setup().await;
        let result = list(
            &f,
            json!({"search": f.t, "sortBy": sort_by, "sortDirection": direction}),
        )
        .await;
        assert_eq!(ids(&result), expected(&f), "{sort_by} {direction}");
        assert_eq!(result["count"], 3);
    }

    #[tokio::test]
    async fn sorts_by_first_name_asc() {
        sorts_by("firstName", "asc", |f| of(&[&f.u2, &f.u3, &f.u1])).await;
    }

    #[tokio::test]
    async fn sorts_by_first_name_desc() {
        sorts_by("firstName", "desc", |f| of(&[&f.u1, &f.u3, &f.u2])).await;
    }

    #[tokio::test]
    async fn sorts_by_last_name_asc() {
        sorts_by("lastName", "asc", |f| of(&[&f.u3, &f.u1, &f.u2])).await;
    }

    #[tokio::test]
    async fn sorts_by_last_name_desc() {
        sorts_by("lastName", "desc", |f| of(&[&f.u2, &f.u1, &f.u3])).await;
    }

    // primary emails: alpha (u1), charlie (u2), zulu (u3)
    #[tokio::test]
    async fn sorts_by_email_asc() {
        sorts_by("email", "asc", |f| of(&[&f.u1, &f.u2, &f.u3])).await;
    }

    #[tokio::test]
    async fn sorts_by_email_desc() {
        sorts_by("email", "desc", |f| of(&[&f.u3, &f.u2, &f.u1])).await;
    }

    // female (u1) before male, with males tie-broken by last name: Alpha (u3), Gamma (u2)
    #[tokio::test]
    async fn sorts_by_gender_matching_asc() {
        sorts_by("genderMatching", "asc", |f| of(&[&f.u1, &f.u3, &f.u2])).await;
    }

    #[tokio::test]
    async fn sorts_by_gender_matching_desc() {
        sorts_by("genderMatching", "desc", |f| of(&[&f.u3, &f.u2, &f.u1])).await;
    }

    #[tokio::test]
    async fn sorts_by_created_on_asc() {
        sorts_by("createdOn", "asc", |f| of(&[&f.u1, &f.u2, &f.u3])).await;
    }

    #[tokio::test]
    async fn sorts_by_created_on_desc() {
        sorts_by("createdOn", "desc", |f| of(&[&f.u3, &f.u2, &f.u1])).await;
    }

    #[tokio::test]
    async fn uses_name_tie_breakers_in_ascending_order_regardless_of_direction() {
        let f = setup().await;
        let t2 = tag();
        async fn user(f: &Fixture, first: &str, last: String) -> Value {
            create_user(
                &f.server,
                &f.admin,
                NewUser {
                    first_name: Some(first),
                    last_name: Some(&last),
                    gender_matching: Some("male"),
                    ..Default::default()
                },
            )
            .await
        }
        let a = user(&f, "Same", format!("B{t2}")).await;
        let b = user(&f, "Same", format!("A{t2}")).await;
        let c = user(&f, "Zed", format!("C{t2}")).await;
        let result = list(
            &f,
            json!({"search": t2, "sortBy": "firstName", "sortDirection": "desc"}),
        )
        .await;
        assert_eq!(ids(&result), of(&[&c, &b, &a]));
        let result = list(
            &f,
            json!({"search": t2, "sortBy": "genderMatching", "sortDirection": "desc"}),
        )
        .await;
        assert_eq!(ids(&result), of(&[&b, &a, &c]));
    }

    #[tokio::test]
    async fn applies_skip_and_limit_after_sorting_while_counting_all_matches() {
        let f = setup().await;
        let page = list(
            &f,
            json!({"search": f.t, "sortBy": "firstName", "sortDirection": "asc", "skip": 1, "limit": 1}),
        )
        .await;
        assert_eq!(page["count"], 3);
        assert_eq!(ids(&page), of(&[&f.u3]));

        let email_page = list(
            &f,
            json!({"search": f.t, "sortBy": "email", "sortDirection": "asc", "skip": 2, "limit": 5}),
        )
        .await;
        assert_eq!(email_page["count"], 3);
        assert_eq!(ids(&email_page), of(&[&f.u3]));
        assert!(email_page["users"][0].get("_sortPrimaryEmail").is_none());
    }
}

mod user_create_update_toggle_admin {
    use super::*;

    #[tokio::test]
    async fn creates_a_user_with_one_unverified_primary_email() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let email = unique_email("user");
        let user = create_user(
            &server,
            &admin,
            NewUser {
                email: Some(email.clone()),
                first_name: Some("New"),
                gender_matching: Some("Female"),
                ..Default::default()
            },
        )
        .await;
        assert_match(
            &user,
            &json!({"firstName": "New", "genderMatching": "female", "termsAccepted": false}),
        );
        let emails = user["emails"].as_array().unwrap();
        assert_eq!(emails.len(), 1);
        assert_match(
            &emails[0],
            &json!({"value": email, "primary": true, "verified": false}),
        );
        assert!(emails[0].get("code").is_none());
    }

    #[tokio::test]
    async fn rejects_a_duplicate_email_case_insensitively() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let email = unique_email("user");
        create_user(
            &server,
            &admin,
            NewUser {
                email: Some(email.clone()),
                ..Default::default()
            },
        )
        .await;
        let response = server
            .post_as(
                "/UserCreate",
                json!({
                    "email": email.to_uppercase(),
                    "firstName": "A",
                    "lastName": "B",
                    "genderMatching": "male",
                    "termsAccepted": true,
                }),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 409);
        assert_eq!(response.body["errorCode"], "user.email_exists");
    }

    #[tokio::test]
    async fn requires_admin_to_create() {
        let server = TestServer::start().await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/UserCreate",
                json!({
                    "email": unique_email("user"),
                    "firstName": "A",
                    "lastName": "B",
                    "genderMatching": "male",
                    "termsAccepted": true,
                }),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
    }

    #[tokio::test]
    async fn updates_a_user() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user = create_user(&server, &admin, NewUser::default()).await;
        wait(5).await;
        let response = server
            .post_as(
                "/UserUpdate",
                json!({"userId": user["id"], "firstName": "Changed", "genderMatching": "Male Matching"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "id": user["id"],
                "firstName": "Changed",
                "lastName": user["lastName"],
                "genderMatching": "male",
            }),
        );
        assert!(response.body["updatedOn"].as_str().unwrap() > user["updatedOn"].as_str().unwrap());
        assert_eq!(get_user(&server, &id(&user)).await.first_name, "Changed");

        for gender_matching in ["non-binary", "other"] {
            let unmatched = server
                .post_as(
                    "/UserUpdate",
                    json!({"userId": user["id"], "genderMatching": gender_matching}),
                    &admin.token,
                )
                .await;
            assert_eq!(unmatched.status, 422);
        }
        assert_eq!(
            get_user(&server, &id(&user)).await.gender_matching.as_str(),
            "male"
        );

        let missing = server
            .post_as(
                "/UserUpdate",
                json!({"userId": generate_id(), "firstName": "X"}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 404);
        assert_eq!(missing.body["errorCode"], "db.record_not_found");
    }

    #[tokio::test]
    async fn toggles_admin_on_and_off() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user = create_user(&server, &admin, NewUser::default()).await;
        let on = server
            .post_as(
                "/UserToggleAdmin",
                json!({"userId": user["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(on.status, 200);
        assert_eq!(on.body["admin"], true);
        let off = server
            .post_as(
                "/UserToggleAdmin",
                json!({"userId": user["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(off.body["admin"], false);
        assert_eq!(get_user(&server, &id(&user)).await.admin, Some(false));
    }
}

mod admin_email_management {
    use super::*;

    fn pairs(user: &Value, field: &str) -> Vec<(String, bool)> {
        user["emails"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                (
                    e["value"].as_str().unwrap().to_string(),
                    e[field].as_bool().unwrap(),
                )
            })
            .collect()
    }

    #[tokio::test]
    async fn adds_sets_primary_sets_verified_and_removes_emails() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let first = unique_email("first");
        let second = unique_email("second");
        let user = create_user(
            &server,
            &admin,
            NewUser {
                email: Some(first.clone()),
                ..Default::default()
            },
        )
        .await;

        let added = server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": user["id"], "email": second}),
                &admin.token,
            )
            .await;
        assert_eq!(added.status, 200);
        assert_match(
            &added.body["emails"],
            &json!([
                {"value": first, "primary": true, "verified": false},
                {"value": second, "primary": false, "verified": false},
            ]),
        );
        // a code was sent to the new address
        let code = server.latest_code(&second);
        assert!(
            code.len() == 9
                && code.as_bytes()[4] == b'-'
                && code
                    .chars()
                    .enumerate()
                    .all(|(i, c)| i == 4 || c.is_alphanumeric() || c == '_'),
            "{code}"
        );

        let again = server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": user["id"], "email": second.to_uppercase()}),
                &admin.token,
            )
            .await;
        assert_eq!(again.status, 409);
        assert_eq!(again.body["errorCode"], "user.email_exists");

        let other = create_user(&server, &admin, NewUser::default()).await;
        let taken = server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": other["id"], "email": first}),
                &admin.token,
            )
            .await;
        assert_eq!(taken.status, 409);
        assert_eq!(taken.body["errorCode"], "user.email_exists");

        let primary = server
            .post_as(
                "/UserEmailPrimarySet",
                json!({"userId": user["id"], "email": second.to_uppercase()}),
                &admin.token,
            )
            .await;
        assert_eq!(primary.status, 200);
        assert_eq!(
            pairs(&primary.body, "primary"),
            [(first.clone(), false), (second.clone(), true)]
        );

        let verified = server
            .post_as(
                "/UserEmailVerifiedSet",
                json!({"userId": user["id"], "email": first, "verified": true}),
                &admin.token,
            )
            .await;
        let flags: Vec<bool> = pairs(&verified.body, "verified")
            .into_iter()
            .map(|(_, v)| v)
            .collect();
        assert_eq!(flags, [true, false]);
        let unverified = server
            .post_as(
                "/UserEmailVerifiedSet",
                json!({"userId": user["id"], "email": first, "verified": false}),
                &admin.token,
            )
            .await;
        let flags: Vec<bool> = pairs(&unverified.body, "verified")
            .into_iter()
            .map(|(_, v)| v)
            .collect();
        assert_eq!(flags, [false, false]);

        // removing the primary promotes the first remaining email
        let removed = server
            .post_as(
                "/UserEmailRemove",
                json!({"userId": user["id"], "email": second}),
                &admin.token,
            )
            .await;
        assert_eq!(removed.status, 200);
        assert_match(
            &removed.body["emails"],
            &json!([{"value": first, "primary": true}]),
        );

        let last = server
            .post_as(
                "/UserEmailRemove",
                json!({"userId": user["id"], "email": first}),
                &admin.token,
            )
            .await;
        assert_eq!(last.status, 400);
        assert_eq!(last.body["errorCode"], "user.email_required");
    }

    #[tokio::test]
    async fn reports_unknown_emails_as_not_found() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user = create_user(&server, &admin, NewUser::default()).await;
        for path in ["/UserEmailPrimarySet", "/UserEmailRemove"] {
            let response = server
                .post_as(
                    path,
                    json!({"userId": user["id"], "email": unique_email("user")}),
                    &admin.token,
                )
                .await;
            assert_eq!(response.status, 404, "{path}");
            assert_eq!(response.body["errorCode"], "user.email_not_found");
        }
        let verified = server
            .post_as(
                "/UserEmailVerifiedSet",
                json!({"userId": user["id"], "email": unique_email("user"), "verified": true}),
                &admin.token,
            )
            .await;
        assert_eq!(verified.status, 404);
        assert_eq!(verified.body["errorCode"], "user.email_not_found");
    }

    #[tokio::test]
    async fn rejects_invalid_email_values() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user = create_user(&server, &admin, NewUser::default()).await;
        let response = server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": user["id"], "email": "not-an-email"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 422);
        assert_eq!(response.body["errorCode"], "validation_error");
    }

    #[tokio::test]
    async fn requires_admin() {
        let server = TestServer::start().await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/UserEmailAdd",
                json!({"userId": player.user_id, "email": unique_email("user")}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
    }
}

mod current_user {
    use super::*;

    #[tokio::test]
    async fn updates_the_current_user() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/UserCurrentUpdate",
                json!({"firstName": "Me", "lastName": "Myself", "genderMatching": "m"}),
                &actor.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "id": actor.user_id,
                "firstName": "Me",
                "lastName": "Myself",
                "genderMatching": "male",
            }),
        );
        assert!(response.body.get("password").is_none());
    }

    #[tokio::test]
    async fn adds_verifies_resends_sets_primary_and_removes_own_emails() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let second = unique_email("second");

        let added = server
            .post_as(
                "/UserCurrentEmailAdd",
                json!({"email": second}),
                &actor.token,
            )
            .await;
        assert_eq!(added.status, 200);
        assert_match(
            &added.body["emails"][1],
            &json!({"value": second, "primary": false, "verified": false}),
        );

        let duplicate = server
            .post_as(
                "/UserCurrentEmailAdd",
                json!({"email": second}),
                &actor.token,
            )
            .await;
        assert_eq!(duplicate.status, 409);
        assert_eq!(duplicate.body["errorCode"], "user.email_exists");

        let first_code = server.latest_code(&second);
        let resent = server
            .post_as(
                "/UserCurrentEmailCodeResend",
                json!({"email": second}),
                &actor.token,
            )
            .await;
        assert_eq!(resent.status, 200);
        let second_code = server.latest_code(&second);
        assert_ne!(second_code, first_code);

        let wrong = server
            .post_as(
                "/UserCurrentEmailVerify",
                json!({"email": second, "code": "ZZZZ-ZZZZ"}),
                &actor.token,
            )
            .await;
        assert_eq!(wrong.status, 400);
        assert_eq!(wrong.body["errorCode"], "user.code_invalid");

        // the old code was replaced by the resend
        let stale = server
            .post_as(
                "/UserCurrentEmailVerify",
                json!({"email": second, "code": first_code}),
                &actor.token,
            )
            .await;
        assert_eq!(stale.status, 400);
        assert_eq!(stale.body["errorCode"], "user.code_invalid");

        let verified = server
            .post_as(
                "/UserCurrentEmailVerify",
                json!({"email": second, "code": second_code.to_lowercase()}),
                &actor.token,
            )
            .await;
        assert_eq!(verified.status, 200);
        assert_match(
            &verified.body["emails"][1],
            &json!({"value": second, "verified": true}),
        );

        // the used code cannot be replayed
        let replay = server
            .post_as(
                "/UserCurrentEmailVerify",
                json!({"email": second, "code": second_code}),
                &actor.token,
            )
            .await;
        assert_eq!(replay.status, 400);
        assert_eq!(replay.body["errorCode"], "user.code_invalid");

        let primary = server
            .post_as(
                "/UserCurrentEmailPrimarySet",
                json!({"email": second}),
                &actor.token,
            )
            .await;
        let flags: Vec<bool> = primary.body["emails"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["primary"].as_bool().unwrap())
            .collect();
        assert_eq!(flags, [false, true]);

        let removed = server
            .post_as(
                "/UserCurrentEmailRemove",
                json!({"email": second}),
                &actor.token,
            )
            .await;
        assert_eq!(removed.status, 200);
        assert_match(
            &removed.body["emails"],
            &json!([{"value": actor.email, "primary": true}]),
        );

        let last = server
            .post_as(
                "/UserCurrentEmailRemove",
                json!({"email": actor.email}),
                &actor.token,
            )
            .await;
        assert_eq!(last.status, 400);
        assert_eq!(last.body["errorCode"], "user.email_required");
    }

    #[tokio::test]
    async fn reports_unknown_emails_on_verify_and_resend_as_not_found() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let verify = server
            .post_as(
                "/UserCurrentEmailVerify",
                json!({"email": unique_email("user"), "code": "ABCD-EFGH"}),
                &actor.token,
            )
            .await;
        assert_eq!(verify.status, 404);
        assert_eq!(verify.body["errorCode"], "user.email_not_found");
        let resend = server
            .post_as(
                "/UserCurrentEmailCodeResend",
                json!({"email": unique_email("user")}),
                &actor.token,
            )
            .await;
        assert_eq!(resend.status, 404);
        assert_eq!(resend.body["errorCode"], "user.email_not_found");
    }

    #[tokio::test]
    async fn rate_limits_code_resends_per_email() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let second = unique_email("limited");
        // the add itself counts as one delivery
        server
            .post_as(
                "/UserCurrentEmailAdd",
                json!({"email": second}),
                &actor.token,
            )
            .await;
        let mut statuses = Vec::new();
        for _ in 0..3 {
            let response = server
                .post_as(
                    "/UserCurrentEmailCodeResend",
                    json!({"email": second}),
                    &actor.token,
                )
                .await;
            statuses.push(response.status);
        }
        assert_eq!(statuses, [200, 200, 429]);
    }

    #[tokio::test]
    async fn requires_sign_in() {
        let server = TestServer::start().await;
        let response = server
            .post(
                "/UserCurrentEmailAdd",
                json!({"email": unique_email("user")}),
            )
            .await;
        assert_eq!(response.status, 401);
        assert_eq!(response.body["errorCode"], "auth.token_missing");
    }
}

mod password_changes {
    use super::*;

    #[tokio::test]
    async fn requires_a_password_and_the_correct_old_password() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let none = server
            .post_as(
                "/UserCurrentChangePassword",
                json!({"oldPassword": "x", "newPassword": "abcdefgh"}),
                &actor.token,
            )
            .await;
        assert_eq!(none.status, 400);
        assert_eq!(none.body["errorCode"], "user.password_missing");

        let token = set_password(&server, &actor.email, "first-pass").await;
        let wrong = server
            .post_as(
                "/UserCurrentChangePassword",
                json!({"oldPassword": "wrong-pass", "newPassword": "second-pass"}),
                &token,
            )
            .await;
        assert_eq!(wrong.status, 400);
        assert_eq!(wrong.body["errorCode"], "user.old_password_invalid");

        let short = server
            .post_as(
                "/UserCurrentChangePassword",
                json!({"oldPassword": "first-pass", "newPassword": "abc"}),
                &token,
            )
            .await;
        assert_eq!(short.status, 400);
        assert_eq!(short.body["errorCode"], "user.password_too_short");
    }

    #[tokio::test]
    async fn ends_other_sessions_but_keeps_the_current_one() {
        let server = TestServer::start().await;
        let actor = sign_up(&server, SignUp::default()).await;
        let current = set_password(&server, &actor.email, "first-pass").await;
        let other = login(&server, &actor.email, "first-pass").await;

        let response = server
            .post_as(
                "/UserCurrentChangePassword",
                json!({"oldPassword": "first-pass", "newPassword": "second-pass"}),
                &current,
            )
            .await;
        assert_eq!(response.status, 200);
        assert!(response.body.get("password").is_none());

        assert_eq!(
            server
                .post_as("/UserCurrentUpdate", json!({}), &other)
                .await
                .status,
            401
        );
        assert_eq!(
            server
                .post_as("/UserCurrentUpdate", json!({}), &current)
                .await
                .status,
            200
        );
        assert!(!login(&server, &actor.email, "second-pass").await.is_empty());
        let old = server
            .post(
                "/SecurityLogin",
                json!({"email": actor.email, "password": "first-pass"}),
            )
            .await;
        assert_eq!(old.status, 401);
    }

    #[tokio::test]
    async fn lets_an_admin_set_a_password_and_ends_all_of_that_users_sessions() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let actor = sign_up(&server, SignUp::default()).await;
        let token = set_password(&server, &actor.email, "first-pass").await;

        let short = server
            .post_as(
                "/UserChangePassword",
                json!({"userId": actor.user_id, "newPassword": "abc"}),
                &admin.token,
            )
            .await;
        assert_eq!(short.status, 400);
        assert_eq!(short.body["errorCode"], "user.password_too_short");

        let response = server
            .post_as(
                "/UserChangePassword",
                json!({"userId": actor.user_id, "newPassword": "admin-set"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert!(response.body.get("password").is_none());
        assert_eq!(
            server
                .post_as("/UserCurrentUpdate", json!({}), &token)
                .await
                .status,
            401
        );
        let sessions = SESSION
            .get_many(
                server.db(),
                Session::USER_ID.eq(&actor.user_id),
                frisbee::db::Query::new(),
            )
            .await
            .unwrap();
        assert!(sessions.iter().all(|s| s.ended == Some(true)));
        assert!(!login(&server, &actor.email, "admin-set").await.is_empty());

        let player = sign_up(&server, SignUp::default()).await;
        let forbidden = server
            .post_as(
                "/UserChangePassword",
                json!({"userId": actor.user_id, "newPassword": "whatever"}),
                &player.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);
    }
}

mod user_merge {
    use super::*;

    async fn create_member(
        server: &TestServer,
        user_id: &str,
        season_id: &str,
        team_id: &str,
        pending: bool,
        captain: bool,
    ) -> Member {
        let mut value = json!({
            "userId": user_id,
            "seasonId": season_id,
            "teamId": team_id,
            "pending": pending,
        });
        if captain {
            value["captain"] = json!(true);
        }
        MEMBER.create_one(server.db(), value).await.unwrap()
    }

    async fn get_report(server: &TestServer, report_id: &str) -> Report {
        REPORT
            .get_one(server.db(), Report::ID.eq(report_id))
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn cannot_merge_a_user_into_itself() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user = create_user(&server, &admin, NewUser::default()).await;
        let response = server
            .post_as(
                "/UserMerge",
                json!({"user1Id": user["id"], "user2Id": user["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "user.merge_invalid");
    }

    #[tokio::test]
    async fn requires_admin() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let player = sign_up(&server, SignUp::default()).await;
        let other = create_user(&server, &admin, NewUser::default()).await;
        let response = server
            .post_as(
                "/UserMerge",
                json!({"user1Id": player.user_id, "user2Id": other["id"]}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
    }

    #[tokio::test]
    async fn moves_members_reports_sessions_and_emails_onto_the_first_user() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season =
            create_season(&server, &admin, json!({"name": format!("Merge {}", tag())})).await;
        let season_id = id(&season);
        let t1 = id(&create_team(&server, &admin, &season_id, "Merge One", json!({})).await);
        let t2 = id(&create_team(&server, &admin, &season_id, "Merge Two", json!({})).await);
        let t3 = id(&create_team(&server, &admin, &season_id, "Merge Three", json!({})).await);

        let user1 = sign_up(
            &server,
            SignUp {
                first_name: Some("Keep".into()),
                ..Default::default()
            },
        )
        .await;
        let user2 = sign_up(
            &server,
            SignUp {
                first_name: Some("Drop".into()),
                ..Default::default()
            },
        )
        .await;
        let prior_merged_id = generate_id();
        let epoch = "1970-01-01T00:00:00.000Z";
        // user2 also holds user1's address (verified) and was an admin with earlier merges
        let user2_doc = get_user(&server, &user2.user_id).await;
        let emails = vec![
            UserEmail {
                verified: true,
                ..user2_doc.emails[0].clone()
            },
            UserEmail {
                value: user1.email.to_uppercase(),
                verified: true,
                primary: false,
                code: "x".into(),
                created_on: epoch.into(),
            },
        ];
        USER.update_one(
            server.db(),
            User::ID.eq(&user2.user_id),
            Patch::new()
                .set(User::ADMIN, true)
                .set(User::USER_MERGED_IDS, vec![prior_merged_id.clone()])
                .set_list(&User::EMAILS, &emails),
        )
        .await
        .unwrap();

        // t1: user1 pending, user2 confirmed -> user2's membership wins
        let u1t1 = create_member(&server, &user1.user_id, &season_id, &t1, true, false).await;
        let u2t1 = create_member(&server, &user2.user_id, &season_id, &t1, false, false).await;
        // t2: only user2 -> moved
        let u2t2 = create_member(&server, &user2.user_id, &season_id, &t2, false, true).await;
        // t3: both confirmed -> user1's kept, user2's dropped
        let u1t3 = create_member(&server, &user1.user_id, &season_id, &t3, false, false).await;
        let u2t3 = create_member(&server, &user2.user_id, &season_id, &t3, false, false).await;

        let report_base = json!({
            "teamId": t1,
            "teamAgainstId": t2,
            "fixtureId": generate_id(),
            "scoreFor": 1,
            "scoreAgainst": 2,
            "spiritComment": "",
        });
        let report = |extra: Value| {
            let mut value = report_base.clone();
            value
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            value
        };
        let r1 = REPORT
            .create_one(
                server.db(),
                report(json!({
                    "userId": user2.user_id,
                    "mvpMale": user2.user_id,
                    "mvpMale2": user1.user_id,
                })),
            )
            .await
            .unwrap();
        let r2 = REPORT
            .create_one(
                server.db(),
                report(json!({
                    "userId": user1.user_id,
                    "mvpFemale": user1.user_id,
                    "mvpFemale2": user2.user_id,
                })),
            )
            .await
            .unwrap();
        let unrelated_id = generate_id();
        let r3 = REPORT
            .create_one(
                server.db(),
                report(json!({"mvpMale": unrelated_id, "mvpFemale": user2.user_id})),
            )
            .await
            .unwrap();

        let response = server
            .post_as(
                "/UserMerge",
                json!({"user1Id": user1.user_id, "user2Id": user2.user_id}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200, "{}", response.body);
        let merged = &response.body;
        assert_eq!(merged["id"], json!(user1.user_id));
        assert_eq!(merged["firstName"], "Keep");
        assert_eq!(merged["admin"], true);
        assert!(merged.get("password").is_none());
        assert_eq!(
            merged["userMergedIds"],
            json!([user2.user_id, prior_merged_id])
        );

        // emails merged by address, single primary, verified carried over
        assert_match(
            &merged["emails"],
            &json!([
                {
                    "value": user1.email.to_uppercase(),
                    "primary": true,
                    "verified": true,
                    "createdOn": epoch,
                },
                {"value": user2.email, "primary": false, "verified": true},
            ]),
        );
        let primaries = merged["emails"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["primary"] == true)
            .count();
        assert_eq!(primaries, 1);

        assert!(
            USER.maybe_one(server.db(), User::ID.eq(&user2.user_id))
                .await
                .unwrap()
                .is_none()
        );

        let members = MEMBER
            .get_many(
                server.db(),
                Member::SEASON_ID.eq(&season_id),
                frisbee::db::Query::new(),
            )
            .await
            .unwrap();
        let by_team = |team_id: &str| -> Vec<&Member> {
            members.iter().filter(|m| m.team_id == team_id).collect()
        };
        let t1_members: Vec<(String, String, bool)> = by_team(&t1)
            .iter()
            .map(|m| (m.id.clone(), m.user_id.clone(), m.pending))
            .collect();
        assert_eq!(
            t1_members,
            [(u2t1.id.clone(), user1.user_id.clone(), false)]
        );
        let t2_members: Vec<(String, String, Option<bool>)> = by_team(&t2)
            .iter()
            .map(|m| (m.id.clone(), m.user_id.clone(), m.captain))
            .collect();
        assert_eq!(
            t2_members,
            [(u2t2.id.clone(), user1.user_id.clone(), Some(true))]
        );
        let t3_members: Vec<(String, String)> = by_team(&t3)
            .iter()
            .map(|m| (m.id.clone(), m.user_id.clone()))
            .collect();
        assert_eq!(t3_members, [(u1t3.id.clone(), user1.user_id.clone())]);
        assert!(!members.iter().any(|m| m.id == u1t1.id || m.id == u2t3.id));
        assert_eq!(
            MEMBER
                .count(server.db(), Member::USER_ID.eq(&user2.user_id))
                .await
                .unwrap(),
            0
        );

        let report1 = get_report(&server, &r1.id).await;
        assert_eq!(report1.user_id.as_deref(), Some(user1.user_id.as_str()));
        assert_eq!(report1.mvp_male.as_deref(), Some(user1.user_id.as_str()));
        // duplicate MVP slot is cleared
        assert_eq!(report1.mvp_male2, None);

        let report2 = get_report(&server, &r2.id).await;
        assert_eq!(report2.user_id.as_deref(), Some(user1.user_id.as_str()));
        assert_eq!(report2.mvp_female.as_deref(), Some(user1.user_id.as_str()));
        assert_eq!(report2.mvp_female2, None);

        let report3 = get_report(&server, &r3.id).await;
        assert_eq!(report3.user_id, None);
        assert_eq!(report3.mvp_male.as_deref(), Some(unrelated_id.as_str()));
        assert_eq!(report3.mvp_female.as_deref(), Some(user1.user_id.as_str()));

        // user2's sessions are reassigned to user1 and ended
        assert_eq!(
            SESSION
                .count(server.db(), Session::USER_ID.eq(&user2.user_id))
                .await
                .unwrap(),
            0
        );
        let moved = SESSION
            .get_one(server.db(), Session::TOKEN.eq(&user2.token))
            .await
            .unwrap();
        assert_eq!(moved.user_id, user1.user_id);
        assert_eq!(moved.ended, Some(true));
        assert!(moved.ended_on.is_some());
        // user1's own session is untouched
        let own = SESSION
            .get_one(server.db(), Session::TOKEN.eq(&user1.token))
            .await
            .unwrap();
        assert_ne!(own.ended, Some(true));
        let via_old_token = server
            .call(
                "/UserCurrentUpdate",
                Some(json!({})),
                CallOptions::token(&user2.token),
            )
            .await;
        assert_eq!(via_old_token.status, 401);
        assert_eq!(via_old_token.body["errorCode"], "auth.token_invalid");
    }

    #[tokio::test]
    async fn clears_a_male_mvp_repeated_in_the_female_slot() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user1 = create_user(&server, &admin, NewUser::default()).await;
        let user2 = create_user(&server, &admin, NewUser::default()).await;
        let report = REPORT
            .create_one(
                server.db(),
                json!({
                    "teamId": generate_id(),
                    "teamAgainstId": generate_id(),
                    "fixtureId": generate_id(),
                    "scoreFor": 0,
                    "scoreAgainst": 0,
                    "spiritComment": "",
                    "mvpMale": user1["id"],
                    "mvpFemale": user2["id"],
                }),
            )
            .await
            .unwrap();
        let response = server
            .post_as(
                "/UserMerge",
                json!({"user1Id": user1["id"], "user2Id": user2["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        let after = get_report(&server, &report.id).await;
        assert_eq!(after.mvp_male, Some(id(&user1)));
        assert_eq!(after.mvp_female, None);
    }

    #[tokio::test]
    async fn returns_not_found_for_an_unknown_user() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let user = create_user(&server, &admin, NewUser::default()).await;
        let response = server
            .post_as(
                "/UserMerge",
                json!({"user1Id": user["id"], "user2Id": generate_id()}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 404);
        assert_eq!(response.body["errorCode"], "db.record_not_found");
    }
}
