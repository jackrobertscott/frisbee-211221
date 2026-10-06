//! Port of `server/src/services/exportArchive.test.ts`.

use super::*;
use crate::db::Patch;
use crate::testing::TestApp;
use crate::utils::random::generate_id;
use serde_json::json;
use std::io::Read;

const COLOR: &str = "hsla(0, 100%, 50%, 1)";

/// Reads one file out of an export zip.
pub fn read_zip_file(buffer: &[u8], name: &str) -> String {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(buffer)).unwrap();
    let mut file = archive.by_name(name).unwrap();
    let mut text = String::new();
    file.read_to_string(&mut text).unwrap();
    text
}

struct Seeded {
    app: TestApp,
}

impl Seeded {
    async fn json(&self) -> (String, impl Fn(&str) -> Vec<Value>) {
        let ExportArchive { buffer, filename } =
            create_export_archive(self.app.db(), ExportFileType::Json)
                .await
                .unwrap();
        (filename, move |name: &str| {
            serde_json::from_str::<Vec<Value>>(&read_zip_file(&buffer, &format!("{name}.json")))
                .unwrap()
        })
    }

    async fn csv(&self) -> (String, impl Fn(&str) -> String) {
        let ExportArchive { buffer, filename } =
            create_export_archive(self.app.db(), ExportFileType::Csv)
                .await
                .unwrap();
        (filename, move |name: &str| {
            read_zip_file(&buffer, &format!("{name}.csv"))
        })
    }
}

async fn seed() -> Seeded {
    let app = TestApp::new(vec![]);
    let db = app.db();
    let missing_id = generate_id();
    let season10: Season = SEASON
        .create_one(
            db,
            json!({"name": "Season 10", "genderDivision": "mixed", "useOfficialScoring": true, "isHidden": true}),
        )
        .await
        .unwrap();
    let season2: Season = SEASON
        .create_one(
            db,
            json!({"name": "Season 2", "genderDivision": "women", "signUpOpen": true}),
        )
        .await
        .unwrap();

    let team = |season: &str, name: &str, extra: Value| {
        let mut value = json!({"seasonId": season, "name": name, "color": COLOR});
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().cloned().unwrap());
        let db = db.clone();
        async move { TEAM.create_one(&db, value).await.unwrap() }
    };
    let alpha = team(&season10.id, "Alpha", json!({"division": 2})).await;
    let bravo = team(
        &season10.id,
        "Bravo",
        json!({"division": 1, "email": "bravo@example.com", "phone": "0400"}),
    )
    .await;
    let charlie = team(&season2.id, "Charlie", json!({})).await;
    let delta = team(&season2.id, "Delta", json!({})).await;

    SEASON
        .update_one(
            db,
            Season::ID.eq(&season10.id),
            Patch::new().set_field(
                "finalResults",
                json!([
                    {"teamId": missing_id, "position": null},
                    {"teamId": bravo.id, "position": 2},
                    {"teamId": alpha.id, "position": 1},
                ]),
            ),
        )
        .await
        .unwrap();

    let secret = &app.state.config.jwt_secret;
    let email = |value: &str, primary: bool| {
        serde_json::to_value(user_email::create(secret, value, primary, None).unwrap()).unwrap()
    };
    let mut verified = email("z.mal@example.com", true);
    verified["verified"] = json!(true);
    let male: User = USER
        .create_one(
            db,
            json!({
                "firstName": "Mal",
                "lastName": "Male",
                "genderMatching": "male",
                "termsAccepted": true,
                "admin": true,
                "emails": [email("m.mal@example.com", false), email("b.mal@example.com", false), verified],
            }),
        )
        .await
        .unwrap();
    let female: User = USER
        .create_one(
            db,
            json!({
                "firstName": "Fay",
                "lastName": "Female",
                "genderMatching": "female",
                "termsAccepted": false,
                "emails": [email("fay@example.com", true)],
            }),
        )
        .await
        .unwrap();

    let round2: Fixture = FIXTURE
        .create_one(
            db,
            json!({
                "seasonId": season10.id,
                "userId": male.id,
                "title": "Round 2",
                "date": "2024-03-02T00:00:00.000Z",
                "grading": true,
                "games": [
                    {"id": generate_id(), "team1Id": bravo.id, "team2Id": alpha.id, "place": "Field 1", "time": "10:00", "team1Score": 3, "team2Score": 2},
                    {"id": generate_id(), "team1Id": alpha.id, "team2Id": missing_id, "place": "Field 2", "time": "09:00"},
                ],
            }),
        )
        .await
        .unwrap();
    FIXTURE
        .create_one(
            db,
            json!({
                "seasonId": season10.id,
                "userId": missing_id,
                "title": "Round 1",
                "date": "2024-03-01T00:00:00.000Z",
                "games": [{"id": generate_id(), "team1Id": alpha.id, "team2Id": bravo.id, "place": "Field 1", "time": "09:00"}],
            }),
        )
        .await
        .unwrap();
    let women1: Fixture = FIXTURE
        .create_one(
            db,
            json!({
                "seasonId": season2.id,
                "userId": female.id,
                "title": "W1",
                "date": "2024-01-01T00:00:00.000Z",
                "games": [{"id": generate_id(), "team1Id": charlie.id, "team2Id": delta.id, "place": "Court", "time": "18:00"}],
            }),
        )
        .await
        .unwrap();

    REPORT
        .create_one(
            db,
            json!({
                "fixtureId": round2.id,
                "teamId": alpha.id,
                "teamAgainstId": bravo.id,
                "userId": female.id,
                "scoreFor": 2,
                "scoreAgainst": 3,
                "mvpMale": male.id,
                "mvpMale2": female.id,
                "mvpFemale": female.id,
                "mvpFemale2": missing_id,
                "spiritP1": 2,
                "spiritP2": 3,
                "spiritP3": 1,
                "spiritP4": 2,
                "spiritP5": 4,
                "spiritComment": "=SUM(A1)",
            }),
        )
        .await
        .unwrap();
    REPORT
        .create_one(
            db,
            json!({
                "fixtureId": women1.id,
                "teamId": charlie.id,
                "teamAgainstId": delta.id,
                "userId": male.id,
                "scoreFor": 1,
                "scoreAgainst": 0,
                "mvpMale": male.id,
                "mvpFemale": female.id,
                "spirit": 8,
                "spiritComment": "",
            }),
        )
        .await
        .unwrap();
    REPORT
        .create_one(
            db,
            json!({
                "fixtureId": missing_id,
                "teamId": bravo.id,
                "teamAgainstId": alpha.id,
                "scoreFor": 0,
                "scoreAgainst": 0,
                "spiritComment": "No fixture",
            }),
        )
        .await
        .unwrap();

    for member in [
        json!({"seasonId": season10.id, "teamId": alpha.id, "userId": male.id, "captain": true, "pending": false}),
        json!({"seasonId": season10.id, "teamId": alpha.id, "userId": female.id, "pending": true}),
        json!({"seasonId": missing_id, "teamId": bravo.id, "userId": missing_id, "pending": false}),
    ] {
        MEMBER.create_one(db, member).await.unwrap();
    }
    Seeded { app }
}

fn pick(row: &Value, keys: &[&str]) -> Vec<Value> {
    keys.iter().map(|key| row[*key].clone()).collect()
}

#[track_caller]
fn assert_contains(row: &Value, expected: Value) {
    for (key, value) in expected.as_object().unwrap() {
        assert_eq!(&row[key], value, "{key} in {row}");
    }
}

mod create_export_archive_tests {
    use super::*;

    #[tokio::test]
    async fn names_the_archive_after_the_file_type_and_time() {
        let seeded = seed().await;
        let (filename, _) = seeded.json().await;
        let pattern =
            regex::Regex::new(r"^frisbee-export-json-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.zip$")
                .unwrap();
        assert!(pattern.is_match(&filename), "{filename}");
    }

    #[tokio::test]
    async fn lists_fixture_games_by_season_date_and_team_with_fallbacks_for_missing_records() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        let rows = read("fixture-games");
        let keys = [
            "seasonName",
            "fixtureTitle",
            "team1Name",
            "team2Name",
            "grading",
            "fixtureCreatedByName",
            "fixtureCreatedByEmail",
        ];
        assert_eq!(
            rows.iter().map(|row| pick(row, &keys)).collect::<Vec<_>>(),
            [
                json!([
                    "Season 2",
                    "W1",
                    "Charlie",
                    "Delta",
                    "",
                    "Fay Female",
                    "fay@example.com"
                ]),
                json!([
                    "Season 10",
                    "Round 1",
                    "Alpha",
                    "Bravo",
                    "",
                    "Unknown user",
                    null
                ]),
                json!([
                    "Season 10",
                    "Round 2",
                    "Alpha",
                    "Unknown team",
                    "Yes",
                    "Mal Male",
                    "z.mal@example.com"
                ]),
                json!([
                    "Season 10",
                    "Round 2",
                    "Bravo",
                    "Alpha",
                    "Yes",
                    "Mal Male",
                    "z.mal@example.com"
                ]),
            ]
            .map(|row| row.as_array().unwrap().clone())
        );
        assert_contains(
            &rows[3],
            json!({
                "team1Score": 3,
                "team2Score": 2,
                "gameTime": "10:00",
                "gamePlace": "Field 1",
                "fixtureDate": human_readable_date(Some("2024-03-02T00:00:00.000Z")),
            }),
        );
    }

    #[tokio::test]
    async fn orders_final_results_by_numeric_season_name_and_position_missing_positions_last() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        assert_eq!(
            read("season-final-results"),
            [
                json!({"seasonName": "Season 10", "position": 1, "teamName": "Alpha"}),
                json!({"seasonName": "Season 10", "position": 2, "teamName": "Bravo"}),
                json!({"seasonName": "Season 10", "position": null, "teamName": "Unknown team"}),
            ]
        );
    }

    #[tokio::test]
    async fn describes_seasons() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        assert_eq!(
            read("seasons"),
            [
                json!({"name": "Season 2", "signUpOpen": "Yes", "scoringSystem": "Simple", "genderDivision": "women", "isHidden": ""}),
                json!({"name": "Season 10", "signUpOpen": "", "scoringSystem": "Official", "genderDivision": "mixed", "isHidden": "Yes"}),
            ]
        );
    }

    #[tokio::test]
    async fn only_exports_mvps_eligible_for_slots_the_season_uses() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        let reports = read("reports");
        assert_eq!(
            reports
                .iter()
                .map(|row| pick(row, &["seasonName", "teamName", "fixtureTitle"]))
                .collect::<Vec<_>>(),
            [
                json!(["Season 2", "Charlie", "W1"]),
                json!(["Season 10", "Bravo", null]),
                json!(["Season 10", "Alpha", "Round 2"]),
            ]
            .map(|row| row.as_array().unwrap().clone())
        );

        // a women's season has no male MVP slot
        assert_contains(
            &reports[0],
            json!({
                "mvpMaleName": null,
                "mvpFemaleName": "Fay Female",
                "mvpFemaleEmail": "fay@example.com",
                "spiritSimple": 8,
                "submittedByName": "Mal Male",
            }),
        );
        // without a fixture the season comes from the team
        assert_contains(
            &reports[1],
            json!({
                "againstTeamName": "Alpha",
                "fixtureDate": "",
                "submittedByName": null,
                "submittedByEmail": null,
                "spiritComment": "No fixture",
            }),
        );
        // ineligible and unknown MVPs are left blank
        assert_contains(
            &reports[2],
            json!({
                "mvpMaleName": "Mal Male",
                "mvpMaleEmail": "z.mal@example.com",
                "mvpMale2Name": null,
                "mvpFemaleName": "Fay Female",
                "mvpFemale2Name": null,
                "mvpFemale2Email": null,
                "scoreFor": 2,
                "scoreAgainst": 3,
                "spiritP5": 4,
            }),
        );
    }

    #[tokio::test]
    async fn lists_memberships_falling_back_to_the_team_season() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        assert_eq!(
            read("memberships"),
            [
                json!({"seasonName": "Season 10", "teamName": "Alpha", "userName": "Fay Female", "userEmail": "fay@example.com", "captain": "", "pending": "Pending"}),
                json!({"seasonName": "Season 10", "teamName": "Alpha", "userName": "Mal Male", "userEmail": "z.mal@example.com", "captain": "Yes", "pending": ""}),
                json!({"seasonName": "Season 10", "teamName": "Bravo", "userName": null, "userEmail": null, "captain": "", "pending": ""}),
            ]
        );
    }

    #[tokio::test]
    async fn orders_teams_by_season_division_and_name() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        assert_eq!(
            read("teams")
                .iter()
                .map(|row| pick(row, &["seasonName", "division", "name"]))
                .collect::<Vec<_>>(),
            [
                json!(["Season 2", null, "Charlie"]),
                json!(["Season 2", null, "Delta"]),
                json!(["Season 10", 1, "Bravo"]),
                json!(["Season 10", 2, "Alpha"]),
            ]
            .map(|row| row.as_array().unwrap().clone())
        );
    }

    #[tokio::test]
    async fn lists_every_user_email_with_the_primary_email_first_per_user() {
        let seeded = seed().await;
        let (_, read) = seeded.json().await;
        assert_eq!(
            read("user-emails")
                .iter()
                .map(|row| pick(
                    row,
                    &[
                        "userName",
                        "email",
                        "primary",
                        "verified",
                        "userPrimaryEmail"
                    ]
                ))
                .collect::<Vec<_>>(),
            [
                json!([
                    "Fay Female",
                    "fay@example.com",
                    "Yes",
                    "",
                    "fay@example.com"
                ]),
                json!([
                    "Mal Male",
                    "z.mal@example.com",
                    "Yes",
                    "Yes",
                    "z.mal@example.com"
                ]),
                json!(["Mal Male", "b.mal@example.com", "", "", "z.mal@example.com"]),
                json!(["Mal Male", "m.mal@example.com", "", "", "z.mal@example.com"]),
            ]
            .map(|row| row.as_array().unwrap().clone())
        );
        let users = read("users");
        assert_eq!(users.len(), 2);
        assert_contains(
            &users[0],
            json!({
                "firstName": "Fay",
                "primaryEmail": "fay@example.com",
                "primaryEmailVerified": "",
                "genderMatching": "female",
                "admin": "",
                "termsAccepted": "",
            }),
        );
        assert_contains(
            &users[1],
            json!({
                "firstName": "Mal",
                "primaryEmail": "z.mal@example.com",
                "primaryEmailVerified": "Yes",
                "genderMatching": "male",
                "admin": "Yes",
                "termsAccepted": "Yes",
            }),
        );
    }

    #[tokio::test]
    async fn writes_csv_with_escaped_formulas_blank_missing_values_and_numbers_as_text() {
        let seeded = seed().await;
        let (filename, read) = seeded.csv().await;
        assert!(filename.starts_with("frisbee-export-csv-") && filename.ends_with(".zip"));
        let reports_text = read("reports");
        let reports: Vec<&str> = reports_text.trim_end().split('\n').collect();
        assert_eq!(
            reports[0].split(',').take(7).collect::<Vec<_>>(),
            [
                "\"SEASON_NAME\"",
                "\"FIXTURE_DATE\"",
                "\"FIXTURE_TITLE\"",
                "\"TEAM_NAME\"",
                "\"AGAINST_TEAM_NAME\"",
                "\"SCORE_FOR\"",
                "\"SCORE_AGAINST\"",
            ]
        );
        assert!(
            reports[2].starts_with("\"Season 10\",\"\",\"\",\"Bravo\",\"Alpha\",\"0\",\"0\","),
            "{}",
            reports[2]
        );
        assert!(
            reports[3].contains("\"2\",\"3\",\"\",\"2\",\"3\",\"1\",\"2\",\"4\",\"'=SUM(A1)\""),
            "{}",
            reports[3]
        );
        assert_eq!(
            read("season-final-results"),
            [
                "\"SEASON_NAME\",\"POSITION\",\"TEAM_NAME\"",
                "\"Season 10\",\"1\",\"Alpha\"",
                "\"Season 10\",\"2\",\"Bravo\"",
                "\"Season 10\",\"\",\"Unknown team\"",
                "",
            ]
            .join("\n")
        );
    }

    #[test]
    fn converts_headings_to_upper_snake_case() {
        assert_eq!(csv_heading("team1Score"), "TEAM1_SCORE");
        assert_eq!(csv_heading("mvpMale2Email"), "MVP_MALE2_EMAIL");
        assert_eq!(csv_heading("userPrimaryEmail"), "USER_PRIMARY_EMAIL");
        assert_eq!(csv_heading("HTMLParser"), "HTML_PARSER");
        assert_eq!(csv_heading("a  b"), "A_B");
    }
}
