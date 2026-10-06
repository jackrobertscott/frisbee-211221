//! One-off import of the TS server's MongoDB data into the SQLite database
//! (`bin/migrate-mongo.rs`).
//!
//! 1. Read a `mongodump` directory or archive ([`dump`]).
//! 2. Prepare the SQLite file: refuse one holding data unless `force`, then
//!    apply the server's schema migrations and index sync.
//! 3. In one transaction: clear the tables (`force`), import every known
//!    collection ([`import`]), run the startup data backfills (gender
//!    matching) and, with `strict`, fail when any document is invalid.
//!
//! Nothing is dropped silently: every document is imported, and whatever
//! could not be stored as dumped is listed as a warning.

pub mod convert;
pub mod dump;
pub mod import;

use crate::db::Db;
use crate::shared::errors::AppError;
use import::{CollectionSummary, import_collection, import_tables};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Command-line options.
#[derive(Clone, Debug, Default)]
pub struct Options {
    /// A `mongodump` directory or `--archive` file.
    pub dump: PathBuf,
    /// The SQLite database to create.
    pub sqlite: PathBuf,
    /// The Mongo database to import (needed when the dump has several).
    pub db: Option<String>,
    /// Replace the data of a non-empty SQLite database.
    pub force: bool,
    /// Fail (import nothing) when any document fails schema validation.
    pub strict: bool,
    /// Write every warning and note, with values, to this JSON file.
    pub report: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Level {
    /// Data that is not stored exactly as dumped, or may not read cleanly.
    Warning,
    /// A normalisation the server would have applied itself (trim, ISO date).
    Note,
}

/// Something about one document worth knowing.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Warning {
    pub collection: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub level: Level,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    pub message: String,
    /// The dumped value, for dropped or invalid fields.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}

impl Warning {
    /// One line for the console.
    pub fn line(&self) -> String {
        let mut line = format!(
            "{} {}",
            self.collection,
            self.id.as_deref().unwrap_or("(no id)")
        );
        if let Some(field) = &self.field {
            line.push_str(&format!(" {field}"));
        }
        line.push_str(&format!(": {}", self.message));
        if let Some(value) = &self.value {
            line.push_str(&format!(" [value: {}]", import::preview(value)));
        }
        line
    }
}

/// What an import did.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub database: String,
    pub collections: Vec<CollectionSummary>,
    /// Collections in the dump with no table: `(name, documents)`.
    pub skipped: Vec<(String, usize)>,
    pub warnings: Vec<Warning>,
}

impl Outcome {
    pub fn warning_count(&self) -> usize {
        self.warnings
            .iter()
            .filter(|w| w.level == Level::Warning)
            .count()
    }

    /// The console summary: a table of counts, the skipped collections and
    /// the first `max_warnings` warnings per collection.
    pub fn summary_lines(&self, max_warnings: usize) -> Vec<String> {
        let mut lines = vec![format!("Imported database \"{}\":", self.database)];
        lines.push(format!(
            "  {:<22}{:>8}{:>10}{:>9}{:>12}{:>10}",
            "collection", "read", "imported", "invalid", "normalised", "warnings"
        ));
        for c in &self.collections {
            lines.push(format!(
                "  {:<22}{:>8}{:>10}{:>9}{:>12}{:>10}",
                c.name, c.read, c.imported, c.invalid, c.normalised, c.warnings
            ));
        }
        for (name, count) in &self.skipped {
            lines.push(format!(
                "Skipped unknown collection \"{name}\" ({count} documents)."
            ));
        }
        for c in &self.collections {
            let warnings: Vec<&Warning> = self
                .warnings
                .iter()
                .filter(|w| w.collection == c.name && w.level == Level::Warning)
                .collect();
            if warnings.is_empty() {
                continue;
            }
            lines.push(format!("Warnings for {}:", c.name));
            for warning in warnings.iter().take(max_warnings) {
                lines.push(format!("  - {}", warning.line()));
            }
            if warnings.len() > max_warnings {
                lines.push(format!(
                    "  ... and {} more (use --report <file> to list them all)",
                    warnings.len() - max_warnings
                ));
            }
        }
        lines
    }
}

fn app_error(context: &str) -> impl Fn(AppError) -> String + '_ {
    move |error| format!("{context}: {}", error.message)
}

fn file_has_content(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|m| m.len() > 0)
}

fn remove_database_files(path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let mut file = path.as_os_str().to_owned();
        file.push(suffix);
        let _ = std::fs::remove_file(PathBuf::from(file));
    }
}

/// Runs the import. Errors are fatal and leave existing data untouched
/// (a database file created by this run is removed again).
pub fn migrate(options: &Options) -> Result<Outcome, String> {
    let dump = dump::read_dump(&options.dump, options.db.as_deref())?;
    let existed = file_has_content(&options.sqlite);
    let result = import_dump(options, dump, existed);
    if result.is_err() && !existed {
        remove_database_files(&options.sqlite);
    }
    let outcome = result?;
    if let Some(report) = &options.report {
        let json = serde_json::to_string_pretty(&outcome).map_err(|e| e.to_string())?;
        std::fs::write(report, json).map_err(|error| {
            format!(
                "The import succeeded but the report {} could not be written: {error}",
                report.display()
            )
        })?;
    }
    Ok(outcome)
}

fn import_dump(options: &Options, dump: dump::Dump, existed: bool) -> Result<Outcome, String> {
    let db = Db::open(&options.sqlite).map_err(app_error("Cannot open the SQLite database"))?;
    if existed {
        let empty = db
            .call_blocking(crate::db::migrations::database_is_empty)
            .map_err(app_error("Cannot inspect the SQLite database"))?;
        if !empty && !options.force {
            return Err(format!(
                "{} already holds data; pass --force to replace it.",
                options.sqlite.display()
            ));
        }
    }
    db.call_blocking(crate::db::migrations::run_startup_schema)
        .map_err(app_error("Cannot prepare the SQLite schema"))?;

    let strict = options.strict;
    let mut outcome = Outcome {
        database: dump.database.clone(),
        ..Default::default()
    };
    let mut collections = dump.collections;
    db.transaction_blocking(|conn| {
        let fail = |message: String| crate::shared::errors::AppError::internal_from(message);
        for table in import_tables() {
            table.clear(conn)?;
        }
        for table in import_tables() {
            let documents = match collections.iter().position(|c| c.name == table.def().key) {
                Some(index) => collections.remove(index).documents,
                None => continue,
            };
            let summary =
                import_collection(conn, table, documents, &mut outcome.warnings).map_err(fail)?;
            outcome.collections.push(summary);
        }
        outcome.skipped = collections
            .iter()
            .map(|c| (c.name.clone(), c.documents.len()))
            .collect();
        crate::migrations::user_gender_matching::run_user_gender_matching_migration_on(conn)?;
        let invalid: usize = outcome.collections.iter().map(|c| c.invalid).sum();
        if strict && invalid > 0 {
            return Err(fail(format!(
                "{invalid} documents fail schema validation (--strict); nothing was imported."
            )));
        }
        Ok(())
    })
    .map_err(|error| error.message.clone())?;
    Ok(outcome)
}

#[cfg(test)]
mod tests;
