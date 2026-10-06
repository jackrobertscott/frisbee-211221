//! Port of `server/src/tables/$User.ts`.
//!
//! `emails` lives in the `user_email` child table so emails can be indexed
//! and matched case-insensitively (`User::EMAILS.any(UserEmail::VALUE.eq_ci(email))`,
//! the Mongo `{'emails.value': email}` with `EMAIL_COLLATION`).
//! `userMergedIds` is a JSON array column. The legacy `gender` column holds
//! the pre-gender-matching value until the startup backfill removes it.

use super::{default_id, default_now};
use crate::columns;
use crate::db::filter::ChildCol;
use crate::db::schema::{ChildDef, Collation, ColumnDef, ColumnKind, Direction::*, IndexDef, TableDef};
use crate::db::Record;
use crate::shared::schemas::{io_user, GenderMatching, User, UserEmail};

/// `EMAIL_COLLATION`: case-insensitive email matching.
pub const EMAIL_COLLATION: Collation = Collation::CaseInsensitive;

columns!(UserEmail {
    VALUE: String = "value" / "value" (Text),
    VERIFIED: bool = "verified" / "verified" (Bool),
    CODE: String = "code" / "code" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    PRIMARY: bool = "primary" / "is_primary" (Bool),
});

pub static EMAILS: ChildDef = ChildDef {
    field: "emails",
    table: "user_email",
    parent_column: "user_id",
    position_column: "position",
    columns: &[
        UserEmail::VALUE.def,
        UserEmail::VERIFIED.def,
        UserEmail::CODE.def,
        UserEmail::CREATED_ON.def,
        UserEmail::PRIMARY.def,
    ],
};

columns!(User {
    ID: String = "id" / "id" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    UPDATED_ON: String = "updatedOn" / "updated_on" (Text),
    USER_MERGED_IDS: Vec<String> = "userMergedIds" / "user_merged_ids" (Json),
    ADMIN: bool = "admin" / "admin" (Bool),
    IS_MOCK: bool = "isMock" / "is_mock" (Bool),
    FIRST_NAME: String = "firstName" / "first_name" (Text),
    LAST_NAME: String = "lastName" / "last_name" (Text),
    GENDER_MATCHING: GenderMatching = "genderMatching" / "gender_matching" (Text),
    PASSWORD: String = "password" / "password" (Text),
    AVATAR_URL: String = "avatarUrl" / "avatar_url" (Text),
    BIO: String = "bio" / "bio" (Text),
    TERMS_ACCEPTED: bool = "termsAccepted" / "terms_accepted" (Bool),
    LAST_SEASON_ID: String = "lastSeasonId" / "last_season_id" (Text),
});

impl User {
    /// The `emails` array (child table).
    pub const EMAILS: ChildCol = ChildCol::new(&EMAILS);
}

const EMAILS_COLUMN: ColumnDef = ColumnDef::new("emails", "emails", ColumnKind::Children(&EMAILS));

/// The legacy `gender` field (pre gender matching).
pub const LEGACY_GENDER: ColumnDef = ColumnDef::new("gender", "gender", ColumnKind::Text);

pub static TABLE: TableDef = TableDef {
    key: "user",
    sql: "user",
    columns: &[
        User::ID.def,
        User::CREATED_ON.def,
        User::UPDATED_ON.def,
        User::USER_MERGED_IDS.def,
        User::ADMIN.def,
        User::IS_MOCK.def,
        User::FIRST_NAME.def,
        User::LAST_NAME.def,
        User::GENDER_MATCHING.def,
        User::PASSWORD.def,
        &EMAILS_COLUMN,
        User::AVATAR_URL.def,
        User::BIO.def,
        User::TERMS_ACCEPTED.def,
        User::LAST_SEASON_ID.def,
    ],
    legacy_columns: &[&LEGACY_GENDER],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("emails.value", Asc)]).collation(EMAIL_COLLATION),
        IndexDef::new(&[("firstName", Asc), ("lastName", Asc)]),
        IndexDef::new(&[("lastName", Asc), ("firstName", Asc)]),
        IndexDef::new(&[("genderMatching", Asc), ("lastName", Asc), ("firstName", Asc)]),
        IndexDef::new(&[("createdOn", Desc)]),
    ],
    schema: io_user,
    defaults: &[("id", default_id), ("createdOn", default_now), ("updatedOn", default_now)],
};

impl Record for User {
    fn table() -> &'static TableDef {
        &TABLE
    }
}

/// Legacy-data helpers for the gender matching backfill
/// (`migrations::user_gender_matching`).
pub mod legacy {
    use crate::shared::errors::AppResult;
    use crate::shared::schemas::GenderMatching;
    use rusqlite::Connection;
    use std::collections::HashMap;

    /// How many times each user was picked in a male or female MVP slot:
    /// `user id -> (male picks, female picks)`.
    pub fn mvp_slot_picks(conn: &Connection, user_ids: &[String]) -> AppResult<HashMap<String, (i64, i64)>> {
        if user_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let ids = serde_json::to_string(user_ids)?;
        let sql = r#"
            SELECT user_id, SUM(slot = 'male'), SUM(slot = 'female') FROM (
                SELECT "mvp_male" AS user_id, 'male' AS slot FROM "report" WHERE "mvp_male" IN (SELECT value FROM json_each(?1))
                UNION ALL SELECT "mvp_male2", 'male' FROM "report" WHERE "mvp_male2" IN (SELECT value FROM json_each(?1))
                UNION ALL SELECT "mvp_female", 'female' FROM "report" WHERE "mvp_female" IN (SELECT value FROM json_each(?1))
                UNION ALL SELECT "mvp_female2", 'female' FROM "report" WHERE "mvp_female2" IN (SELECT value FROM json_each(?1))
            ) GROUP BY user_id"#;
        let mut statement = conn.prepare(sql)?;
        let rows = statement.query_map([ids], |row| Ok((row.get::<_, String>(0)?, (row.get(1)?, row.get(2)?))))?;
        Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
    }

    /// Sets `genderMatching` and removes the legacy `gender` field.
    pub fn set_gender_matching_clearing_legacy(conn: &Connection, user_id: &str, gender_matching: GenderMatching) -> AppResult<()> {
        conn.execute(
            r#"UPDATE "user" SET "gender_matching" = ?1, "gender" = NULL WHERE "id" = ?2"#,
            (gender_matching.as_str(), user_id),
        )?;
        Ok(())
    }

    /// Stores a user the way they looked before gender matching existed
    /// (`gender` set, `genderMatching` missing). For tests and imports.
    pub fn set_legacy_gender(conn: &Connection, user_id: &str, gender: &str) -> AppResult<()> {
        conn.execute(r#"UPDATE "user" SET "gender" = ?1, "gender_matching" = NULL WHERE "id" = ?2"#, (gender, user_id))?;
        Ok(())
    }
}

pub use legacy::{mvp_slot_picks, set_gender_matching_clearing_legacy};
