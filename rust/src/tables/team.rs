//! Port of `server/src/tables/$Team.ts`.

use super::{default_id, default_now};
use crate::columns;
use crate::db::Record;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::shared::schemas::{Team, io_team};

columns!(Team {
    ID: String = "id" / "id"(Text),
    CREATED_ON: String = "createdOn" / "created_on"(Text),
    UPDATED_ON: String = "updatedOn" / "updated_on"(Text),
    SEASON_ID: String = "seasonId" / "season_id"(Text),
    IS_MOCK: bool = "isMock" / "is_mock"(Bool),
    NAME: String = "name" / "name"(Text),
    COLOR: String = "color" / "color"(Text),
    DIVISION: f64 = "division" / "division"(Real),
    PHONE: String = "phone" / "phone"(Text),
    EMAIL: String = "email" / "email"(Text),
});

pub static TABLE: TableDef = TableDef {
    key: "team",
    sql: "team",
    columns: &[
        Team::ID.def,
        Team::CREATED_ON.def,
        Team::UPDATED_ON.def,
        Team::SEASON_ID.def,
        Team::IS_MOCK.def,
        Team::NAME.def,
        Team::COLOR.def,
        Team::DIVISION.def,
        Team::PHONE.def,
        Team::EMAIL.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("seasonId", Asc), ("division", Asc), ("name", Asc)]),
        IndexDef::new(&[("seasonId", Asc), ("name", Asc)]),
        IndexDef::new(&[("seasonId", Asc), ("phone", Asc), ("name", Asc)]),
        IndexDef::new(&[("seasonId", Asc), ("email", Asc), ("name", Asc)]),
        IndexDef::new(&[("seasonId", Asc), ("createdOn", Desc)]),
        IndexDef::new(&[("createdOn", Asc)]),
        IndexDef::new(&[("isMock", Asc)]),
    ],
    schema: io_team,
    defaults: &[
        ("id", default_id),
        ("createdOn", default_now),
        ("updatedOn", default_now),
    ],
};

impl Record for Team {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
