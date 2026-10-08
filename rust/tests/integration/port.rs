//! Port of `server/test/integration/port.test.ts`.

use crate::common::actors::{
    Actor, NewMember, SignUp, add_member, create_season, create_team, sign_up, unique_email,
};
use crate::common::{CLIENT_ORIGIN, CallOptions, TestServer, assert_match};
use frisbee::db::{Filter, Patch, Query};
use frisbee::shared::schemas::{GamedayImportConfig, Member, Report, Team, User, UserEmail};
use frisbee::tables::{GAMEDAY_IMPORT_CONFIG, MEMBER, REPORT, TEAM, USER};
use frisbee::utils::random::{generate_id, random_string};
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashSet};
use std::io::Read;

fn tag() -> String {
    random_string(8).to_lowercase()
}

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

async fn admin(server: &TestServer) -> Actor {
    sign_up(
        server,
        SignUp {
            admin: true,
            ..Default::default()
        },
    )
    .await
}

const EXPORT_FILES: [&str; 8] = [
    "fixture-games",
    "season-final-results",
    "seasons",
    "reports",
    "memberships",
    "teams",
    "user-emails",
    "users",
];

struct Download {
    status: u16,
    headers: reqwest::header::HeaderMap,
    buffer: Vec<u8>,
}

impl Download {
    fn header(&self, name: &str) -> String {
        self.headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    }
}

async fn export_zip(server: &TestServer, file_type: &str, token: &str) -> Download {
    let response = server
        .request(reqwest::Method::POST, "/PortExport")
        .header("content-type", "application/json")
        .header("origin", CLIENT_ORIGIN)
        .header("authorization", token)
        .body(json!({"payload": {"fileType": file_type}}).to_string())
        .send()
        .await
        .unwrap();
    Download {
        status: response.status().as_u16(),
        headers: response.headers().clone(),
        buffer: response.bytes().await.unwrap().to_vec(),
    }
}

fn read_entries(buffer: &[u8]) -> BTreeMap<String, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(buffer)).unwrap();
    let mut entries = BTreeMap::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).unwrap();
        let mut text = String::new();
        file.read_to_string(&mut text).unwrap();
        entries.insert(file.name().to_string(), text);
    }
    entries
}

#[derive(Default)]
struct ImportOptions<'a> {
    season_id: Option<&'a str>,
    content_type: Option<&'a str>,
    token: Option<&'a str>,
    filename: Option<&'a str>,
}

struct ImportResult {
    status: u16,
    body: Value,
}

/// Uploads `csv` as multipart form data, like the browser's `FormData`.
async fn import_csv(
    server: &TestServer,
    admin: &Actor,
    csv: &str,
    options: ImportOptions<'_>,
) -> ImportResult {
    let boundary = format!("----frisbee{}", random_string(16));
    let mut body = String::new();
    if let Some(season_id) = options.season_id {
        body.push_str(&format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"seasonId\"\r\n\r\n{season_id}\r\n"
        ));
    }
    body.push_str(&format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{}\"\r\nContent-Type: {}\r\n\r\n{csv}\r\n--{boundary}--\r\n",
        options.filename.unwrap_or("members.csv"),
        options.content_type.unwrap_or("text/csv"),
    ));
    let response = server
        .request(reqwest::Method::POST, "/PortImport")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header("origin", CLIENT_ORIGIN)
        .header("authorization", options.token.unwrap_or(&admin.token))
        .body(body)
        .send()
        .await
        .unwrap();
    let status = response.status().as_u16();
    let text = response.text().await.unwrap();
    ImportResult {
        status,
        body: if text.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).unwrap()
        },
    }
}

const IMPORT_HEADINGS: &str =
    "team_name,team_division,type,email_address,first_name,last_name,gender_matching";

fn by_email(email: &str) -> Filter {
    User::EMAILS.any(UserEmail::VALUE.eq(email))
}

mod port_export {
    use super::*;

    struct Setup {
        server: TestServer,
        admin: Actor,
        t: String,
        team_name: String,
    }

    async fn setup() -> Setup {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let t = tag();
        let season = create_season(&server, &admin, json!({"name": format!("Export {t}")})).await;
        let team_name = format!("=HYPERLINK(\"x\") {t}");
        let team = create_team(
            &server,
            &admin,
            &id(&season),
            &team_name,
            json!({"division": 2}),
        )
        .await;
        add_member(
            &server,
            &admin,
            &id(&team),
            NewMember {
                first_name: Some(format!("+Plus{t}")),
                last_name: Some("Person".into()),
                email: Some(format!("export.{t}@example.com")),
                ..Default::default()
            },
        )
        .await;
        Setup {
            server,
            admin,
            t,
            team_name,
        }
    }

    fn sorted_names(file_type: &str) -> Vec<String> {
        let mut names: Vec<String> = EXPORT_FILES
            .iter()
            .map(|name| format!("{name}.{file_type}"))
            .collect();
        names.sort();
        names
    }

    #[tokio::test]
    async fn requires_admin() {
        let Setup { server, .. } = setup().await;
        let player = sign_up(&server, SignUp::default()).await;
        let download = export_zip(&server, "csv", &player.token).await;
        assert_eq!(download.status, 403);
        let body: Value = serde_json::from_slice(&download.buffer).unwrap();
        assert_eq!(body["errorCode"], "auth.admin_required");
    }

    #[tokio::test]
    async fn returns_a_zip_of_csv_files_with_upper_snake_headings_and_escaped_formulas() {
        let Setup {
            server, admin, t, ..
        } = setup().await;
        let download = export_zip(&server, "csv", &admin.token).await;
        assert_eq!(download.status, 200);
        assert_eq!(download.header("content-type"), "application/zip");
        assert_eq!(download.header("cache-control"), "no-store, max-age=0");
        let disposition =
            regex::Regex::new(r#"^attachment; filename="frisbee-export-csv-[\dT-]+Z\.zip""#)
                .unwrap();
        assert!(
            disposition.is_match(&download.header("content-disposition")),
            "{}",
            download.header("content-disposition")
        );

        let entries = read_entries(&download.buffer);
        assert_eq!(
            entries.keys().cloned().collect::<Vec<_>>(),
            sorted_names("csv")
        );

        let teams = &entries["teams.csv"];
        let lines: Vec<&str> = teams.trim_end().split('\n').collect();
        assert_eq!(
            lines[0],
            "\"SEASON_NAME\",\"NAME\",\"DIVISION\",\"COLOR\",\"EMAIL\",\"PHONE\""
        );
        // leading "=" is prefixed with a quote and inner quotes are doubled
        let expected_team = format!(
            "\"Export {t}\",\"'=HYPERLINK(\"\"x\"\") {t}\",\"2\",\"hsla(0, 100%, 50%, 1)\",\"\",\"\""
        );
        assert!(lines.contains(&expected_team.as_str()), "{teams}");
        assert!(teams.ends_with('\n'));

        let users = &entries["users.csv"];
        assert_eq!(
            users.split('\n').next().unwrap(),
            "\"FIRST_NAME\",\"LAST_NAME\",\"PRIMARY_EMAIL\",\"PRIMARY_EMAIL_VERIFIED\",\"GENDER_MATCHING\",\"ADMIN\",\"TERMS_ACCEPTED\",\"CREATED_ON\""
        );
        assert!(users.contains(&format!(
            "\"'+Plus{t}\",\"Person\",\"export.{t}@example.com\",\"\",\"male\",\"\",\"\","
        )));
        assert!(entries["memberships.csv"].contains(&format!(
            "\"Export {t}\",\"'=HYPERLINK(\"\"x\"\") {t}\",\"'+Plus{t} Person\",\"export.{t}@example.com\",\"\",\"\""
        )));
        assert_eq!(
            entries["fixture-games.csv"].split('\n').next().unwrap(),
            "\"SEASON_NAME\",\"FIXTURE_DATE\",\"FIXTURE_TITLE\",\"GAME_TIME\",\"GAME_PLACE\",\"TEAM1_NAME\",\"TEAM1_SCORE\",\"TEAM2_NAME\",\"TEAM2_SCORE\",\"GRADING\",\"FIXTURE_CREATED_BY_NAME\",\"FIXTURE_CREATED_BY_EMAIL\""
        );
        // datasets with no records still have a heading row
        assert_eq!(
            entries["season-final-results.csv"],
            "\"SEASON_NAME\",\"POSITION\",\"TEAM_NAME\"\n"
        );
    }

    #[tokio::test]
    async fn returns_a_zip_of_json_files_with_nulls_for_missing_values_and_no_escaping() {
        let Setup {
            server,
            admin,
            t,
            team_name,
        } = setup().await;
        let download = export_zip(&server, "json", &admin.token).await;
        assert_eq!(download.status, 200);
        let disposition = regex::Regex::new(r#"filename="frisbee-export-json-.+\.zip""#).unwrap();
        assert!(disposition.is_match(&download.header("content-disposition")));
        let entries = read_entries(&download.buffer);
        assert_eq!(
            entries.keys().cloned().collect::<Vec<_>>(),
            sorted_names("json")
        );

        let teams: Vec<Map<String, Value>> = serde_json::from_str(&entries["teams.json"]).unwrap();
        let team = teams
            .iter()
            .find(|team| team["name"] == json!(team_name))
            .unwrap();
        assert_eq!(
            Value::Object(team.clone()),
            json!({
                "seasonName": format!("Export {t}"),
                "name": team_name,
                "division": 2,
                "color": "hsla(0, 100%, 50%, 1)",
                "email": null,
                "phone": null,
            })
        );
        assert_eq!(
            team.keys().map(String::as_str).collect::<Vec<_>>(),
            ["seasonName", "name", "division", "color", "email", "phone"]
        );
        assert_eq!(
            serde_json::from_str::<Value>(&entries["season-final-results.json"]).unwrap(),
            json!([])
        );
        let seasons: Vec<Value> = serde_json::from_str(&entries["seasons.json"]).unwrap();
        let season = seasons
            .iter()
            .find(|s| s["name"] == json!(format!("Export {t}")))
            .unwrap();
        assert_match(season, &json!({"signUpOpen": "Yes", "isHidden": ""}));
    }
}

mod port_import {
    use super::*;

    #[tokio::test]
    async fn requires_admin() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let player = sign_up(&server, SignUp::default()).await;
        let season_id = generate_id();
        let result = import_csv(
            &server,
            &admin,
            &format!("{IMPORT_HEADINGS}\n"),
            ImportOptions {
                season_id: Some(&season_id),
                token: Some(&player.token),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(result.status, 403);
        assert_eq!(result.body["errorCode"], "auth.admin_required");
    }

    #[tokio::test]
    async fn requires_a_season_id_an_existing_season_and_a_csv_file() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(
            &server,
            &admin,
            json!({"name": format!("Import {}", tag())}),
        )
        .await;
        let csv = format!("{IMPORT_HEADINGS}\n");
        let missing = import_csv(&server, &admin, &csv, ImportOptions::default()).await;
        assert_eq!(missing.status, 400);
        assert_eq!(missing.body["errorCode"], "season.id_missing");

        let unknown_id = generate_id();
        let unknown = import_csv(
            &server,
            &admin,
            &csv,
            ImportOptions {
                season_id: Some(&unknown_id),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(unknown.status, 404);
        assert_eq!(unknown.body["errorCode"], "db.record_not_found");

        let season_id = id(&season);
        let json_file = import_csv(
            &server,
            &admin,
            &csv,
            ImportOptions {
                season_id: Some(&season_id),
                content_type: Some("application/json"),
                filename: Some("members.json"),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(json_file.status, 400);
        assert_eq!(json_file.body["errorCode"], "upload.invalid_file_type");
    }

    #[tokio::test]
    async fn rejects_a_request_that_is_not_a_multipart_upload_as_a_bad_request() {
        let capture = frisbee::log::capture();
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(
            &server,
            &admin,
            json!({"name": format!("Import {}", tag())}),
        )
        .await;
        let result = server
            .call(
                "/PortImport",
                Some(json!({"seasonId": id(&season)})),
                CallOptions::token(&admin.token),
            )
            .await;
        assert_eq!(result.status, 400);
        assert_match(
            &result.body,
            &json!({"statusCode": 400, "errorCode": "upload.unsupported_content_type"}),
        );
        let server_errors: Vec<String> = capture
            .lines(frisbee::log::Level::Error)
            .into_iter()
            .filter(|line| line.contains("| 500 |") && line.contains("/PortImport"))
            .collect();
        assert!(server_errors.is_empty(), "{server_errors:?}");
    }

    #[tokio::test]
    async fn rejects_missing_and_unexpected_headings() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(
            &server,
            &admin,
            json!({"name": format!("Import {}", tag())}),
        )
        .await;
        let season_id = id(&season);
        let options = || ImportOptions {
            season_id: Some(&season_id),
            ..Default::default()
        };
        let missing = import_csv(
            &server,
            &admin,
            "team_name,email_address,first_name\nA,a@example.com,A\n",
            options(),
        )
        .await;
        assert_eq!(missing.status, 400);
        assert_eq!(missing.body["errorCode"], "bad_request");
        assert_eq!(
            missing.body["message"],
            "Missing required headings: last_name"
        );

        let unexpected = import_csv(
            &server,
            &admin,
            "team_name,email_address,first_name,last_name,phone,gender\nA,a@example.com,A,B,123,male\n",
            options(),
        )
        .await;
        assert_eq!(unexpected.status, 400);
        assert_eq!(
            unexpected.body["message"],
            "Unexpected headings found: phone"
        );

        // a heading row without data rows reports every required heading as missing
        let empty = import_csv(&server, &admin, &format!("{IMPORT_HEADINGS}\n"), options()).await;
        assert_eq!(empty.status, 400);
        assert_eq!(
            empty.body["message"],
            "Missing required headings: team_name, email_address, first_name, last_name"
        );
        assert_eq!(
            TEAM.count(server.db(), Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn creates_teams_users_and_members_and_is_idempotent() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let t = tag();
        let season = create_season(&server, &admin, json!({"name": format!("Import {t}")})).await;
        let season_id = id(&season);
        let existing = sign_up(
            &server,
            SignUp {
                first_name: Some("Already".into()),
                last_name: Some("Here".into()),
                ..Default::default()
            },
        )
        .await;
        let captain_email = format!("cap.{t}@example.com");
        let player_email = format!("player.{t}@example.com");
        let csv = [
            IMPORT_HEADINGS.to_string(),
            format!("Alpha {t},2,team,{captain_email},Cap,Tain,Female"),
            format!("Alpha {t},2,player,{player_email},Play,Er,m"),
            format!(
                "alpha {t},,player,{},Dupe,Row,male",
                player_email.to_uppercase()
            ),
            format!(
                "Beta {t},,player,{},Renamed,Person,female",
                existing.email.to_uppercase()
            ),
            format!("Beta {t},,player,,No,Email,Male Matching"),
        ]
        .join("\n");
        let options = || ImportOptions {
            season_id: Some(&season_id),
            ..Default::default()
        };

        let first = import_csv(&server, &admin, &csv, options()).await;
        assert_eq!(first.status, 204, "{}", first.body);

        let teams = TEAM
            .get_many(
                server.db(),
                Team::SEASON_ID.eq(&season_id),
                Query::new().sort([Team::NAME.asc()]),
            )
            .await
            .unwrap();
        assert_eq!(
            teams
                .iter()
                .map(|team| (team.name.clone(), team.division, team.color.clone()))
                .collect::<Vec<_>>(),
            [
                (
                    format!("Alpha {t}"),
                    Some(2.0),
                    "hsla(0, 0%, 100%, 1)".to_string()
                ),
                (
                    format!("Beta {t}"),
                    Some(1.0),
                    "hsla(0, 0%, 100%, 1)".to_string()
                ),
            ]
        );
        let (alpha, beta) = (&teams[0], &teams[1]);

        let db = server.db();
        let captain = USER.get_one(db, by_email(&captain_email)).await.unwrap();
        assert_eq!(captain.first_name, "Cap");
        assert_eq!(captain.last_name, "Tain");
        assert_eq!(captain.gender_matching.as_str(), "female");
        assert!(!captain.terms_accepted);
        assert_eq!(captain.emails.len(), 1);
        assert_eq!(captain.emails[0].value, captain_email);
        assert!(captain.emails[0].primary);
        assert!(!captain.emails[0].verified);
        assert_eq!(USER.count(db, by_email(&player_email)).await.unwrap(), 1);
        let player = USER.get_one(db, by_email(&player_email)).await.unwrap();
        assert_eq!(player.first_name, "Play");

        // existing users are matched by email and never updated
        let existing_user = USER
            .get_one(db, User::ID.eq(&existing.user_id))
            .await
            .unwrap();
        assert_eq!(existing_user.first_name, "Already");

        let no_email = USER
            .get_one(
                db,
                User::FIRST_NAME
                    .eq("No")
                    .and_also(User::LAST_NAME.eq("Email")),
            )
            .await
            .unwrap();
        assert!(no_email.emails.is_empty());
        assert_eq!(no_email.gender_matching.as_str(), "male");

        let members = MEMBER
            .get_many(db, Member::SEASON_ID.eq(&season_id), Query::new())
            .await
            .unwrap();
        let member_of = |user_id: &str| -> Vec<&Member> {
            members.iter().filter(|m| m.user_id == user_id).collect()
        };
        let captain_members = member_of(&captain.id);
        assert_eq!(captain_members.len(), 1);
        assert_eq!(captain_members[0].team_id, alpha.id);
        assert_eq!(captain_members[0].captain, Some(true));
        assert!(!captain_members[0].pending);
        let player_members = member_of(&player.id);
        assert_eq!(player_members.len(), 1);
        assert_eq!(player_members[0].team_id, alpha.id);
        assert_eq!(player_members[0].captain, Some(false));
        assert!(!player_members[0].pending);
        let existing_members = member_of(&existing.user_id);
        assert_eq!(existing_members.len(), 1);
        assert_eq!(existing_members[0].team_id, beta.id);
        assert_eq!(existing_members[0].captain, Some(false));
        let no_email_members = member_of(&no_email.id);
        assert_eq!(no_email_members.len(), 1);
        assert_eq!(no_email_members[0].team_id, beta.id);
        assert_eq!(no_email_members[0].captain, Some(false));
        assert_eq!(members.len(), 4);

        let user_count = USER.count(db, Filter::all()).await.unwrap();
        let second = import_csv(&server, &admin, &csv, options()).await;
        assert_eq!(second.status, 204);
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            2
        );
        assert_eq!(USER.count(db, Filter::all()).await.unwrap(), user_count);
        assert_eq!(
            MEMBER
                .count(db, Member::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            4
        );
    }

    #[tokio::test]
    async fn does_not_add_a_second_membership_for_a_user_already_in_the_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let t = tag();
        let season = create_season(&server, &admin, json!({"name": format!("Import {t}")})).await;
        let season_id = id(&season);
        let team = create_team(
            &server,
            &admin,
            &season_id,
            &format!("Gamma {t}"),
            json!({}),
        )
        .await;
        let email = unique_email("moved");
        add_member(
            &server,
            &admin,
            &id(&team),
            NewMember {
                email: Some(email.clone()),
                ..Default::default()
            },
        )
        .await;
        let result = import_csv(
            &server,
            &admin,
            &format!("{IMPORT_HEADINGS}\nDelta {t},,team,{email},M,N,male\n"),
            ImportOptions {
                season_id: Some(&season_id),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(result.status, 204);
        let db = server.db();
        let user = USER.get_one(db, by_email(&email)).await.unwrap();
        let members = MEMBER
            .get_many(
                db,
                Member::USER_ID
                    .eq(&user.id)
                    .and_also(Member::SEASON_ID.eq(&season_id)),
                Query::new(),
            )
            .await
            .unwrap();
        assert_eq!(
            members
                .iter()
                .map(|m| m.team_id.clone())
                .collect::<Vec<_>>(),
            [id(&team)]
        );
        // the new team is still created
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            2
        );
    }

    async fn rejects_an_invalid_gender_matching_with_the_row_number(value: &str) {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let t = tag();
        let season = create_season(&server, &admin, json!({"name": format!("Import {t}")})).await;
        let season_id = id(&season);
        let result = import_csv(
            &server,
            &admin,
            &format!(
                "{IMPORT_HEADINGS}\nEpsilon {t},,player,ok.{t}@example.com,A,B,male\nEpsilon {t},,player,bad.{t}@example.com,C,D,{value}\n"
            ),
            ImportOptions {
                season_id: Some(&season_id),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(result.status, 400);
        assert_eq!(result.body["errorCode"], "upload.invalid_gender_matching");
        assert_eq!(
            result.body["message"],
            format!("Failed: row 3 has invalid gender matching \"{value}\". Use male or female.")
        );
        let db = server.db();
        assert_eq!(
            USER.count(db, by_email(&format!("ok.{t}@example.com")))
                .await
                .unwrap(),
            0
        );
        // rows are validated before any team is created
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn rejects_an_invalid_gender_matching_banana_with_the_row_number() {
        rejects_an_invalid_gender_matching_with_the_row_number("banana").await;
    }

    #[tokio::test]
    async fn rejects_an_invalid_gender_matching_non_binary_with_the_row_number() {
        rejects_an_invalid_gender_matching_with_the_row_number("non-binary").await;
    }

    #[tokio::test]
    async fn rejects_an_invalid_gender_matching_other_with_the_row_number() {
        rejects_an_invalid_gender_matching_with_the_row_number("other").await;
    }

    #[tokio::test]
    async fn accepts_the_older_gender_heading_for_gender_matching() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let t = tag();
        let season = create_season(&server, &admin, json!({"name": format!("Import {t}")})).await;
        let season_id = id(&season);
        let email = format!("legacy.{t}@example.com");
        let result = import_csv(
            &server,
            &admin,
            &format!(
                "team_name,email_address,first_name,last_name,gender\nZeta {t},{email},L,G,female\n"
            ),
            ImportOptions {
                season_id: Some(&season_id),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(result.status, 204);
        assert_eq!(
            USER.get_one(server.db(), by_email(&email))
                .await
                .unwrap()
                .gender_matching
                .as_str(),
            "female"
        );
    }
}

mod mock_data {
    use super::*;

    #[tokio::test]
    async fn generates_mock_teams_users_and_members_and_deletes_them_again() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season =
            create_season(&server, &admin, json!({"name": format!("Mock {}", tag())})).await;
        let season_id = id(&season);
        let real_team = create_team(&server, &admin, &season_id, "Real Team", json!({})).await;
        let real_team_id = id(&real_team);
        add_member(&server, &admin, &real_team_id, NewMember::default()).await;

        let generated = server
            .post_as(
                "/PortMockGenerate",
                json!({"seasonId": season_id, "teams": 3, "usersPerTeam": 4}),
                &admin.token,
            )
            .await;
        assert_eq!(generated.status, 204, "{}", generated.body);

        let db = server.db();
        let mock_teams = TEAM
            .get_many(
                db,
                Team::SEASON_ID
                    .eq(&season_id)
                    .and_also(Team::IS_MOCK.eq(true)),
                Query::new(),
            )
            .await
            .unwrap();
        assert_eq!(mock_teams.len(), 3);
        assert_eq!(
            mock_teams
                .iter()
                .map(|t| &t.name)
                .collect::<HashSet<_>>()
                .len(),
            3
        );
        let color = regex::Regex::new(r"^hsla\(\d+, 100%, 65%, 1\)$").unwrap();
        for team in &mock_teams {
            assert_eq!(team.division, Some(1.0));
            assert!(color.is_match(&team.color), "{}", team.color);
            let members = MEMBER
                .get_many(db, Member::TEAM_ID.eq(&team.id), Query::new())
                .await
                .unwrap();
            assert_eq!(members.len(), 4);
            assert_eq!(
                members.iter().filter(|m| m.captain == Some(true)).count(),
                1
            );
            assert!(
                members
                    .iter()
                    .all(|m| m.is_mock == Some(true) && !m.pending)
            );
        }
        let mock_users = USER
            .get_many(db, User::IS_MOCK.eq(true), Query::new())
            .await
            .unwrap();
        assert_eq!(mock_users.len(), 12);
        assert!(
            mock_users
                .iter()
                .all(|u| u.emails[0].verified && u.emails[0].primary)
        );

        let report = |team_against_id: &str| {
            json!({
                "teamId": real_team_id,
                "teamAgainstId": team_against_id,
                "fixtureId": generate_id(),
                "scoreFor": 1,
                "scoreAgainst": 0,
                "spiritComment": "",
            })
        };
        let mock_report: Report = REPORT
            .create_one(db, report(&mock_teams[0].id))
            .await
            .unwrap();
        let real_report: Report = REPORT.create_one(db, report(&real_team_id)).await.unwrap();

        let deleted = server
            .call(
                "/PortDeleteAllMockData",
                None,
                CallOptions::token(&admin.token),
            )
            .await;
        assert_eq!(deleted.status, 204);
        assert_eq!(TEAM.count(db, Team::IS_MOCK.eq(true)).await.unwrap(), 0);
        assert_eq!(USER.count(db, User::IS_MOCK.eq(true)).await.unwrap(), 0);
        assert_eq!(MEMBER.count(db, Member::IS_MOCK.eq(true)).await.unwrap(), 0);
        assert!(
            REPORT
                .maybe_one(db, Report::ID.eq(&mock_report.id))
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            REPORT
                .maybe_one(db, Report::ID.eq(&real_report.id))
                .await
                .unwrap()
                .is_some()
        );
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            MEMBER
                .count(db, Member::TEAM_ID.eq(&real_team_id))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn validates_the_generate_payload_and_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let too_many = server
            .post_as(
                "/PortMockGenerate",
                json!({"seasonId": generate_id(), "teams": 0, "usersPerTeam": 1}),
                &admin.token,
            )
            .await;
        assert_eq!(too_many.status, 422);
        let unknown = server
            .post_as(
                "/PortMockGenerate",
                json!({"seasonId": generate_id(), "teams": 1, "usersPerTeam": 1}),
                &admin.token,
            )
            .await;
        assert_eq!(unknown.status, 404);
        assert_eq!(unknown.body["errorCode"], "db.record_not_found");
    }

    #[tokio::test]
    async fn requires_admin() {
        let server = TestServer::start().await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .call(
                "/PortDeleteAllMockData",
                None,
                CallOptions::token(&player.token),
            )
            .await;
        assert_eq!(response.status, 403);
    }
}

mod gameday_import_config {
    use super::*;

    fn base(season_id: &str, extra: Value) -> Value {
        let mut value = json!({
            "seasonId": season_id,
            "username": "gd-user",
            "association": "Assoc",
            "competition": "Comp",
            "scheduleEnabled": false,
        });
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().cloned().unwrap());
        value
    }

    #[tokio::test]
    async fn requires_a_password_when_creating() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(
            &server,
            &admin,
            json!({"name": format!("Gameday {}", tag())}),
        )
        .await;
        let season_id = id(&season);
        for password in [json!({}), json!({"password": "   "})] {
            let response = server
                .post_as(
                    "/PortGamedayImportSave",
                    base(&season_id, password),
                    &admin.token,
                )
                .await;
            assert_eq!(response.status, 400);
            assert_eq!(response.body["errorCode"], "gameday.password_missing");
        }
        assert!(
            GAMEDAY_IMPORT_CONFIG
                .maybe_one(server.db(), GamedayImportConfig::SEASON_ID.eq(&season_id))
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn validates_schedule_dates() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(
            &server,
            &admin,
            json!({"name": format!("Gameday {}", tag())}),
        )
        .await;
        let season_id = id(&season);
        let missing = server
            .post_as(
                "/PortGamedayImportSave",
                base(
                    &season_id,
                    json!({
                        "password": "secret",
                        "scheduleEnabled": true,
                        "scheduleStartOn": "2026-01-01T00:00:00.000Z",
                    }),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 400);
        assert_eq!(missing.body["errorCode"], "gameday.schedule_dates_missing");

        let reversed = server
            .post_as(
                "/PortGamedayImportSave",
                base(
                    &season_id,
                    json!({
                        "password": "secret",
                        "scheduleEnabled": true,
                        "scheduleStartOn": "2026-02-01T00:00:00.000Z",
                        "scheduleEndOn": "2026-01-01T00:00:00.000Z",
                    }),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(reversed.status, 400);
        assert_eq!(
            reversed.body["errorCode"],
            "gameday.schedule_date_range_invalid"
        );
    }

    #[tokio::test]
    async fn saves_and_loads_a_safe_config_without_exposing_the_password() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(
            &server,
            &admin,
            json!({"name": format!("Gameday {}", tag())}),
        )
        .await;
        let season_id = id(&season);

        let empty = server
            .post_as(
                "/PortGamedayImportLoad",
                json!({"seasonId": season_id}),
                &admin.token,
            )
            .await;
        assert_eq!(empty.status, 200);
        assert_eq!(empty.body, json!({"runs": []}));

        let created = server
            .post_as(
                "/PortGamedayImportSave",
                base(
                    &season_id,
                    json!({
                        "password": "secret",
                        "scheduleEnabled": true,
                        "scheduleStartOn": "2026-01-01T00:00:00.000Z",
                        "scheduleEndOn": "2026-12-31T00:00:00.000Z",
                    }),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(created.status, 200, "{}", created.body);
        assert_match(
            &created.body,
            &json!({
                "seasonId": season_id,
                "username": "gd-user",
                "association": "Assoc",
                "competition": "Comp",
                "scheduleEnabled": true,
                "scheduleStartOn": "2026-01-01T00:00:00.000Z",
                "scheduleEndOn": "2026-12-31T00:00:00.000Z",
                "hasPassword": true,
            }),
        );
        assert!(created.body.get("passwordEncrypted").is_none());
        assert!(created.body.get("scheduleLockToken").is_none());

        let db = server.db();
        let stored = GAMEDAY_IMPORT_CONFIG
            .get_one(db, GamedayImportConfig::SEASON_ID.eq(&season_id))
            .await
            .unwrap();
        assert!(stored.password_encrypted.starts_with("v1:"));
        assert!(!stored.password_encrypted.contains("secret"));

        // updating without a password keeps the stored one and clears the schedule
        GAMEDAY_IMPORT_CONFIG
            .update_one(
                db,
                GamedayImportConfig::ID.eq(&stored.id),
                Patch::new().set(GamedayImportConfig::LAST_SCHEDULED_RUN_KEY, "k1"),
            )
            .await
            .unwrap();
        let updated = server
            .post_as(
                "/PortGamedayImportSave",
                base(
                    &season_id,
                    json!({"username": "other-user", "password": ""}),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(updated.status, 200);
        assert_eq!(updated.body["id"], json!(stored.id));
        assert_eq!(updated.body["username"], "other-user");
        assert_eq!(updated.body["hasPassword"], true);
        assert_eq!(updated.body["scheduleEnabled"], false);
        assert!(updated.body.get("scheduleStartOn").is_none());
        assert!(updated.body.get("lastScheduledRunKey").is_none());
        let after = GAMEDAY_IMPORT_CONFIG
            .get_one(db, GamedayImportConfig::ID.eq(&stored.id))
            .await
            .unwrap();
        assert_eq!(after.password_encrypted, stored.password_encrypted);

        let loaded = server
            .post_as(
                "/PortGamedayImportLoad",
                json!({"seasonId": season_id}),
                &admin.token,
            )
            .await;
        assert_eq!(loaded.status, 200);
        assert_eq!(loaded.body["runs"], json!([]));
        assert_match(
            &loaded.body["config"],
            &json!({"id": stored.id, "username": "other-user", "hasPassword": true}),
        );
        assert!(loaded.body["config"].get("passwordEncrypted").is_none());
    }

    #[tokio::test]
    async fn returns_not_found_for_unknown_seasons_and_requires_admin() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let unknown = server
            .post_as(
                "/PortGamedayImportLoad",
                json!({"seasonId": generate_id()}),
                &admin.token,
            )
            .await;
        assert_eq!(unknown.status, 404);
        let save_unknown = server
            .post_as(
                "/PortGamedayImportSave",
                base(&generate_id(), json!({"password": "secret"})),
                &admin.token,
            )
            .await;
        assert_eq!(save_unknown.status, 404);

        let player = sign_up(&server, SignUp::default()).await;
        let forbidden = server
            .post_as(
                "/PortGamedayImportLoad",
                json!({"seasonId": generate_id()}),
                &player.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);
    }
}
