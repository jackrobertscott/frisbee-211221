//! Port of `server/src/services/missingReports.ts`: which teams have not yet
//! reported on the games they played, per fixture.

use crate::js;
use crate::shared::schemas::{FixtureGame, Team};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// The fixture fields the list needs (`Pick<TFixture, 'id' | 'title' | 'date' | 'games'>`).
#[derive(Clone, Copy, Debug)]
pub struct FixtureRef<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub date: &'a str,
    pub games: &'a [FixtureGame],
}

/// `TSubmittedReport`.
#[derive(Clone, Debug, PartialEq)]
pub struct SubmittedReport {
    pub fixture_id: String,
    pub team_id: String,
    pub team_against_id: Option<String>,
}

/// One entry of `missingTeams`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingTeam {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub against_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub against_name: Option<String>,
}

/// `TMissingReportRound`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingReportRound {
    pub title: String,
    pub fixture_id: String,
    pub date: String,
    pub missing_teams: Vec<MissingTeam>,
}

fn report_key(fixture_id: &str, team_id: &str, team_against_id: Option<&str>) -> String {
    [fixture_id, team_id, team_against_id.unwrap_or("")].join("\u{0000}")
}

/// `listMissingReports(fixtures, teams, reports)`: per fixture, the teams that
/// have not reported on a game they played. Each team appears at most once per
/// fixture, fixtures with nothing missing are dropped, and fixtures are
/// ordered by date.
pub fn list_missing_reports(
    fixtures: &[FixtureRef<'_>],
    teams: &[Team],
    reports: &[SubmittedReport],
) -> Vec<MissingReportRound> {
    let teams_by_id: HashMap<&str, &Team> = teams.iter().map(|t| (t.id.as_str(), t)).collect();
    let report_keys: HashSet<String> = reports
        .iter()
        .map(|r| report_key(&r.fixture_id, &r.team_id, r.team_against_id.as_deref()))
        .collect();
    // fixtures are grouped by id: titles can repeat (e.g. a rescheduled round)
    let mut rounds: Vec<MissingReportRound> = Vec::new();
    for fixture in fixtures {
        let index = match rounds.iter().position(|r| r.fixture_id == fixture.id) {
            Some(index) => index,
            None => {
                rounds.push(MissingReportRound {
                    title: fixture.title.to_string(),
                    fixture_id: fixture.id.to_string(),
                    date: fixture.date.to_string(),
                    missing_teams: Vec::new(),
                });
                rounds.len() - 1
            }
        };
        let round = &mut rounds[index];
        for game in fixture.games {
            let team1 = teams_by_id.get(game.team1_id.as_str()).copied();
            let team2 = teams_by_id.get(game.team2_id.as_str()).copied();
            for (team, against) in [(team1, team2), (team2, team1)] {
                let Some(team) = team else { continue };
                let against_id = against.map(|a| a.id.as_str());
                if report_keys.contains(&report_key(fixture.id, &team.id, against_id)) {
                    continue;
                }
                if round.missing_teams.iter().any(|t| t.id == team.id) {
                    continue;
                }
                round.missing_teams.push(MissingTeam {
                    id: team.id.clone(),
                    name: team.name.clone(),
                    color: Some(team.color.clone()),
                    against_id: against.map(|a| a.id.clone()),
                    against_name: against.map(|a| a.name.clone()),
                });
            }
        }
    }
    let mut rounds: Vec<MissingReportRound> = rounds
        .into_iter()
        .filter(|round| !round.missing_teams.is_empty())
        .collect();
    // fixtures arrive sorted by date; this keeps the TS contract for any input
    rounds.sort_by(
        |a, b| match (js::date::parse(&a.date), js::date::parse(&b.date)) {
            (Some(a), Some(b)) => a.cmp(&b),
            _ => std::cmp::Ordering::Equal,
        },
    );
    rounds
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn teams() -> Vec<Team> {
        [
            ("A", "Alpha", "hsla(0, 50%, 50%, 1)"),
            ("B", "Bravo", "hsla(90, 50%, 50%, 1)"),
            ("C", "Charlie", "hsla(180, 50%, 50%, 1)"),
            ("D", "Delta", "hsla(270, 50%, 50%, 1)"),
        ]
        .into_iter()
        .map(|(id, name, color)| Team {
            id: id.into(),
            created_on: String::new(),
            updated_on: String::new(),
            season_id: String::new(),
            is_mock: None,
            name: name.into(),
            color: color.into(),
            division: None,
            phone: None,
            email: None,
        })
        .collect()
    }

    struct TestFixture {
        id: String,
        title: String,
        date: String,
        games: Vec<FixtureGame>,
    }

    impl TestFixture {
        fn as_ref(&self) -> FixtureRef<'_> {
            FixtureRef {
                id: &self.id,
                title: &self.title,
                date: &self.date,
                games: &self.games,
            }
        }
    }

    fn fixture(id: &str, title: &str, date: &str, pairings: &[(&str, &str)]) -> TestFixture {
        TestFixture {
            id: id.into(),
            title: title.into(),
            date: date.into(),
            games: pairings
                .iter()
                .enumerate()
                .map(|(index, (team1, team2))| FixtureGame {
                    id: format!("{id}-{index}"),
                    team1_id: team1.to_string(),
                    team2_id: team2.to_string(),
                    place: "Field".into(),
                    time: "18:00".into(),
                    team1_score: None,
                    team2_score: None,
                })
                .collect(),
        }
    }

    fn list(fixtures: &[TestFixture], reports: &[SubmittedReport]) -> Value {
        let refs: Vec<FixtureRef<'_>> = fixtures.iter().map(TestFixture::as_ref).collect();
        serde_json::to_value(list_missing_reports(&refs, &teams(), reports)).unwrap()
    }

    fn report(fixture_id: &str, team_id: &str, team_against_id: Option<&str>) -> SubmittedReport {
        SubmittedReport {
            fixture_id: fixture_id.into(),
            team_id: team_id.into(),
            team_against_id: team_against_id.map(str::to_string),
        }
    }

    fn missing(id: &str, against_id: Option<&str>) -> Value {
        let teams = teams();
        let team = teams.iter().find(|t| t.id == id).unwrap();
        let mut value = json!({"id": id, "name": team.name, "color": team.color});
        if let Some(against) = against_id.and_then(|a| teams.iter().find(|t| t.id == a)) {
            value["againstId"] = json!(against.id);
            value["againstName"] = json!(against.name);
        }
        value
    }

    #[test]
    fn lists_both_sides_of_a_game_until_each_has_reported() {
        let fixtures = [fixture(
            "F1",
            "Round 1",
            "2026-01-01",
            &[("A", "B"), ("C", "D")],
        )];
        assert_eq!(
            list(
                &fixtures,
                &[report("F1", "A", Some("B")), report("F1", "D", Some("C"))]
            ),
            json!([{
                "title": "Round 1",
                "fixtureId": "F1",
                "date": "2026-01-01",
                "missingTeams": [missing("B", Some("A")), missing("C", Some("D"))],
            }])
        );
    }

    #[test]
    fn only_counts_a_report_against_the_same_opponent_and_fixture() {
        let fixtures = [fixture("F1", "Round 1", "2026-01-01", &[("A", "B")])];
        let result = list(
            &fixtures,
            &[report("F1", "A", Some("C")), report("F2", "B", Some("A"))],
        );
        assert_eq!(
            result[0]["missingTeams"],
            json!([missing("A", Some("B")), missing("B", Some("A"))])
        );
    }

    #[test]
    fn drops_rounds_where_everyone_has_reported() {
        let fixtures = [fixture("F1", "Round 1", "2026-01-01", &[("A", "B")])];
        assert_eq!(
            list(
                &fixtures,
                &[report("F1", "A", Some("B")), report("F1", "B", Some("A"))]
            ),
            json!([])
        );
    }

    #[test]
    fn skips_unknown_teams_but_still_names_a_known_opponent() {
        let fixtures = [fixture("F1", "Round 1", "2026-01-01", &[("A", "X")])];
        assert_eq!(
            list(&fixtures, &[])[0]["missingTeams"],
            json!([missing("A", None)])
        );
        assert_eq!(list(&fixtures, &[report("F1", "A", None)]), json!([]));
    }

    #[test]
    fn lists_fixtures_that_share_a_title_separately() {
        let fixtures = [
            fixture("F1", "Round 1", "2026-01-01", &[("A", "B")]),
            fixture("F2", "Round 1", "2026-01-08", &[("A", "C"), ("C", "D")]),
        ];
        assert_eq!(
            list(&fixtures, &[]),
            json!([
                {
                    "title": "Round 1",
                    "fixtureId": "F1",
                    "date": "2026-01-01",
                    "missingTeams": [missing("A", Some("B")), missing("B", Some("A"))],
                },
                {
                    "title": "Round 1",
                    "fixtureId": "F2",
                    "date": "2026-01-08",
                    // C appears once in a fixture even though it is missing two reports
                    "missingTeams": [missing("A", Some("C")), missing("C", Some("A")), missing("D", Some("C"))],
                },
            ])
        );
    }

    #[test]
    fn orders_rounds_by_date() {
        let fixtures = [
            fixture("F2", "Round 2", "2026-01-08", &[("A", "B")]),
            fixture("F1", "Round 1", "2026-01-01", &[("C", "D")]),
        ];
        let titles: Vec<Value> = list(&fixtures, &[])
            .as_array()
            .unwrap()
            .iter()
            .map(|round| round["title"].clone())
            .collect();
        assert_eq!(titles, [json!("Round 1"), json!("Round 2")]);
    }
}
