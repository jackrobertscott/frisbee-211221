//! Port of `server/src/tables/$Fixture.ts`. `games` is a JSON array column.

use super::{default_id, default_now};
use crate::columns;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::db::Record;
use crate::shared::schemas::{io_fixture, Fixture, FixtureGame};

columns!(Fixture {
    ID: String = "id" / "id" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    UPDATED_ON: String = "updatedOn" / "updated_on" (Text),
    SEASON_ID: String = "seasonId" / "season_id" (Text),
    USER_ID: String = "userId" / "user_id" (Text),
    TITLE: String = "title" / "title" (Text),
    DATE: String = "date" / "date" (Text),
    GAMES: Vec<FixtureGame> = "games" / "games" (Json),
    GRADING: bool = "grading" / "grading" (Bool),
});

pub static TABLE: TableDef = TableDef {
    key: "fixture",
    sql: "fixture",
    columns: &[
        Fixture::ID.def,
        Fixture::CREATED_ON.def,
        Fixture::UPDATED_ON.def,
        Fixture::SEASON_ID.def,
        Fixture::USER_ID.def,
        Fixture::TITLE.def,
        Fixture::DATE.def,
        Fixture::GAMES.def,
        Fixture::GRADING.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("seasonId", Asc), ("date", Asc)]),
        IndexDef::new(&[("userId", Asc)]),
        IndexDef::new(&[("createdOn", Asc)]),
    ],
    schema: io_fixture,
    defaults: &[("id", default_id), ("createdOn", default_now), ("updatedOn", default_now)],
};

impl Record for Fixture {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
