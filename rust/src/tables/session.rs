//! Port of `server/src/tables/$Session.ts`.

use super::{default_id, default_now};
use crate::columns;
use crate::db::Record;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::shared::schemas::{Session, io_session};

columns!(Session {
    ID: String = "id" / "id"(Text),
    CREATED_ON: String = "createdOn" / "created_on"(Text),
    UPDATED_ON: String = "updatedOn" / "updated_on"(Text),
    EXPIRES_ON: String = "expiresOn" / "expires_on"(Text),
    TOKEN: String = "token" / "token"(Text),
    USER_ID: String = "userId" / "user_id"(Text),
    ENDED: bool = "ended" / "ended"(Bool),
    ENDED_ON: String = "endedOn" / "ended_on"(Text),
    USER_AGENT: String = "userAgent" / "user_agent"(Text),
});

pub static TABLE: TableDef = TableDef {
    key: "session",
    sql: "session",
    columns: &[
        Session::ID.def,
        Session::CREATED_ON.def,
        Session::UPDATED_ON.def,
        Session::EXPIRES_ON.def,
        Session::TOKEN.def,
        Session::USER_ID.def,
        Session::ENDED.def,
        Session::ENDED_ON.def,
        Session::USER_AGENT.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("userId", Asc)]),
        IndexDef::new(&[("expiresOn", Asc)]),
    ],
    schema: io_session,
    defaults: &[
        ("id", default_id),
        ("createdOn", default_now),
        ("updatedOn", default_now),
    ],
};

impl Record for Session {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
