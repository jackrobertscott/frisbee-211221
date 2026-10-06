//! Port of `shared/src/schemas/ioGamedayImport.ts`.

use super::season::io_season;
use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

pub const GAMEDAY_IMPORT_RUN_TRIGGERS: [&str; 2] = ["manual", "scheduled"];
pub const GAMEDAY_IMPORT_RUN_STATUSES: [&str; 3] = ["running", "succeeded", "failed"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GamedayImportRunTrigger {
    Manual,
    Scheduled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GamedayImportRunStatus {
    Running,
    Succeeded,
    Failed,
}

io_schema! {
    pub fn io_gameday_import_config() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("seasonId", io_season().field("id")),
            ("username", io::string().trim()),
            ("passwordEncrypted", io::string()),
            ("association", io::string().trim()),
            ("competition", io::string().trim()),
            ("scheduleEnabled", io::boolean()),
            ("scheduleStartOn", io::optional(io::date())),
            ("scheduleEndOn", io::optional(io::date())),
            ("lastScheduledRunKey", io::optional(io::string().trim())),
            ("scheduleLockedUntil", io::optional(io::date())),
            ("scheduleLockToken", io::optional(io::id())),
        ])
    }
}

io_schema! {
    pub fn io_gameday_import_config_safe() {
        io_gameday_import_config()
            .omit(&["passwordEncrypted", "scheduleLockToken"])
            .extend([("hasPassword", io::boolean())])
    }
}

io_schema! {
    pub fn io_gameday_import_run() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("configId", io_gameday_import_config().field("id")),
            ("seasonId", io_season().field("id")),
            ("trigger", io::enumeration(&GAMEDAY_IMPORT_RUN_TRIGGERS)),
            ("status", io::enumeration(&GAMEDAY_IMPORT_RUN_STATUSES)),
            ("association", io::string().trim()),
            ("competition", io::string().trim()),
            ("startedOn", io::date()),
            ("finishedOn", io::optional(io::date())),
            ("rowsImported", io::optional(io::number())),
            ("teamsCreated", io::optional(io::number())),
            ("usersCreated", io::optional(io::number())),
            ("membersCreated", io::optional(io::number())),
            ("note", io::optional(io::string().emptyok())),
            ("errorMessage", io::optional(io::string().emptyok())),
        ])
    }
}

/// `TGamedayImportConfig`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayImportConfig {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub season_id: String,
    pub username: String,
    pub password_encrypted: String,
    pub association: String,
    pub competition: String,
    pub schedule_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_start_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_end_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_scheduled_run_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_locked_until: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_lock_token: Option<String>,
}

/// `TGamedayImportConfigSafe`: the config without secrets, plus `hasPassword`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayImportConfigSafe {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub season_id: String,
    pub username: String,
    pub association: String,
    pub competition: String,
    pub schedule_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_start_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_end_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_scheduled_run_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedule_locked_until: Option<String>,
    pub has_password: bool,
}

/// `TGamedayImportRun`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayImportRun {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub config_id: String,
    pub season_id: String,
    pub trigger: GamedayImportRunTrigger,
    pub status: GamedayImportRunStatus,
    pub association: String,
    pub competition: String,
    pub started_on: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows_imported: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub teams_created: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub users_created: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub members_created: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}
