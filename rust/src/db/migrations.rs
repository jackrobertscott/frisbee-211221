//! Schema setup on startup (replaces `server/src/db/syncIndexes.ts`).
//!
//! 1. [`run_schema_migrations`] applies the numbered [`MIGRATIONS`] that are
//!    newer than `PRAGMA user_version`, each in its own transaction. Tables
//!    are only ever changed by adding a new migration.
//! 2. [`run_startup_index_sync`] then makes each table's indexes match its
//!    declaration (`TableDef::indexes`): unknown indexes are dropped, changed
//!    ones recreated and missing ones created — the same contract as the TS
//!    index sync, logging the same lines.
//!
//! Columns are declared without a type (no affinity) and without NOT NULL or
//! foreign-key constraints: the Mongo server enforced records only through
//! schema validation in the table layer, so legacy rows must still load.
//! Every table has `_seq INTEGER PRIMARY KEY`, the insertion order used when a
//! query does not sort (Mongo's natural order).

use super::schema::TableDef;
use crate::log;
use crate::shared::errors::{AppError, AppResult};
use rusqlite::Connection;

/// `(version, description, sql)`, applied in order.
pub const MIGRATIONS: &[(i64, &str, &str)] = &[(1, "create tables", MIGRATION_1)];

const MIGRATION_1: &str = r#"
CREATE TABLE "auth_attempt_limit" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "kind", "scope", "email", "ip",
    "attempts", "window_started_at", "blocked_until", "last_seen_at"
);
CREATE TABLE "fixture" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "season_id", "user_id", "title", "date",
    "games", "grading"
);
CREATE TABLE "gameday_import_config" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "season_id", "username", "password_encrypted",
    "association", "competition", "schedule_enabled", "schedule_start_on", "schedule_end_on",
    "last_scheduled_run_key", "schedule_locked_until", "schedule_lock_token"
);
CREATE TABLE "gameday_import_run" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "config_id", "season_id", "trigger", "status",
    "association", "competition", "started_on", "finished_on", "rows_imported",
    "teams_created", "users_created", "members_created", "note", "error_message"
);
CREATE TABLE "member" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "user_id", "season_id", "team_id", "is_mock",
    "captain", "pending"
);
CREATE TABLE "report" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "team_id", "team_against_id", "fixture_id", "user_id",
    "score_for", "score_against", "mvp_male", "mvp_male2", "mvp_female", "mvp_female2",
    "spirit", "spirit_comment", "spirit_p1", "spirit_p2", "spirit_p3", "spirit_p4", "spirit_p5"
);
CREATE TABLE "season" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "name", "sign_up_open", "is_hidden",
    "use_official_scoring", "gender_division", "final_results"
);
CREATE TABLE "session" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "expires_on", "token", "user_id", "ended",
    "ended_on", "user_agent"
);
CREATE TABLE "team" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "season_id", "is_mock", "name", "color",
    "division", "phone", "email"
);
CREATE TABLE "user" (
    "_seq" INTEGER PRIMARY KEY,
    "id", "created_on", "updated_on", "user_merged_ids", "admin", "is_mock",
    "first_name", "last_name", "gender_matching", "password", "avatar_url", "bio",
    "terms_accepted", "last_season_id", "gender"
);
CREATE TABLE "user_email" (
    "_seq" INTEGER PRIMARY KEY,
    "user_id" NOT NULL, "position" NOT NULL,
    "value", "verified", "code", "created_on", "is_primary"
);
CREATE INDEX "user_email__user_id" ON "user_email" ("user_id", "position");
CREATE TRIGGER "user_delete_emails" AFTER DELETE ON "user" BEGIN
    DELETE FROM "user_email" WHERE "user_id" = OLD."id";
END;
"#;

/// Indexes the migrations own (not declared on any table).
const MIGRATION_INDEXES: [&str; 1] = ["user_email__user_id"];

/// Applies pending migrations; returns how many ran.
pub fn run_schema_migrations(conn: &Connection) -> AppResult<usize> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let mut applied = 0;
    for (version, description, sql) in MIGRATIONS.iter().filter(|(version, _, _)| *version > current) {
        conn.execute_batch("BEGIN IMMEDIATE")?;
        let result = conn
            .execute_batch(sql)
            .and_then(|_| conn.pragma_update(None, "user_version", version));
        match result {
            Ok(()) => conn.execute_batch("COMMIT")?,
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(AppError::internal_from(format!("Migration {version} ({description}) failed: {error}")));
            }
        }
        log::log(format!("Applied SQLite migration {version}: {description}"));
        applied += 1;
    }
    Ok(applied)
}

/// The indexes currently on `table` (excluding automatic ones): `(name, sql)`.
fn existing_indexes(conn: &Connection, sql_table: &str) -> AppResult<Vec<(String, String)>> {
    let mut statement = conn.prepare(
        "SELECT name, COALESCE(sql, '') FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY rowid",
    )?;
    let rows = statement
        .query_map([sql_table], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// `runStartupIndexSync()` for the given tables, logging what changed.
pub fn sync_indexes(conn: &Connection, tables: &[&TableDef]) -> AppResult<()> {
    let mut lines = Vec::new();
    let result = sync_indexes_into(conn, tables, &mut lines);
    for line in lines {
        log::log(line);
    }
    result
}

/// The index sync, collecting its log lines into `lines`.
pub fn sync_indexes_into(conn: &Connection, tables: &[&TableDef], lines: &mut Vec<String>) -> AppResult<()> {
    lines.push("Syncing SQLite indexes...".into());
    for table in tables {
        if let Some(line) = sync_table_indexes(conn, table)? {
            lines.push(line);
        }
    }
    lines.push("SQLite indexes synced.".into());
    Ok(())
}

fn sync_table_indexes(conn: &Connection, table: &TableDef) -> AppResult<Option<String>> {
    let desired = table.compiled_indexes().map_err(AppError::internal_from)?;
    let mut sql_tables: Vec<String> = vec![table.sql.to_string()];
    sql_tables.extend(table.children().map(|child| child.table.to_string()));
    let prefix = format!("{}__", table.sql);
    let mut existing = Vec::new();
    for sql_table in &sql_tables {
        for (name, sql) in existing_indexes(conn, sql_table)? {
            if MIGRATION_INDEXES.contains(&name.as_str()) {
                continue;
            }
            existing.push((name, sql));
        }
    }
    let display = |sql_name: &str| sql_name.strip_prefix(&prefix).unwrap_or(sql_name).to_string();

    let mut dropped = Vec::new();
    for (name, sql) in &existing {
        let matches = desired.iter().any(|index| &index.sql_name == name && &index.create_sql == sql);
        if !matches {
            conn.execute_batch(&format!("DROP INDEX \"{name}\""))?;
            dropped.push(display(name));
        }
    }
    let current: Vec<String> = existing_indexes_for(conn, &sql_tables)?;
    let mut created = Vec::new();
    for index in &desired {
        if current.contains(&index.sql_name) {
            continue;
        }
        conn.execute_batch(&index.create_sql)?;
        created.push(index.name.clone());
    }
    if dropped.is_empty() && created.is_empty() {
        return Ok(None);
    }
    let mut parts = vec![format!("- {}", table.key)];
    if !dropped.is_empty() {
        parts.push(format!("dropped: {}", dropped.join(", ")));
    }
    if !created.is_empty() {
        parts.push(format!("created: {}", created.join(", ")));
    }
    Ok(Some(parts.join(" | ")))
}

fn existing_indexes_for(conn: &Connection, sql_tables: &[String]) -> AppResult<Vec<String>> {
    let mut names = Vec::new();
    for sql_table in sql_tables {
        names.extend(existing_indexes(conn, sql_table)?.into_iter().map(|(name, _)| name));
    }
    Ok(names)
}

/// Every index name declared on `table` (`table.indexes().map(i => i.name)`).
pub fn declared_index_names(table: &TableDef) -> Vec<String> {
    table.compiled_indexes().map(|indexes| indexes.into_iter().map(|i| i.name).collect()).unwrap_or_default()
}

/// The non-automatic index names currently on a table and its child tables.
pub fn index_names(conn: &Connection, table: &TableDef) -> AppResult<Vec<String>> {
    let mut sql_tables: Vec<String> = vec![table.sql.to_string()];
    sql_tables.extend(table.children().map(|child| child.table.to_string()));
    let prefix = format!("{}__", table.sql);
    let mut names: Vec<String> = existing_indexes_for(conn, &sql_tables)?
        .into_iter()
        .filter(|name| !MIGRATION_INDEXES.contains(&name.as_str()))
        .map(|name| name.strip_prefix(&prefix).unwrap_or(&name).to_string())
        .collect();
    names.sort();
    Ok(names)
}

/// Migrations then index sync for every table: the startup schema task.
pub fn run_startup_schema(conn: &Connection) -> AppResult<()> {
    run_schema_migrations(conn)?;
    sync_indexes(conn, &crate::tables::all_tables())
}

#[cfg(test)]
#[path = "migrations_tests.rs"]
mod tests;

/// [`run_startup_schema`] without logging (test setup).
pub fn run_startup_schema_quiet(conn: &Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current < MIGRATIONS.last().map(|m| m.0).unwrap_or(0) {
        for (_, _, sql) in MIGRATIONS.iter().filter(|(version, _, _)| *version > current) {
            conn.execute_batch(sql)?;
        }
        conn.pragma_update(None, "user_version", MIGRATIONS.last().map(|m| m.0).unwrap_or(0))?;
    }
    sync_indexes_into(conn, &crate::tables::all_tables(), &mut Vec::new())
}
