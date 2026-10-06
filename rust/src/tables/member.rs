//! Port of `server/src/tables/$Member.ts`.

use super::{default_id, default_now};
use crate::columns;
use crate::db::Record;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::shared::schemas::{Member, io_member};

columns!(Member {
    ID: String = "id" / "id"(Text),
    CREATED_ON: String = "createdOn" / "created_on"(Text),
    UPDATED_ON: String = "updatedOn" / "updated_on"(Text),
    USER_ID: String = "userId" / "user_id"(Text),
    SEASON_ID: String = "seasonId" / "season_id"(Text),
    TEAM_ID: String = "teamId" / "team_id"(Text),
    IS_MOCK: bool = "isMock" / "is_mock"(Bool),
    CAPTAIN: bool = "captain" / "captain"(Bool),
    PENDING: bool = "pending" / "pending"(Bool),
});

pub static TABLE: TableDef = TableDef {
    key: "member",
    sql: "member",
    columns: &[
        Member::ID.def,
        Member::CREATED_ON.def,
        Member::UPDATED_ON.def,
        Member::USER_ID.def,
        Member::SEASON_ID.def,
        Member::TEAM_ID.def,
        Member::IS_MOCK.def,
        Member::CAPTAIN.def,
        Member::PENDING.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("userId", Asc), ("seasonId", Asc)]),
        IndexDef::new(&[("teamId", Asc), ("userId", Asc)]),
        IndexDef::new(&[("teamId", Asc), ("pending", Asc)]),
        IndexDef::new(&[("userId", Asc), ("pending", Asc)]),
        IndexDef::new(&[("createdOn", Asc)]),
    ],
    schema: io_member,
    defaults: &[
        ("id", default_id),
        ("createdOn", default_now),
        ("updatedOn", default_now),
    ],
};

impl Record for Member {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
