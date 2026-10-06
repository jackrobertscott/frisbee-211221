//! Port of `server/src/services/mockData.ts`: random mock teams, users and
//! memberships for trying out a season.

use crate::shared::schemas::{GenderMatching, UserEmail};
use crate::utils::random::{generate_id, random_string};
use serde::Serialize;
use std::collections::HashSet;

/// `TMockTeamCreate`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockTeamCreate {
    pub id: String,
    pub season_id: String,
    pub is_mock: bool,
    pub name: String,
    pub color: String,
    pub division: i64,
}

/// `TMockUserCreate`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockUserCreate {
    pub id: String,
    pub is_mock: bool,
    pub first_name: String,
    pub last_name: String,
    pub terms_accepted: bool,
    pub gender_matching: GenderMatching,
    pub emails: Vec<UserEmail>,
}

/// `TMockMemberCreate`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockMemberCreate {
    pub season_id: String,
    pub team_id: String,
    pub user_id: String,
    pub is_mock: bool,
    pub captain: bool,
    pub pending: bool,
}

/// `TMockSeasonData`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MockSeasonData {
    pub teams: Vec<MockTeamCreate>,
    pub users: Vec<MockUserCreate>,
    pub members: Vec<MockMemberCreate>,
}

/// `generateMockSeasonData(seasonId, teamCount, usersPerTeam)`: random mock
/// teams for a season, each with `usersPerTeam` confirmed members whose first
/// member is captain.
pub fn generate_mock_season_data(
    season_id: &str,
    team_count: usize,
    users_per_team: usize,
) -> MockSeasonData {
    let team_names = generate_mock_team_names(team_count);
    let teams: Vec<MockTeamCreate> = team_names
        .into_iter()
        .map(|name| MockTeamCreate {
            id: generate_id(),
            is_mock: true,
            season_id: season_id.to_string(),
            name,
            color: format!("hsla({}, 100%, 65%, 1)", rand::random_range(0..36) * 10),
            division: 1,
        })
        .collect();

    let mut users = Vec::new();
    let mut members = Vec::new();
    for team in &teams {
        let mut team_users: Vec<MockUserCreate> = Vec::new();
        while team_users.len() < users_per_team {
            let first_name = pick(&MOCK_FIRST_NAMES);
            let last_name = pick(&MOCK_LAST_NAMES);
            let email = mock_email(first_name, last_name);
            if team_users.iter().any(|u| u.emails[0].value == email) {
                continue;
            }
            let gender_matching = if rand::random::<f64>() > 0.5 {
                GenderMatching::Male
            } else {
                GenderMatching::Female
            };
            let user = MockUserCreate {
                id: generate_id(),
                is_mock: true,
                first_name: first_name.into(),
                last_name: last_name.into(),
                gender_matching,
                terms_accepted: true,
                emails: vec![UserEmail {
                    value: email,
                    verified: true,
                    code: "0000".into(),
                    created_on: crate::js::date::now_iso(),
                    primary: true,
                }],
            };
            members.push(MockMemberCreate {
                season_id: team.season_id.clone(),
                team_id: team.id.clone(),
                user_id: user.id.clone(),
                is_mock: true,
                captain: team_users.is_empty(),
                pending: false,
            });
            team_users.push(user);
        }
        users.extend(team_users);
    }

    MockSeasonData {
        teams,
        users,
        members,
    }
}

/// `generateMockTeamNames(count)`: `count` distinct team names in random
/// order. Once the name pool runs out the names repeat with a cycle number
/// suffix.
pub fn generate_mock_team_names(count: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut pool = Vec::new();
    let combos = MOCK_TEAM_DISTRICTS
        .iter()
        .chain(MOCK_TEAM_MODIFIERS.iter())
        .flat_map(|prefix| {
            MOCK_TEAM_MASCOTS
                .iter()
                .map(move |mascot| format!("{prefix} {mascot}"))
        });
    for name in combos {
        if seen.insert(name.clone()) {
            pool.push(name);
        }
    }

    let mut names = shuffle(pool);
    if names.len() >= count {
        names.truncate(count);
        return names;
    }
    let base_len = names.len();
    let mut extras = Vec::new();
    while base_len + extras.len() < count {
        let index = base_len + extras.len();
        let base = &names[index % base_len];
        let cycle = index / base_len + 1;
        extras.push(format!("{base} {cycle}"));
    }
    names.extend(extras);
    names
}

fn pick(values: &[&'static str]) -> &'static str {
    values[rand::random_range(0..values.len())]
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut in_run = false;
    for c in value.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
            in_run = false;
        } else if !in_run {
            out.push('.');
            in_run = true;
        }
    }
    out
}

fn shuffle<T>(mut values: Vec<T>) -> Vec<T> {
    for i in (1..values.len()).rev() {
        let j = rand::random_range(0..=i);
        values.swap(i, j);
    }
    values
}

fn mock_email(first_name: &str, last_name: &str) -> String {
    format!(
        "{}.{}.{}@example.com",
        slugify(first_name),
        slugify(last_name),
        random_string(6).to_lowercase()
    )
}

const MOCK_TEAM_DISTRICTS: [&str; 24] = [
    "North Coast",
    "South Bay",
    "River City",
    "Red Rock",
    "High Plains",
    "Twin Pines",
    "Harbor Point",
    "East Ridge",
    "West End",
    "Gold Valley",
    "Cedar Grove",
    "Silver Lake",
    "Blue Summit",
    "Iron Range",
    "Desert Run",
    "Pine Harbor",
    "Storm Creek",
    "Sunset Hills",
    "Lakeview",
    "Granite Point",
    "Shadow Ridge",
    "Wild Coast",
    "Copper Canyon",
    "Frost Hollow",
];

const MOCK_TEAM_MODIFIERS: [&str; 20] = [
    "Crimson",
    "Electric",
    "Iron",
    "Midnight",
    "Solar",
    "Rapid",
    "Storm",
    "Golden",
    "Steel",
    "Wildfire",
    "Shadow",
    "Arctic",
    "Coastal",
    "Thunder",
    "Neon",
    "Granite",
    "Blackwater",
    "Velocity",
    "Royal",
    "Fireline",
];

const MOCK_TEAM_MASCOTS: [&str; 24] = [
    "Falcons",
    "Cyclones",
    "Wolves",
    "Breakers",
    "Vipers",
    "Rangers",
    "Titans",
    "Barracudas",
    "Comets",
    "Outlaws",
    "Raiders",
    "Rhinos",
    "Stags",
    "Coyotes",
    "Ravens",
    "Mavericks",
    "Chargers",
    "Firebirds",
    "Hawks",
    "Griffins",
    "Pirates",
    "Sentinels",
    "Royals",
    "Stormhawks",
];

const MOCK_FIRST_NAMES: [&str; 12] = [
    "Alex", "Taylor", "Jordan", "Sam", "Casey", "Riley", "Jamie", "Cameron", "Morgan", "Avery",
    "Quinn", "Parker",
];

const MOCK_LAST_NAMES: [&str; 12] = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Taylor",
    "Clark", "Evans", "Hall",
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::utils::regex;

    mod generate_mock_team_names_tests {
        use super::*;

        #[test]
        fn returns_the_requested_number_of_distinct_names() {
            let names = generate_mock_team_names(30);
            assert_eq!(names.len(), 30);
            assert_eq!(names.iter().collect::<HashSet<_>>().len(), 30);
        }

        #[test]
        fn suffixes_a_cycle_number_once_the_pool_runs_out() {
            let names = generate_mock_team_names(1100);
            assert_eq!(names.len(), 1100);
            assert_eq!(names.iter().collect::<HashSet<_>>().len(), 1100);
            assert!(names.last().unwrap().ends_with(" 2"));
        }
    }

    mod generate_mock_season_data_tests {
        use super::*;

        #[test]
        fn creates_mock_teams_users_and_memberships_for_the_season() {
            let MockSeasonData {
                teams,
                users,
                members,
            } = generate_mock_season_data("season", 3, 4);
            assert_eq!(teams.len(), 3);
            assert_eq!(users.len(), 12);
            assert_eq!(members.len(), 12);
            for team in &teams {
                assert_eq!(team.season_id, "season");
                assert!(team.is_mock);
                assert_eq!(team.division, 1);
                assert!(regex::hsla().is_match(&team.color), "{}", team.color);
                let team_members: Vec<&MockMemberCreate> =
                    members.iter().filter(|m| m.team_id == team.id).collect();
                assert_eq!(team_members.len(), 4);
                assert_eq!(
                    team_members.iter().map(|m| m.captain).collect::<Vec<_>>(),
                    [true, false, false, false]
                );
            }
            for user in &users {
                assert!(user.is_mock);
                assert_eq!(user.emails.len(), 1);
                assert!(user.emails[0].verified);
                assert!(user.emails[0].primary);
                assert!(regex::email().is_match(&user.emails[0].value));
            }
            assert_eq!(
                members.iter().map(|m| &m.user_id).collect::<HashSet<_>>(),
                users.iter().map(|u| &u.id).collect::<HashSet<_>>()
            );
        }

        #[test]
        fn creates_nothing_for_zero_teams() {
            assert_eq!(
                generate_mock_season_data("season", 0, 5),
                MockSeasonData::default()
            );
        }
    }
}
