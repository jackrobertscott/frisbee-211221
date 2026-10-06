//! Port of `server/src/tables/*`: one module per table with its typed
//! columns (`Team::NAME`), table declaration and [`Table`] constant.
//!
//! This module and `crate::db` are the only places that know SQL table and
//! column names; everything else goes through these typed helpers (or a
//! query function in `crate::queries` built from them).

pub mod auth_attempt_limit;
pub mod fixture;
pub mod gameday_import_config;
pub mod gameday_import_run;
pub mod member;
pub mod report;
pub mod season;
pub mod session;
pub mod team;
pub mod user;

use crate::db::schema::TableDef;
use crate::db::Table;
use crate::shared::schemas::{
    AuthAttemptLimit, Fixture, GamedayImportConfig, GamedayImportRun, Member, Report, Season, Session, Team, User,
};
use serde_json::Value;

pub const AUTH_ATTEMPT_LIMIT: Table<AuthAttemptLimit> = Table::new();
pub const FIXTURE: Table<Fixture> = Table::new();
pub const GAMEDAY_IMPORT_CONFIG: Table<GamedayImportConfig> = Table::new();
pub const GAMEDAY_IMPORT_RUN: Table<GamedayImportRun> = Table::new();
pub const MEMBER: Table<Member> = Table::new();
pub const REPORT: Table<Report> = Table::new();
pub const SEASON: Table<Season> = Table::new();
pub const SESSION: Table<Session> = Table::new();
pub const TEAM: Table<Team> = Table::new();
pub const USER: Table<User> = Table::new();

/// Every table, for startup work that applies to all of them.
pub fn all_tables() -> [&'static TableDef; 10] {
    [
        &auth_attempt_limit::TABLE,
        &fixture::TABLE,
        &gameday_import_config::TABLE,
        &gameday_import_run::TABLE,
        &member::TABLE,
        &report::TABLE,
        &season::TABLE,
        &session::TABLE,
        &team::TABLE,
        &user::TABLE,
    ]
}

/// Default: a new 24-character id.
pub fn default_id() -> Value {
    Value::String(crate::utils::random::generate_id())
}

/// Default: the current time as an ISO string.
pub fn default_now() -> Value {
    Value::String(crate::js::date::now_iso())
}

/// Default: `false`.
pub fn default_false() -> Value {
    Value::Bool(false)
}

/// Declares typed column constants on a record type:
/// `columns!(Team { ID: String = "id" / "id" (Text), ... })`.
#[macro_export]
macro_rules! columns {
    ($record:ty { $($name:ident : $ty:ty = $field:literal / $sql:literal ($kind:ident)),* $(,)? }) => {
        impl $record {
            $(
                pub const $name: $crate::db::Col<$ty> = $crate::db::Col::new(&$crate::db::schema::ColumnDef::new(
                    $field,
                    $sql,
                    $crate::db::schema::ColumnKind::$kind,
                ));
            )*
        }
    };
}
