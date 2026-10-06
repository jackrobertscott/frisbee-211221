//! Port of `server/src/endpoints/Season.ts` — endpoints for
//! `shared/src/endpoints/SeasonDef.ts` (`crate::shared::contract::season`).

use crate::auth::hash;
use crate::db::{Collation, Patch, Query};
use crate::http::endpoint::{Ctx, Endpoint};
use crate::services::season_deletion::{count_season_reports, delete_season_with_data};
use crate::shared::contract::season::{
    SEASON_CREATE, SEASON_DELETE, SEASON_DELETE_STATUS, SEASON_LIST, SEASON_UPDATE,
};
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error};
use crate::shared::schemas::Season;
use crate::tables::SEASON;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Deserialize)]
struct ListPayload {
    search: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeasonIdPayload {
    season_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeletePayload {
    season_id: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeleteStatusResult {
    can_delete: bool,
}

async fn list(payload: ListPayload, ctx: Ctx) -> AppResult<Vec<Season>> {
    SEASON
        .get_many(
            ctx.db(),
            Season::NAME.contains_ci(payload.search.unwrap_or_default()),
            Query::new().sort([Season::NAME.desc().collate(Collation::SeasonName)]),
        )
        .await
}

async fn create(payload: Value, ctx: Ctx) -> AppResult<Season> {
    ctx.require_access().await?;
    SEASON.create_one(ctx.db(), payload).await
}

async fn update(mut payload: Map<String, Value>, ctx: Ctx) -> AppResult<Season> {
    ctx.require_access().await?;
    let season_id = match payload.remove("seasonId") {
        Some(Value::String(id)) => id,
        _ => String::new(),
    };
    SEASON
        .update_one(
            ctx.db(),
            Season::ID.eq(season_id),
            Patch::from_object(payload).set(Season::UPDATED_ON, crate::js::date::now_iso()),
        )
        .await
}

async fn delete_status(payload: SeasonIdPayload, ctx: Ctx) -> AppResult<DeleteStatusResult> {
    ctx.require_access().await?;
    SEASON
        .get_one(ctx.db(), Season::ID.eq(&payload.season_id))
        .await?;
    Ok(DeleteStatusResult {
        can_delete: count_season_reports(ctx.db(), &payload.season_id).await? == 0,
    })
}

async fn delete(payload: DeletePayload, ctx: Ctx) -> AppResult<()> {
    let (user, _) = ctx.require_access().await?;
    let Some(password_hash) = user.password.filter(|password| !password.is_empty()) else {
        return Err(bad_request_error(
            "User does not have a password.",
            ErrorOptions::code("user.password_missing"),
        ));
    };
    if !hash::compare_async(payload.password, password_hash).await {
        return Err(bad_request_error(
            "Password is incorrect.",
            ErrorOptions::code("user.old_password_invalid"),
        ));
    }
    SEASON
        .get_one(ctx.db(), Season::ID.eq(&payload.season_id))
        .await?;
    delete_season_with_data(ctx.db(), &payload.season_id).await
}

/// The Season endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&SEASON_LIST, list),
        Endpoint::new(&SEASON_CREATE, create),
        Endpoint::new(&SEASON_UPDATE, update),
        Endpoint::new(&SEASON_DELETE_STATUS, delete_status),
        Endpoint::new(&SEASON_DELETE, delete),
    ]
}
