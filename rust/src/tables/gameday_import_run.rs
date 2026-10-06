//! Port of `server/src/tables/$GamedayImportRun.ts`.

use super::{default_id, default_now};
use crate::columns;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::db::Record;
use crate::shared::schemas::{io_gameday_import_run, GamedayImportRun, GamedayImportRunStatus, GamedayImportRunTrigger};

columns!(GamedayImportRun {
    ID: String = "id" / "id" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    UPDATED_ON: String = "updatedOn" / "updated_on" (Text),
    CONFIG_ID: String = "configId" / "config_id" (Text),
    SEASON_ID: String = "seasonId" / "season_id" (Text),
    TRIGGER: GamedayImportRunTrigger = "trigger" / "trigger" (Text),
    STATUS: GamedayImportRunStatus = "status" / "status" (Text),
    ASSOCIATION: String = "association" / "association" (Text),
    COMPETITION: String = "competition" / "competition" (Text),
    STARTED_ON: String = "startedOn" / "started_on" (Text),
    FINISHED_ON: String = "finishedOn" / "finished_on" (Text),
    ROWS_IMPORTED: f64 = "rowsImported" / "rows_imported" (Real),
    TEAMS_CREATED: f64 = "teamsCreated" / "teams_created" (Real),
    USERS_CREATED: f64 = "usersCreated" / "users_created" (Real),
    MEMBERS_CREATED: f64 = "membersCreated" / "members_created" (Real),
    NOTE: String = "note" / "note" (Text),
    ERROR_MESSAGE: String = "errorMessage" / "error_message" (Text),
});

pub static TABLE: TableDef = TableDef {
    key: "gamedayImportRun",
    sql: "gameday_import_run",
    columns: &[
        GamedayImportRun::ID.def,
        GamedayImportRun::CREATED_ON.def,
        GamedayImportRun::UPDATED_ON.def,
        GamedayImportRun::CONFIG_ID.def,
        GamedayImportRun::SEASON_ID.def,
        GamedayImportRun::TRIGGER.def,
        GamedayImportRun::STATUS.def,
        GamedayImportRun::ASSOCIATION.def,
        GamedayImportRun::COMPETITION.def,
        GamedayImportRun::STARTED_ON.def,
        GamedayImportRun::FINISHED_ON.def,
        GamedayImportRun::ROWS_IMPORTED.def,
        GamedayImportRun::TEAMS_CREATED.def,
        GamedayImportRun::USERS_CREATED.def,
        GamedayImportRun::MEMBERS_CREATED.def,
        GamedayImportRun::NOTE.def,
        GamedayImportRun::ERROR_MESSAGE.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("seasonId", Asc), ("startedOn", Desc)]),
        IndexDef::new(&[("configId", Asc), ("startedOn", Desc)]),
        IndexDef::new(&[("status", Asc), ("startedOn", Desc)]),
    ],
    schema: io_gameday_import_run,
    defaults: &[("id", default_id), ("createdOn", default_now), ("updatedOn", default_now)],
};

impl Record for GamedayImportRun {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
