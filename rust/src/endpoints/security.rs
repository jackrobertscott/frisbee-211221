//! Port of `server/src/endpoints/Security.ts` — endpoints for
//! `shared/src/endpoints/SecurityDef.ts` (`crate::shared::contract::security`).

use crate::auth::{attempt_limit, hash, sessions};
use crate::db::{Filter, Patch, Query};
use crate::http::endpoint::{Ctx, Endpoint};
use crate::js;
use crate::services::auth_payload::{AuthPayload, build_auth_payload};
use crate::services::user_email;
use crate::shared::contract::security::{
    SECURITY_CURRENT, SECURITY_FORGOT, SECURITY_LOGIN, SECURITY_LOGOUT, SECURITY_SIGN_UP,
    SECURITY_STATUS, SECURITY_VERIFY,
};
use crate::shared::errors::{
    AppResult, ErrorOptions, bad_request_error, conflict_error, not_found_error,
    unauthorized_error,
};
use crate::shared::schemas::{AttemptKind, GenderMatching, Season, Session, User};
use crate::tables::{SEASON, SESSION, USER};
use serde::{Deserialize, Serialize};
use serde_json::json;

const INVALID_LOGIN_MESSAGE: &str = "Email or password is incorrect.";

/// JavaScript truthiness of an optional string (`!value` is false).
fn is_set(value: Option<&str>) -> bool {
    value.is_some_and(|value| !value.is_empty())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentPayload {
    season_id: Option<String>,
}

#[derive(Serialize)]
struct CurrentResult {
    season: Season,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth: Option<AuthPayload>,
}

#[derive(Deserialize)]
struct StatusPayload {
    email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusResult {
    status: &'static str,
    email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    first_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginPayload {
    season_id: Option<String>,
    email: String,
    password: String,
    user_agent: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignUpPayload {
    season_id: Option<String>,
    email: String,
    first_name: String,
    last_name: String,
    gender_matching: GenderMatching,
    terms_accepted: bool,
    user_agent: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyPayload {
    season_id: Option<String>,
    email: String,
    code: String,
    new_password: String,
    user_agent: Option<String>,
}

fn invalid_login() -> crate::shared::errors::AppError {
    unauthorized_error(
        INVALID_LOGIN_MESSAGE,
        ErrorOptions::code("auth.invalid_login"),
    )
}

async fn current(payload: CurrentPayload, ctx: Ctx) -> AppResult<CurrentResult> {
    let db = ctx.db();
    let mut signed_in: Option<(User, Session)> = None;
    if let Some(auth) = sessions::digest_request(&ctx.headers, &ctx.config().jwt_secret)
        .filter(|auth| !auth.user_id.is_empty() && !auth.session_id.is_empty())
    {
        let (user, session) = tokio::try_join!(
            USER.maybe_one(db, User::ID.eq(&auth.user_id)),
            SESSION.maybe_one(db, Session::ID.eq(&auth.session_id)),
        )?;
        if let (Some(user), Some(session)) = (user, session)
            && sessions::is_session_valid(Some(&auth), Some(&session), js::date::now_ms())
        {
            signed_in = Some((user, session));
        }
    }
    let mut season = None;
    if let Some(season_id) = payload.season_id.as_deref().filter(|id| !id.is_empty()) {
        season = SEASON.maybe_one(db, Season::ID.eq(season_id)).await?;
    }
    if season.is_none()
        && let Some(last_season_id) = signed_in
            .as_ref()
            .and_then(|(user, _)| user.last_season_id.as_deref())
            .filter(|id| !id.is_empty())
    {
        season = SEASON.maybe_one(db, Season::ID.eq(last_season_id)).await?;
    }
    if season.is_none() {
        season = SEASON
            .maybe_one_sorted(
                db,
                Filter::all(),
                Query::new().sort([Season::CREATED_ON.desc()]),
            )
            .await?;
    }
    let Some(season) = season else {
        return Err(not_found_error(
            "No season is available.",
            ErrorOptions::code("season.not_found"),
        ));
    };
    let auth = match signed_in {
        Some((user, session)) => Some(build_auth_payload(db, user, session, Some(&season.id)).await?),
        None => None,
    };
    Ok(CurrentResult { season, auth })
}

async fn status(payload: StatusPayload, ctx: Ctx) -> AppResult<StatusResult> {
    let email = payload.email;
    let Some(user) = user_email::maybe_user(ctx.db(), &email).await? else {
        return Ok(StatusResult {
            status: "unknown",
            email,
            first_name: None,
        });
    };
    if !is_set(user.password.as_deref()) {
        let ip = ctx.client_ip();
        attempt_limit::consume(ctx.db(), AttemptKind::Delivery, &email, &ip).await?;
        user_email::code_send_save(&ctx.state, &user, &email, "Verify Email").await?;
        return Ok(StatusResult {
            status: "password",
            email,
            first_name: Some(user.first_name),
        });
    }
    let verified = user_email::get(&user, &email).is_some_and(|item| item.verified);
    Ok(StatusResult {
        status: if verified { "good" } else { "unverified" },
        first_name: Some(user.first_name),
        email,
    })
}

async fn login(payload: LoginPayload, ctx: Ctx) -> AppResult<AuthPayload> {
    let db = ctx.db();
    let ip = ctx.client_ip();
    attempt_limit::consume(db, AttemptKind::Login, &payload.email, &ip).await?;
    let user = user_email::maybe_user(db, &payload.email).await?;
    let password_hash = user
        .as_ref()
        .and_then(|user| user.password.clone())
        .filter(|password| !js::trim(password).is_empty());
    let (Some(user), Some(password_hash)) = (user, password_hash) else {
        hash::compare_dummy_async(payload.password).await;
        return Err(invalid_login());
    };
    if !hash::compare_async(payload.password, password_hash).await {
        return Err(invalid_login());
    }
    attempt_limit::reset(db, AttemptKind::Login, &payload.email, &ip).await?;
    let session =
        sessions::create_user_session(db, ctx.config(), &user, payload.user_agent.as_deref())
            .await?;
    build_auth_payload(db, user, session, payload.season_id.as_deref()).await
}

async fn sign_up(payload: SignUpPayload, ctx: Ctx) -> AppResult<AuthPayload> {
    let db = ctx.db();
    if !payload.terms_accepted {
        return Err(bad_request_error(
            "Please accept our terms to create an account.",
            ErrorOptions::code("auth.terms_required"),
        ));
    }
    if user_email::maybe_user(db, &payload.email).await?.is_some() {
        return Err(conflict_error(
            format!("User already exists with email \"{}\".", payload.email),
            ErrorOptions::code("user.email_exists"),
        ));
    }
    attempt_limit::consume(db, AttemptKind::Delivery, &payload.email, &ctx.client_ip()).await?;
    let code =
        user_email::code_send(&ctx.state, &payload.email, &payload.first_name, "Verify Email")
            .await?;
    let email = user_email::create(
        &ctx.config().jwt_secret,
        &payload.email,
        true,
        Some(&code),
    )?;
    let user: User = USER
        .create_one(
            db,
            json!({
                "lastName": payload.last_name,
                "genderMatching": payload.gender_matching,
                "firstName": payload.first_name,
                "termsAccepted": payload.terms_accepted,
                "emails": [email],
            }),
        )
        .await?;
    let session =
        sessions::create_user_session(db, ctx.config(), &user, payload.user_agent.as_deref())
            .await?;
    build_auth_payload(db, user, session, payload.season_id.as_deref()).await
}

async fn forgot(email: String, ctx: Ctx) -> AppResult<()> {
    let ip = ctx.client_ip();
    attempt_limit::consume(ctx.db(), AttemptKind::Delivery, &email, &ip).await?;
    if let Some(user) = user_email::maybe_user(ctx.db(), &email).await? {
        user_email::code_send_save(&ctx.state, &user, &email, "Restore Account").await?;
    }
    Ok(())
}

async fn verify(payload: VerifyPayload, ctx: Ctx) -> AppResult<AuthPayload> {
    let db = ctx.db();
    let ip = ctx.client_ip();
    let email = payload.email;
    attempt_limit::consume(db, AttemptKind::Verify, &email, &ip).await?;
    let Some(mut user) = user_email::maybe_user(db, &email).await? else {
        return Err(bad_request_error(
            "Code is incorrect.",
            ErrorOptions::code("user.code_invalid"),
        ));
    };
    let has_password = is_set(user.password.as_deref());
    let expired_subject = if has_password {
        "Restore Account"
    } else {
        "Verify Email"
    };
    user_email::assert_code_valid(&ctx.state, &user, &email, &payload.code, &ip, expired_subject)
        .await?;
    let password_changed = !js::trim(&payload.new_password).is_empty() || !has_password;
    if password_changed {
        hash::assert_new_password_valid(&payload.new_password)?;
        let password = hash::encrypt_async(payload.new_password).await?;
        user = USER
            .update_one(
                db,
                User::ID.eq(&user.id),
                Patch::new().set(User::PASSWORD, password),
            )
            .await?;
    }
    let user = user_email::verify(&ctx.state, &user, &email).await?;
    attempt_limit::reset(db, AttemptKind::Verify, &email, &ip).await?;
    // a reset proves control of the email, so sign out everywhere else
    if password_changed {
        sessions::end_user_sessions(db, &user.id, None).await?;
    }
    let session =
        sessions::create_user_session(db, ctx.config(), &user, payload.user_agent.as_deref())
            .await?;
    build_auth_payload(db, user, session, payload.season_id.as_deref()).await
}

async fn logout(ctx: Ctx) -> AppResult<()> {
    let Some(auth) = sessions::digest_request(&ctx.headers, &ctx.config().jwt_secret) else {
        return Ok(());
    };
    let session = SESSION
        .maybe_one(ctx.db(), Session::ID.eq(&auth.session_id))
        .await?;
    let Some(session) = session
        .filter(|session| sessions::is_session_valid(Some(&auth), Some(session), js::date::now_ms()))
    else {
        return Ok(());
    };
    SESSION
        .update_one(
            ctx.db(),
            Session::ID.eq(&session.id),
            Patch::new()
                .set(Session::ENDED, true)
                .set(Session::ENDED_ON, js::date::now_iso()),
        )
        .await?;
    Ok(())
}

/// The Security endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&SECURITY_CURRENT, current),
        Endpoint::new(&SECURITY_STATUS, status),
        Endpoint::new(&SECURITY_LOGIN, login),
        Endpoint::new(&SECURITY_SIGN_UP, sign_up),
        Endpoint::new(&SECURITY_FORGOT, forgot),
        Endpoint::new(&SECURITY_VERIFY, verify),
        Endpoint::new(&SECURITY_LOGOUT, |_: (), ctx: Ctx| logout(ctx)),
    ]
}
