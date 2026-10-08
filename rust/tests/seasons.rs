//! Port of `server/test/integration/seasons.test.ts`.

mod common;

use common::actors::{Actor, NewMember, SignUp, add_member, create_season, create_team, sign_up};
use common::{TestServer, assert_match};
use frisbee::db::Filter;
use frisbee::shared::schemas::{Fixture, Member, Season, Team, User};
use frisbee::tables::{FIXTURE, MEMBER, REPORT, SEASON, TEAM, USER};
use frisbee::utils::random::{generate_id, random_string};
use serde_json::{Value, json};

/// Sets a password via the verify flow; returns an actor with the fresh session.
async fn with_password(server: &TestServer, actor: Actor, password: &str) -> Actor {
    let response = server
        .post(
            "/SecurityVerify",
            json!({
                "email": actor.email,
                "code": server.latest_code(&actor.email),
                "newPassword": password,
            }),
        )
        .await;
    assert_eq!(response.status, 200, "Verify failed: {}", response.body);
    Actor {
        token: response.body["session"]["token"]
            .as_str()
            .unwrap()
            .to_string(),
        ..actor
    }
}

fn tag() -> String {
    random_string(8)
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

async fn create_fixture(server: &TestServer, season_id: &str, user_id: &str) -> Fixture {
    FIXTURE
        .create_one(
            server.db(),
            json!({
                "seasonId": season_id,
                "userId": user_id,
                "title": "Round 1",
                "date": frisbee::js::date::now_iso(),
                "games": [],
            }),
        )
        .await
        .unwrap()
}

async fn create_report(server: &TestServer, team_id: &str, against_id: &str, fixture_id: &str) {
    REPORT
        .create_one(
            server.db(),
            json!({
                "teamId": team_id,
                "teamAgainstId": against_id,
                "fixtureId": fixture_id,
                "scoreFor": 1,
                "scoreAgainst": 0,
                "spiritComment": "",
            }),
        )
        .await
        .unwrap();
}

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

fn names(body: &Value) -> Vec<String> {
    body.as_array()
        .unwrap()
        .iter()
        .map(|s| s["name"].as_str().unwrap().to_string())
        .collect()
}

mod season_access_control {
    use super::*;

    #[tokio::test]
    async fn rejects_anonymous_and_non_admin_season_management() {
        let server = TestServer::start().await;
        let anonymous = server
            .post("/SeasonCreate", json!({"name": "Nope", "signUpOpen": true}))
            .await;
        assert_eq!(anonymous.status, 401);
        assert_eq!(anonymous.body["errorCode"], "auth.token_missing");

        let player = sign_up(&server, SignUp::default()).await;
        let forbidden = server
            .post_as(
                "/SeasonCreate",
                json!({"name": "Nope", "signUpOpen": true}),
                &player.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);
        assert_eq!(forbidden.body["errorCode"], "auth.admin_required");
        assert!(forbidden.body["userMessage"].is_string());
        assert_eq!(forbidden.body["statusCode"], 403);

        for path in ["/SeasonUpdate", "/SeasonDeleteStatus", "/SeasonDelete"] {
            let response = server
                .post_as(
                    path,
                    json!({
                        "seasonId": generate_id(),
                        "name": "x",
                        "signUpOpen": true,
                        "password": "x",
                    }),
                    &player.token,
                )
                .await;
            assert_eq!(response.status, 403);
            assert_eq!(response.body["errorCode"], "auth.admin_required");
        }
    }
}

mod season_list {
    use super::*;

    #[tokio::test]
    async fn is_public_and_orders_names_descending_with_numeric_collation() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let prefix = format!("List{}", tag());
        for n in [2, 10, 1, 9] {
            create_season(
                &server,
                &admin,
                json!({"name": format!("{prefix} Season {n}")}),
            )
            .await;
        }
        let response = server.post("/SeasonList", json!({"search": prefix})).await;
        assert_eq!(response.status, 200);
        // numeric ordering: "10" sorts above "9" and "2" (not lexicographic)
        assert_eq!(
            names(&response.body),
            vec![
                format!("{prefix} Season 10"),
                format!("{prefix} Season 9"),
                format!("{prefix} Season 2"),
                format!("{prefix} Season 1"),
            ]
        );
    }

    #[tokio::test]
    async fn searches_case_insensitively_and_treats_regex_characters_literally() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let prefix = format!("Find{}", tag());
        create_season(
            &server,
            &admin,
            json!({"name": format!("{prefix} Winter (A)")}),
        )
        .await;
        create_season(&server, &admin, json!({"name": format!("{prefix} Summer")})).await;

        let lower = server
            .post(
                "/SeasonList",
                json!({"search": format!("{} winter", prefix.to_lowercase())}),
            )
            .await;
        assert_eq!(names(&lower.body), vec![format!("{prefix} Winter (A)")]);

        let literal = server
            .post(
                "/SeasonList",
                json!({"search": format!("{prefix} Winter (A)")}),
            )
            .await;
        assert_eq!(literal.body.as_array().unwrap().len(), 1);

        let none = server
            .post("/SeasonList", json!({"search": format!("{prefix}.*")}))
            .await;
        assert_eq!(none.body, json!([]));
    }

    #[tokio::test]
    async fn returns_all_seasons_without_a_search() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        create_season(&server, &admin, json!({"name": "One"})).await;
        create_season(&server, &admin, json!({"name": "Two"})).await;
        let response = server.post("/SeasonList", json!({})).await;
        assert_eq!(response.status, 200);
        let count = SEASON.count(server.db(), Filter::all()).await.unwrap();
        assert_eq!(response.body.as_array().unwrap().len() as i64, count);
    }
}

mod season_create_and_season_update {
    use super::*;

    #[tokio::test]
    async fn creates_a_season_with_the_given_fields() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let response = server
            .post_as(
                "/SeasonCreate",
                json!({
                    "name": "Created",
                    "signUpOpen": false,
                    "useOfficialScoring": true,
                    "genderDivision": "women",
                }),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "name": "Created",
                "signUpOpen": false,
                "useOfficialScoring": true,
                "genderDivision": "women",
            }),
        );
        assert!(response.body["id"].is_string());
        let stored = SEASON
            .get_one(server.db(), Season::ID.eq(id(&response.body)))
            .await
            .unwrap();
        assert_eq!(stored.name, "Created");
    }

    #[tokio::test]
    async fn rejects_an_invalid_payload() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let response = server
            .post_as(
                "/SeasonCreate",
                json!({"name": "Bad", "genderDivision": "other"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 422);
        assert_eq!(response.body["errorCode"], "validation_error");
    }

    #[tokio::test]
    async fn updates_a_season_and_its_updated_on() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({"name": "Before"})).await;
        let before = SEASON
            .get_one(server.db(), Season::ID.eq(id(&season)))
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        let response = server
            .post_as(
                "/SeasonUpdate",
                json!({
                    "seasonId": season["id"],
                    "name": "After",
                    "signUpOpen": false,
                    "isHidden": true,
                    "finalResults": [{"teamId": generate_id(), "position": 1}],
                }),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "id": season["id"],
                "name": "After",
                "signUpOpen": false,
                "isHidden": true,
            }),
        );
        assert_eq!(response.body["finalResults"].as_array().unwrap().len(), 1);
        assert!(response.body["updatedOn"].as_str().unwrap() > before.updated_on.as_str());
        let stored = SEASON
            .get_one(server.db(), Season::ID.eq(id(&season)))
            .await
            .unwrap();
        assert_eq!(stored.name, "After");
    }

    #[tokio::test]
    async fn returns_404_when_updating_a_missing_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let response = server
            .post_as(
                "/SeasonUpdate",
                json!({"seasonId": generate_id(), "name": "X", "signUpOpen": true}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 404);
        assert_eq!(response.body["errorCode"], "db.record_not_found");
    }
}

mod season_delete_status {
    use super::*;

    #[tokio::test]
    async fn reports_whether_a_season_has_score_reports() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({"name": "Status"})).await;
        let team = create_team(&server, &admin, &id(&season), "Status Team", json!({})).await;

        let clean = server
            .post_as(
                "/SeasonDeleteStatus",
                json!({"seasonId": season["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(clean.status, 200);
        assert_eq!(clean.body, json!({"canDelete": true}));

        create_report(&server, &id(&team), &generate_id(), &generate_id()).await;
        let blocked = server
            .post_as(
                "/SeasonDeleteStatus",
                json!({"seasonId": season["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(blocked.body, json!({"canDelete": false}));
    }

    #[tokio::test]
    async fn detects_reports_linked_by_fixture_or_by_opposing_team() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let by_fixture = create_season(&server, &admin, json!({"name": "ByFixture"})).await;
        let fixture = create_fixture(&server, &id(&by_fixture), &admin.user_id).await;
        create_report(&server, &generate_id(), &generate_id(), &fixture.id).await;
        assert_eq!(
            server
                .post_as(
                    "/SeasonDeleteStatus",
                    json!({"seasonId": by_fixture["id"]}),
                    &admin.token,
                )
                .await
                .body,
            json!({"canDelete": false})
        );

        let by_against = create_season(&server, &admin, json!({"name": "ByAgainst"})).await;
        let team = create_team(&server, &admin, &id(&by_against), "Against", json!({})).await;
        create_report(&server, &generate_id(), &id(&team), &generate_id()).await;
        assert_eq!(
            server
                .post_as(
                    "/SeasonDeleteStatus",
                    json!({"seasonId": by_against["id"]}),
                    &admin.token,
                )
                .await
                .body,
            json!({"canDelete": false})
        );
    }

    #[tokio::test]
    async fn returns_404_for_a_missing_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let response = server
            .post_as(
                "/SeasonDeleteStatus",
                json!({"seasonId": generate_id()}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 404);
    }
}

mod season_delete {
    use super::*;

    async fn season_exists(server: &TestServer, season_id: &str) -> bool {
        SEASON
            .maybe_one(server.db(), Season::ID.eq(season_id))
            .await
            .unwrap()
            .is_some()
    }

    #[tokio::test]
    async fn requires_the_admin_to_have_a_password() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({"name": "NoPassword"})).await;
        let response = server
            .post_as(
                "/SeasonDelete",
                json!({"seasonId": season["id"], "password": "anything"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "user.password_missing");
        assert!(season_exists(&server, &id(&season)).await);
    }

    #[tokio::test]
    async fn rejects_a_wrong_password() {
        let server = TestServer::start().await;
        let admin = with_password(&server, admin(&server).await, "correct-pass").await;
        let season = create_season(&server, &admin, json!({"name": "WrongPassword"})).await;
        let response = server
            .post_as(
                "/SeasonDelete",
                json!({"seasonId": season["id"], "password": "wrong-pass"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "user.old_password_invalid");
        assert!(season_exists(&server, &id(&season)).await);
    }

    #[tokio::test]
    async fn returns_404_for_a_missing_season() {
        let server = TestServer::start().await;
        let admin = with_password(&server, admin(&server).await, "correct-pass").await;
        let response = server
            .post_as(
                "/SeasonDelete",
                json!({"seasonId": generate_id(), "password": "correct-pass"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 404);
    }

    #[tokio::test]
    async fn is_blocked_when_the_season_has_score_reports() {
        let server = TestServer::start().await;
        let admin = with_password(&server, admin(&server).await, "correct-pass").await;
        let season = create_season(&server, &admin, json!({"name": "HasReports"})).await;
        let season_id = id(&season);
        let team = create_team(&server, &admin, &season_id, "Reported", json!({})).await;
        add_member(&server, &admin, &id(&team), NewMember::default()).await;
        REPORT
            .create_one(
                server.db(),
                json!({
                    "teamId": team["id"],
                    "teamAgainstId": generate_id(),
                    "fixtureId": generate_id(),
                    "scoreFor": 3,
                    "scoreAgainst": 2,
                    "spiritComment": "",
                }),
            )
            .await
            .unwrap();
        let response = server
            .post_as(
                "/SeasonDelete",
                json!({"seasonId": season_id, "password": "correct-pass"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 409);
        assert_eq!(response.body["errorCode"], "season.delete_has_reports");
        assert!(season_exists(&server, &season_id).await);
        let db = server.db();
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            MEMBER
                .count(db, Member::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn cascades_members_fixtures_and_teams_and_clears_last_season_id() {
        let server = TestServer::start().await;
        let admin = with_password(&server, admin(&server).await, "correct-pass").await;
        let season = create_season(&server, &admin, json!({"name": "Doomed"})).await;
        let other = create_season(&server, &admin, json!({"name": "Survivor"})).await;
        let (season_id, other_id) = (id(&season), id(&other));
        let team = create_team(&server, &admin, &season_id, "Doomed Team", json!({})).await;
        let other_team = create_team(&server, &admin, &other_id, "Other Team", json!({})).await;
        add_member(&server, &admin, &id(&team), NewMember::default()).await;
        add_member(&server, &admin, &id(&other_team), NewMember::default()).await;
        create_fixture(&server, &season_id, &admin.user_id).await;
        create_fixture(&server, &other_id, &admin.user_id).await;
        let player = sign_up(
            &server,
            SignUp {
                season_id: Some(season_id.clone()),
                ..Default::default()
            },
        )
        .await;
        let bystander = sign_up(
            &server,
            SignUp {
                season_id: Some(other_id.clone()),
                ..Default::default()
            },
        )
        .await;
        let db = server.db();
        let last_season = |user_id: String| async move {
            USER.get_one(db, User::ID.eq(user_id))
                .await
                .unwrap()
                .last_season_id
        };
        assert_eq!(
            last_season(player.user_id.clone()).await,
            Some(season_id.clone())
        );

        let response = server
            .post_as(
                "/SeasonDelete",
                json!({"seasonId": season_id, "password": "correct-pass"}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 204);
        assert!(!season_exists(&server, &season_id).await);
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            0
        );
        assert_eq!(
            MEMBER
                .count(db, Member::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            0
        );
        assert_eq!(
            FIXTURE
                .count(db, Fixture::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            0
        );
        assert_eq!(last_season(player.user_id.clone()).await, None);

        // other seasons are untouched
        assert!(season_exists(&server, &other_id).await);
        assert_eq!(
            TEAM.count(db, Team::SEASON_ID.eq(&other_id)).await.unwrap(),
            1
        );
        assert_eq!(
            MEMBER
                .count(db, Member::SEASON_ID.eq(&other_id))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            FIXTURE
                .count(db, Fixture::SEASON_ID.eq(&other_id))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            last_season(bystander.user_id.clone()).await,
            Some(other_id.clone())
        );
    }
}
