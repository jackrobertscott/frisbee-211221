//! Port of `server/test/actors.ts`: helpers that set up users, seasons,
//! teams and members through the real endpoints.

use super::{CallOptions, TestServer};
use frisbee::db::Patch;
use frisbee::shared::schemas::User;
use frisbee::tables::USER;
use serde_json::{Map, Value, json};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// A unique email address for this test run.
pub fn unique_email(prefix: &str) -> String {
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    let suffix = frisbee::utils::random::random_string(6).to_lowercase();
    format!("{prefix}.{counter}.{suffix}@example.com")
}

/// `TActor`: a signed-up account and its session token.
#[derive(Clone, Debug)]
pub struct Actor {
    pub token: String,
    pub user_id: String,
    pub email: String,
}

/// Options for [`sign_up`].
#[derive(Clone, Debug, Default)]
pub struct SignUp {
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub gender_matching: Option<String>,
    pub admin: bool,
    pub season_id: Option<String>,
}

fn merge(base: Value, extra: Value) -> Value {
    let mut map: Map<String, Value> = base.as_object().cloned().unwrap_or_default();
    if let Value::Object(extra) = extra {
        map.extend(extra);
    }
    Value::Object(map)
}

/// `signUp(server, options)`: signs up a fresh account (optionally promoted to admin).
pub async fn sign_up(server: &TestServer, options: SignUp) -> Actor {
    let email = options.email.unwrap_or_else(|| unique_email("user"));
    let mut payload = json!({
        "email": email,
        "firstName": options.first_name.unwrap_or_else(|| "Test".into()),
        "lastName": options.last_name.unwrap_or_else(|| "Player".into()),
        "genderMatching": options.gender_matching.unwrap_or_else(|| "female".into()),
        "termsAccepted": true,
    });
    if let Some(season_id) = options.season_id {
        payload["seasonId"] = json!(season_id);
    }
    let response = server.post("/SecuritySignUp", payload).await;
    assert_eq!(response.status, 200, "Sign up failed: {}", response.body);
    let user_id = response.body["user"]["id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    if options.admin {
        USER.update_one(
            server.db(),
            User::ID.eq(&user_id),
            Patch::new().set(User::ADMIN, true),
        )
        .await
        .expect("promote to admin");
    }
    let token = response.body["session"]["token"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    Actor {
        token,
        user_id,
        email,
    }
}

/// `createSeason(server, admin, payload)`.
pub async fn create_season(server: &TestServer, admin: &Actor, payload: Value) -> Value {
    let body = merge(json!({"name": "Summer 2026", "signUpOpen": true}), payload);
    let response = server
        .call(
            "/SeasonCreate",
            Some(body),
            CallOptions::token(&admin.token),
        )
        .await;
    assert_eq!(
        response.status, 200,
        "Season create failed: {}",
        response.body
    );
    response.body
}

/// `createTeam(server, admin, seasonId, name, extra)`.
pub async fn create_team(
    server: &TestServer,
    admin: &Actor,
    season_id: &str,
    name: &str,
    extra: Value,
) -> Value {
    let body = merge(
        json!({"seasonId": season_id, "name": name, "color": "hsla(0, 100%, 50%, 1)"}),
        extra,
    );
    let response = server
        .call("/TeamCreate", Some(body), CallOptions::token(&admin.token))
        .await;
    assert_eq!(
        response.status, 200,
        "Team create failed: {}",
        response.body
    );
    response.body
}

/// Options for [`add_member`].
#[derive(Clone, Debug, Default)]
pub struct NewMember {
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub gender_matching: Option<String>,
}

/// `addMember(server, admin, teamId, user)`: adds a confirmed member to a
/// team (creating the user when the email is new).
pub async fn add_member(
    server: &TestServer,
    admin: &Actor,
    team_id: &str,
    user: NewMember,
) -> Value {
    let body = json!({
        "teamId": team_id,
        "email": user.email.unwrap_or_else(|| unique_email("member")),
        "firstName": user.first_name.unwrap_or_else(|| "Member".into()),
        "lastName": user.last_name.unwrap_or_else(|| "Person".into()),
        "genderMatching": user.gender_matching.unwrap_or_else(|| "male".into()),
    });
    let response = server
        .call(
            "/MemberCreate",
            Some(body),
            CallOptions::token(&admin.token),
        )
        .await;
    assert_eq!(
        response.status, 200,
        "Member create failed: {}",
        response.body
    );
    response.body
}
