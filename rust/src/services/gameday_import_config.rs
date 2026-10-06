//! Port of `server/src/services/gamedayImportConfig.ts`: a season's GameDay
//! credentials and schedule, and manual imports.

use crate::app::AppState;
use crate::db::{Filter, Patch, Query};
use crate::gameday::credentials::{encrypt_gameday_password, to_safe_gameday_import_config};
use crate::gameday::import_members::{GamedayImportSummary, run_gameday_import_with_history};
use crate::js::date::{now_ms, to_iso_string};
use crate::log;
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error, conflict_error};
use crate::shared::schemas::{
    GamedayImportConfig, GamedayImportConfigSafe, GamedayImportRun, GamedayImportRunTrigger, Season,
};
use crate::tables::{GAMEDAY_IMPORT_CONFIG, GAMEDAY_IMPORT_RUN, SEASON};
use crate::utils::random::generate_id;
use serde::{Deserialize, Serialize};
use serde_json::json;

const GAMEDAY_IMPORT_RUN_HISTORY_LIMIT: u64 = 50;
const GAMEDAY_MANUAL_IMPORT_LOCK_MS: i64 = 30 * 60 * 1000;

/// `TGamedayImportSavePayload` (the validated `PortGamedayImportSave` payload).
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayImportSavePayload {
    pub season_id: String,
    pub username: String,
    pub password: Option<String>,
    pub association: String,
    pub competition: String,
    pub schedule_enabled: bool,
    pub schedule_start_on: Option<String>,
    pub schedule_end_on: Option<String>,
}

/// `TGamedayImportScheduleFields`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct GamedayImportScheduleFields {
    pub schedule_enabled: bool,
    pub schedule_start_on: Option<String>,
    pub schedule_end_on: Option<String>,
}

/// The `PortGamedayImportLoad` result.
#[derive(Clone, Debug, Serialize)]
pub struct GamedayImportState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<GamedayImportConfigSafe>,
    pub runs: Vec<GamedayImportRun>,
}

/// `loadGamedayImportState(seasonId)`: the saved config (without secrets)
/// and the latest runs.
pub async fn load_gameday_import_state(
    state: &AppState,
    season_id: &str,
) -> AppResult<GamedayImportState> {
    let db = &state.db;
    SEASON.get_one(db, Season::ID.eq(season_id)).await?;
    let config = GAMEDAY_IMPORT_CONFIG
        .maybe_one(db, GamedayImportConfig::SEASON_ID.eq(season_id))
        .await?;
    let runs = GAMEDAY_IMPORT_RUN
        .get_many(
            db,
            GamedayImportRun::SEASON_ID.eq(season_id),
            Query::new()
                .sort([GamedayImportRun::STARTED_ON.desc()])
                .limit(GAMEDAY_IMPORT_RUN_HISTORY_LIMIT),
        )
        .await?;
    Ok(GamedayImportState {
        config: config.as_ref().map(to_safe_gameday_import_config),
        runs,
    })
}

/// `saveGamedayImportConfig(body)`: creates or updates a season's config and
/// returns it without secrets.
pub async fn save_gameday_import_config(
    state: &AppState,
    body: GamedayImportSavePayload,
) -> AppResult<GamedayImportConfigSafe> {
    let db = &state.db;
    SEASON.get_one(db, Season::ID.eq(&body.season_id)).await?;
    let existing = GAMEDAY_IMPORT_CONFIG
        .maybe_one(db, GamedayImportConfig::SEASON_ID.eq(&body.season_id))
        .await?;
    let saved = match existing {
        Some(existing) => update_gameday_import_config(state, &existing, &body).await?,
        None => create_gameday_import_config(state, &body).await?,
    };
    Ok(to_safe_gameday_import_config(&saved))
}

fn unlocked_filter(now_iso: &str) -> Filter {
    Filter::or([
        GamedayImportConfig::SCHEDULE_LOCKED_UNTIL.missing(),
        GamedayImportConfig::SCHEDULE_LOCKED_UNTIL.lte(now_iso),
    ])
}

/// `runManualGamedayImport(seasonId)`: runs the import now, sharing the
/// scheduler's lock so only one import per season runs at a time.
pub async fn run_manual_gameday_import(
    state: &AppState,
    season_id: &str,
) -> AppResult<GamedayImportSummary> {
    let db = &state.db;
    let config = get_gameday_import_config_for_season(state, season_id).await?;
    let now = now_ms();
    let lock_token = generate_id();
    // one conditional UPDATE takes the lock atomically, even across servers
    let locked_count = GAMEDAY_IMPORT_CONFIG
        .update_many(
            db,
            GamedayImportConfig::ID
                .eq(&config.id)
                .and_also(unlocked_filter(&to_iso_string(now))),
            Patch::new()
                .set(
                    GamedayImportConfig::SCHEDULE_LOCKED_UNTIL,
                    to_iso_string(now + GAMEDAY_MANUAL_IMPORT_LOCK_MS),
                )
                .set(GamedayImportConfig::SCHEDULE_LOCK_TOKEN, lock_token.clone()),
        )
        .await?;
    let locked = if locked_count > 0 {
        GAMEDAY_IMPORT_CONFIG
            .maybe_one(
                db,
                GamedayImportConfig::ID
                    .eq(&config.id)
                    .and_also(GamedayImportConfig::SCHEDULE_LOCK_TOKEN.eq(&lock_token)),
            )
            .await?
    } else {
        None
    };
    let Some(locked) = locked else {
        return Err(conflict_error(
            "A GameDay import is already running for this season.",
            ErrorOptions::code("gameday.import_running").with_user_message(
                "A GameDay import is already running. Try again when it finishes.",
            ),
        ));
    };
    let result =
        run_gameday_import_with_history(state, &locked, GamedayImportRunTrigger::Manual).await;
    let released = GAMEDAY_IMPORT_CONFIG
        .update_many(
            db,
            GamedayImportConfig::ID
                .eq(&config.id)
                .and_also(GamedayImportConfig::SCHEDULE_LOCK_TOKEN.eq(&lock_token)),
            Patch::new()
                .unset(GamedayImportConfig::SCHEDULE_LOCKED_UNTIL)
                .unset(GamedayImportConfig::SCHEDULE_LOCK_TOKEN),
        )
        .await;
    if let Err(error) = released {
        log::error(format!(
            "Failed to release GameDay import lock. {}",
            error.message
        ));
    }
    result
}

/// `readNewGamedayPassword(body)`: the new password, or `None` to keep the
/// stored one.
pub fn read_new_gameday_password(password: Option<&str>) -> Option<String> {
    password
        .filter(|p| !crate::js::trim(p).is_empty())
        .map(str::to_string)
}

/// `readGamedayScheduleFields(body)`: the schedule fields to store,
/// validating the date range when enabled.
pub fn read_gameday_schedule_fields(
    body: &GamedayImportScheduleFields,
) -> AppResult<GamedayImportScheduleFields> {
    if !body.schedule_enabled {
        return Ok(GamedayImportScheduleFields::default());
    }
    let (Some(start), Some(end)) = (
        body.schedule_start_on.as_deref().filter(|v| !v.is_empty()),
        body.schedule_end_on.as_deref().filter(|v| !v.is_empty()),
    ) else {
        return Err(bad_request_error(
            "GameDay schedule date range is required.",
            ErrorOptions::code("gameday.schedule_dates_missing").with_user_message(
                "Choose schedule start and end dates before enabling the schedule.",
            ),
        ));
    };
    // `Date.parse(a) > Date.parse(b)` is false when either is NaN
    if let (Some(start_ms), Some(end_ms)) =
        (crate::js::date::parse(start), crate::js::date::parse(end))
        && start_ms > end_ms
    {
        return Err(bad_request_error(
            "GameDay schedule start date must be before the end date.",
            ErrorOptions::code("gameday.schedule_date_range_invalid")
                .with_user_message("Choose a GameDay schedule start date before the end date."),
        ));
    }
    Ok(GamedayImportScheduleFields {
        schedule_enabled: true,
        schedule_start_on: Some(start.to_string()),
        schedule_end_on: Some(end.to_string()),
    })
}

/// `hasGamedayScheduleChanged(existing, next)`.
pub fn has_gameday_schedule_changed(
    existing: &GamedayImportScheduleFields,
    next: &GamedayImportScheduleFields,
) -> bool {
    existing != next
}

fn schedule_of(body: &GamedayImportSavePayload) -> GamedayImportScheduleFields {
    GamedayImportScheduleFields {
        schedule_enabled: body.schedule_enabled,
        schedule_start_on: body.schedule_start_on.clone(),
        schedule_end_on: body.schedule_end_on.clone(),
    }
}

async fn get_gameday_import_config_for_season(
    state: &AppState,
    season_id: &str,
) -> AppResult<GamedayImportConfig> {
    SEASON.get_one(&state.db, Season::ID.eq(season_id)).await?;
    GAMEDAY_IMPORT_CONFIG
        .maybe_one(&state.db, GamedayImportConfig::SEASON_ID.eq(season_id))
        .await?
        .ok_or_else(|| {
            bad_request_error(
                "GameDay credentials have not been saved for this season.",
                ErrorOptions::code("gameday.credentials_missing")
                    .with_user_message("Save GameDay credentials before running the import."),
            )
        })
}

async fn create_gameday_import_config(
    state: &AppState,
    body: &GamedayImportSavePayload,
) -> AppResult<GamedayImportConfig> {
    let Some(password) = read_new_gameday_password(body.password.as_deref()) else {
        return Err(bad_request_error(
            "GameDay password is required.",
            ErrorOptions::code("gameday.password_missing")
                .with_user_message("Enter the GameDay password before saving credentials."),
        ));
    };
    let schedule = read_gameday_schedule_fields(&schedule_of(body))?;
    let mut value = json!({
        "seasonId": body.season_id,
        "username": body.username,
        "passwordEncrypted": encrypt_gameday_password(&state.config.jwt_secret, &password)?,
        "association": body.association,
        "competition": body.competition,
        "scheduleEnabled": schedule.schedule_enabled,
    });
    if let Some(map) = value.as_object_mut() {
        if let Some(start) = schedule.schedule_start_on {
            map.insert("scheduleStartOn".into(), start.into());
        }
        if let Some(end) = schedule.schedule_end_on {
            map.insert("scheduleEndOn".into(), end.into());
        }
    }
    GAMEDAY_IMPORT_CONFIG.create_one(&state.db, value).await
}

async fn update_gameday_import_config(
    state: &AppState,
    existing: &GamedayImportConfig,
    body: &GamedayImportSavePayload,
) -> AppResult<GamedayImportConfig> {
    let schedule = read_gameday_schedule_fields(&schedule_of(body))?;
    let password = read_new_gameday_password(body.password.as_deref());
    let current = GamedayImportScheduleFields {
        schedule_enabled: existing.schedule_enabled,
        schedule_start_on: existing.schedule_start_on.clone(),
        schedule_end_on: existing.schedule_end_on.clone(),
    };
    let schedule_changed = has_gameday_schedule_changed(&current, &schedule);
    let mut patch = Patch::new()
        .set(GamedayImportConfig::USERNAME, body.username.clone())
        .set(GamedayImportConfig::ASSOCIATION, body.association.clone())
        .set(GamedayImportConfig::COMPETITION, body.competition.clone())
        .set(GamedayImportConfig::UPDATED_ON, crate::js::date::now_iso())
        .set(
            GamedayImportConfig::SCHEDULE_ENABLED,
            schedule.schedule_enabled,
        )
        .set_opt(
            GamedayImportConfig::SCHEDULE_START_ON,
            schedule.schedule_start_on,
        )
        .set_opt(
            GamedayImportConfig::SCHEDULE_END_ON,
            schedule.schedule_end_on,
        );
    if let Some(password) = password {
        patch = patch.set(
            GamedayImportConfig::PASSWORD_ENCRYPTED,
            encrypt_gameday_password(&state.config.jwt_secret, &password)?,
        );
    }
    if schedule_changed {
        patch = patch.unset(GamedayImportConfig::LAST_SCHEDULED_RUN_KEY);
    }
    GAMEDAY_IMPORT_CONFIG
        .update_one(&state.db, GamedayImportConfig::ID.eq(&existing.id), patch)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(
        enabled: bool,
        start: Option<&str>,
        end: Option<&str>,
    ) -> GamedayImportScheduleFields {
        GamedayImportScheduleFields {
            schedule_enabled: enabled,
            schedule_start_on: start.map(str::to_string),
            schedule_end_on: end.map(str::to_string),
        }
    }

    mod read_new_gameday_password_tests {
        use super::*;

        #[test]
        fn keeps_the_existing_password_when_none_or_a_blank_one_is_given() {
            assert_eq!(read_new_gameday_password(None), None);
            assert_eq!(read_new_gameday_password(Some("   ")), None);
        }

        #[test]
        fn returns_the_password_untrimmed() {
            assert_eq!(
                read_new_gameday_password(Some(" secret ")).as_deref(),
                Some(" secret ")
            );
        }
    }

    mod read_gameday_schedule_fields_tests {
        use super::*;

        #[test]
        fn clears_the_date_range_when_the_schedule_is_disabled() {
            assert_eq!(
                read_gameday_schedule_fields(&fields(
                    false,
                    Some("2026-01-01"),
                    Some("2026-02-01")
                ))
                .unwrap(),
                fields(false, None, None)
            );
        }

        #[test]
        fn keeps_a_valid_date_range() {
            let value = fields(true, Some("2026-01-01"), Some("2026-01-01"));
            assert_eq!(read_gameday_schedule_fields(&value).unwrap(), value);
        }

        #[test]
        fn requires_both_dates_when_enabled() {
            assert_eq!(
                read_gameday_schedule_fields(&fields(true, Some("2026-01-01"), None))
                    .unwrap_err()
                    .message,
                "GameDay schedule date range is required."
            );
        }

        #[test]
        fn rejects_a_start_date_after_the_end_date() {
            assert_eq!(
                read_gameday_schedule_fields(&fields(true, Some("2026-02-01"), Some("2026-01-01")))
                    .unwrap_err()
                    .message,
                "GameDay schedule start date must be before the end date."
            );
        }
    }

    mod has_gameday_schedule_changed_tests {
        use super::*;

        fn schedule() -> GamedayImportScheduleFields {
            fields(true, Some("2026-01-01"), Some("2026-02-01"))
        }

        #[test]
        fn is_false_for_the_same_schedule() {
            assert!(!has_gameday_schedule_changed(&schedule(), &schedule()));
        }

        #[test]
        fn is_true_when_any_schedule_field_differs() {
            assert!(has_gameday_schedule_changed(
                &schedule(),
                &GamedayImportScheduleFields {
                    schedule_enabled: false,
                    ..schedule()
                }
            ));
            assert!(has_gameday_schedule_changed(
                &schedule(),
                &GamedayImportScheduleFields {
                    schedule_end_on: Some("2026-03-01".into()),
                    ..schedule()
                }
            ));
        }
    }
}
