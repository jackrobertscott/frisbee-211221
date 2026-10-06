//! Port of `server/src/gameday/scheduler.ts`: once a minute, runs the GameDay
//! imports whose daily run time (the time of day of `scheduleStartOn`) fell
//! within the last minute, between the schedule's start and end days.
//!
//! Several servers may share a database: each run is claimed with one
//! conditional UPDATE that sets `scheduleLockedUntil`, `scheduleLockToken`
//! and `lastScheduledRunKey`, so only one server runs a given day's import.

use super::import_members::{GamedayImportSummary, run_gameday_import_with_history};
use crate::app::AppState;
use crate::db::{Db, Filter, Patch, Query};
use crate::js::date::{now_iso, now_ms, to_iso_string};
use crate::log;
use crate::shared::errors::AppResult;
use crate::shared::schemas::{GamedayImportConfig, GamedayImportRunTrigger};
use crate::tables::GAMEDAY_IMPORT_CONFIG;
use crate::utils::random::generate_id;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

pub const CHECK_INTERVAL_MS: u64 = 60 * 1000;
/// Only run during the scheduler check window after the standard run time.
/// Missed windows are skipped instead of caught up later at arbitrary times.
const SCHEDULE_DUE_WINDOW_MS: i64 = CHECK_INTERVAL_MS as i64;
const SCHEDULE_LOCK_MS: i64 = 2 * 60 * 60 * 1000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const MAX_RUNS_PER_CHECK: usize = 3;
const MAX_CONFIGS_PER_CHECK: u64 = 100;

pub type RunFuture = Pin<Box<dyn Future<Output = AppResult<GamedayImportSummary>> + Send>>;
/// Runs one locked config's import (`runGamedayImportWithHistory`).
pub type ImportRunner =
    Arc<dyn Fn(GamedayImportConfig, GamedayImportRunTrigger) -> RunFuture + Send + Sync>;

/// The scheduler's state: the TS module's `timer` and `checking` flags.
pub struct GamedayImportScheduler {
    db: Db,
    runner: ImportRunner,
    interval: Duration,
    started: AtomicBool,
    checking: AtomicBool,
}

impl GamedayImportScheduler {
    pub fn new(db: Db, runner: ImportRunner, interval: Duration) -> Arc<Self> {
        Arc::new(GamedayImportScheduler {
            db,
            runner,
            interval,
            started: AtomicBool::new(false),
            checking: AtomicBool::new(false),
        })
    }

    /// Starts checking (now, then every interval) unless already started or
    /// `disabled`. Returns whether this call started it. Needs a tokio runtime.
    pub fn start(self: &Arc<Self>, disabled: bool) -> bool {
        if disabled || self.started.swap(true, Ordering::SeqCst) {
            return false;
        }
        log::log("Starting GameDay import scheduler...");
        let scheduler = self.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(scheduler.interval);
            ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                // the first tick completes at once
                ticks.tick().await;
                let check = scheduler.clone();
                // like `void checkDueGamedayImports()`: a slow check never
                // delays the timer, and overlapping checks are skipped
                tokio::spawn(async move { check.check_due_gameday_imports().await });
            }
        });
        true
    }

    /// `checkDueGamedayImports()`: runs up to three due imports, one at a time.
    pub async fn check_due_gameday_imports(&self) {
        if self.checking.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Err(error) = self.check_due().await {
            log::error(format!(
                "GameDay import scheduler failed. {}",
                error.message
            ));
        }
        self.checking.store(false, Ordering::SeqCst);
    }

    async fn check_due(&self) -> AppResult<()> {
        let now = now_ms();
        let configs = GAMEDAY_IMPORT_CONFIG
            .get_many(
                &self.db,
                GamedayImportConfig::SCHEDULE_ENABLED.eq(true),
                Query::new()
                    .sort([GamedayImportConfig::UPDATED_ON.asc()])
                    .limit(MAX_CONFIGS_PER_CHECK),
            )
            .await?;
        let due: Vec<GamedayImportConfig> = configs
            .into_iter()
            .filter(|config| is_gameday_import_due(config, now))
            .take(MAX_RUNS_PER_CHECK)
            .collect();
        for config in due {
            self.run_scheduled_gameday_import(config).await?;
        }
        Ok(())
    }

    async fn run_scheduled_gameday_import(&self, config: GamedayImportConfig) -> AppResult<()> {
        let now = now_ms();
        let Some(run_key) = read_due_schedule_run_key(&config, now) else {
            return Ok(());
        };
        let (Some(start_on), Some(end_on)) = (&config.schedule_start_on, &config.schedule_end_on)
        else {
            return Ok(());
        };

        let lock_token = generate_id();
        let now_text = to_iso_string(now);
        let locked_count = GAMEDAY_IMPORT_CONFIG
            .update_many(
                &self.db,
                Filter::and([
                    GamedayImportConfig::ID.eq(&config.id),
                    GamedayImportConfig::SCHEDULE_ENABLED.eq(true),
                    GamedayImportConfig::SCHEDULE_START_ON.eq(start_on),
                    GamedayImportConfig::SCHEDULE_END_ON.eq(end_on),
                    GamedayImportConfig::LAST_SCHEDULED_RUN_KEY.ne(&run_key),
                    Filter::or([
                        GamedayImportConfig::SCHEDULE_LOCKED_UNTIL.missing(),
                        GamedayImportConfig::SCHEDULE_LOCKED_UNTIL.lte(&now_text),
                    ]),
                ]),
                Patch::new()
                    .set(
                        GamedayImportConfig::SCHEDULE_LOCKED_UNTIL,
                        to_iso_string(now + SCHEDULE_LOCK_MS),
                    )
                    .set(GamedayImportConfig::SCHEDULE_LOCK_TOKEN, lock_token.clone())
                    .set(GamedayImportConfig::LAST_SCHEDULED_RUN_KEY, run_key)
                    .set(GamedayImportConfig::UPDATED_ON, now_text.clone()),
            )
            .await?;
        if locked_count == 0 {
            return Ok(());
        }

        let Some(locked) = GAMEDAY_IMPORT_CONFIG
            .maybe_one(
                &self.db,
                GamedayImportConfig::ID
                    .eq(&config.id)
                    .and_also(GamedayImportConfig::SCHEDULE_LOCK_TOKEN.eq(&lock_token)),
            )
            .await?
        else {
            return Ok(());
        };

        let season_id = locked.season_id.clone();
        let locked_id = locked.id.clone();
        if let Err(error) = (self.runner)(locked, GamedayImportRunTrigger::Scheduled).await {
            log::error(format!(
                "Scheduled GameDay import failed for season {season_id}. {}",
                error.message
            ));
        }
        let released = GAMEDAY_IMPORT_CONFIG
            .update_one(
                &self.db,
                GamedayImportConfig::ID.eq(&locked_id),
                Patch::new()
                    .unset(GamedayImportConfig::SCHEDULE_LOCKED_UNTIL)
                    .unset(GamedayImportConfig::SCHEDULE_LOCK_TOKEN)
                    .set(GamedayImportConfig::UPDATED_ON, now_iso()),
            )
            .await;
        if let Err(error) = released {
            log::error(format!(
                "Failed to release GameDay import schedule lock. {} ({})",
                error.message, error.error_code
            ));
        }
        Ok(())
    }
}

static SCHEDULER: OnceLock<Arc<GamedayImportScheduler>> = OnceLock::new();

/// `startGamedayImportScheduler()`: called once at startup; returns at once.
/// Does nothing when `GAMEDAY_IMPORT_SCHEDULER_DISABLED` is set or the
/// scheduler is already running.
pub fn start_gameday_import_scheduler(state: &AppState) {
    if state.config.gameday_import_scheduler_disabled {
        return;
    }
    let runner_state = state.clone();
    let runner: ImportRunner = Arc::new(move |config, trigger| {
        let state = runner_state.clone();
        Box::pin(async move { run_gameday_import_with_history(&state, &config, trigger).await })
    });
    let scheduler = SCHEDULER.get_or_init(|| {
        GamedayImportScheduler::new(
            state.db.clone(),
            runner,
            Duration::from_millis(CHECK_INTERVAL_MS),
        )
    });
    scheduler.start(false);
}

/// `isGamedayImportDue(config, now)`.
pub fn is_gameday_import_due(config: &GamedayImportConfig, now_ms: i64) -> bool {
    match read_due_schedule_run_key(config, now_ms) {
        Some(run_key) => config.last_scheduled_run_key.as_deref() != Some(run_key.as_str()),
        None => false,
    }
}

fn read_due_schedule_run_key(config: &GamedayImportConfig, now_ms: i64) -> Option<String> {
    let start_on = config.schedule_start_on.as_deref()?;
    let end_on = config.schedule_end_on.as_deref()?;
    let start_ms = crate::js::date::parse(start_on)?;
    let end_ms = crate::js::date::parse(end_on)? + DAY_MS - 1;
    if now_ms < start_ms || now_ms > end_ms {
        return None;
    }
    let day_index = (now_ms - start_ms).div_euclid(DAY_MS);
    let scheduled_ms = start_ms + day_index * DAY_MS;
    let due_until_ms = scheduled_ms + SCHEDULE_DUE_WINDOW_MS;
    if now_ms < scheduled_ms || now_ms >= due_until_ms {
        return None;
    }
    Some(format!("{start_on}:{day_index}"))
}

#[cfg(test)]
#[path = "scheduler_tests.rs"]
mod tests;
