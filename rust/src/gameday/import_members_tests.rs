//! Port of `server/src/gameday/importMembers.test.ts`.

use super::*;
use crate::db::{Filter, Query};
use crate::gameday::credentials::encrypt_gameday_password;
use crate::gameday::mock_exporter::MockExporter;
use crate::shared::errors::{AppError, ErrorInput, ErrorOptions, to_app_error};
use crate::shared::schemas::{Member, Season, Team, User, UserEmail};
use crate::tables::{GAMEDAY_IMPORT_CONFIG, MEMBER, SEASON, TEAM, USER};
use crate::testing::TestApp;
use serde_json::Value;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn next() -> usize {
    COUNTER.fetch_add(1, Ordering::SeqCst) + 1
}

struct Setup {
    app: TestApp,
    exporter: Arc<MockExporter>,
}

fn setup() -> Setup {
    let app = TestApp::new(vec![]);
    let exporter = Arc::new(MockExporter::new());
    app.state.set_gameday_exporter(exporter.clone());
    Setup { app, exporter }
}

async fn create_config(app: &TestApp) -> GamedayImportConfig {
    let season: Season = SEASON
        .create_one(
            app.db(),
            json!({"name": format!("GameDay {}", next()), "genderDivision": "mixed"}),
        )
        .await
        .unwrap();
    GAMEDAY_IMPORT_CONFIG
        .create_one(
            app.db(),
            json!({
                "seasonId": season.id,
                "username": "gd-user",
                "passwordEncrypted": encrypt_gameday_password(&app.state.config.jwt_secret, "gd-pass").unwrap(),
                "association": "Assoc",
                "competition": "Comp",
            }),
        )
        .await
        .unwrap()
}

#[derive(Default)]
struct M<'a> {
    team_name: Option<&'a str>,
    first_name: Option<&'a str>,
    last_name: Option<&'a str>,
    email: Option<&'a str>,
    gender: Option<&'a str>,
}

/// The TS `member(overrides)`: unique names and email per call.
fn member(overrides: M) -> GamedayExportMember {
    let n = next();
    GamedayExportMember {
        team_name: overrides.team_name.unwrap_or("Alpha").into(),
        first_name: overrides
            .first_name
            .map(str::to_string)
            .unwrap_or(format!("First{n}")),
        last_name: overrides
            .last_name
            .map(str::to_string)
            .unwrap_or(format!("Last{n}")),
        email: overrides
            .email
            .map(str::to_string)
            .unwrap_or(format!("gd.{n}@example.com")),
        gender: overrides.gender.unwrap_or("Female").into(),
    }
}

async fn runs(app: &TestApp, config: &GamedayImportConfig) -> Vec<GamedayImportRun> {
    GAMEDAY_IMPORT_RUN
        .get_many(
            app.db(),
            GamedayImportRun::CONFIG_ID.eq(&config.id),
            Query::new(),
        )
        .await
        .unwrap()
}

fn by_email(email: &str) -> Filter {
    User::EMAILS.any(UserEmail::VALUE.eq(email))
}

mod run_gameday_import_with_history_tests {
    use super::*;

    #[tokio::test]
    async fn exports_with_the_decrypted_password_imports_members_and_records_the_run() {
        let Setup { app, exporter } = setup();
        let config = create_config(&app).await;
        let male = member(M {
            gender: Some("M"),
            team_name: Some("Beta"),
            ..Default::default()
        });
        let female = member(M {
            gender: Some(" female "),
            ..Default::default()
        });
        let blank = member(M {
            gender: Some(""),
            ..Default::default()
        });
        exporter.resolve(vec![male.clone(), female.clone(), blank.clone()]);

        let summary =
            run_gameday_import_with_history(&app.state, &config, GamedayImportRunTrigger::Manual)
                .await
                .unwrap();

        assert_eq!(
            exporter.calls(),
            [GamedayExportInput {
                starting_url: "https://membership.mygameday.app/".into(),
                username: "gd-user".into(),
                password: "gd-pass".into(),
                association: "Assoc".into(),
                competition: "Comp".into(),
                ..Default::default()
            }]
        );
        assert_eq!(
            summary,
            GamedayImportSummary {
                rows_imported: 3,
                teams_created: 2,
                users_created: 3,
                members_created: 3,
                note: None,
            }
        );

        let teams = TEAM
            .get_many(
                app.db(),
                Team::SEASON_ID.eq(&config.season_id),
                Query::new().sort([Team::NAME.asc()]),
            )
            .await
            .unwrap();
        assert_eq!(
            teams.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(),
            ["Alpha", "Beta"]
        );
        let gender_of = |email: String| {
            let db = app.db().clone();
            async move {
                USER.get_one(&db, by_email(&email))
                    .await
                    .unwrap()
                    .gender_matching
            }
        };
        assert_eq!(gender_of(male.email.clone()).await, GenderMatching::Male);
        assert_eq!(
            gender_of(female.email.clone()).await,
            GenderMatching::Female
        );
        // a blank GameDay gender uses the fallback without a note
        assert_eq!(gender_of(blank.email.clone()).await, GenderMatching::Female);
        assert_eq!(
            MEMBER
                .count(app.db(), Member::SEASON_ID.eq(&config.season_id))
                .await
                .unwrap(),
            3
        );

        let runs = runs(&app, &config).await;
        assert_eq!(runs.len(), 1);
        let run = &runs[0];
        assert_eq!(run.season_id, config.season_id);
        assert_eq!(run.trigger, GamedayImportRunTrigger::Manual);
        assert_eq!(run.status, GamedayImportRunStatus::Succeeded);
        assert_eq!(run.association, "Assoc");
        assert_eq!(run.competition, "Comp");
        assert_eq!(run.rows_imported, Some(3.0));
        assert_eq!(run.teams_created, Some(2.0));
        assert_eq!(run.users_created, Some(3.0));
        assert_eq!(run.members_created, Some(3.0));
        assert_eq!(run.note, None);
        let finished = crate::js::date::parse(run.finished_on.as_deref().unwrap_or("")).unwrap();
        assert!(finished >= crate::js::date::parse(&run.started_on).unwrap());
    }

    #[tokio::test]
    async fn skips_invalid_rows_and_notes_them_with_unrecognised_genders() {
        let Setup { app, exporter } = setup();
        let capture = log::capture();
        let config = create_config(&app).await;
        let valid = member(M {
            gender: Some("Prefer not to say"),
            ..Default::default()
        });
        let blank_row = member(M {
            team_name: Some("  "),
            first_name: Some("Ann"),
            last_name: Some(" "),
            email: Some(""),
            ..Default::default()
        });
        let other = member(M {
            gender: Some("Other"),
            ..Default::default()
        });
        let no_first = member(M {
            first_name: Some(""),
            email: Some("x@example.com"),
            ..Default::default()
        });
        let repeated = member(M {
            gender: Some("Other"),
            ..Default::default()
        });
        exporter.resolve(vec![valid, blank_row, other, no_first.clone(), repeated]);

        let summary = run_gameday_import_with_history(
            &app.state,
            &config,
            GamedayImportRunTrigger::Scheduled,
        )
        .await
        .unwrap();

        assert_eq!(summary.rows_imported, 3);
        assert_eq!(summary.users_created, 3);
        let expected = [
            "Skipped 2 invalid GameDay member rows.".to_string(),
            String::new(),
            "Rows skipped:".into(),
            "- Row 3".into(),
            "  Problems: missing team name; missing last name".into(),
            "  Team: <blank>".into(),
            "  First: \"Ann\"".into(),
            "  Last: <blank>".into(),
            "  Email: <blank>".into(),
            "- Row 5".into(),
            "  Problem: missing first name".into(),
            "  Team: \"Alpha\"".into(),
            "  First: <blank>".into(),
            format!("  Last: \"{}\"", no_first.last_name),
            "  Email: \"x@example.com\"".into(),
            String::new(),
            "Imported 2 unrecognised GameDay gender values as female gender matching:".into(),
            "- \"Other\"".into(),
            "- \"Prefer not to say\"".into(),
        ]
        .join("\n");
        assert_eq!(summary.note.as_deref(), Some(expected.as_str()));
        let warnings = capture.matching(log::Level::Warn, "unrecognised GameDay gender values");
        assert_eq!(
            warnings
                .iter()
                .filter(|line| line.contains("\"Prefer not to say\""))
                .count(),
            1
        );
        assert!(
            USER.maybe_one(app.db(), by_email("x@example.com"))
                .await
                .unwrap()
                .is_none()
        );

        let runs = runs(&app, &config).await;
        let run = &runs[0];
        assert_eq!(run.trigger, GamedayImportRunTrigger::Scheduled);
        assert_eq!(run.status, GamedayImportRunStatus::Succeeded);
        assert_eq!(run.rows_imported, Some(3.0));
        assert_eq!(run.note, summary.note);
    }

    #[tokio::test]
    async fn limits_the_invalid_row_details_in_the_note() {
        let Setup { app, exporter } = setup();
        let config = create_config(&app).await;
        exporter.resolve(
            (0..27)
                .map(|_| {
                    member(M {
                        team_name: Some(""),
                        ..Default::default()
                    })
                })
                .collect(),
        );

        let summary =
            run_gameday_import_with_history(&app.state, &config, GamedayImportRunTrigger::Manual)
                .await
                .unwrap();

        assert_eq!(summary.rows_imported, 0);
        let note = summary.note.unwrap_or_default();
        assert!(note.starts_with("Skipped 27 invalid GameDay member rows."));
        assert!(note.contains("- Row 26\n"));
        assert!(!note.contains("- Row 27\n"));
        assert!(note.ends_with("- 2 additional rows omitted from this note."));
    }

    #[tokio::test]
    async fn uses_singular_wording_for_one_invalid_row_one_omitted_row_and_one_gender() {
        let Setup { app, exporter } = setup();
        let config = create_config(&app).await;
        let mut members: Vec<GamedayExportMember> = (0..26)
            .map(|_| {
                member(M {
                    last_name: Some(""),
                    ..Default::default()
                })
            })
            .collect();
        members.push(member(M {
            gender: Some("Unknown"),
            ..Default::default()
        }));
        exporter.resolve(members);
        let summary =
            run_gameday_import_with_history(&app.state, &config, GamedayImportRunTrigger::Manual)
                .await
                .unwrap();
        let note = summary.note.unwrap_or_default();
        assert!(note.contains("Skipped 26 invalid GameDay member rows."));
        assert!(note.contains("- 1 additional row omitted from this note."));
        assert!(note.contains(
            "Imported 1 unrecognised GameDay gender value as female gender matching:\n- \"Unknown\""
        ));

        let single = create_config(&app).await;
        exporter.resolve(vec![member(M {
            team_name: Some(""),
            ..Default::default()
        })]);
        let single_summary =
            run_gameday_import_with_history(&app.state, &single, GamedayImportRunTrigger::Manual)
                .await
                .unwrap();
        assert_eq!(
            single_summary.note.unwrap_or_default().split('\n').next(),
            Some("Skipped 1 invalid GameDay member row.")
        );
    }

    #[tokio::test]
    async fn records_a_failed_run_and_rethrows_the_export_error() {
        let Setup { app, exporter } = setup();
        let config = create_config(&app).await;
        let error =
            AppError::internal_from("GameDay export failed. Login stayed on the login page.");
        exporter.reject(error.clone());

        let result =
            run_gameday_import_with_history(&app.state, &config, GamedayImportRunTrigger::Manual)
                .await;
        assert_eq!(result.unwrap_err(), error);

        let runs = runs(&app, &config).await;
        let run = &runs[0];
        assert_eq!(run.status, GamedayImportRunStatus::Failed);
        assert_eq!(
            run.error_message.as_deref(),
            Some("GameDay export failed. Login stayed on the login page.")
        );
        assert!(run.finished_on.is_some());
        assert_eq!(run.rows_imported, None);
        assert_eq!(
            TEAM.count(app.db(), Team::SEASON_ID.eq(&config.season_id))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn records_non_error_failures_as_text() {
        let Setup { app, exporter } = setup();
        let config = create_config(&app).await;
        // a thrown string becomes an error whose message is the string
        let plain = to_app_error(
            ErrorInput::Value(Some(Value::String("plain failure".into()))),
            ErrorOptions::default(),
        );
        exporter.reject(plain.clone());
        let result =
            run_gameday_import_with_history(&app.state, &config, GamedayImportRunTrigger::Manual)
                .await;
        assert_eq!(result.unwrap_err().message, plain.message);
        let runs = runs(&app, &config).await;
        assert_eq!(
            runs[0].error_message.as_deref(),
            Some(plain.message.as_str())
        );
    }

    #[tokio::test]
    async fn fails_the_run_when_the_stored_password_cannot_be_decrypted() {
        let Setup { app, exporter } = setup();
        let config = create_config(&app).await;
        let broken = GAMEDAY_IMPORT_CONFIG
            .update_one(
                app.db(),
                GamedayImportConfig::ID.eq(&config.id),
                Patch::new().set(GamedayImportConfig::PASSWORD_ENCRYPTED, "plain-text"),
            )
            .await
            .unwrap();

        let error =
            run_gameday_import_with_history(&app.state, &broken, GamedayImportRunTrigger::Manual)
                .await
                .unwrap_err();
        assert_eq!(
            error.message,
            "Stored GameDay password is not in a supported format."
        );
        assert!(exporter.calls().is_empty());
        let runs = runs(&app, &config).await;
        assert_eq!(runs[0].status, GamedayImportRunStatus::Failed);
    }
}
