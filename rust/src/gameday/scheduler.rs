//! Hook for `server/src/gameday/scheduler.ts`.
//!
//! The Port domain implements the scheduler here. Startup calls
//! [`start_gameday_import_scheduler`] once (see `crate::server::bootstrap`);
//! it must return immediately (spawn its own task) and honour
//! `Config::gameday_import_scheduler_disabled`.

use crate::app::AppState;

/// `startGamedayImportScheduler()`. Not implemented yet: does nothing.
pub fn start_gameday_import_scheduler(state: &AppState) {
    if state.config.gameday_import_scheduler_disabled {}
    // TODO(port domain): port the scheduler loop from gameday/scheduler.ts.
}
