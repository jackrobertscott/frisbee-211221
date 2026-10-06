//! Port of `server/src/queries/reportSearch.ts`: one page of a season's
//! reports, newest first, with the fixture, team and submitter names joined
//! in, plus the total count of matching reports.
//!
//! The search filters on joined fields (fixture title, team names, submitter
//! name) as well as the submitter id and spirit comment, so it is applied in
//! SQL before sorting and paging.

use super::team_list::paging_sql;
use crate::db::schema::{row_to_map, select_list};
use crate::js;
use crate::shared::contract::report::ReportSearchRow;
use crate::shared::errors::{AppError, AppResult};
use crate::shared::schemas::{Fixture, Report, Season, Team, User};
use crate::shared::utils::season_gender_division::get_season_mvp_slots;
use crate::tables::{fixture, report, team, user};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, params_from_iter};
use serde::Serialize;
use serde_json::Value;

/// `TReportSearchResult`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ReportSearchResult {
    pub count: i64,
    pub reports: Vec<ReportSearchRow>,
}

/// The characters MongoDB's `$trim` removes by default (except `\0`).
const MONGO_TRIM_CHARACTERS: &str = " \t\n\u{0B}\u{0C}\r\u{A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}";

/// `FROM ... WHERE ...` shared by the count and the page: the season's
/// reports joined to their fixture (required), teams and submitter (optional).
/// Binds `?1` (fixture ids as JSON), `?2` (search) and `?3` (trim characters).
fn from_where_sql(searching: bool) -> String {
    let submitter = submitter_name_sql();
    let mut sql = format!(
        r#" FROM "{report}" t
            JOIN "{fixture}" f ON f."{fixture_id}" = t."{report_fixture_id}"
            LEFT JOIN "{team}" tm ON tm."{team_id}" = t."{report_team_id}"
            LEFT JOIN "{team}" ag ON ag."{team_id}" = t."{report_against_id}"
            LEFT JOIN "{user}" u ON u."{user_id}" = t."{report_user_id}"
            WHERE t."{report_fixture_id}" IN (SELECT value FROM json_each(?1))"#,
        report = report::TABLE.sql,
        fixture = fixture::TABLE.sql,
        team = team::TABLE.sql,
        user = user::TABLE.sql,
        fixture_id = Fixture::ID.sql(),
        team_id = Team::ID.sql(),
        user_id = User::ID.sql(),
        report_fixture_id = Report::FIXTURE_ID.sql(),
        report_team_id = Report::TEAM_ID.sql(),
        report_against_id = Report::TEAM_AGAINST_ID.sql(),
        report_user_id = Report::USER_ID.sql(),
    );
    if searching {
        let fields = [
            format!("f.\"{}\"", Fixture::TITLE.sql()),
            format!("tm.\"{}\"", Team::NAME.sql()),
            format!("ag.\"{}\"", Team::NAME.sql()),
            submitter,
            format!("t.\"{}\"", Report::USER_ID.sql()),
            format!("t.\"{}\"", Report::SPIRIT_COMMENT.sql()),
        ];
        let matches: Vec<String> = fields
            .iter()
            .map(|field| format!("contains_ci({field}, ?2)"))
            .collect();
        sql.push_str(&format!(" AND ({})", matches.join(" OR ")));
    }
    sql
}

/// `trim(firstName + ' ' + lastName)` of the submitter (`''` when missing).
fn submitter_name_sql() -> String {
    format!(
        "trim(COALESCE(u.\"{first}\", '') || ' ' || COALESCE(u.\"{last}\", ''), ?3)",
        first = User::FIRST_NAME.sql(),
        last = User::LAST_NAME.sql(),
    )
}

/// `getReportSearchPipeline({fixtureIds, season, search, limit, skip})`.
pub fn report_search(
    conn: &Connection,
    fixture_ids: &[String],
    season: &Season,
    search: Option<&str>,
    limit: Option<u64>,
    skip: Option<u64>,
) -> AppResult<ReportSearchResult> {
    let trimmed = search.map(js::trim).filter(|s| !s.is_empty());
    let params = [
        SqlValue::Text(serde_json::to_string(fixture_ids)?),
        SqlValue::Text(trimmed.unwrap_or_default().to_string()),
        SqlValue::Text(MONGO_TRIM_CHARACTERS.to_string()),
    ];
    let from_where = from_where_sql(trimmed.is_some());

    let count: i64 = conn
        .prepare(&format!("SELECT COUNT(*){from_where}"))?
        // without a search only `?1` appears in the count
        .query_row(
            params_from_iter(params.iter().take(if trimmed.is_some() { 3 } else { 1 })),
            |row| row.get(0),
        )?;

    let columns = report::TABLE.plain_columns(false);
    let extras = [
        format!("f.\"{}\"", Fixture::TITLE.sql()),
        format!("tm.\"{}\"", Team::NAME.sql()),
        format!("tm.\"{}\"", Team::COLOR.sql()),
        format!("ag.\"{}\"", Team::NAME.sql()),
        format!("ag.\"{}\"", Team::COLOR.sql()),
        submitter_name_sql(),
    ];
    let sql = format!(
        "SELECT {}, {}{from_where} ORDER BY t.\"{}\" DESC{}",
        select_list("t", &columns),
        extras.join(", "),
        Report::CREATED_ON.sql(),
        paging_sql(skip, limit),
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement
        .query_map(params_from_iter(params.iter()), |row| {
            let map = row_to_map(row, &columns, 0)?;
            let offset = columns.len();
            Ok((
                map,
                row.get::<_, Option<String>>(offset)?,
                row.get::<_, Option<String>>(offset + 1)?,
                row.get::<_, Option<String>>(offset + 2)?,
                row.get::<_, Option<String>>(offset + 3)?,
                row.get::<_, Option<String>>(offset + 4)?,
                row.get::<_, String>(offset + 5)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // MVP fields are hidden for slots the season does not use
    let slots = get_season_mvp_slots(Some(season));
    let reports = rows
        .into_iter()
        .map(
            |(
                map,
                fixture_title,
                team_name,
                team_color,
                against_name,
                against_color,
                submitter,
            )| {
                let mut report: Report =
                    serde_json::from_value(Value::Object(map)).map_err(AppError::internal_from)?;
                if !slots.male {
                    report.mvp_male = None;
                    report.mvp_male2 = None;
                }
                if !slots.female {
                    report.mvp_female = None;
                    report.mvp_female2 = None;
                }
                let submitter_name = if submitter.is_empty() {
                    report.user_id.clone().unwrap_or_else(|| "...".into())
                } else {
                    submitter
                };
                Ok(ReportSearchRow {
                    fixture_title: fixture_title.unwrap_or_else(|| report.fixture_id.clone()),
                    team_name: team_name.unwrap_or_else(|| report.team_id.clone()),
                    team_color,
                    against_name: against_name.unwrap_or_else(|| report.team_against_id.clone()),
                    against_color,
                    submitter_name,
                    report,
                })
            },
        )
        .collect::<AppResult<Vec<_>>>()?;
    Ok(ReportSearchResult { count, reports })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schemas::SeasonGenderDivision;
    use crate::tables::{FIXTURE, REPORT, TEAM, USER};
    use crate::testing::TestApp;
    use serde_json::json;

    fn season(gender_division: SeasonGenderDivision) -> Season {
        Season {
            id: "s".into(),
            created_on: "1970-01-01T00:00:00.000Z".into(),
            updated_on: "1970-01-01T00:00:00.000Z".into(),
            name: "Season".into(),
            sign_up_open: false,
            is_hidden: None,
            use_official_scoring: None,
            gender_division: Some(gender_division),
            final_results: None,
        }
    }

    /// Two fixtures and three reports created a minute apart; report 1 is
    /// submitted by "Ann Bee" against "A.B Team".
    async fn seed(app: &TestApp) -> Vec<String> {
        let db = app.db();
        let user = USER
            .create_one(
                db,
                json!({"firstName": "Ann", "lastName": "Bee", "genderMatching": "female", "termsAccepted": true, "emails": []}),
            )
            .await
            .unwrap();
        let team =
            |name: &str| json!({"seasonId": "s", "name": name, "color": "hsla(0, 50%, 50%, 1)"});
        let a = TEAM.create_one(db, team("A.B Team")).await.unwrap();
        let b = TEAM.create_one(db, team("Other")).await.unwrap();
        let mut fixture_ids = Vec::new();
        for title in ["Round 1", "Round 2"] {
            let fixture = FIXTURE
                .create_one(
                    db,
                    json!({"seasonId": "s", "userId": user.id, "title": title, "date": "2026-01-01T00:00:00.000Z", "games": []}),
                )
                .await
                .unwrap();
            fixture_ids.push(fixture.id);
        }
        for (i, (fixture, team_id, against)) in [
            (&fixture_ids[0], &b.id, &a.id),
            (&fixture_ids[0], &a.id, &b.id),
            (&fixture_ids[1], &b.id, &a.id),
        ]
        .into_iter()
        .enumerate()
        {
            REPORT
                .create_one(
                    db,
                    json!({
                        "fixtureId": fixture,
                        "teamId": team_id,
                        "teamAgainstId": against,
                        "userId": if i == 1 { user.id.clone() } else { "ghost".into() },
                        "createdOn": format!("2026-07-01T12:0{i}:00.000Z"),
                        "scoreFor": 1,
                        "scoreAgainst": 0,
                        "spiritComment": "",
                        "mvpMale": "m",
                        "mvpFemale": "f",
                    }),
                )
                .await
                .unwrap();
        }
        fixture_ids
    }

    fn titles(result: &ReportSearchResult) -> Vec<(String, String)> {
        result
            .reports
            .iter()
            .map(|r| {
                (
                    r.fixture_title.clone(),
                    r.report.created_on[11..16].to_string(),
                )
            })
            .collect()
    }

    mod get_report_search_pipeline {
        use super::*;

        #[tokio::test]
        async fn pages_newest_first_before_joining_when_not_searching() {
            let app = TestApp::new(vec![]);
            let fixture_ids = seed(&app).await;
            let season = season(SeasonGenderDivision::Mixed);
            let result = app
                .db()
                .call(move |c| report_search(c, &fixture_ids, &season, None, Some(1), Some(1)))
                .await
                .unwrap();
            assert_eq!(result.count, 3);
            assert_eq!(
                titles(&result),
                [("Round 1".to_string(), "12:01".to_string())]
            );
            assert_eq!(result.reports[0].submitter_name, "Ann Bee");
            assert_eq!(result.reports[0].team_name, "A.B Team");
        }

        #[tokio::test]
        async fn joins_and_filters_before_paging_when_searching() {
            let app = TestApp::new(vec![]);
            let fixture_ids = seed(&app).await;
            let season = season(SeasonGenderDivision::Mixed);
            let result = app
                .db()
                .call(move |c| {
                    report_search(c, &fixture_ids, &season, Some("  a.b  "), Some(10), None)
                })
                .await
                .unwrap();
            // every report involves "A.B Team"; the dot is literal, not a wildcard
            assert_eq!(result.count, 3);
            assert_eq!(result.reports.len(), 3);
            let fixture_ids = result
                .reports
                .iter()
                .map(|r| r.report.fixture_id.clone())
                .collect::<Vec<_>>();
            let season = super::season(SeasonGenderDivision::Mixed);
            let none = app
                .db()
                .call(move |c| report_search(c, &fixture_ids, &season, Some("a_b"), None, None))
                .await
                .unwrap();
            assert_eq!(none.count, 0);
        }

        #[tokio::test]
        async fn hides_mvp_fields_for_slots_the_season_does_not_use() {
            let app = TestApp::new(vec![]);
            let fixture_ids = seed(&app).await;
            let season = season(SeasonGenderDivision::Women);
            let result = app
                .db()
                .call(move |c| report_search(c, &fixture_ids, &season, None, None, None))
                .await
                .unwrap();
            let report = &result.reports[0].report;
            assert_eq!(report.mvp_male, None);
            assert_eq!(report.mvp_female.as_deref(), Some("f"));
            assert_eq!(result.reports[0].submitter_name, "ghost");
        }
    }
}
