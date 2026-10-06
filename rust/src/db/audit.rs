//! Port of `server/src/db/schemaAudit.ts`: checks every stored row against
//! its table's schema and reports invalid rows per table and property.
//!
//! Like the TS audit it is not part of the default startup tasks; call
//! [`run_startup_schema_audit`] (e.g. after importing legacy data) to see
//! which stored rows would fail validation.

use super::schema::TableDef;
use crate::log;
use crate::shared::errors::AppResult;
use crate::shared::torva::Io;
use rusqlite::Connection;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

const ROOT_FAILURE: &str = "(root)";

/// Runs the audit over every table and logs the results.
pub fn run_startup_schema_audit(conn: &Connection) -> AppResult<()> {
    log::log("Running SQLite schema audit...");
    let lines = audit_tables(conn, &crate::tables::all_tables())?;
    log::log(lines.join("\n"));
    Ok(())
}

/// The audit report lines for `tables`.
pub fn audit_tables(conn: &Connection, tables: &[&TableDef]) -> AppResult<Vec<String>> {
    let mut lines = vec!["SQLite schema audit results:".to_string()];
    for table in tables {
        let rows = scan_table(conn, table)?;
        let schema = (table.schema)();
        let mut property_counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut invalid = 0;
        for row in &rows {
            let failures = collect_failure_paths(&schema, Some(&Value::Object(row.clone())), "");
            if failures.is_empty() {
                continue;
            }
            invalid += 1;
            let mut unique: Vec<String> = failures
                .iter()
                .map(|path| normalize_failure_path(path))
                .collect();
            unique.sort();
            unique.dedup();
            for property in unique {
                *property_counts.entry(property).or_default() += 1;
            }
        }
        if invalid == 0 {
            lines.push(format!("- {}: ✓", table.key));
            continue;
        }
        lines.push(format!(
            "- {}: {invalid} invalid of {}",
            table.key,
            rows.len()
        ));
        let mut counts: Vec<(String, usize)> = property_counts.into_iter().collect();
        counts.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
        for (property, count) in counts {
            lines.push(format!("  - {property}: {count}"));
        }
    }
    Ok(lines)
}

/// Stored rows as JSON (no schema, legacy columns included).
fn scan_table(conn: &Connection, table: &TableDef) -> AppResult<Vec<Map<String, Value>>> {
    use super::schema::{row_to_map, select_list};
    let columns = table.plain_columns(true);
    let sql = format!(
        "SELECT {} FROM \"{}\" t ORDER BY t.\"_seq\"",
        select_list("t", &columns),
        table.sql
    );
    let mut statement = conn.prepare(&sql)?;
    let mut rows: Vec<Map<String, Value>> = statement
        .query_map([], |row| row_to_map(row, &columns, 0))?
        .collect::<Result<Vec<_>, _>>()?;
    for child in table.children() {
        let child_sql = format!(
            "SELECT {} FROM \"{}\" c WHERE c.\"{}\" = ? ORDER BY c.\"{}\"",
            select_list("c", child.columns),
            child.table,
            child.parent_column,
            child.position_column
        );
        let mut child_statement = conn.prepare(&child_sql)?;
        for row in rows.iter_mut() {
            let id = row
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let items = child_statement
                .query_map([id], |r| row_to_map(r, child.columns, 0))?
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .map(Value::Object)
                .collect();
            row.insert(child.field.to_string(), Value::Array(items));
        }
    }
    Ok(rows)
}

fn append_path(path: &str, next: &str) -> String {
    if path.is_empty() {
        next.to_string()
    } else {
        format!("{path}.{next}")
    }
}

fn root_or(path: &str) -> String {
    if path.is_empty() {
        ROOT_FAILURE.to_string()
    } else {
        path.to_string()
    }
}

fn collect_failure_paths(schema: &Io, value: Option<&Value>, path: &str) -> Vec<String> {
    match schema.type_name() {
        "object" => {
            let Some(Value::Object(map)) = value else {
                return vec![root_or(path)];
            };
            schema
                .shape()
                .map(|shape| {
                    shape
                        .iter()
                        .flat_map(|(key, child)| {
                            collect_failure_paths(child, map.get(key), &append_path(path, key))
                        })
                        .collect()
                })
                .unwrap_or_default()
        }
        "array" => {
            let Some(Value::Array(items)) = value else {
                return vec![root_or(path)];
            };
            let Some(of_type) = schema.of_type() else {
                return Vec::new();
            };
            items
                .iter()
                .enumerate()
                .flat_map(|(index, item)| {
                    collect_failure_paths(
                        of_type,
                        Some(item),
                        &append_path(path, &index.to_string()),
                    )
                })
                .collect()
        }
        "lazy" => schema
            .get_type()
            .map(|inner| collect_failure_paths(&inner, value, path))
            .unwrap_or_default(),
        "null" => match value {
            Some(Value::Null) => Vec::new(),
            _ => schema
                .of_type()
                .map(|inner| collect_failure_paths(inner, value, path))
                .unwrap_or_default(),
        },
        "optional" => match value {
            None => Vec::new(),
            _ => schema
                .of_type()
                .map(|inner| collect_failure_paths(inner, value, path))
                .unwrap_or_default(),
        },
        _ => {
            if schema.validate_opt(value).is_ok() {
                Vec::new()
            } else {
                vec![root_or(path)]
            }
        }
    }
}

fn normalize_failure_path(path: &str) -> String {
    let parts: Vec<&str> = path
        .split('.')
        .filter(|part| !part.is_empty())
        .filter(|part| !part.bytes().all(|b| b.is_ascii_digit()))
        .collect();
    if parts.is_empty() {
        ROOT_FAILURE.to_string()
    } else {
        parts.join(".")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::db::migrations::run_schema_migrations;
    use crate::shared::schemas::{Season, Team};
    use crate::tables::{SEASON, TEAM, USER, all_tables};
    use crate::utils::random::generate_id;
    use serde_json::json;

    /// Writes a row without validation, the way legacy data ends up stored.
    fn insert_raw<T: crate::db::Record>(db: &Db, table: crate::db::Table<T>, document: Value) {
        let now = crate::js::date::now_iso();
        let mut map = Map::new();
        map.insert("id".into(), json!(generate_id()));
        map.insert("createdOn".into(), json!(now));
        map.insert("updatedOn".into(), json!(now));
        map.extend(document.as_object().cloned().unwrap_or_default());
        db.call_blocking(move |c| table.tx(c).insert_raw(&map))
            .unwrap();
    }

    // runStartupSchemaAudit (schemaAudit.test.ts)
    #[test]
    fn reports_invalid_stored_documents_per_table_and_property() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("test.sqlite")).unwrap();
        db.call_blocking(|c| run_schema_migrations(c).map(|_| ()))
            .unwrap();

        let season: Season = db
            .call_blocking(|c| SEASON.tx(c).create_one(json!({"name": "Valid season"})))
            .unwrap();
        let season_id = season.id.clone();
        let _: Team = db
            .call_blocking(move |c| {
                TEAM.tx(c).create_one(json!({"seasonId": season_id, "name": "Valid team", "color": "hsla(0, 0%, 100%, 1)"}))
            })
            .unwrap();
        insert_raw(&db, TEAM, json!({"seasonId": season.id, "color": "red"}));
        insert_raw(
            &db,
            TEAM,
            json!({"seasonId": season.id, "name": "Bad colour", "color": "blue"}),
        );
        insert_raw(
            &db,
            TEAM,
            json!({"seasonId": season.id, "name": "Bad division", "color": "hsla(0, 0%, 100%, 1)", "division": "one"}),
        );
        insert_raw(
            &db,
            SEASON,
            json!({
                "name": "Results",
                "signUpOpen": false,
                "finalResults": [
                    {"teamId": generate_id(), "position": null},
                    {"teamId": 5, "position": "first"},
                    {"teamId": generate_id(), "position": "second"}
                ]
            }),
        );
        insert_raw(
            &db,
            SEASON,
            json!({"name": "Not an array", "signUpOpen": false, "finalResults": "none"}),
        );
        insert_raw(
            &db,
            USER,
            json!({
                "firstName": "A",
                "lastName": "B",
                "genderMatching": "female",
                "termsAccepted": true,
                "emails": [{"value": "not-an-email", "verified": false, "code": "c", "createdOn": "x", "primary": true}]
            }),
        );

        let lines = db
            .call_blocking(|c| audit_tables(c, &all_tables()))
            .unwrap();
        assert_eq!(lines[0], "SQLite schema audit results:");

        let section = |key: &str| -> Vec<String> {
            let start = lines
                .iter()
                .position(|line| line.starts_with(&format!("- {key}:")))
                .unwrap();
            let end = lines
                .iter()
                .enumerate()
                .position(|(index, line)| index > start && line.starts_with("- "));
            lines[start..end.unwrap_or(lines.len())].to_vec()
        };

        assert_eq!(
            section("team"),
            [
                "- team: 3 invalid of 4",
                "  - color: 2",
                "  - division: 1",
                "  - name: 1"
            ]
        );
        // array indexes are folded into one property path, counted once per document
        assert_eq!(
            section("season"),
            [
                "- season: 2 invalid of 3",
                "  - finalResults: 1",
                "  - finalResults.position: 1",
                "  - finalResults.teamId: 1",
            ]
        );
        assert_eq!(
            section("user"),
            [
                "- user: 1 invalid of 1",
                "  - emails.createdOn: 1",
                "  - emails.value: 1"
            ]
        );
        for table in all_tables() {
            if ["team", "season", "user"].contains(&table.key) {
                continue;
            }
            assert_eq!(section(table.key), [format!("- {}: ✓", table.key)]);
        }
    }
}
