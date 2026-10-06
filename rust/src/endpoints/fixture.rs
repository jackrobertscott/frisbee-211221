//! Port of `server/src/endpoints/Fixture.ts` — endpoints for
//! `shared/src/endpoints/FixtureDef.ts` (`crate::shared::contract::fixture`).

use crate::db::{Patch, Query};
use crate::http::endpoint::{Ctx, Endpoint};
use crate::js;
use crate::services::fixture_schedule::{
    DateAdjustment, DateDirection, DateUnit, FixtureSlot, RoundPlanInput,
    assert_teams_can_be_scheduled, plan_fixture_rounds, shift_fixture_date,
};
use crate::shared::contract::fixture::{
    FIXTURE_ADJUST_MULTIPLE, FIXTURE_CREATE, FIXTURE_DELETE, FIXTURE_GENERATE, FIXTURE_UPDATE,
};
use crate::shared::errors::AppResult;
use crate::shared::schemas::{Fixture, Season, Team};
use crate::tables::{FIXTURE, SEASON, TEAM};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeletePayload {
    fixture_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdjustMultiplePayload {
    season_id: String,
    reference_fixture_id: String,
    amount: f64,
    unit: DateUnit,
    direction: DateDirection,
}

#[derive(Serialize)]
struct CountResult {
    count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratePayload {
    season_id: String,
    starting_date: String,
    round_count: f64,
    slots: Vec<FixtureSlot>,
}

async fn create(mut payload: Map<String, Value>, ctx: Ctx) -> AppResult<Fixture> {
    let (user, _) = ctx.require_access().await?;
    let season_id = payload
        .get("seasonId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    SEASON.get_one(ctx.db(), Season::ID.eq(season_id)).await?;
    payload.insert("userId".into(), Value::String(user.id));
    FIXTURE.create_one(ctx.db(), payload).await
}

async fn update(mut payload: Map<String, Value>, ctx: Ctx) -> AppResult<Fixture> {
    ctx.require_access().await?;
    let fixture_id = match payload.remove("fixtureId") {
        Some(Value::String(id)) => id,
        _ => String::new(),
    };
    FIXTURE
        .update_one(
            ctx.db(),
            Fixture::ID.eq(fixture_id),
            Patch::from_object(payload).set(Fixture::UPDATED_ON, js::date::now_iso()),
        )
        .await
}

async fn delete(payload: DeletePayload, ctx: Ctx) -> AppResult<()> {
    ctx.require_access().await?;
    FIXTURE
        .delete_one(ctx.db(), Fixture::ID.eq(payload.fixture_id))
        .await?;
    Ok(())
}

async fn adjust_multiple(payload: AdjustMultiplePayload, ctx: Ctx) -> AppResult<CountResult> {
    ctx.require_access().await?;
    let db = ctx.db();
    let reference = FIXTURE
        .get_one(db, Fixture::ID.eq(&payload.reference_fixture_id))
        .await?;
    let from = js::date::normalize(&reference.date).unwrap_or(reference.date);
    let fixtures = FIXTURE
        .get_many(
            db,
            Fixture::SEASON_ID
                .eq(&payload.season_id)
                .and_also(Fixture::DATE.gte(from)),
            Query::new().sort([Fixture::DATE.asc()]),
        )
        .await?;
    let adjustment = DateAdjustment {
        amount: payload.amount as i64,
        unit: payload.unit,
        direction: payload.direction,
    };
    for fixture in &fixtures {
        FIXTURE
            .update_one(
                db,
                Fixture::ID.eq(&fixture.id),
                Patch::new()
                    .set(
                        Fixture::DATE,
                        shift_fixture_date(&fixture.date, &adjustment),
                    )
                    .set(Fixture::UPDATED_ON, js::date::now_iso()),
            )
            .await?;
    }
    Ok(CountResult {
        count: fixtures.len(),
    })
}

async fn generate(payload: GeneratePayload, ctx: Ctx) -> AppResult<()> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let season = SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let teams = TEAM
        .get_many(db, Team::SEASON_ID.eq(&season.id), Query::new())
        .await?;
    let divisions: Vec<Option<f64>> = teams.iter().map(|team| team.division).collect();
    assert_teams_can_be_scheduled(&divisions, payload.slots.len())?;
    let existing_fixtures = FIXTURE
        .get_many(
            db,
            Fixture::SEASON_ID.eq(&season.id),
            Query::new().sort([Fixture::DATE.asc()]),
        )
        .await?;
    let new_fixtures = plan_fixture_rounds(&RoundPlanInput {
        season_id: &season.id,
        user_id: &user.id,
        starting_date: &payload.starting_date,
        round_count: payload.round_count as usize,
        slots: &payload.slots,
        teams: &teams,
        existing_fixtures: &existing_fixtures,
    })?;
    if !new_fixtures.is_empty() {
        FIXTURE.create_many(db, new_fixtures).await?;
    }
    Ok(())
}

/// The Fixture endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&FIXTURE_CREATE, create),
        Endpoint::new(&FIXTURE_UPDATE, update),
        Endpoint::new(&FIXTURE_DELETE, delete),
        Endpoint::new(&FIXTURE_ADJUST_MULTIPLE, adjust_multiple),
        Endpoint::new(&FIXTURE_GENERATE, generate),
    ]
}
