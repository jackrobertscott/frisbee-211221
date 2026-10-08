//! `migrate-mongo` against a real `mongodump --archive --gzip` file.
//!
//! `fixtures/mongo/frisbee-rt.archive.gz` was made by seeding a throwaway
//! `mongod` through the TS table layer (`fixtures/mongo/seed.mts`, run with
//! `tsx` from `server/`), starting the TS server on it and logging in (which
//! wrote the session and the attempt-limit rows), then inserting legacy
//! documents the current TS code no longer writes (`fixtures/mongo/legacy.mjs`:
//! a pre gender-matching user with BSON dates and an unknown field, a member
//! with an invalid `pending`, reports with BSON dates and a `null`, and an
//! unrelated collection), and finally
//! `mongodump --db frisbee-rt --archive=frisbee-rt.archive.gz --gzip`.

use frisbee::db::{Db, Filter, Query};
use frisbee::migrate::{Level, Options, migrate};
use frisbee::shared::schemas::{GenderMatching, User, UserEmail};
use frisbee::tables::{MEMBER, SEASON, SESSION, USER};
use serde_json::json;
use std::path::PathBuf;

const ADA: &str = "5Y5QKgaQd7Z8t1SbLe4YBi54";
const SAM: &str = "legacySam00000000000000";

fn fixture() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mongo/frisbee-rt.archive.gz")
}

#[tokio::test]
async fn imports_a_real_mongodump_archive() {
    let dir = tempfile::tempdir().unwrap();
    let sqlite = dir.path().join("frisbee.sqlite");
    let outcome = migrate(&Options {
        dump: fixture(),
        sqlite: sqlite.clone(),
        ..Default::default()
    })
    .unwrap();

    assert_eq!(outcome.database, "frisbee-rt");
    let counts: Vec<(&str, usize, usize, usize)> = outcome
        .collections
        .iter()
        .map(|c| (c.name.as_str(), c.read, c.imported, c.invalid))
        .collect();
    assert_eq!(
        counts,
        [
            ("authAttemptLimit", 2, 2, 0),
            ("fixture", 1, 1, 0),
            ("gamedayImportConfig", 1, 1, 0),
            ("gamedayImportRun", 1, 1, 0),
            ("member", 3, 3, 1),
            ("report", 3, 3, 0),
            ("season", 2, 2, 0),
            ("session", 1, 1, 0),
            ("team", 2, 2, 0),
            ("user", 3, 3, 0),
        ]
    );
    assert_eq!(outcome.skipped, vec![("notes".to_string(), 1)]);
    let warnings: Vec<String> = outcome
        .warnings
        .iter()
        .filter(|w| w.level == Level::Warning)
        .map(|w| w.line())
        .collect();
    assert_eq!(
        warnings,
        [
            "member legacyMember000000000001 pending: fails schema validation (Value is not a boolean.); imported as stored [value: \"no\"]",
            "user legacySam00000000000000 nickname: not part of the schema; dropped [value: \"Sammy\"]",
        ]
    );

    let db = Db::open(&sqlite).unwrap();
    // the legacy user was backfilled from MVP votes, with BSON dates converted
    let sam = USER.get_one(&db, User::ID.eq(SAM)).await.unwrap();
    assert_eq!(sam.gender_matching, GenderMatching::Female);
    assert_eq!(sam.created_on, "2021-06-01T09:30:00.250Z");
    let stored = USER.scan_stored(&db, User::ID.eq(SAM)).await.unwrap();
    assert!(!stored[0].contains_key("gender"));

    // emails are matched case-insensitively, as the server looks them up
    let ada = USER
        .get_one(
            &db,
            User::EMAILS.any(UserEmail::VALUE.eq_ci("ADA.ALT@example.com")),
        )
        .await
        .unwrap();
    assert_eq!(ada.id, ADA);
    assert_eq!(ada.emails.len(), 2);

    let session = SESSION.get_one(&db, Filter::all()).await.unwrap();
    assert_eq!(
        (session.user_id.as_str(), session.user_agent.as_deref()),
        (ADA, Some("round-trip"))
    );

    let seasons = SEASON
        .get_many(&db, Filter::all(), Query::new())
        .await
        .unwrap();
    let summer = seasons.iter().find(|s| s.name == "Summer 2023").unwrap();
    assert_eq!(
        serde_json::to_value(&summer.final_results).unwrap()[1]["position"],
        json!(null)
    );

    // the invalid member is stored as dumped, and typed reads refuse it
    let members = MEMBER.scan_stored(&db, Filter::all()).await.unwrap();
    assert_eq!(members[2]["pending"], json!("no"));
    assert!(
        MEMBER
            .get_many(&db, Filter::all(), Query::new())
            .await
            .is_err()
    );
}
