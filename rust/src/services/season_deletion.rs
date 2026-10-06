//! Port of `server/src/services/seasonDeletion.ts`.

use crate::db::{Db, Filter, Patch, Query};
use crate::shared::errors::{AppResult, ErrorOptions, conflict_error};
use crate::shared::schemas::{
    Fixture, GamedayImportConfig, GamedayImportRun, Member, Report, Season, Team, User,
};
use crate::tables::{
    FIXTURE, GAMEDAY_IMPORT_CONFIG, GAMEDAY_IMPORT_RUN, MEMBER, REPORT, SEASON, TEAM, USER,
};
use rusqlite::Connection;

/// `countSeasonReports(seasonId)` on one connection: reports tied to the
/// season through its fixtures or teams.
pub fn count_season_reports_on(conn: &Connection, season_id: &str) -> AppResult<i64> {
    let fixture_ids: Vec<String> = FIXTURE
        .tx(conn)
        .get_many(&Fixture::SEASON_ID.eq(season_id), &Query::new())?
        .into_iter()
        .map(|fixture| fixture.id)
        .collect();
    let team_ids: Vec<String> = TEAM
        .tx(conn)
        .get_many(&Team::SEASON_ID.eq(season_id), &Query::new())?
        .into_iter()
        .map(|team| team.id)
        .collect();
    let mut report_queries = Vec::new();
    if !fixture_ids.is_empty() {
        report_queries.push(Report::FIXTURE_ID.is_in(fixture_ids));
    }
    if !team_ids.is_empty() {
        report_queries.push(Report::TEAM_ID.is_in(team_ids.clone()));
        report_queries.push(Report::TEAM_AGAINST_ID.is_in(team_ids));
    }
    if report_queries.is_empty() {
        return Ok(0);
    }
    REPORT.tx(conn).count(&Filter::or(report_queries))
}

/// `countSeasonReports(seasonId)`.
pub async fn count_season_reports(db: &Db, season_id: &str) -> AppResult<i64> {
    let season_id = season_id.to_string();
    db.call(move |conn| count_season_reports_on(conn, &season_id))
        .await
}

/// `deleteSeasonWithData(seasonId)`: deletes a season and everything hanging
/// off it in one transaction, and clears it as users' last season. Refuses
/// if any reports exist.
pub async fn delete_season_with_data(db: &Db, season_id: &str) -> AppResult<()> {
    let season_id = season_id.to_string();
    db.transaction(move |conn| {
        if count_season_reports_on(conn, &season_id)? > 0 {
            return Err(conflict_error(
                "Season has score reports.",
                ErrorOptions::code("season.delete_has_reports"),
            ));
        }
        MEMBER
            .tx(conn)
            .delete_many(&Member::SEASON_ID.eq(&season_id))?;
        FIXTURE
            .tx(conn)
            .delete_many(&Fixture::SEASON_ID.eq(&season_id))?;
        TEAM.tx(conn).delete_many(&Team::SEASON_ID.eq(&season_id))?;
        GAMEDAY_IMPORT_RUN
            .tx(conn)
            .delete_many(&GamedayImportRun::SEASON_ID.eq(&season_id))?;
        GAMEDAY_IMPORT_CONFIG
            .tx(conn)
            .delete_many(&GamedayImportConfig::SEASON_ID.eq(&season_id))?;
        USER.tx(conn).update_many(
            &User::LAST_SEASON_ID.eq(&season_id),
            &Patch::new()
                .unset(User::LAST_SEASON_ID)
                .set(User::UPDATED_ON, crate::js::date::now_iso()),
        )?;
        SEASON.tx(conn).delete_one(&Season::ID.eq(&season_id))?;
        Ok(())
    })
    .await
}
