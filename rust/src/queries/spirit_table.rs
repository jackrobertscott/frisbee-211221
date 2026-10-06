//! Port of `server/src/queries/spiritTable.ts`: spirit totals across the
//! given fixtures — totals per team received and allocated, plus every
//! report's score (in stored order) for the scorer-bias adjustment. Official
//! scoring sums the five spirit categories.

use crate::shared::errors::AppResult;
use crate::shared::schemas::Report;
use crate::tables::report;
use rusqlite::{Connection, params};

/// `TSpiritTeamTotal`: `_id` is the team id.
#[derive(Clone, Debug, PartialEq)]
pub struct SpiritTeamTotal {
    pub team_id: String,
    pub spirit: f64,
    pub reports: i64,
}

/// `TSpiritReportScore`.
#[derive(Clone, Debug, PartialEq)]
pub struct SpiritReportScore {
    pub team_id: String,
    pub team_against_id: String,
    pub spirit: f64,
}

/// `TSpiritTableAggregate`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SpiritTableAggregate {
    pub received: Vec<SpiritTeamTotal>,
    pub allocated: Vec<SpiritTeamTotal>,
    pub reports: Vec<SpiritReportScore>,
}

/// The per-report spirit total for alias `t`.
fn spirit_total_sql(use_official_scoring: bool) -> String {
    if use_official_scoring {
        [
            Report::SPIRIT_P1,
            Report::SPIRIT_P2,
            Report::SPIRIT_P3,
            Report::SPIRIT_P4,
            Report::SPIRIT_P5,
        ]
        .iter()
        .map(|col| format!("COALESCE(t.\"{}\", 0)", col.sql()))
        .collect::<Vec<_>>()
        .join(" + ")
    } else {
        format!("COALESCE(t.\"{}\", 0)", Report::SPIRIT.sql())
    }
}

/// `getSpiritTablePipeline(fixtureIds, useOfficialScoring)`.
pub fn spirit_table(
    conn: &Connection,
    fixture_ids: &[String],
    use_official_scoring: bool,
) -> AppResult<SpiritTableAggregate> {
    let ids = serde_json::to_string(fixture_ids)?;
    let matched = format!(
        "SELECT t.\"_seq\" AS seq, t.\"{team}\" AS team_id, t.\"{against}\" AS team_against_id, {total} AS spirit FROM \"{table}\" t WHERE t.\"{fixture}\" IN (SELECT value FROM json_each(?1))",
        team = Report::TEAM_ID.sql(),
        against = Report::TEAM_AGAINST_ID.sql(),
        total = spirit_total_sql(use_official_scoring),
        table = report::TABLE.sql,
        fixture = Report::FIXTURE_ID.sql(),
    );
    let totals_by = |field: &str| -> AppResult<Vec<SpiritTeamTotal>> {
        let sql = format!(
            "WITH matched AS ({matched}) SELECT {field}, TOTAL(spirit), COUNT(*) FROM matched GROUP BY {field}"
        );
        let mut statement = conn.prepare(&sql)?;
        let rows = statement
            .query_map(params![ids], |row| {
                Ok(SpiritTeamTotal {
                    team_id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    spirit: row.get(1)?,
                    reports: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    };
    let received = totals_by("team_against_id")?;
    let allocated = totals_by("team_id")?;
    let mut statement = conn.prepare(&format!(
        "WITH matched AS ({matched}) SELECT team_id, team_against_id, spirit FROM matched ORDER BY seq"
    ))?;
    let reports = statement
        .query_map(params![ids], |row| {
            Ok(SpiritReportScore {
                team_id: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                team_against_id: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                spirit: row.get::<_, f64>(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SpiritTableAggregate {
        received,
        allocated,
        reports,
    })
}
