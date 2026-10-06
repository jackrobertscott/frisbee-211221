//! Port of `server/src/queries/mvpLeaderboard.ts`: MVP vote totals per player
//! across the given fixtures, sorted in SQL by votes, then division (teams
//! without one last), then player name.
//!
//! Official scoring gives 5 points to a first pick and 3 to a second;
//! otherwise only first picks count, for 1 point each. A player's team is the
//! opposition of the first report (in stored order) that voted for them.

use crate::db::Col;
use crate::shared::contract::feature::FeatureMvpRow;
use crate::shared::errors::AppResult;
use crate::shared::schemas::{GenderMatching, Report, Season, Team, User, UserPublic};
use crate::shared::utils::season_gender_division::{
    get_season_mvp_slots, is_season_mvp_slot_enabled,
};
use crate::tables::{report, team, user};
use rusqlite::{Connection, params};
use std::collections::HashMap;

/// `TMvpLeaderboardRow`.
#[derive(Clone, Debug, PartialEq)]
pub struct MvpLeaderboardRow {
    pub user_id: String,
    pub votes: f64,
    pub male_votes: f64,
    pub female_votes: f64,
    pub team_id: Option<String>,
}

/// One MVP field that can hold a vote.
#[derive(Clone, Copy, Debug)]
pub struct VoteSlot {
    pub column: Col<String>,
    pub points: i64,
    pub gender_matching: GenderMatching,
}

/// The vote slots a season counts, with their points, in report field order.
pub fn mvp_vote_slots(season: &Season) -> Vec<VoteSlot> {
    let official = season.use_official_scoring == Some(true);
    let (first_points, second_points) = if official { (5, 3) } else { (1, 0) };
    let slot_votes = |first: Col<String>, second: Col<String>, gender_matching| {
        [
            VoteSlot {
                column: first,
                points: first_points,
                gender_matching,
            },
            VoteSlot {
                column: second,
                points: second_points,
                gender_matching,
            },
        ]
    };
    let mut votes = Vec::new();
    if is_season_mvp_slot_enabled(Some(season), GenderMatching::Male) {
        votes.extend(slot_votes(
            Report::MVP_MALE,
            Report::MVP_MALE2,
            GenderMatching::Male,
        ));
    }
    if is_season_mvp_slot_enabled(Some(season), GenderMatching::Female) {
        votes.extend(slot_votes(
            Report::MVP_FEMALE,
            Report::MVP_FEMALE2,
            GenderMatching::Female,
        ));
    }
    votes
}

/// The leaderboard order: votes descending, division ascending with missing
/// divisions last, then `firstName lastName` — never `id`.
pub fn mvp_leaderboard_order_sql() -> String {
    format!(
        " ORDER BY g.votes DESC, (tm.\"{division}\" IS NULL) ASC, tm.\"{division}\" ASC, (COALESCE(u.\"{first}\", '') || ' ' || COALESCE(u.\"{last}\", '')) ASC",
        division = Team::DIVISION.sql(),
        first = User::FIRST_NAME.sql(),
        last = User::LAST_NAME.sql(),
    )
}

/// `getMvpLeaderboardPipeline(fixtureIds, season)`.
pub fn mvp_leaderboard(
    conn: &Connection,
    fixture_ids: &[String],
    season: &Season,
) -> AppResult<Vec<MvpLeaderboardRow>> {
    let slots = mvp_vote_slots(season);
    if slots.is_empty() {
        return Ok(Vec::new());
    }
    let votes = slots
        .iter()
        .enumerate()
        .map(|(index, slot)| {
            format!(
                "SELECT t.\"_seq\" AS seq, {index} AS slot, t.\"{column}\" AS user_id, {points} AS points, '{gender}' AS gender_matching, t.\"{against}\" AS team_id FROM \"{table}\" t WHERE t.\"{fixture}\" IN (SELECT value FROM json_each(?1))",
                column = slot.column.sql(),
                points = slot.points,
                gender = slot.gender_matching.as_str(),
                against = Report::TEAM_AGAINST_ID.sql(),
                table = report::TABLE.sql,
                fixture = Report::FIXTURE_ID.sql(),
            )
        })
        .collect::<Vec<_>>()
        .join(" UNION ALL ");
    let sql = format!(
        r#"WITH votes AS ({votes}),
        valid AS (
            SELECT * FROM votes WHERE typeof(user_id) = 'text' AND user_id <> '' AND points > 0
        ),
        firsts AS (
            SELECT user_id, team_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY seq, slot) AS n FROM valid
        ),
        g AS (
            SELECT v.user_id AS user_id,
                SUM(v.points) AS votes,
                SUM(CASE WHEN v.gender_matching = 'male' THEN v.points ELSE 0 END) AS male_votes,
                SUM(CASE WHEN v.gender_matching = 'female' THEN v.points ELSE 0 END) AS female_votes,
                f.team_id AS team_id
            FROM valid v JOIN firsts f ON f.user_id = v.user_id AND f.n = 1
            GROUP BY v.user_id
        )
        SELECT g.user_id, g.votes, g.male_votes, g.female_votes, g.team_id
        FROM g
        LEFT JOIN "{team}" tm ON tm."{team_id}" = g.team_id AND tm."{team_season}" = ?2
        LEFT JOIN "{user}" u ON u."{user_id}" = g.user_id{order}"#,
        team = team::TABLE.sql,
        team_id = Team::ID.sql(),
        team_season = Team::SEASON_ID.sql(),
        user = user::TABLE.sql,
        user_id = User::ID.sql(),
        order = mvp_leaderboard_order_sql(),
    );
    let ids = serde_json::to_string(fixture_ids)?;
    let mut statement = conn.prepare(&sql)?;
    let rows = statement
        .query_map(params![ids, season.id], |row| {
            Ok(MvpLeaderboardRow {
                user_id: row.get(0)?,
                votes: row.get(1)?,
                male_votes: row.get(2)?,
                female_votes: row.get(3)?,
                team_id: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// `toMvpRows({aggregateRows, season, teams, users})`: leaderboard rows in
/// aggregate order. A player's gender matching comes from their profile,
/// falling back to whichever slot gave them more votes when the user is
/// missing, and players in slots the season does not use are dropped.
pub fn to_mvp_rows(
    aggregate_rows: &[MvpLeaderboardRow],
    season: &Season,
    teams: &[Team],
    users: &[UserPublic],
) -> Vec<FeatureMvpRow> {
    let team_map: HashMap<&str, &Team> = teams.iter().map(|t| (t.id.as_str(), t)).collect();
    let user_map: HashMap<&str, &UserPublic> = users.iter().map(|u| (u.id.as_str(), u)).collect();
    let slots = get_season_mvp_slots(Some(season));
    aggregate_rows
        .iter()
        .map(|row| {
            let user = user_map.get(row.user_id.as_str()).copied();
            let team = row
                .team_id
                .as_deref()
                .and_then(|id| team_map.get(id).copied());
            FeatureMvpRow {
                user_id: row.user_id.clone(),
                user_name: user.map_or_else(
                    || row.user_id.clone(),
                    |u| format!("{} {}", u.first_name, u.last_name),
                ),
                team_id: team.map(|t| t.id.clone()),
                team_name: team.map(|t| t.name.clone()),
                division: team.and_then(|t| t.division),
                votes: row.votes,
                gender_matching: get_mvp_gender_matching(row, user),
            }
        })
        .filter(|row| {
            row.votes > 0.0
                && match row.gender_matching {
                    GenderMatching::Male => slots.male,
                    GenderMatching::Female => slots.female,
                }
        })
        .collect()
}

fn get_mvp_gender_matching(row: &MvpLeaderboardRow, user: Option<&UserPublic>) -> GenderMatching {
    if let Some(user) = user {
        return user.gender_matching;
    }
    if row.male_votes > row.female_votes {
        GenderMatching::Male
    } else {
        GenderMatching::Female
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schemas::SeasonGenderDivision;
    use crate::tables::{REPORT, TEAM, USER};
    use crate::testing::TestApp;
    use serde_json::json;

    const NOW: &str = "1970-01-01T00:00:00.000Z";

    fn season() -> Season {
        Season {
            id: "s".into(),
            created_on: NOW.into(),
            updated_on: NOW.into(),
            name: "Season".into(),
            sign_up_open: false,
            is_hidden: None,
            use_official_scoring: None,
            gender_division: None,
            final_results: None,
        }
    }

    fn team() -> Team {
        Team {
            id: "t".into(),
            created_on: NOW.into(),
            updated_on: NOW.into(),
            season_id: "s".into(),
            is_mock: None,
            name: "Team".into(),
            color: "hsla(0, 50%, 50%, 1)".into(),
            division: Some(2.0),
            phone: None,
            email: None,
        }
    }

    fn user(id: &str, gender_matching: GenderMatching) -> UserPublic {
        UserPublic {
            id: id.into(),
            created_on: NOW.into(),
            updated_on: NOW.into(),
            first_name: "First".into(),
            last_name: id.into(),
            gender_matching,
            avatar_url: None,
        }
    }

    fn row(user_id: &str, votes: f64, male_votes: f64, female_votes: f64) -> MvpLeaderboardRow {
        MvpLeaderboardRow {
            user_id: user_id.into(),
            votes,
            male_votes,
            female_votes,
            team_id: Some("t".into()),
        }
    }

    mod get_mvp_leaderboard_pipeline {
        use super::*;

        #[test]
        fn weights_second_picks_only_under_official_scoring() {
            let points = |season: &Season| {
                mvp_vote_slots(season)
                    .iter()
                    .map(|v| v.points)
                    .collect::<Vec<_>>()
            };
            let official = Season {
                use_official_scoring: Some(true),
                ..season()
            };
            assert_eq!(points(&season()), [1, 0, 1, 0]);
            assert_eq!(points(&official), [5, 3, 5, 3]);
        }

        #[test]
        fn only_counts_slots_the_season_uses() {
            let men = Season {
                gender_division: Some(SeasonGenderDivision::Men),
                ..season()
            };
            let fields: Vec<&str> = mvp_vote_slots(&men)
                .iter()
                .map(|v| v.column.field())
                .collect();
            assert_eq!(fields, ["mvpMale", "mvpMale2"]);
        }

        #[tokio::test]
        async fn sorts_by_votes_division_and_player_name_never_id() {
            assert_eq!(
                mvp_leaderboard_order_sql(),
                " ORDER BY g.votes DESC, (tm.\"division\" IS NULL) ASC, tm.\"division\" ASC, (COALESCE(u.\"first_name\", '') || ' ' || COALESCE(u.\"last_name\", '')) ASC"
            );
            // and the query applies it: equal votes, division 1 before 2 before none
            let app = TestApp::new(vec![]);
            let db = app.db();
            let team = |name: &str, division: Option<i64>| {
                let mut value =
                    json!({"seasonId": "s", "name": name, "color": "hsla(0, 50%, 50%, 1)"});
                if let Some(division) = division {
                    value["division"] = json!(division);
                }
                value
            };
            let two = TEAM.create_one(db, team("Two", Some(2))).await.unwrap();
            let one = TEAM.create_one(db, team("One", Some(1))).await.unwrap();
            let none = TEAM.create_one(db, team("None", None)).await.unwrap();
            let mut ids = Vec::new();
            for (first, last) in [("Zed", "A"), ("Amy", "B"), ("Bob", "C"), ("Ann", "D")] {
                let user = USER
                    .create_one(
                        db,
                        json!({"firstName": first, "lastName": last, "genderMatching": "male", "termsAccepted": true, "emails": []}),
                    )
                    .await
                    .unwrap();
                ids.push(user.id);
            }
            for (user_id, against) in [
                (&ids[0], &none.id),
                (&ids[1], &two.id),
                (&ids[2], &one.id),
                (&ids[3], &two.id),
            ] {
                REPORT
                    .create_one(
                        db,
                        json!({"fixtureId": "f", "teamId": "x", "teamAgainstId": against, "scoreFor": 0, "scoreAgainst": 0, "spiritComment": "", "mvpMale": user_id}),
                    )
                    .await
                    .unwrap();
            }
            let rows = db
                .call(|c| mvp_leaderboard(c, &["f".to_string()], &season()))
                .await
                .unwrap();
            let order: Vec<&str> = rows.iter().map(|r| r.user_id.as_str()).collect();
            assert_eq!(
                order,
                [&ids[2], &ids[1], &ids[3], &ids[0]].map(String::as_str)
            );
            assert!(rows.iter().all(|r| r.votes == 1.0 && r.male_votes == 1.0));
        }
    }

    mod to_mvp_rows_tests {
        use super::*;

        #[test]
        fn names_players_attaches_teams_and_keeps_aggregate_order() {
            let rows = to_mvp_rows(
                &[row("b", 5.0, 5.0, 0.0), row("a", 3.0, 0.0, 3.0)],
                &season(),
                &[team()],
                &[
                    user("a", GenderMatching::Female),
                    user("b", GenderMatching::Male),
                ],
            );
            assert_eq!(
                serde_json::to_value(rows).unwrap(),
                json!([
                    {
                        "userId": "b",
                        "userName": "First b",
                        "teamId": "t",
                        "teamName": "Team",
                        "division": 2.0,
                        "votes": 5.0,
                        "genderMatching": "male",
                    },
                    {
                        "userId": "a",
                        "userName": "First a",
                        "teamId": "t",
                        "teamName": "Team",
                        "division": 2.0,
                        "votes": 3.0,
                        "genderMatching": "female",
                    },
                ])
            );
        }

        #[test]
        fn uses_the_profile_gender_matching_over_the_slot_votes() {
            let rows = to_mvp_rows(
                &[row("a", 4.0, 4.0, 0.0)],
                &season(),
                &[],
                &[user("a", GenderMatching::Female)],
            );
            assert_eq!(
                rows.iter().map(|r| r.gender_matching).collect::<Vec<_>>(),
                [GenderMatching::Female]
            );
        }

        #[test]
        fn falls_back_to_the_slot_with_more_votes_and_drops_unused_slots() {
            let women = Season {
                gender_division: Some(SeasonGenderDivision::Women),
                ..season()
            };
            let rows = to_mvp_rows(
                &[
                    row("unknown", 4.0, 3.0, 1.0),
                    row("missing", 2.0, 0.0, 2.0),
                    row("zero", 0.0, 0.0, 0.0),
                ],
                &women,
                &[],
                &[],
            );
            assert_eq!(
                rows.iter()
                    .map(|r| (r.user_id.as_str(), r.user_name.as_str(), r.gender_matching))
                    .collect::<Vec<_>>(),
                [("missing", "missing", GenderMatching::Female)]
            );
        }
    }
}
