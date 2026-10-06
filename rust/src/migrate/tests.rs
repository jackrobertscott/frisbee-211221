use super::*;
use crate::db::{Filter, Query};
use crate::shared::schemas::{
    AuthAttemptLimit, Fixture, GamedayImportConfig, GamedayImportRun, GenderMatching, Member,
    Report, Season, Session, Team, User,
};
use crate::tables::{self, *};
use bson::{Bson, DateTime, Document, doc, oid::ObjectId};
use serde_json::json;

const CREATED: &str = "2024-03-01T10:00:00.000Z";

/// Documents shaped like the TS server writes them (dates as ISO strings),
/// with a few legacy quirks mixed in.
fn sample() -> Vec<(&'static str, Vec<Document>)> {
    let base = |id: &str| doc! {"_id": ObjectId::new(), "id": id, "createdOn": CREATED, "updatedOn": CREATED};
    let with = |id: &str, extra: Document| {
        let mut d = base(id);
        d.extend(extra);
        d
    };
    vec![
        (
            "user",
            vec![
                with(
                    "user1",
                    doc! {
                        "firstName": "Ada", "lastName": "Lovelace", "genderMatching": "female",
                        "password": "hash", "admin": true, "termsAccepted": true,
                        "emails": [{"value": "ada@example.com", "verified": true, "code": "c1", "createdOn": CREATED, "primary": true}],
                        "userMergedIds": ["old1"],
                    },
                ),
                // legacy: pre gender matching, non-binary, voted female twice
                with(
                    "user2",
                    doc! {
                        "firstName": "Sam", "lastName": "Legacy", "gender": "non-binary", "termsAccepted": true,
                        "emails": [], "favouriteColour": "green",
                    },
                ),
            ],
        ),
        (
            "season",
            vec![with(
                "season1",
                doc! {
                    "name": "Winter 2024", "signUpOpen": true, "genderDivision": "mixed",
                    "finalResults": [{"teamId": "team1", "position": 1}, {"teamId": "team2", "position": Bson::Null}],
                },
            )],
        ),
        (
            "team",
            vec![
                with(
                    "team1",
                    doc! {"seasonId": "season1", "name": "Hawks", "color": "hsla(10, 50%, 50%, 1)", "division": 1},
                ),
                with(
                    "team2",
                    doc! {"seasonId": "season1", "name": "Owls", "color": "hsla(200, 50%, 50%, 1)", "division": Bson::Null},
                ),
            ],
        ),
        (
            "member",
            vec![with(
                "member1",
                doc! {"userId": "user1", "seasonId": "season1", "teamId": "team1", "pending": false, "captain": true},
            )],
        ),
        (
            "fixture",
            vec![with(
                "fixture1",
                doc! {
                    "seasonId": "season1", "userId": "user1", "title": "Round 1",
                    "date": DateTime::from_millis(1_709_287_200_000),
                    "games": [{"id": "game1", "team1Id": "team1", "team2Id": "team2", "place": "Field 1", "time": "6:00pm", "team1Score": 3.0_f64, "team2Score": 2_i64}],
                },
            )],
        ),
        (
            "report",
            vec![
                with(
                    "report1",
                    doc! {"teamId": "team1", "teamAgainstId": "team2", "fixtureId": "fixture1", "userId": "user1",
                    "scoreFor": 3, "scoreAgainst": 2, "mvpFemale": "user2", "spirit": 10.5_f64, "spiritComment": ""},
                ),
                with(
                    "report2",
                    doc! {"teamId": "team2", "teamAgainstId": "team1", "fixtureId": "fixture1",
                    "scoreFor": 2, "scoreAgainst": 3, "mvpFemale2": "user2", "spiritComment": "Good game"},
                ),
            ],
        ),
        (
            "session",
            vec![with(
                "session1",
                doc! {"expiresOn": "2024-06-01T10:00:00.000Z", "token": "tok", "userId": "user1", "userAgent": "Mozilla"},
            )],
        ),
        (
            "authAttemptLimit",
            vec![with(
                "limit1",
                doc! {
                    "kind": "login", "scope": "account", "email": "ada@example.com", "attempts": 2_i32,
                    "windowStartedAt": 1_709_287_200_000_i64, "blockedUntil": 0_i64, "lastSeenAt": 1_709_287_200_000.0_f64,
                },
            )],
        ),
        (
            "gamedayImportConfig",
            vec![with(
                "config1",
                doc! {
                    "seasonId": "season1", "username": "u", "passwordEncrypted": "enc", "association": "a",
                    "competition": "c", "scheduleEnabled": false,
                },
            )],
        ),
        (
            "gamedayImportRun",
            vec![with(
                "run1",
                doc! {
                    "configId": "config1", "seasonId": "season1", "trigger": "manual", "status": "succeeded",
                    "association": "a", "competition": "c", "startedOn": CREATED, "rowsImported": 4, "note": "",
                },
            )],
        ),
        ("unknownThings", vec![doc! {"_id": ObjectId::new(), "x": 1}]),
    ]
}

fn write_dump(root: &Path, db: &str, collections: &[(&str, Vec<Document>)]) -> PathBuf {
    let dir = root.join("dump").join(db);
    std::fs::create_dir_all(&dir).unwrap();
    for (name, documents) in collections {
        let bytes: Vec<u8> = documents.iter().flat_map(|d| d.to_vec().unwrap()).collect();
        std::fs::write(dir.join(format!("{name}.bson")), bytes).unwrap();
        std::fs::write(
            dir.join(format!("{name}.metadata.json")),
            "{\"indexes\":[]}",
        )
        .unwrap();
    }
    root.join("dump")
}

/// A record as JSON with numbers printed like JS (as the response pipeline does).
fn json_of(value: &impl serde::Serialize) -> Value {
    let mut value = serde_json::to_value(value).unwrap();
    crate::js::normalize_numbers(&mut value);
    value
}

fn options(dump: PathBuf, sqlite: PathBuf) -> Options {
    Options {
        dump,
        sqlite,
        ..Default::default()
    }
}

#[test]
fn import_tables_cover_every_table() {
    let keys: Vec<&str> = import_tables().iter().map(|t| t.def().key).collect();
    let all: Vec<&str> = tables::all_tables().iter().map(|t| t.key).collect();
    assert_eq!(keys, all);
}

#[tokio::test]
async fn imports_a_dump_the_way_the_server_stores_records() {
    let dir = tempfile::tempdir().unwrap();
    let dump = write_dump(dir.path(), "frisbee", &sample());
    let sqlite = dir.path().join("data/frisbee.sqlite");
    let report = dir.path().join("report.json");
    let outcome = migrate(&Options {
        report: Some(report.clone()),
        ..options(dump, sqlite.clone())
    })
    .unwrap();

    assert_eq!(outcome.database, "frisbee");
    assert_eq!(outcome.skipped, vec![("unknownThings".to_string(), 1)]);
    assert_eq!(outcome.collections.len(), 10);
    assert!(
        outcome
            .collections
            .iter()
            .all(|c| c.read == c.imported && c.invalid == 0)
    );
    let user = outcome
        .collections
        .iter()
        .find(|c| c.name == "user")
        .unwrap();
    assert_eq!((user.read, user.warnings), (2, 1));
    let warning = outcome
        .warnings
        .iter()
        .find(|w| w.level == Level::Warning)
        .unwrap();
    assert_eq!(warning.field.as_deref(), Some("favouriteColour"));
    assert_eq!(warning.value, Some(json!("green")));
    let written: Value = serde_json::from_str(&std::fs::read_to_string(report).unwrap()).unwrap();
    assert_eq!(
        written["warnings"].as_array().unwrap().len(),
        outcome.warnings.len()
    );

    let db = Db::open(&sqlite).unwrap();
    // typed reads succeed for every table (rows deserialise into records)
    let users = USER
        .get_many(&db, Filter::all(), Query::new())
        .await
        .unwrap();
    assert_eq!(users.len(), 2);
    assert_eq!(users[0].emails[0].value, "ada@example.com");
    assert_eq!(users[0].user_merged_ids, Some(vec!["old1".to_string()]));
    assert_eq!(users[1].gender_matching, GenderMatching::Female); // from MVP votes
    let stored = USER.scan_stored(&db, User::ID.eq("user2")).await.unwrap();
    assert!(!stored[0].contains_key("gender"));

    let fixture: Fixture = FIXTURE
        .get_one(&db, Fixture::ID.eq("fixture1"))
        .await
        .unwrap();
    assert_eq!(fixture.date, "2024-03-01T10:00:00.000Z");
    assert_eq!(
        json_of(&fixture.games),
        json!([{"id": "game1", "team1Id": "team1", "team2Id": "team2", "place": "Field 1", "time": "6:00pm", "team1Score": 3, "team2Score": 2}])
    );
    let season: Season = SEASON.get_one(&db, Season::ID.eq("season1")).await.unwrap();
    assert_eq!(
        json_of(&season)["finalResults"],
        json!([{"teamId": "team1", "position": 1}, {"teamId": "team2", "position": null}])
    );
    let team: Team = TEAM.get_one(&db, Team::ID.eq("team2")).await.unwrap();
    assert_eq!(team.division, None);
    let report: Report = REPORT.get_one(&db, Report::ID.eq("report1")).await.unwrap();
    assert_eq!(report.spirit, Some(10.5));
    let limit: AuthAttemptLimit = AUTH_ATTEMPT_LIMIT
        .get_one(&db, Filter::all())
        .await
        .unwrap();
    assert_eq!(json_of(&limit)["lastSeenAt"], json!(1_709_287_200_000_i64));
    MEMBER.get_one(&db, Member::ID.eq("member1")).await.unwrap();
    SESSION
        .get_one(&db, Session::ID.eq("session1"))
        .await
        .unwrap();
    GAMEDAY_IMPORT_CONFIG
        .get_one(&db, GamedayImportConfig::ID.eq("config1"))
        .await
        .unwrap();
    GAMEDAY_IMPORT_RUN
        .get_one(&db, GamedayImportRun::ID.eq("run1"))
        .await
        .unwrap();
    // the schema audit agrees every row is valid
    let lines = db
        .call(|c| crate::db::audit::audit_tables(c, &tables::all_tables()))
        .await
        .unwrap();
    assert!(
        lines.iter().skip(1).all(|line| line.ends_with('✓')),
        "{lines:?}"
    );
}

#[test]
fn reports_invalid_documents_and_imports_them_as_stored() {
    let dir = tempfile::tempdir().unwrap();
    let dump = write_dump(
        dir.path(),
        "frisbee",
        &[(
            "member",
            vec![
                doc! {"_id": ObjectId::new(), "id": "m1", "createdOn": CREATED, "updatedOn": CREATED, "userId": "u", "seasonId": "s", "teamId": "t", "pending": "yes"},
            ],
        )],
    );
    let sqlite = dir.path().join("db.sqlite");
    let outcome = migrate(&options(dump.clone(), sqlite.clone())).unwrap();
    let member = &outcome.collections[0];
    assert_eq!((member.read, member.imported, member.invalid), (1, 1, 1));
    let warning = &outcome.warnings[0];
    assert_eq!(warning.field.as_deref(), Some("pending"));
    assert!(
        warning.message.contains("imported as stored"),
        "{}",
        warning.message
    );
    let db = Db::open(&sqlite).unwrap();
    let stored = db
        .call_blocking(|c| MEMBER.tx(c).scan_stored(&Filter::all()))
        .unwrap();
    assert_eq!(stored[0]["pending"], json!("yes"));
    drop(db);

    // --strict refuses and leaves no new database behind
    let strict_sqlite = dir.path().join("strict.sqlite");
    let error = migrate(&Options {
        strict: true,
        ..options(dump, strict_sqlite.clone())
    })
    .unwrap_err();
    assert!(error.contains("--strict"), "{error}");
    assert!(!strict_sqlite.exists());
}

#[test]
fn refuses_a_database_with_data_unless_forced() {
    let dir = tempfile::tempdir().unwrap();
    let first = write_dump(&dir.path().join("a"), "frisbee", &sample()[..1]);
    let second = write_dump(&dir.path().join("b"), "frisbee", &sample()[2..3]);
    let sqlite = dir.path().join("db.sqlite");
    migrate(&options(first, sqlite.clone())).unwrap();

    let error = migrate(&options(second.clone(), sqlite.clone())).unwrap_err();
    assert!(error.contains("--force"), "{error}");
    let db = Db::open(&sqlite).unwrap();
    let count = |db: &Db| {
        db.call_blocking(|c| {
            Ok((
                USER.tx(c).count(&Filter::all())?,
                TEAM.tx(c).count(&Filter::all())?,
            ))
        })
        .unwrap()
    };
    assert_eq!(count(&db), (2, 0));

    migrate(&Options {
        force: true,
        ..options(second, sqlite.clone())
    })
    .unwrap();
    assert_eq!(count(&db), (0, 2));
}

#[test]
fn an_empty_server_database_is_not_refused() {
    let dir = tempfile::tempdir().unwrap();
    let dump = write_dump(dir.path(), "frisbee", &sample()[2..3]);
    let sqlite = dir.path().join("db.sqlite");
    let db = Db::open(&sqlite).unwrap();
    db.call_blocking(crate::db::migrations::run_startup_schema_quiet)
        .unwrap();
    drop(db);
    migrate(&options(dump, sqlite)).unwrap();
}

#[test]
fn duplicate_ids_are_fatal_and_roll_back() {
    let dir = tempfile::tempdir().unwrap();
    let team = doc! {"id": "t1", "createdOn": CREATED, "updatedOn": CREATED, "seasonId": "s", "name": "A", "color": "hsla(1, 1%, 1%, 1)"};
    let dump = write_dump(dir.path(), "frisbee", &[("team", vec![team.clone(), team])]);
    let sqlite = dir.path().join("db.sqlite");
    let error = migrate(&options(dump, sqlite.clone())).unwrap_err();
    assert!(error.contains("Cannot import team t1"), "{error}");
    assert!(!sqlite.exists());
}

#[test]
fn reads_gzipped_archives() {
    use flate2::{Compression, write::GzEncoder};
    use std::io::Write;
    let dir = tempfile::tempdir().unwrap();
    let to_bytes = |d: &Document| d.to_vec().unwrap();
    let mut archive = 0x8199_e26d_u32.to_le_bytes().to_vec();
    archive.extend(to_bytes(&doc! {"version": "0.1"}));
    archive.extend((-1_i32).to_le_bytes());
    for document in &sample()[2].1 {
        archive.extend(to_bytes(
            &doc! {"db": "frisbee", "collection": "team", "EOF": false, "CRC": 0_i64},
        ));
        archive.extend(to_bytes(document));
        archive.extend((-1_i32).to_le_bytes());
    }
    archive.extend(to_bytes(
        &doc! {"db": "frisbee", "collection": "team", "EOF": true, "CRC": 0_i64},
    ));
    archive.extend((-1_i32).to_le_bytes());
    let mut gz = GzEncoder::new(Vec::new(), Compression::default());
    gz.write_all(&archive).unwrap();
    let path = dir.path().join("frisbee.archive.gz");
    std::fs::write(&path, gz.finish().unwrap()).unwrap();
    let outcome = migrate(&options(path, dir.path().join("db.sqlite"))).unwrap();
    assert_eq!(outcome.collections[0].imported, 2);
}
