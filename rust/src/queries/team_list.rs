//! Port of `server/src/queries/teamList.ts`: teams sorted in SQL before any
//! paging. Division sorts keep teams without a division last regardless of
//! direction and break ties by name.

use crate::db::Filter;
use crate::shared::contract::team::TeamListSortKey;
use crate::shared::errors::AppResult;
use crate::shared::schemas::Team;
use crate::shared::utils::endpoint_def::SortDirection;
use crate::tables::TEAM;
use rusqlite::Connection;

pub const TEAM_LIST_DEFAULT_SORT_BY: TeamListSortKey = TeamListSortKey::Division;
pub const TEAM_LIST_DEFAULT_SORT_DIRECTION: SortDirection = SortDirection::Asc;

fn direction_sql(direction: SortDirection) -> &'static str {
    match direction {
        SortDirection::Asc => "ASC",
        SortDirection::Desc => "DESC",
    }
}

/// `LIMIT`/`OFFSET` like the Mongo `$skip` (only when positive) and `$limit`
/// (only when given) stages.
pub fn paging_sql(skip: Option<u64>, limit: Option<u64>) -> String {
    match (skip.filter(|s| *s > 0), limit) {
        (None, None) => String::new(),
        (None, Some(limit)) => format!(" LIMIT {limit}"),
        (Some(skip), None) => format!(" LIMIT -1 OFFSET {skip}"),
        (Some(skip), Some(limit)) => format!(" LIMIT {limit} OFFSET {skip}"),
    }
}

/// `getTeamListSort`: the `ORDER BY` for alias `t`, using domain fields with
/// a name tie-breaker, never `id`.
pub fn team_list_order_sql(sort_by: TeamListSortKey, direction: SortDirection) -> String {
    let dir = direction_sql(direction);
    let name = format!("t.\"{}\" ASC", Team::NAME.sql());
    let keys = match sort_by {
        TeamListSortKey::Name => format!("t.\"{}\" {dir}", Team::NAME.sql()),
        TeamListSortKey::Division => {
            let division = Team::DIVISION.sql();
            format!("(t.\"{division}\" IS NULL) ASC, t.\"{division}\" {dir}, {name}")
        }
        TeamListSortKey::Phone => format!("t.\"{}\" {dir}, {name}", Team::PHONE.sql()),
        TeamListSortKey::Email => format!("t.\"{}\" {dir}, {name}", Team::EMAIL.sql()),
        TeamListSortKey::CreatedOn => format!("t.\"{}\" {dir}", Team::CREATED_ON.sql()),
    };
    format!(" ORDER BY {keys}")
}

/// `getTeamListPipeline(query, sortBy, sortDirection, skip, limit)`: teams
/// matching `filter`, sorted before any paging.
pub fn team_list(
    conn: &Connection,
    filter: &Filter,
    sort_by: TeamListSortKey,
    direction: SortDirection,
    skip: Option<u64>,
    limit: Option<u64>,
) -> AppResult<Vec<Team>> {
    let mut params = Vec::new();
    let where_sql = filter.to_sql("t", &mut params);
    let tail = format!(
        "WHERE {where_sql}{}{}",
        team_list_order_sql(sort_by, direction),
        paging_sql(skip, limit)
    );
    TEAM.tx(conn).select_where(&tail, &params)
}

/// `getSeasonTeamsPipeline(seasonId)`: every team in a season in the default
/// (division) order.
pub fn season_teams(conn: &Connection, season_id: &str) -> AppResult<Vec<Team>> {
    team_list(
        conn,
        &Team::SEASON_ID.eq(season_id),
        TEAM_LIST_DEFAULT_SORT_BY,
        TEAM_LIST_DEFAULT_SORT_DIRECTION,
        None,
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TestApp;
    use serde_json::json;

    fn names(teams: &[Team]) -> Vec<&str> {
        teams.iter().map(|t| t.name.as_str()).collect()
    }

    async fn seed(app: &TestApp) {
        for (name, division) in [
            ("Bravo", Some(2)),
            ("Alpha", None),
            ("Charlie", Some(1)),
            ("Delta", Some(2)),
        ] {
            let mut team = json!({"seasonId": "s", "name": name, "color": "hsla(0, 50%, 50%, 1)"});
            if let Some(division) = division {
                team["division"] = json!(division);
            }
            TEAM.create_one(app.db(), team).await.unwrap();
        }
        TEAM.create_one(
            app.db(),
            json!({"seasonId": "other", "name": "Echo", "color": "hsla(0, 50%, 50%, 1)", "division": 1}),
        )
        .await
        .unwrap();
    }

    mod get_team_list_pipeline {
        use super::*;

        #[test]
        fn sorts_before_skipping_and_limiting() {
            assert_eq!(
                format!(
                    "{}{}",
                    team_list_order_sql(TeamListSortKey::Name, SortDirection::Desc),
                    paging_sql(Some(10), Some(5))
                ),
                " ORDER BY t.\"name\" DESC LIMIT 5 OFFSET 10"
            );
        }

        #[tokio::test]
        async fn keeps_teams_without_a_division_last_and_tie_breaks_by_name() {
            assert_eq!(
                team_list_order_sql(TeamListSortKey::Division, SortDirection::Desc),
                " ORDER BY (t.\"division\" IS NULL) ASC, t.\"division\" DESC, t.\"name\" ASC"
            );
            let app = TestApp::new(vec![]);
            seed(&app).await;
            let teams = app
                .db()
                .call(|c| {
                    team_list(
                        c,
                        &Filter::all(),
                        TeamListSortKey::Division,
                        SortDirection::Desc,
                        Some(0),
                        Some(20),
                    )
                })
                .await
                .unwrap();
            assert_eq!(
                names(&teams),
                ["Bravo", "Delta", "Charlie", "Echo", "Alpha"]
            );
        }

        #[test]
        fn uses_domain_fields_with_a_name_tie_breaker_never_id() {
            assert_eq!(
                team_list_order_sql(TeamListSortKey::Phone, SortDirection::Asc),
                " ORDER BY t.\"phone\" ASC, t.\"name\" ASC"
            );
            assert_eq!(
                team_list_order_sql(TeamListSortKey::Email, SortDirection::Asc),
                " ORDER BY t.\"email\" ASC, t.\"name\" ASC"
            );
            assert_eq!(
                team_list_order_sql(TeamListSortKey::CreatedOn, SortDirection::Asc),
                " ORDER BY t.\"created_on\" ASC"
            );
        }

        #[test]
        fn omits_paging_stages_when_not_requested() {
            assert_eq!(paging_sql(None, None), "");
            assert_eq!(paging_sql(Some(0), None), "");
        }
    }

    mod get_season_teams_pipeline {
        use super::*;

        #[tokio::test]
        async fn lists_the_whole_season_by_division() {
            let app = TestApp::new(vec![]);
            seed(&app).await;
            let teams = app.db().call(|c| season_teams(c, "s")).await.unwrap();
            assert_eq!(names(&teams), ["Charlie", "Bravo", "Delta", "Alpha"]);
        }
    }
}
