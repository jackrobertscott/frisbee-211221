//! Port of `server/src/endpoints/Feature.ts` — the screen loaders for
//! `shared/src/endpoints/FeatureDef.ts` (`crate::shared::contract::feature`).

use crate::auth::require::require_team;
use crate::db::{Db, Query};
use crate::http::endpoint::{Ctx, Endpoint};
use crate::queries::mvp_leaderboard::{mvp_leaderboard, to_mvp_rows};
use crate::queries::report_search::{ReportSearchResult, report_search};
use crate::queries::spirit_table::spirit_table;
use crate::queries::team_list::{
    TEAM_LIST_DEFAULT_SORT_BY, TEAM_LIST_DEFAULT_SORT_DIRECTION, season_teams, team_list,
};
use crate::services::spirit_stats::{build_spirit_rows, sort_spirit_rows};
use crate::services::user_fields::select_public_user_fields;
use crate::shared::contract::feature::{
    FEATURE_COMPETITION_LOAD, FEATURE_DASHBOARD_MVP_LOAD, FEATURE_DASHBOARD_REPORTS_LOAD,
    FEATURE_DASHBOARD_SPIRIT_LOAD, FEATURE_DASHBOARD_TEAMS_LOAD,
    FEATURE_DASHBOARD_USER_MEMBERSHIPS_LOAD, FEATURE_FIXTURE_TALLY_LOAD, FEATURE_FIXTURE_VIEW_LOAD,
    FEATURE_REPORT_EDITOR_LOAD, FEATURE_TEAM_SETUP_LOAD, FeatureAgainstOption, FeatureMvpRow,
    FeatureSpiritRow, FeatureSpiritSortKey,
};
use crate::shared::contract::report::ReportSearchRow;
use crate::shared::contract::team::TeamListSortKey;
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error};
use crate::shared::schemas::{Fixture, Member, Report, Season, Team, User, UserPublic};
use crate::shared::utils::endpoint_def::SortDirection;
use crate::tables::{FIXTURE, MEMBER, REPORT, SEASON, TEAM, USER};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeasonIdPayload {
    season_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureIdPayload {
    fixture_id: String,
}

#[derive(Serialize)]
struct TeamsAndFixtures {
    teams: Vec<Team>,
    fixtures: Vec<Fixture>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardTeamsPayload {
    season_id: String,
    search: Option<String>,
    sort_by: Option<TeamListSortKey>,
    sort_direction: Option<SortDirection>,
    limit: Option<f64>,
    skip: Option<f64>,
}

#[derive(Serialize)]
struct DashboardTeamsResult {
    count: i64,
    teams: Vec<Team>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardReportsPayload {
    season_id: String,
    search: Option<String>,
    limit: Option<f64>,
    skip: Option<f64>,
}

#[derive(Serialize)]
struct DashboardReportsResult {
    count: i64,
    reports: Vec<ReportSearchRow>,
    fixtures: Vec<Fixture>,
    teams: Vec<Team>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportEditorPayload {
    season_id: String,
    fixture_id: Option<String>,
    team_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportEditorResult {
    fixtures: Vec<Fixture>,
    teams: Vec<Team>,
    against_options: Vec<FeatureAgainstOption>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardSpiritPayload {
    season_id: String,
    sort_by: Option<FeatureSpiritSortKey>,
    sort_direction: Option<SortDirection>,
}

#[derive(Serialize)]
struct SpiritRowsResult {
    rows: Vec<FeatureSpiritRow>,
}

#[derive(Serialize)]
struct MvpRowsResult {
    rows: Vec<FeatureMvpRow>,
}

#[derive(Serialize)]
struct FixtureTallyResult {
    fixture: Fixture,
    teams: Vec<Team>,
    reports: Vec<Report>,
}

#[derive(Serialize)]
struct FixtureViewResult {
    fixture: Fixture,
    teams: Vec<Team>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TeamSetupPayload {
    season_id: String,
    search: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamSetupResult {
    teams: Vec<Team>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pending_team: Option<Team>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserIdPayload {
    user_id: String,
}

#[derive(Serialize)]
struct UserMembershipsResult {
    members: Vec<Member>,
    seasons: Vec<Season>,
    teams: Vec<Team>,
}

/// A validated non-negative integer paging value.
fn paging(value: Option<f64>) -> Option<u64> {
    value.map(|v| v.max(0.0) as u64)
}

/// `_getSeasonTeams(seasonId)`: the season's teams by division.
async fn get_season_teams(db: &Db, season_id: &str) -> AppResult<Vec<Team>> {
    let season_id = season_id.to_string();
    db.call(move |c| season_teams(c, &season_id)).await
}

/// `_getSeasonTeamsAndFixtures(seasonId)`: teams by division, fixtures by date.
async fn get_season_teams_and_fixtures(db: &Db, season_id: &str) -> AppResult<TeamsAndFixtures> {
    let teams = get_season_teams(db, season_id).await?;
    let fixtures = FIXTURE
        .get_many(
            db,
            Fixture::SEASON_ID.eq(season_id),
            Query::new().sort([Fixture::DATE.asc()]),
        )
        .await?;
    Ok(TeamsAndFixtures { teams, fixtures })
}

fn fixture_ids(fixtures: &[Fixture]) -> Vec<String> {
    fixtures.iter().map(|fixture| fixture.id.clone()).collect()
}

async fn competition_load(payload: SeasonIdPayload, ctx: Ctx) -> AppResult<TeamsAndFixtures> {
    SEASON
        .get_one(ctx.db(), Season::ID.eq(&payload.season_id))
        .await?;
    get_season_teams_and_fixtures(ctx.db(), &payload.season_id).await
}

async fn dashboard_teams_load(
    payload: DashboardTeamsPayload,
    ctx: Ctx,
) -> AppResult<DashboardTeamsResult> {
    let db = ctx.db();
    SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let filter = Team::SEASON_ID
        .eq(&payload.season_id)
        .and_also(Team::NAME.contains_ci(payload.search.unwrap_or_default()));
    let count = TEAM.count(db, filter.clone()).await?;
    let sort_by = payload.sort_by.unwrap_or(TEAM_LIST_DEFAULT_SORT_BY);
    let direction = payload
        .sort_direction
        .unwrap_or(TEAM_LIST_DEFAULT_SORT_DIRECTION);
    let (skip, limit) = (paging(payload.skip), paging(payload.limit));
    let teams = db
        .call(move |c| team_list(c, &filter, sort_by, direction, skip, limit))
        .await?;
    Ok(DashboardTeamsResult { count, teams })
}

async fn dashboard_reports_load(
    payload: DashboardReportsPayload,
    ctx: Ctx,
) -> AppResult<DashboardReportsResult> {
    ctx.require_access().await?;
    let db = ctx.db();
    let season = SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let TeamsAndFixtures { teams, fixtures } =
        get_season_teams_and_fixtures(db, &payload.season_id).await?;
    let ids = fixture_ids(&fixtures);
    let (skip, limit) = (paging(payload.skip), paging(payload.limit));
    let search = payload.search;
    let ReportSearchResult { count, reports } = db
        .call(move |c| report_search(c, &ids, &season, search.as_deref(), limit, skip))
        .await?;
    Ok(DashboardReportsResult {
        count,
        reports,
        fixtures,
        teams,
    })
}

/// `_getAgainstOptions`: the teams `teamId` plays in a fixture, each with its
/// confirmed players as MVP options. Non-admins must belong to `teamId`.
async fn get_against_options(
    db: &Db,
    user: &User,
    season_id: &str,
    fixture_id: &str,
    team_id: &str,
) -> AppResult<Vec<FeatureAgainstOption>> {
    let team = if user.admin == Some(true) {
        TEAM.get_one(
            db,
            Team::ID.eq(team_id).and_also(Team::SEASON_ID.eq(season_id)),
        )
        .await?
    } else {
        require_team(db, &user.id, team_id).await?.0
    };
    let fixture = FIXTURE.get_one(db, Fixture::ID.eq(fixture_id)).await?;
    if fixture.season_id != season_id {
        return Err(bad_request_error(
            "Fixture does not belong to the selected season.",
            ErrorOptions::code("report.fixture_invalid"),
        ));
    }
    let against_team_ids: Vec<String> = fixture
        .games
        .iter()
        .flat_map(|game| {
            let mut ids = Vec::new();
            if game.team1_id == team.id {
                ids.push(game.team2_id.clone());
            }
            if game.team2_id == team.id {
                ids.push(game.team1_id.clone());
            }
            ids
        })
        .collect();
    if against_team_ids.is_empty() {
        return Err(bad_request_error(
            "Failed to find the opposition team. Your team is may not be playing in this fixture.",
            ErrorOptions::code("report.matchup_invalid"),
        ));
    }
    let against_teams = TEAM
        .get_many(db, Team::ID.is_in(against_team_ids.clone()), Query::new())
        .await?;
    let members = MEMBER
        .get_many(
            db,
            Member::TEAM_ID
                .is_in(against_team_ids.clone())
                .and_also(Member::PENDING.eq(false)),
            Query::new(),
        )
        .await?;
    let user_ids: Vec<String> = members.iter().map(|m| m.user_id.clone()).collect();
    let users = USER
        .get_many(db, User::ID.is_in(user_ids), Query::new())
        .await?;
    let user_map: HashMap<&str, UserPublic> = users
        .iter()
        .map(|u| (u.id.as_str(), select_public_user_fields(u)))
        .collect();
    Ok(against_team_ids
        .iter()
        .filter_map(|against_team_id| {
            let against_team = against_teams.iter().find(|t| &t.id == against_team_id)?;
            let team_users = members
                .iter()
                .filter(|m| &m.team_id == against_team_id)
                .filter_map(|m| user_map.get(m.user_id.as_str()).cloned())
                .collect();
            Some(FeatureAgainstOption {
                team: against_team.clone(),
                users: team_users,
            })
        })
        .collect())
}

async fn report_editor_load(
    payload: ReportEditorPayload,
    ctx: Ctx,
) -> AppResult<ReportEditorResult> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let season = SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let TeamsAndFixtures { teams, fixtures } =
        get_season_teams_and_fixtures(db, &payload.season_id).await?;
    let against_options = match (
        payload.fixture_id.filter(|id| !id.is_empty()),
        payload.team_id.filter(|id| !id.is_empty()),
    ) {
        (Some(fixture_id), Some(team_id)) => {
            get_against_options(db, &user, &season.id, &fixture_id, &team_id).await?
        }
        _ => Vec::new(),
    };
    Ok(ReportEditorResult {
        fixtures,
        teams,
        against_options,
    })
}

async fn dashboard_spirit_load(
    payload: DashboardSpiritPayload,
    ctx: Ctx,
) -> AppResult<SpiritRowsResult> {
    ctx.require_access().await?;
    let db = ctx.db();
    let season = SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let TeamsAndFixtures { teams, fixtures } =
        get_season_teams_and_fixtures(db, &payload.season_id).await?;
    let ids = fixture_ids(&fixtures);
    let official = season.use_official_scoring == Some(true);
    let aggregate = db.call(move |c| spirit_table(c, &ids, official)).await?;
    Ok(SpiritRowsResult {
        rows: sort_spirit_rows(
            &build_spirit_rows(&teams, Some(&aggregate)),
            payload
                .sort_by
                .unwrap_or(FeatureSpiritSortKey::AdjustedReceivedAverage),
            payload.sort_direction.unwrap_or(SortDirection::Desc),
        ),
    })
}

async fn dashboard_mvp_load(payload: SeasonIdPayload, ctx: Ctx) -> AppResult<MvpRowsResult> {
    ctx.require_access().await?;
    let db = ctx.db();
    let season = SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let TeamsAndFixtures { teams, fixtures } =
        get_season_teams_and_fixtures(db, &payload.season_id).await?;
    let ids = fixture_ids(&fixtures);
    let query_season = season.clone();
    let aggregate_rows = db
        .call(move |c| mvp_leaderboard(c, &ids, &query_season))
        .await?;
    let user_ids: Vec<String> = aggregate_rows.iter().map(|r| r.user_id.clone()).collect();
    let users = USER
        .get_many(db, User::ID.is_in(user_ids), Query::new())
        .await?;
    let users: Vec<UserPublic> = users.iter().map(select_public_user_fields).collect();
    Ok(MvpRowsResult {
        rows: to_mvp_rows(&aggregate_rows, &season, &teams, &users),
    })
}

async fn fixture_tally_load(payload: FixtureIdPayload, ctx: Ctx) -> AppResult<FixtureTallyResult> {
    ctx.require_access().await?;
    let db = ctx.db();
    let fixture = FIXTURE
        .get_one(db, Fixture::ID.eq(&payload.fixture_id))
        .await?;
    let teams = get_season_teams(db, &fixture.season_id).await?;
    let reports = REPORT
        .get_many(
            db,
            Report::FIXTURE_ID.eq(&payload.fixture_id),
            Query::new().sort([Report::CREATED_ON.desc()]),
        )
        .await?;
    Ok(FixtureTallyResult {
        fixture,
        teams,
        reports,
    })
}

async fn fixture_view_load(payload: FixtureIdPayload, ctx: Ctx) -> AppResult<FixtureViewResult> {
    let fixture = FIXTURE
        .get_one(ctx.db(), Fixture::ID.eq(&payload.fixture_id))
        .await?;
    let teams = get_season_teams(ctx.db(), &fixture.season_id).await?;
    Ok(FixtureViewResult { fixture, teams })
}

async fn team_setup_load(payload: TeamSetupPayload, ctx: Ctx) -> AppResult<TeamSetupResult> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    SEASON
        .get_one(db, Season::ID.eq(&payload.season_id))
        .await?;
    let filter = Team::SEASON_ID
        .eq(&payload.season_id)
        .and_also(Team::NAME.contains_ci(payload.search.unwrap_or_default()));
    let teams = db
        .call(move |c| {
            team_list(
                c,
                &filter,
                TeamListSortKey::Name,
                SortDirection::Asc,
                None,
                None,
            )
        })
        .await?;
    let memberships = MEMBER
        .get_many(
            db,
            Member::USER_ID
                .eq(&user.id)
                .and_also(Member::SEASON_ID.eq(&payload.season_id)),
            Query::new(),
        )
        .await?;
    let pending_team = match memberships.first() {
        Some(membership) => TEAM.maybe_one(db, Team::ID.eq(&membership.team_id)).await?,
        None => None,
    };
    Ok(TeamSetupResult {
        teams,
        pending_team,
    })
}

async fn dashboard_user_memberships_load(
    payload: UserIdPayload,
    ctx: Ctx,
) -> AppResult<UserMembershipsResult> {
    ctx.require_access().await?;
    let db = ctx.db();
    USER.get_one(db, User::ID.eq(&payload.user_id)).await?;
    let members = MEMBER
        .get_many(db, Member::USER_ID.eq(&payload.user_id), Query::new())
        .await?;
    let team_ids: Vec<String> = members.iter().map(|m| m.team_id.clone()).collect();
    let season_ids: Vec<String> = members.iter().map(|m| m.season_id.clone()).collect();
    let teams = TEAM
        .get_many(db, Team::ID.is_in(team_ids), Query::new())
        .await?;
    let seasons = SEASON
        .get_many(db, Season::ID.is_in(season_ids), Query::new())
        .await?;
    Ok(UserMembershipsResult {
        members,
        seasons,
        teams,
    })
}

/// The Feature endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&FEATURE_COMPETITION_LOAD, competition_load),
        Endpoint::new(&FEATURE_DASHBOARD_TEAMS_LOAD, dashboard_teams_load),
        Endpoint::new(&FEATURE_DASHBOARD_REPORTS_LOAD, dashboard_reports_load),
        Endpoint::new(&FEATURE_REPORT_EDITOR_LOAD, report_editor_load),
        Endpoint::new(&FEATURE_DASHBOARD_SPIRIT_LOAD, dashboard_spirit_load),
        Endpoint::new(&FEATURE_DASHBOARD_MVP_LOAD, dashboard_mvp_load),
        Endpoint::new(&FEATURE_FIXTURE_TALLY_LOAD, fixture_tally_load),
        Endpoint::new(&FEATURE_FIXTURE_VIEW_LOAD, fixture_view_load),
        Endpoint::new(&FEATURE_TEAM_SETUP_LOAD, team_setup_load),
        Endpoint::new(
            &FEATURE_DASHBOARD_USER_MEMBERSHIPS_LOAD,
            dashboard_user_memberships_load,
        ),
    ]
}
