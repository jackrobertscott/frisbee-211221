//! Port of `server/src/gameday/scheduler.test.ts`.

use super::*;
use crate::shared::errors::AppError;
use crate::testing::TestApp;
use serde_json::{Value, json};
use std::sync::Mutex;

const START: &str = "2024-01-01T00:00:00.000Z";
const END: &str = "2024-01-10T00:00:00.000Z";

fn start_ms() -> i64 {
    crate::js::date::parse(START).unwrap()
}

fn make_config() -> GamedayImportConfig {
    GamedayImportConfig {
        id: "config1".into(),
        created_on: START.into(),
        updated_on: START.into(),
        season_id: "season1".into(),
        username: "user".into(),
        password_encrypted: "v1:a:b:c".into(),
        association: "assoc".into(),
        competition: "comp".into(),
        schedule_enabled: true,
        schedule_start_on: Some(START.into()),
        schedule_end_on: Some(END.into()),
        last_scheduled_run_key: None,
        schedule_locked_until: None,
        schedule_lock_token: None,
    }
}

mod is_gameday_import_due_tests {
    use super::*;

    #[test]
    fn is_due_during_the_first_minute_after_each_daily_run_time() {
        let config = make_config();
        assert!(is_gameday_import_due(&config, start_ms()));
        assert!(is_gameday_import_due(&config, start_ms() + 59_999));
        assert!(is_gameday_import_due(
            &config,
            start_ms() + 3 * DAY_MS + 30_000
        ));
    }

    #[test]
    fn is_not_due_outside_the_one_minute_window() {
        let config = make_config();
        assert!(!is_gameday_import_due(&config, start_ms() + 60_000));
        assert!(!is_gameday_import_due(
            &config,
            start_ms() + 12 * 60 * 60 * 1000
        ));
        assert!(!is_gameday_import_due(&config, start_ms() + DAY_MS - 1));
    }

    #[test]
    fn is_bounded_by_the_start_and_the_end_of_the_end_day() {
        let config = make_config();
        let end = crate::js::date::parse(END).unwrap();
        assert!(!is_gameday_import_due(&config, start_ms() - 1));
        assert!(is_gameday_import_due(&config, end));
        assert!(!is_gameday_import_due(&config, end + DAY_MS));
    }

    #[test]
    fn is_not_due_when_the_run_key_for_this_day_has_already_run() {
        let now = start_ms() + 2 * DAY_MS + 1000;
        let with_key = |key: &str| GamedayImportConfig {
            last_scheduled_run_key: Some(key.into()),
            ..make_config()
        };
        assert!(!is_gameday_import_due(
            &with_key(&format!("{START}:2")),
            now
        ));
        assert!(is_gameday_import_due(&with_key(&format!("{START}:1")), now));
    }

    #[test]
    fn is_not_due_without_a_valid_schedule_window() {
        let now = start_ms();
        assert!(!is_gameday_import_due(
            &GamedayImportConfig {
                schedule_start_on: None,
                ..make_config()
            },
            now
        ));
        assert!(!is_gameday_import_due(
            &GamedayImportConfig {
                schedule_end_on: None,
                ..make_config()
            },
            now
        ));
        assert!(!is_gameday_import_due(
            &GamedayImportConfig {
                schedule_start_on: Some("nope".into()),
                ..make_config()
            },
            now
        ));
    }

    #[test]
    fn does_not_check_schedule_enabled_the_scheduler_query_filters_on_it() {
        assert!(is_gameday_import_due(
            &GamedayImportConfig {
                schedule_enabled: false,
                ..make_config()
            },
            start_ms()
        ));
    }

    #[test]
    fn follows_the_time_of_day_of_schedule_start_on() {
        let start = "2024-01-01T08:30:00.000Z";
        let config = GamedayImportConfig {
            schedule_start_on: Some(start.into()),
            ..make_config()
        };
        let start_at = crate::js::date::parse(start).unwrap();
        assert!(is_gameday_import_due(&config, start_at + DAY_MS + 10));
        assert!(!is_gameday_import_due(&config, start_ms() + DAY_MS));
    }
}

mod start_gameday_import_scheduler_tests {
    use super::*;

    async fn create_config(
        app: &TestApp,
        season_id: &str,
        overrides: Value,
    ) -> GamedayImportConfig {
        let mut value = json!({
            "seasonId": season_id,
            "username": "user",
            "passwordEncrypted": "v1:a:b:c",
            "association": "assoc",
            "competition": "comp",
        });
        value
            .as_object_mut()
            .unwrap()
            .extend(overrides.as_object().cloned().unwrap());
        GAMEDAY_IMPORT_CONFIG
            .create_one(app.db(), value)
            .await
            .unwrap()
    }

    fn with(base: &Value, extra: Value) -> Value {
        let mut value = base.clone();
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().cloned().unwrap());
        value
    }

    async fn wait_for<F, Fut>(mut condition: F)
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = bool>,
    {
        for _ in 0..250 {
            if condition().await {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("condition was not met in time");
    }

    #[tokio::test]
    async fn runs_due_imports_under_a_lock_at_most_three_per_check() {
        let capture = log::capture();
        let app = TestApp::new(vec![]);
        let calls: Arc<Mutex<Vec<(GamedayImportConfig, GamedayImportRunTrigger)>>> = Arc::default();

        // today's run is due for the first minute after scheduleStartOn's time
        let start = to_iso_string(now_ms() - 5_000);
        let run_key = format!("{start}:0");
        let schedule = json!({
            "scheduleEnabled": true,
            "scheduleStartOn": start,
            "scheduleEndOn": start,
        });
        let ok = create_config(
            &app,
            "season-ok",
            with(&schedule, json!({"updatedOn": "2024-01-01T00:00:01.000Z"})),
        )
        .await;
        let failing = create_config(
            &app,
            "season-failing",
            with(&schedule, json!({"updatedOn": "2024-01-01T00:00:02.000Z"})),
        )
        .await;
        let locked = create_config(
            &app,
            "season-locked",
            with(
                &schedule,
                json!({
                    "updatedOn": "2024-01-01T00:00:03.000Z",
                    "scheduleLockedUntil": to_iso_string(now_ms() + 60 * 60 * 1000),
                    "scheduleLockToken": "other-token",
                }),
            ),
        )
        .await;
        let over_limit = create_config(
            &app,
            "season-over-limit",
            with(&schedule, json!({"updatedOn": "2024-01-01T00:00:04.000Z"})),
        )
        .await;
        let already_run = create_config(
            &app,
            "season-already-run",
            with(&schedule, json!({"lastScheduledRunKey": run_key})),
        )
        .await;
        let disabled = create_config(
            &app,
            "season-disabled",
            with(&schedule, json!({"scheduleEnabled": false})),
        )
        .await;

        let runner: ImportRunner = {
            let calls = calls.clone();
            let db = app.db().clone();
            let failing_id = failing.id.clone();
            let over_limit_id = over_limit.id.clone();
            Arc::new(move |config, trigger| {
                calls.lock().unwrap().push((config.clone(), trigger));
                let db = db.clone();
                let failing_id = failing_id.clone();
                let over_limit_id = over_limit_id.clone();
                Box::pin(async move {
                    if config.id == failing_id {
                        return Err(AppError::internal_from("export failed"));
                    }
                    if config.id == over_limit_id {
                        // deleting the config makes releasing its lock fail
                        GAMEDAY_IMPORT_CONFIG
                            .delete_one(&db, GamedayImportConfig::ID.eq(&config.id))
                            .await?;
                    }
                    Ok(GamedayImportSummary::default())
                })
            })
        };
        let scheduler =
            GamedayImportScheduler::new(app.db().clone(), runner, Duration::from_secs(3600));

        // the scheduler stays off while disabled
        assert!(!scheduler.start(true));
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(calls.lock().unwrap().is_empty());

        assert!(scheduler.start(false));
        // starting again while running is a no-op
        assert!(!scheduler.start(false));
        assert_eq!(CHECK_INTERVAL_MS, 60_000);

        let ids = [ok.id.clone(), failing.id.clone()];
        wait_for(|| {
            let calls = calls.clone();
            let db = app.db().clone();
            let ids = ids.clone();
            async move {
                if calls.lock().unwrap().len() != 2 {
                    return false;
                }
                let stored = GAMEDAY_IMPORT_CONFIG
                    .get_many(&db, GamedayImportConfig::ID.is_in(ids), Query::new())
                    .await
                    .unwrap();
                stored.iter().all(|c| c.schedule_lock_token.is_none())
            }
        })
        .await;

        let first_runs: Vec<String> = calls
            .lock()
            .unwrap()
            .iter()
            .map(|(config, trigger)| {
                assert_eq!(*trigger, GamedayImportRunTrigger::Scheduled);
                assert!(
                    config
                        .schedule_lock_token
                        .as_deref()
                        .is_some_and(|t| !t.is_empty())
                );
                assert_eq!(
                    config.last_scheduled_run_key.as_deref(),
                    Some(run_key.as_str())
                );
                config.id.clone()
            })
            .collect();
        assert_eq!(first_runs, [ok.id.clone(), failing.id.clone()]);
        assert_eq!(
            capture.matching(log::Level::Error, "season-failing"),
            ["Scheduled GameDay import failed for season season-failing. export failed"]
        );

        for id in [&ok.id, &failing.id] {
            let stored = GAMEDAY_IMPORT_CONFIG
                .get_one(app.db(), GamedayImportConfig::ID.eq(id))
                .await
                .unwrap();
            assert_eq!(
                stored.last_scheduled_run_key.as_deref(),
                Some(run_key.as_str())
            );
            assert_eq!(stored.schedule_locked_until, None);
        }
        // another scheduler's lock is left alone
        let still_locked = GAMEDAY_IMPORT_CONFIG
            .get_one(app.db(), GamedayImportConfig::ID.eq(&locked.id))
            .await
            .unwrap();
        assert_eq!(
            still_locked.schedule_lock_token.as_deref(),
            Some("other-token")
        );
        assert_eq!(still_locked.last_scheduled_run_key, None);

        // the next check picks up the config past the per-check limit only
        scheduler.check_due_gameday_imports().await;
        let release_errors = capture.matching(
            log::Level::Error,
            "Failed to release GameDay import schedule lock.",
        );
        assert!(
            release_errors
                .iter()
                .any(|line| line.contains("db.record_not_found")),
            "{release_errors:?}"
        );
        let all_runs: Vec<String> = calls
            .lock()
            .unwrap()
            .iter()
            .map(|(config, _)| config.id.clone())
            .collect();
        assert_eq!(all_runs, [ok.id, failing.id, over_limit.id]);
        assert!(!all_runs.contains(&already_run.id));
        assert!(!all_runs.contains(&disabled.id));
    }
}
