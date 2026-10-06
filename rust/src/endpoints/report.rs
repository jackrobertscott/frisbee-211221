//! Port of `server/src/endpoints/Report.ts` — endpoints for
//! `shared/src/endpoints/ReportDef.ts` (`crate::shared::contract::report`).

use crate::auth::require::require_team;
use crate::db::{Patch, Query};
use crate::http::endpoint::{Ctx, Endpoint};
use crate::js;
use crate::services::missing_reports::{
    FixtureRef, MissingReportRound, SubmittedReport, list_missing_reports,
};
use crate::services::report_mvps::sanitize_report_mvps;
use crate::shared::contract::report::{
    REPORT_CREATE, REPORT_DELETE, REPORT_MISSING_LIST, REPORT_UPDATE,
};
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error, conflict_error};
use crate::shared::schemas::{Fixture, Report, Season, Team};
use crate::shared::utils::report_validation::{
    OfficialSpiritFields, validate_official_spirit_comment,
};
use crate::shared::utils::season_gender_division::SeasonMvpFields;
use crate::tables::{FIXTURE, REPORT, SEASON, TEAM};
use serde::Deserialize;
use serde_json::{Map, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportIdPayload {
    report_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeasonIdPayload {
    season_id: String,
}

fn string_field(payload: &Map<String, Value>, key: &str) -> Option<String> {
    payload.get(key).and_then(Value::as_str).map(str::to_string)
}

fn number_field(payload: &Map<String, Value>, key: &str) -> Option<f64> {
    payload.get(key).and_then(Value::as_f64)
}

fn mvp_fields(payload: &Map<String, Value>) -> SeasonMvpFields {
    SeasonMvpFields {
        mvp_male: string_field(payload, "mvpMale"),
        mvp_male2: string_field(payload, "mvpMale2"),
        mvp_female: string_field(payload, "mvpFemale"),
        mvp_female2: string_field(payload, "mvpFemale2"),
    }
}

fn mvp_values(fields: &SeasonMvpFields) -> [(&'static str, Option<String>); 4] {
    [
        ("mvpMale", fields.mvp_male.clone()),
        ("mvpMale2", fields.mvp_male2.clone()),
        ("mvpFemale", fields.mvp_female.clone()),
        ("mvpFemale2", fields.mvp_female2.clone()),
    ]
}

fn official_spirit_fields(payload: &Map<String, Value>) -> OfficialSpiritFields {
    OfficialSpiritFields {
        spirit_comment: string_field(payload, "spiritComment").unwrap_or_default(),
        spirit_p1: number_field(payload, "spiritP1"),
        spirit_p2: number_field(payload, "spiritP2"),
        spirit_p3: number_field(payload, "spiritP3"),
        spirit_p4: number_field(payload, "spiritP4"),
        spirit_p5: number_field(payload, "spiritP5"),
    }
}

/// `assertOfficialSpiritComment(useOfficialScoring, body)`.
fn assert_official_spirit_comment(
    use_official_scoring: Option<bool>,
    fields: &OfficialSpiritFields,
) -> AppResult<()> {
    if use_official_scoring != Some(true) {
        return Ok(());
    }
    match validate_official_spirit_comment(fields) {
        Some(message) => Err(bad_request_error(
            message,
            ErrorOptions::code("report.spirit_comment_required"),
        )),
        None => Ok(()),
    }
}

/// `fixtureHasMatchup(fixture, teamId, teamAgainstId)`.
fn fixture_has_matchup(fixture: &Fixture, team_id: &str, team_against_id: &str) -> bool {
    fixture.games.iter().any(|game| {
        (game.team1_id == team_id && game.team2_id == team_against_id)
            || (game.team2_id == team_id && game.team1_id == team_against_id)
    })
}

async fn create(mut body: Map<String, Value>, ctx: Ctx) -> AppResult<Report> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let team_id = string_field(&body, "teamId").unwrap_or_default();
    let team = if user.admin == Some(true) {
        TEAM.get_one(db, Team::ID.eq(&team_id)).await?
    } else {
        require_team(db, &user.id, &team_id).await?.0
    };
    let fixture = FIXTURE
        .get_one(
            db,
            Fixture::ID.eq(string_field(&body, "fixtureId").unwrap_or_default()),
        )
        .await?;
    let season = SEASON
        .get_one(db, Season::ID.eq(&fixture.season_id))
        .await?;
    let team_against = TEAM
        .get_one(
            db,
            Team::ID.eq(string_field(&body, "teamAgainstId").unwrap_or_default()),
        )
        .await?;
    let mvps = sanitize_report_mvps(db, &season, &mvp_fields(&body)).await?;
    for (key, value) in mvp_values(&mvps) {
        match value {
            Some(user_id) => body.insert(key.into(), Value::String(user_id)),
            None => body.remove(key),
        };
    }
    assert_official_spirit_comment(season.use_official_scoring, &official_spirit_fields(&body))?;
    let duplicates = REPORT
        .count(
            db,
            Report::FIXTURE_ID
                .eq(&fixture.id)
                .and_also(Report::TEAM_ID.eq(&team.id))
                .and_also(Report::TEAM_AGAINST_ID.eq(&team_against.id)),
        )
        .await?;
    if duplicates > 0 {
        return Err(conflict_error(
            format!(
                "Report already submitted by {} for {}.",
                team.name, fixture.title
            ),
            ErrorOptions::code("report.already_submitted"),
        ));
    }
    if !fixture_has_matchup(&fixture, &team.id, &team_against.id) {
        return Err(bad_request_error(
            "Failed to find the opposition team. Your team is may not be playing in this fixture.",
            ErrorOptions::code("report.matchup_invalid"),
        ));
    }
    body.insert("userId".into(), Value::String(user.id));
    body.insert("teamAgainstId".into(), Value::String(team_against.id));
    REPORT.create_one(db, body).await
}

/// An MVP pick in an update: omitted keeps the stored pick, `null` clears it.
fn pick(body: &mut Map<String, Value>, key: &str, stored: &Option<String>) -> Option<String> {
    match body.remove(key) {
        None => stored.clone(),
        Some(Value::String(user_id)) => Some(user_id),
        Some(_) => None,
    }
}

async fn update(mut body: Map<String, Value>, ctx: Ctx) -> AppResult<Report> {
    ctx.require_access().await?;
    let db = ctx.db();
    let report_id = match body.remove("reportId") {
        Some(Value::String(id)) => id,
        _ => String::new(),
    };
    let report = REPORT.get_one(db, Report::ID.eq(&report_id)).await?;
    let fixture = FIXTURE
        .get_one(db, Fixture::ID.eq(&report.fixture_id))
        .await?;
    let season = SEASON
        .get_one(db, Season::ID.eq(&fixture.season_id))
        .await?;
    let picks = SeasonMvpFields {
        mvp_male: pick(&mut body, "mvpMale", &report.mvp_male),
        mvp_female: pick(&mut body, "mvpFemale", &report.mvp_female),
        mvp_male2: pick(&mut body, "mvpMale2", &report.mvp_male2),
        mvp_female2: pick(&mut body, "mvpFemale2", &report.mvp_female2),
    };
    let mvps = sanitize_report_mvps(db, &season, &picks).await?;
    // spirit parts left out of the update keep their stored values
    let mut merged = match serde_json::to_value(&report)? {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    merged.extend(body.clone());
    assert_official_spirit_comment(
        season.use_official_scoring,
        &official_spirit_fields(&merged),
    )?;
    let mut patch = Patch::from_object(body);
    for (key, value) in mvp_values(&mvps) {
        patch = match value {
            Some(user_id) => patch.set_field(key, Value::String(user_id)),
            None => patch.unset_field(key),
        };
    }
    REPORT
        .update_one(
            db,
            Report::ID.eq(&report_id),
            patch.set(Report::UPDATED_ON, js::date::now_iso()),
        )
        .await
}

async fn delete(payload: ReportIdPayload, ctx: Ctx) -> AppResult<()> {
    ctx.require_access().await?;
    REPORT
        .delete_one(ctx.db(), Report::ID.eq(payload.report_id))
        .await?;
    Ok(())
}

async fn missing_list(payload: SeasonIdPayload, ctx: Ctx) -> AppResult<Vec<MissingReportRound>> {
    ctx.require_access().await?;
    let db = ctx.db();
    let fixtures = FIXTURE
        .get_many(
            db,
            Fixture::SEASON_ID.eq(&payload.season_id),
            Query::new().sort([Fixture::DATE.asc()]),
        )
        .await?;
    let teams = TEAM
        .get_many(db, Team::SEASON_ID.eq(&payload.season_id), Query::new())
        .await?;
    let fixture_ids: Vec<String> = fixtures.iter().map(|f| f.id.clone()).collect();
    let reports: Vec<SubmittedReport> = REPORT
        .get_many(db, Report::FIXTURE_ID.is_in(fixture_ids), Query::new())
        .await?
        .into_iter()
        .map(|report| SubmittedReport {
            fixture_id: report.fixture_id,
            team_id: report.team_id,
            team_against_id: Some(report.team_against_id),
        })
        .collect();
    let refs: Vec<FixtureRef<'_>> = fixtures
        .iter()
        .map(|f| FixtureRef {
            id: &f.id,
            title: &f.title,
            date: &f.date,
            games: &f.games,
        })
        .collect();
    Ok(list_missing_reports(&refs, &teams, &reports))
}

/// The Report endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&REPORT_CREATE, create),
        Endpoint::new(&REPORT_UPDATE, update),
        Endpoint::new(&REPORT_DELETE, delete),
        Endpoint::new(&REPORT_MISSING_LIST, missing_list),
    ]
}
