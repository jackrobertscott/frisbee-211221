//! Port of `server/src/endpoints/User.ts` — endpoints for
//! `shared/src/endpoints/UserDef.ts` (`crate::shared::contract::user`).

use crate::auth::{attempt_limit, hash, sessions};
use crate::db::Patch;
use crate::http::endpoint::{Ctx, Endpoint};
use crate::js;
use crate::queries::user_list::{
    USER_LIST_DEFAULT_SORT_BY, USER_LIST_DEFAULT_SORT_DIRECTION, user_list,
};
use crate::services::user_email;
use crate::services::user_fields::select_safe_user_fields;
use crate::services::user_merge::merge_users;
use crate::shared::contract::user::{
    USER_CHANGE_PASSWORD, USER_CREATE, USER_CURRENT_CHANGE_PASSWORD, USER_CURRENT_EMAIL_ADD,
    USER_CURRENT_EMAIL_CODE_RESEND, USER_CURRENT_EMAIL_PRIMARY_SET, USER_CURRENT_EMAIL_REMOVE,
    USER_CURRENT_EMAIL_VERIFY, USER_CURRENT_UPDATE, USER_EMAIL_ADD, USER_EMAIL_PRIMARY_SET,
    USER_EMAIL_REMOVE, USER_EMAIL_VERIFIED_SET, USER_LIST, USER_MERGE, USER_TOGGLE_ADMIN,
    USER_UPDATE, UserListSortKey,
};
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error, conflict_error};
use crate::shared::schemas::{AttemptKind, User, UserSafe};
use crate::shared::utils::endpoint_def::SortDirection;
use crate::tables::USER;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Deserialize)]
struct EmailPayload {
    email: String,
}

#[derive(Deserialize)]
struct EmailCodePayload {
    email: String,
    code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserIdEmailPayload {
    user_id: String,
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifiedSetPayload {
    user_id: String,
    email: String,
    verified: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurrentChangePasswordPayload {
    old_password: String,
    new_password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListPayload {
    search: Option<String>,
    sort_by: Option<UserListSortKey>,
    sort_direction: Option<SortDirection>,
    limit: Option<f64>,
    skip: Option<f64>,
}

#[derive(Serialize)]
struct ListResult {
    count: i64,
    users: Vec<UserSafe>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserIdPayload {
    user_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MergePayload {
    user1_id: String,
    user2_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordPayload {
    user_id: String,
    new_password: String,
}

/// `{...body, updatedOn: new Date().toISOString()}` over a validated payload
/// object, without `exclude` (e.g. `userId`).
fn profile_patch(mut body: Map<String, Value>, exclude: &str) -> Patch {
    body.remove(exclude);
    Patch::from_object(body).set(User::UPDATED_ON, js::date::now_iso())
}

fn into_object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(map) => map,
        _ => Map::new(),
    }
}

async fn current_update(body: Value, ctx: Ctx) -> AppResult<UserSafe> {
    let (user, _) = ctx.require_access().await?;
    let next = USER
        .update_one(
            ctx.db(),
            User::ID.eq(&user.id),
            profile_patch(into_object(body), ""),
        )
        .await?;
    Ok(select_safe_user_fields(&next))
}

async fn current_email_add(payload: EmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    let (user, _) = ctx.require_access().await?;
    attempt_limit::consume(
        ctx.db(),
        AttemptKind::Delivery,
        &payload.email,
        &ctx.client_ip(),
    )
    .await?;
    let next = user_email::add(&ctx.state, &user, &payload.email).await?;
    Ok(select_safe_user_fields(&next))
}

async fn current_email_verify(payload: EmailCodePayload, ctx: Ctx) -> AppResult<UserSafe> {
    let (user, _) = ctx.require_access().await?;
    let ip = ctx.client_ip();
    let email = payload.email;
    attempt_limit::consume(ctx.db(), AttemptKind::Verify, &email, &ip).await?;
    user_email::assert_code_valid(
        &ctx.state,
        &user,
        &email,
        &payload.code,
        &ip,
        "Verify Email",
    )
    .await?;
    let next = user_email::verify(&ctx.state, &user, &email).await?;
    attempt_limit::reset(ctx.db(), AttemptKind::Verify, &email, &ip).await?;
    Ok(select_safe_user_fields(&next))
}

async fn current_email_code_resend(payload: EmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    let (user, _) = ctx.require_access().await?;
    attempt_limit::consume(
        ctx.db(),
        AttemptKind::Delivery,
        &payload.email,
        &ctx.client_ip(),
    )
    .await?;
    let next =
        user_email::code_send_save(&ctx.state, &user, &payload.email, "Verify Email").await?;
    Ok(select_safe_user_fields(&next))
}

async fn current_email_primary_set(payload: EmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    let (user, _) = ctx.require_access().await?;
    let next = user_email::primary_set(ctx.db(), &user, &payload.email).await?;
    Ok(select_safe_user_fields(&next))
}

async fn current_email_remove(payload: EmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    let (user, _) = ctx.require_access().await?;
    let next = user_email::remove(ctx.db(), &user, &payload.email).await?;
    Ok(select_safe_user_fields(&next))
}

async fn email_add(payload: UserIdEmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let user = USER
        .get_one(ctx.db(), User::ID.eq(&payload.user_id))
        .await?;
    let next = user_email::add(&ctx.state, &user, &payload.email).await?;
    Ok(select_safe_user_fields(&next))
}

async fn email_primary_set(payload: UserIdEmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let user = USER
        .get_one(ctx.db(), User::ID.eq(&payload.user_id))
        .await?;
    let next = user_email::primary_set(ctx.db(), &user, &payload.email).await?;
    Ok(select_safe_user_fields(&next))
}

async fn email_verified_set(payload: VerifiedSetPayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let user = USER
        .get_one(ctx.db(), User::ID.eq(&payload.user_id))
        .await?;
    let next = user_email::verified_set(ctx.db(), &user, &payload.email, payload.verified).await?;
    Ok(select_safe_user_fields(&next))
}

async fn email_remove(payload: UserIdEmailPayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let user = USER
        .get_one(ctx.db(), User::ID.eq(&payload.user_id))
        .await?;
    let next = user_email::remove(ctx.db(), &user, &payload.email).await?;
    Ok(select_safe_user_fields(&next))
}

async fn current_change_password(
    payload: CurrentChangePasswordPayload,
    ctx: Ctx,
) -> AppResult<UserSafe> {
    let (user, session) = ctx.require_access().await?;
    // JavaScript truthiness: an empty password counts as none
    let Some(password) = user.password.clone().filter(|p| !p.is_empty()) else {
        return Err(bad_request_error(
            "User does not have a password.",
            ErrorOptions::code("user.password_missing"),
        ));
    };
    if !hash::compare_async(payload.old_password, password).await {
        return Err(bad_request_error(
            "Old password is incorrect.",
            ErrorOptions::code("user.old_password_invalid"),
        ));
    }
    hash::assert_new_password_valid(&payload.new_password)?;
    let encrypted = hash::encrypt_async(payload.new_password).await?;
    let user = USER
        .update_one(
            ctx.db(),
            User::ID.eq(&user.id),
            Patch::new().set(User::PASSWORD, encrypted),
        )
        .await?;
    sessions::end_user_sessions(ctx.db(), &user.id, Some(&session.id)).await?;
    Ok(select_safe_user_fields(&user))
}

/// A validated whole, non-negative number from the payload.
fn page_number(value: Option<f64>) -> Option<u64> {
    value
        .filter(|v| v.is_finite() && *v >= 0.0)
        .map(|v| v as u64)
}

async fn list(payload: ListPayload, ctx: Ctx) -> AppResult<ListResult> {
    ctx.require_access().await?;
    let search = payload.search.unwrap_or_default();
    let sort_by = payload.sort_by.unwrap_or(USER_LIST_DEFAULT_SORT_BY);
    let direction = payload
        .sort_direction
        .unwrap_or(USER_LIST_DEFAULT_SORT_DIRECTION);
    let skip = page_number(payload.skip);
    let limit = page_number(payload.limit);
    let page = ctx
        .db()
        .call(move |c| user_list(USER.tx(c), &search, sort_by, direction, skip, limit))
        .await?;
    Ok(ListResult {
        count: page.count,
        users: page.users.iter().map(select_safe_user_fields).collect(),
    })
}

async fn create(body: Value, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let mut body = into_object(body);
    let email = body
        .remove("email")
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default();
    if user_email::maybe_user(ctx.db(), &email).await?.is_some() {
        return Err(conflict_error(
            format!("User already exists with email \"{email}\"."),
            ErrorOptions::code("user.email_exists"),
        ));
    }
    let emails = [user_email::create(
        &ctx.config().jwt_secret,
        &email,
        true,
        None,
    )?];
    body.insert("emails".into(), serde_json::to_value(emails)?);
    let user = USER.create_one(ctx.db(), Value::Object(body)).await?;
    Ok(select_safe_user_fields(&user))
}

async fn update(body: Value, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let body = into_object(body);
    let user_id = body
        .get("userId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let user = USER.get_one(ctx.db(), User::ID.eq(&user_id)).await?;
    let next = USER
        .update_one(
            ctx.db(),
            User::ID.eq(&user.id),
            profile_patch(body, "userId"),
        )
        .await?;
    Ok(select_safe_user_fields(&next))
}

async fn toggle_admin(payload: UserIdPayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let user = USER
        .get_one(ctx.db(), User::ID.eq(&payload.user_id))
        .await?;
    let next = USER
        .update_one(
            ctx.db(),
            User::ID.eq(&user.id),
            Patch::new().set(User::ADMIN, user.admin != Some(true)),
        )
        .await?;
    Ok(select_safe_user_fields(&next))
}

async fn merge(payload: MergePayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    let user = merge_users(ctx.db(), &payload.user1_id, &payload.user2_id).await?;
    Ok(select_safe_user_fields(&user))
}

async fn change_password(payload: ChangePasswordPayload, ctx: Ctx) -> AppResult<UserSafe> {
    ctx.require_access().await?;
    hash::assert_new_password_valid(&payload.new_password)?;
    let user = USER
        .get_one(ctx.db(), User::ID.eq(&payload.user_id))
        .await?;
    let encrypted = hash::encrypt_async(payload.new_password).await?;
    let next = USER
        .update_one(
            ctx.db(),
            User::ID.eq(&user.id),
            Patch::new().set(User::PASSWORD, encrypted),
        )
        .await?;
    sessions::end_user_sessions(ctx.db(), &user.id, None).await?;
    Ok(select_safe_user_fields(&next))
}

/// The User endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&USER_CURRENT_UPDATE, current_update),
        Endpoint::new(&USER_CURRENT_EMAIL_ADD, current_email_add),
        Endpoint::new(&USER_CURRENT_EMAIL_VERIFY, current_email_verify),
        Endpoint::new(&USER_CURRENT_EMAIL_CODE_RESEND, current_email_code_resend),
        Endpoint::new(&USER_CURRENT_EMAIL_PRIMARY_SET, current_email_primary_set),
        Endpoint::new(&USER_CURRENT_EMAIL_REMOVE, current_email_remove),
        Endpoint::new(&USER_EMAIL_ADD, email_add),
        Endpoint::new(&USER_EMAIL_PRIMARY_SET, email_primary_set),
        Endpoint::new(&USER_EMAIL_VERIFIED_SET, email_verified_set),
        Endpoint::new(&USER_EMAIL_REMOVE, email_remove),
        Endpoint::new(&USER_CURRENT_CHANGE_PASSWORD, current_change_password),
        Endpoint::new(&USER_LIST, list),
        Endpoint::new(&USER_CREATE, create),
        Endpoint::new(&USER_UPDATE, update),
        Endpoint::new(&USER_TOGGLE_ADMIN, toggle_admin),
        Endpoint::new(&USER_MERGE, merge),
        Endpoint::new(&USER_CHANGE_PASSWORD, change_password),
    ]
}
