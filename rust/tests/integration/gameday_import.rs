//! Port of `server/test/integration/gamedayImport.test.ts`. The TS test
//! mocked `runGamedayExportProcess`; here the server's exporter is swapped
//! for a [`MockExporter`].

use crate::common::actors::{Actor, SignUp, create_season, sign_up};
use crate::common::{Response, TestServer, assert_match};
use frisbee::db::{Patch, Query};
use frisbee::gameday::mock_exporter::MockExporter;
use frisbee::gameday::types::GamedayExportMember;
use frisbee::js::date::{now_ms, to_iso_string};
use frisbee::shared::errors::AppError;
use frisbee::shared::schemas::{
    GamedayImportConfig, GamedayImportRun, GamedayImportRunStatus, GamedayImportRunTrigger, Member,
};
use frisbee::tables::{GAMEDAY_IMPORT_CONFIG, GAMEDAY_IMPORT_RUN, MEMBER};
use frisbee::utils::random::generate_id;
use serde_json::{Value, json};
use std::sync::Arc;

struct Setup {
    server: TestServer,
    admin: Actor,
    exporter: Arc<MockExporter>,
}

async fn setup() -> Setup {
    let server = TestServer::start().await;
    let exporter = Arc::new(MockExporter::new());
    server.app.state.set_gameday_exporter(exporter.clone());
    let admin = sign_up(
        &server,
        SignUp {
            admin: true,
            ..Default::default()
        },
    )
    .await;
    Setup {
        server,
        admin,
        exporter,
    }
}

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

async fn save_config(server: &TestServer, admin: &Actor, season_id: &str) {
    let response = server
        .post_as(
            "/PortGamedayImportSave",
            json!({
                "seasonId": season_id,
                "username": "gd-user",
                "password": "gd-pass",
                "association": "Assoc",
                "competition": "Comp",
                "scheduleEnabled": false,
            }),
            &admin.token,
        )
        .await;
    assert_eq!(response.status, 200, "{}", response.body);
}

async fn run_import(server: &TestServer, season_id: &str, token: &str) -> Response {
    server
        .post_as("/PortGamedayImport", json!({"seasonId": season_id}), token)
        .await
}

async fn config_of(server: &TestServer, season_id: &str) -> GamedayImportConfig {
    GAMEDAY_IMPORT_CONFIG
        .get_one(server.db(), GamedayImportConfig::SEASON_ID.eq(season_id))
        .await
        .unwrap()
}

async fn runs_of(server: &TestServer, season_id: &str) -> Vec<GamedayImportRun> {
    GAMEDAY_IMPORT_RUN
        .get_many(
            server.db(),
            GamedayImportRun::SEASON_ID.eq(season_id),
            Query::new(),
        )
        .await
        .unwrap()
}

async fn lock(server: &TestServer, config: &GamedayImportConfig, until_ms: i64, token: &str) {
    GAMEDAY_IMPORT_CONFIG
        .update_one(
            server.db(),
            GamedayImportConfig::ID.eq(&config.id),
            Patch::new()
                .set(
                    GamedayImportConfig::SCHEDULE_LOCKED_UNTIL,
                    to_iso_string(until_ms),
                )
                .set(GamedayImportConfig::SCHEDULE_LOCK_TOKEN, token.to_string()),
        )
        .await
        .unwrap();
}

fn member(team: &str, first: &str, last: &str, email: &str, gender: &str) -> GamedayExportMember {
    GamedayExportMember {
        team_name: team.into(),
        first_name: first.into(),
        last_name: last.into(),
        email: email.into(),
        gender: gender.into(),
    }
}

mod port_gameday_import {
    use super::*;

    #[tokio::test]
    async fn requires_admin_a_known_season_and_saved_credentials() {
        let Setup {
            server,
            admin,
            exporter,
        } = setup().await;
        let player = sign_up(&server, SignUp::default()).await;
        assert_eq!(
            run_import(&server, &generate_id(), &player.token)
                .await
                .status,
            403
        );
        assert_eq!(
            run_import(&server, &generate_id(), &admin.token)
                .await
                .status,
            404
        );

        let season = create_season(&server, &admin, json!({"name": "No credentials"})).await;
        let missing = run_import(&server, &id(&season), &admin.token).await;
        assert_eq!(missing.status, 400);
        assert_eq!(missing.body["errorCode"], "gameday.credentials_missing");
        assert!(exporter.calls().is_empty());
    }

    #[tokio::test]
    async fn imports_members_records_the_run_and_releases_the_lock() {
        let Setup {
            server,
            admin,
            exporter,
        } = setup().await;
        let season = create_season(&server, &admin, json!({"name": "GameDay manual"})).await;
        let season_id = id(&season);
        save_config(&server, &admin, &season_id).await;
        exporter.resolve(vec![
            member("Alpha", "A", "One", "gd.a@example.com", "F"),
            member("Alpha", "B", "Two", "gd.b@example.com", "M"),
        ]);

        let response = run_import(&server, &season_id, &admin.token).await;

        assert_eq!(response.status, 200, "{}", response.body);
        assert_match(
            &response.body,
            &json!({
                "rowsImported": 2,
                "teamsCreated": 1,
                "usersCreated": 2,
                "membersCreated": 2,
            }),
        );
        let calls = exporter.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].username, "gd-user");
        assert_eq!(calls[0].password, "gd-pass");
        assert_eq!(
            MEMBER
                .count(server.db(), Member::SEASON_ID.eq(&season_id))
                .await
                .unwrap(),
            2
        );
        let config = config_of(&server, &season_id).await;
        assert_eq!(config.schedule_lock_token, None);
        assert_eq!(config.schedule_locked_until, None);
        let runs = runs_of(&server, &season_id).await;
        assert_eq!(
            runs.iter()
                .map(|run| (run.trigger, run.status))
                .collect::<Vec<_>>(),
            [(
                GamedayImportRunTrigger::Manual,
                GamedayImportRunStatus::Succeeded
            )]
        );
    }

    #[tokio::test]
    async fn refuses_to_start_while_another_import_holds_the_lock() {
        let Setup {
            server,
            admin,
            exporter,
        } = setup().await;
        let season = create_season(&server, &admin, json!({"name": "GameDay locked"})).await;
        let season_id = id(&season);
        save_config(&server, &admin, &season_id).await;
        let config = config_of(&server, &season_id).await;
        let other_token = generate_id();
        lock(&server, &config, now_ms() + 60_000, &other_token).await;
        exporter.clear();

        let response = run_import(&server, &season_id, &admin.token).await;

        assert_eq!(response.status, 409);
        assert_eq!(response.body["errorCode"], "gameday.import_running");
        assert!(exporter.calls().is_empty());
        // the other import's lock is left in place
        assert_eq!(
            config_of(&server, &season_id).await.schedule_lock_token,
            Some(other_token)
        );
    }

    #[tokio::test]
    async fn takes_over_an_expired_lock_and_releases_it_after_a_failed_export() {
        let Setup {
            server,
            admin,
            exporter,
        } = setup().await;
        let season = create_season(&server, &admin, json!({"name": "GameDay failing"})).await;
        let season_id = id(&season);
        save_config(&server, &admin, &season_id).await;
        let config = config_of(&server, &season_id).await;
        lock(&server, &config, now_ms() - 1_000, &generate_id()).await;
        exporter.reject(AppError::internal_from("Login stayed on the login page."));

        let response = run_import(&server, &season_id, &admin.token).await;

        assert_eq!(response.status, 500);
        assert_eq!(
            config_of(&server, &season_id).await.schedule_lock_token,
            None
        );
        let runs = runs_of(&server, &season_id).await;
        assert_eq!(
            runs.iter()
                .map(|run| (run.status, run.error_message.clone()))
                .collect::<Vec<_>>(),
            [(
                GamedayImportRunStatus::Failed,
                Some("Login stayed on the login page.".to_string())
            )]
        );
    }
}
