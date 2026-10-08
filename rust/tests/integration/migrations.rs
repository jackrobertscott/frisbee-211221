//! Port of `server/test/integration/migrations.test.ts`.

use crate::common::TestServer;
use frisbee::migrations::user_gender_matching::run_user_gender_matching_migration;
use frisbee::shared::schemas::{Report, User};
use frisbee::tables::{REPORT, USER, user::legacy::set_legacy_gender};
use frisbee::utils::random::generate_id;
use serde_json::{Map, Value, json};

/// Stores a user the way they looked before gender matching existed.
async fn legacy_user(server: &TestServer, gender: &str) -> String {
    let user: User = USER
        .create_one(
            server.db(),
            json!({"firstName": "Legacy", "lastName": gender, "genderMatching": "male", "termsAccepted": true, "emails": []}),
        )
        .await
        .unwrap();
    let id = user.id.clone();
    let gender = gender.to_string();
    server
        .db()
        .call(move |c| set_legacy_gender(c, &id, &gender))
        .await
        .unwrap();
    user.id
}

async fn mvp_report(server: &TestServer, picks: Value) -> Report {
    let mut report = json!({
        "teamId": generate_id(),
        "teamAgainstId": generate_id(),
        "fixtureId": generate_id(),
        "scoreFor": 1,
        "scoreAgainst": 0,
        "spiritComment": "",
    });
    report
        .as_object_mut()
        .unwrap()
        .extend(picks.as_object().cloned().unwrap());
    REPORT.create_one(server.db(), report).await.unwrap()
}

/// Reads without the schema type so a leftover legacy field would show up.
async fn stored(server: &TestServer, id: &str) -> Map<String, Value> {
    USER.scan_stored(server.db(), User::ID.eq(id))
        .await
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
}

mod run_user_gender_matching_migration_tests {
    use super::*;

    #[tokio::test]
    async fn backfills_gender_matching_from_gender_then_mvp_picks_then_the_fallback() {
        let server = TestServer::start().await;
        let male = legacy_user(&server, "male").await;
        let female = legacy_user(&server, "female").await;
        let voted_male = legacy_user(&server, "non-binary").await;
        let voted_female = legacy_user(&server, "other").await;
        let tied = legacy_user(&server, "non-binary").await;
        let unvoted = legacy_user(&server, "other").await;
        let current: User = USER
            .create_one(
                server.db(),
                json!({"firstName": "Current", "lastName": "User", "genderMatching": "male", "termsAccepted": true, "emails": []}),
            )
            .await
            .unwrap();

        mvp_report(
            &server,
            json!({"mvpMale": voted_male, "mvpFemale": voted_female}),
        )
        .await;
        mvp_report(&server, json!({"mvpMale2": voted_male, "mvpFemale2": tied})).await;
        mvp_report(&server, json!({"mvpFemale": voted_male, "mvpMale": tied})).await;

        run_user_gender_matching_migration(server.db())
            .await
            .unwrap();

        let expected = [
            (male, "male"),
            (female, "female"),
            (voted_male.clone(), "male"),
            (voted_female, "female"),
            (tied, "female"),
            (unvoted, "female"),
            (current.id, "male"),
        ];
        for (id, gender_matching) in expected {
            let user = stored(&server, &id).await;
            assert_eq!(
                user.get("genderMatching"),
                Some(&json!(gender_matching)),
                "{id}"
            );
            assert!(!user.contains_key("gender"), "{id}");
        }

        // a second run finds nothing left to change
        let before = USER
            .get_one(server.db(), User::ID.eq(&voted_male))
            .await
            .unwrap();
        run_user_gender_matching_migration(server.db())
            .await
            .unwrap();
        assert_eq!(
            USER.get_one(server.db(), User::ID.eq(&voted_male))
                .await
                .unwrap(),
            before
        );
    }
}
