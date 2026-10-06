//! Port of `server/src/tables/$GamedayImportConfig.ts`.

use super::{default_false, default_id, default_now};
use crate::columns;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::db::Record;
use crate::shared::schemas::{io_gameday_import_config, GamedayImportConfig};

columns!(GamedayImportConfig {
    ID: String = "id" / "id" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    UPDATED_ON: String = "updatedOn" / "updated_on" (Text),
    SEASON_ID: String = "seasonId" / "season_id" (Text),
    USERNAME: String = "username" / "username" (Text),
    PASSWORD_ENCRYPTED: String = "passwordEncrypted" / "password_encrypted" (Text),
    ASSOCIATION: String = "association" / "association" (Text),
    COMPETITION: String = "competition" / "competition" (Text),
    SCHEDULE_ENABLED: bool = "scheduleEnabled" / "schedule_enabled" (Bool),
    SCHEDULE_START_ON: String = "scheduleStartOn" / "schedule_start_on" (Text),
    SCHEDULE_END_ON: String = "scheduleEndOn" / "schedule_end_on" (Text),
    LAST_SCHEDULED_RUN_KEY: String = "lastScheduledRunKey" / "last_scheduled_run_key" (Text),
    SCHEDULE_LOCKED_UNTIL: String = "scheduleLockedUntil" / "schedule_locked_until" (Text),
    SCHEDULE_LOCK_TOKEN: String = "scheduleLockToken" / "schedule_lock_token" (Text),
});

pub static TABLE: TableDef = TableDef {
    key: "gamedayImportConfig",
    sql: "gameday_import_config",
    columns: &[
        GamedayImportConfig::ID.def,
        GamedayImportConfig::CREATED_ON.def,
        GamedayImportConfig::UPDATED_ON.def,
        GamedayImportConfig::SEASON_ID.def,
        GamedayImportConfig::USERNAME.def,
        GamedayImportConfig::PASSWORD_ENCRYPTED.def,
        GamedayImportConfig::ASSOCIATION.def,
        GamedayImportConfig::COMPETITION.def,
        GamedayImportConfig::SCHEDULE_ENABLED.def,
        GamedayImportConfig::SCHEDULE_START_ON.def,
        GamedayImportConfig::SCHEDULE_END_ON.def,
        GamedayImportConfig::LAST_SCHEDULED_RUN_KEY.def,
        GamedayImportConfig::SCHEDULE_LOCKED_UNTIL.def,
        GamedayImportConfig::SCHEDULE_LOCK_TOKEN.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("seasonId", Asc)]).unique(),
        IndexDef::new(&[("scheduleEnabled", Asc), ("updatedOn", Asc)]),
        IndexDef::new(&[("scheduleLockedUntil", Asc)]),
    ],
    schema: io_gameday_import_config,
    defaults: &[
        ("id", default_id),
        ("createdOn", default_now),
        ("updatedOn", default_now),
        ("scheduleEnabled", default_false),
    ],
};

impl Record for GamedayImportConfig {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
