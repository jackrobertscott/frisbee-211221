//! Port of `server/src/endpoints/Team.ts` — endpoints for
//! `shared/src/endpoints/TeamDef.ts` (`crate::shared::contract::team`).

use crate::auth::require::require_team;
use crate::db::Patch;
use crate::http::endpoint::{Ctx, Endpoint};
use crate::shared::contract::team::{
    TEAM_CREATE, TEAM_CURRENT_CREATE, TEAM_CURRENT_UPDATE, TEAM_DELETE, TEAM_UPDATE,
};
use crate::shared::errors::{
    AppResult, ErrorOptions, bad_request_error, conflict_error, forbidden_error,
};
use crate::shared::schemas::{Member, Season, Team, User};
use crate::tables::{MEMBER, SEASON, TEAM, USER};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

#[derive(Serialize)]
struct CurrentCreateResult {
    team: Team,
    member: Member,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TeamIdPayload {
    team_id: String,
}

/// The string field `key` of a validated payload object.
fn string_field(payload: &Map<String, Value>, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Splits `teamId` off an update payload, leaving the fields to set.
fn take_team_id(payload: &mut Map<String, Value>) -> String {
    match payload.remove("teamId") {
        Some(Value::String(id)) => id,
        _ => String::new(),
    }
}

async fn current_create(payload: Map<String, Value>, ctx: Ctx) -> AppResult<CurrentCreateResult> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let season = SEASON
        .get_one(db, Season::ID.eq(string_field(&payload, "seasonId")))
        .await?;
    if !season.sign_up_open {
        return Err(bad_request_error(
            "Season is not currently open for new team sign ups.",
            ErrorOptions::code("team.signup_closed"),
        ));
    }
    let existing = MEMBER
        .count(
            db,
            Member::USER_ID
                .eq(&user.id)
                .and_also(Member::SEASON_ID.eq(&season.id)),
        )
        .await?;
    if existing > 0 {
        return Err(conflict_error(
            "User is already a member of another team.",
            ErrorOptions::code("member.already_on_other_team"),
        ));
    }
    let team = TEAM.create_one(db, payload).await?;
    let member = MEMBER
        .create_one(
            db,
            json!({
                "userId": user.id,
                "seasonId": team.season_id,
                "teamId": team.id,
                "captain": true,
                "pending": false,
            }),
        )
        .await?;
    USER.update_one(
        db,
        User::ID.eq(&user.id),
        Patch::new().set(User::LAST_SEASON_ID, season.id),
    )
    .await?;
    Ok(CurrentCreateResult { team, member })
}

async fn current_update(mut payload: Map<String, Value>, ctx: Ctx) -> AppResult<Team> {
    let (user, _) = ctx.require_access().await?;
    let team_id = take_team_id(&mut payload);
    // require_team only matches confirmed members, so pending requests fail here
    let (team, member) = require_team(ctx.db(), &user.id, &team_id).await?;
    if member.captain != Some(true) {
        return Err(forbidden_error(
            "Only the team captain can update team information.",
            ErrorOptions::code("team.captain_required"),
        ));
    }
    TEAM.update_one(
        ctx.db(),
        Team::ID.eq(&team.id),
        Patch::from_object(payload).set(Team::UPDATED_ON, crate::js::date::now_iso()),
    )
    .await
}

async fn create(payload: Map<String, Value>, ctx: Ctx) -> AppResult<Team> {
    ctx.require_access().await?;
    SEASON
        .get_one(ctx.db(), Season::ID.eq(string_field(&payload, "seasonId")))
        .await?;
    TEAM.create_one(ctx.db(), payload).await
}

async fn update(mut payload: Map<String, Value>, ctx: Ctx) -> AppResult<Team> {
    ctx.require_access().await?;
    let team_id = take_team_id(&mut payload);
    let team = TEAM.get_one(ctx.db(), Team::ID.eq(team_id)).await?;
    TEAM.update_one(
        ctx.db(),
        Team::ID.eq(&team.id),
        Patch::from_object(payload).set(Team::UPDATED_ON, crate::js::date::now_iso()),
    )
    .await
}

async fn delete(payload: TeamIdPayload, ctx: Ctx) -> AppResult<()> {
    ctx.require_access().await?;
    MEMBER
        .delete_many(ctx.db(), Member::TEAM_ID.eq(&payload.team_id))
        .await?;
    TEAM.delete_one(ctx.db(), Team::ID.eq(&payload.team_id))
        .await?;
    Ok(())
}

/// The Team endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&TEAM_CURRENT_CREATE, current_create),
        Endpoint::new(&TEAM_CURRENT_UPDATE, current_update),
        Endpoint::new(&TEAM_CREATE, create),
        Endpoint::new(&TEAM_UPDATE, update),
        Endpoint::new(&TEAM_DELETE, delete),
    ]
}
