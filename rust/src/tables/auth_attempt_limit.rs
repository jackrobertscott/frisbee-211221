//! Port of `server/src/tables/$AuthAttemptLimit.ts`.

use super::default_now;
use crate::columns;
use crate::db::Record;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::shared::schemas::{AttemptKind, AttemptScope, AuthAttemptLimit, io_auth_attempt_limit};

columns!(AuthAttemptLimit {
    ID: String = "id" / "id"(Text),
    CREATED_ON: String = "createdOn" / "created_on"(Text),
    UPDATED_ON: String = "updatedOn" / "updated_on"(Text),
    KIND: AttemptKind = "kind" / "kind"(Text),
    SCOPE: AttemptScope = "scope" / "scope"(Text),
    EMAIL: String = "email" / "email"(Text),
    IP: String = "ip" / "ip"(Text),
    ATTEMPTS: i64 = "attempts" / "attempts"(Integer),
    WINDOW_STARTED_AT: i64 = "windowStartedAt" / "window_started_at"(Integer),
    BLOCKED_UNTIL: i64 = "blockedUntil" / "blocked_until"(Integer),
    LAST_SEEN_AT: i64 = "lastSeenAt" / "last_seen_at"(Integer),
});

pub static TABLE: TableDef = TableDef {
    key: "authAttemptLimit",
    sql: "auth_attempt_limit",
    columns: &[
        AuthAttemptLimit::ID.def,
        AuthAttemptLimit::CREATED_ON.def,
        AuthAttemptLimit::UPDATED_ON.def,
        AuthAttemptLimit::KIND.def,
        AuthAttemptLimit::SCOPE.def,
        AuthAttemptLimit::EMAIL.def,
        AuthAttemptLimit::IP.def,
        AuthAttemptLimit::ATTEMPTS.def,
        AuthAttemptLimit::WINDOW_STARTED_AT.def,
        AuthAttemptLimit::BLOCKED_UNTIL.def,
        AuthAttemptLimit::LAST_SEEN_AT.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("blockedUntil", Asc), ("lastSeenAt", Asc)]),
    ],
    schema: io_auth_attempt_limit,
    defaults: &[("createdOn", default_now), ("updatedOn", default_now)],
};

impl Record for AuthAttemptLimit {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
