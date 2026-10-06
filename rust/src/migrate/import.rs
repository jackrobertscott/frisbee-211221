//! Turns dumped documents into stored rows, through the typed table layer.
//!
//! Each top-level field is validated against its schema field on its own:
//! valid fields are stored normalised exactly as the table layer would write
//! them (`createOne`), invalid or missing required fields are stored as they
//! were (the TS server reads documents without validating them) and reported.
//! After a table is written its rows are read back and compared with the
//! dumped documents, so anything the SQLite schema cannot hold is reported
//! instead of disappearing silently.

use super::convert::{Note, document_to_json};
use super::{Level, Warning};
use crate::db::schema::TableDef;
use crate::db::{Filter, Record, Table};
use crate::js;
use crate::shared::errors::AppResult;
use crate::tables;
use bson::{Bson, Document};
use rusqlite::Connection;
use serde_json::{Map, Value};
use std::collections::BTreeSet;

/// The table operations the import needs, independent of the record type.
pub trait ImportTable: Sync {
    fn def(&self) -> &'static TableDef;
    fn insert_raw(&self, conn: &Connection, row: &Map<String, Value>) -> AppResult<()>;
    fn scan_stored(&self, conn: &Connection) -> AppResult<Vec<Map<String, Value>>>;
    fn clear(&self, conn: &Connection) -> AppResult<usize>;
}

impl<T: Record> ImportTable for Table<T> {
    fn def(&self) -> &'static TableDef {
        Table::def(self)
    }
    fn insert_raw(&self, conn: &Connection, row: &Map<String, Value>) -> AppResult<()> {
        self.tx(conn).insert_raw(row)
    }
    fn scan_stored(&self, conn: &Connection) -> AppResult<Vec<Map<String, Value>>> {
        self.tx(conn).scan_stored(&Filter::all())
    }
    fn clear(&self, conn: &Connection) -> AppResult<usize> {
        self.tx(conn).delete_many(&Filter::all())
    }
}

/// Every table, keyed by its Mongo collection name (the TS table key).
pub fn import_tables() -> [&'static dyn ImportTable; 10] {
    [
        &tables::AUTH_ATTEMPT_LIMIT,
        &tables::FIXTURE,
        &tables::GAMEDAY_IMPORT_CONFIG,
        &tables::GAMEDAY_IMPORT_RUN,
        &tables::MEMBER,
        &tables::REPORT,
        &tables::SEASON,
        &tables::SESSION,
        &tables::TEAM,
        &tables::USER,
    ]
}

/// Per-collection counts.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub name: String,
    pub read: usize,
    pub imported: usize,
    /// Documents with at least one field failing schema validation.
    pub invalid: usize,
    /// Documents whose values were normalised (trimmed, ISO dates, ...).
    pub normalised: usize,
    pub warnings: usize,
}

/// A prepared row and what was learned while preparing it.
#[derive(Debug, Default)]
pub struct PreparedRow {
    pub row: Map<String, Value>,
    /// The document as dumped (JSON, without `_id` and top-level nulls).
    pub original: Map<String, Value>,
    /// Top-level fields stored as dumped because they failed validation.
    pub invalid_fields: BTreeSet<String>,
    pub warnings: Vec<Warning>,
}

fn record_id(map: &Map<String, Value>) -> Option<String> {
    map.get("id").and_then(Value::as_str).map(str::to_string)
}

/// Short single-line rendering of a value for messages.
pub fn preview(value: &Value) -> String {
    let text = js::stringify(value);
    if text.chars().count() > 80 {
        format!("{}...", text.chars().take(77).collect::<String>())
    } else {
        text
    }
}

fn is_gender_matching(value: Option<&Value>) -> bool {
    matches!(value.and_then(Value::as_str), Some("male" | "female"))
}

/// Converts and validates one dumped document for `def`.
pub fn prepare_document(def: &TableDef, document: Document) -> PreparedRow {
    let mut notes: Vec<Note> = Vec::new();
    let mut object_id: Option<Bson> = None;
    let mut fields = Document::new();
    for (key, value) in document {
        if key == "_id" {
            object_id = Some(value);
        } else {
            fields.insert(key, value);
        }
    }
    let mut original = document_to_json(fields, "", &mut notes);
    let mut prepared = PreparedRow::default();
    let collection = def.key.to_string();
    let warn = |id: Option<String>,
                level: Level,
                field: Option<String>,
                message: String,
                value: Option<Value>| {
        Warning {
            collection: collection.clone(),
            id,
            level,
            field,
            message,
            value,
        }
    };

    // records carry their own `id`; `_id` is Mongo's and is dropped, unless
    // a (legacy) document has no `id`, in which case `_id` stands in for it
    if !original.contains_key("id")
        && let Some(object_id) = object_id
    {
        let id = match object_id {
            Bson::ObjectId(oid) => Some(oid.to_hex()),
            Bson::String(text) => Some(text),
            _ => None,
        };
        if let Some(id) = id {
            prepared.warnings.push(warn(
                Some(id.clone()),
                Level::Warning,
                Some("id".into()),
                "document has no id; using its _id".into(),
                None,
            ));
            original.insert("id".into(), Value::String(id));
        }
    }
    let id = record_id(&original);

    for note in notes {
        prepared.warnings.push(warn(
            id.clone(),
            Level::Warning,
            Some(note.path),
            note.message,
            None,
        ));
    }

    // SQLite has no "present but null": a top-level null is stored as missing
    let nulls: Vec<String> = original
        .iter()
        .filter(|(_, value)| value.is_null())
        .map(|(key, _)| key.clone())
        .collect();
    for key in nulls {
        original.remove(&key);
        prepared.warnings.push(warn(
            id.clone(),
            Level::Note,
            Some(key),
            "null stored as missing".into(),
            None,
        ));
    }

    let schema = (def.schema)();
    let shape = schema.shape().cloned().unwrap_or_default();
    let mut row = Map::new();
    for (key, field_schema) in &shape {
        let raw = original.get(key);
        // legacy users: genderMatching is backfilled after the import, from
        // the stored value, the old `gender` field or MVP votes (as at startup)
        if def.key == "user" && key == "genderMatching" && !is_gender_matching(raw) {
            if let Some(raw) = raw {
                row.insert(key.clone(), raw.clone());
            }
            continue;
        }
        match field_schema.validate_opt(raw) {
            Ok(Some(value)) => {
                row.insert(key.clone(), value);
            }
            Ok(None) => {}
            Err(error) => {
                prepared.invalid_fields.insert(key.clone());
                let message = match raw {
                    Some(_) => format!("fails schema validation ({error}); imported as stored"),
                    None => format!("required field is missing ({error})"),
                };
                prepared.warnings.push(warn(
                    id.clone(),
                    Level::Warning,
                    Some(key.clone()),
                    message,
                    raw.cloned(),
                ));
                if let Some(raw) = raw {
                    row.insert(key.clone(), raw.clone());
                }
            }
        }
    }
    // fields outside the schema: legacy columns (user.gender) are kept, the
    // rest cannot be stored and are reported by the read-back comparison
    for (key, value) in &original {
        if !shape.contains_key(key) && def.column(key).is_some() {
            row.insert(key.clone(), value.clone());
        }
    }
    prepared.row = row;
    prepared.original = original;
    prepared
}

/// A difference between a dumped document and its stored row.
#[derive(Clone, Debug, PartialEq)]
pub enum Difference {
    Dropped {
        path: String,
        value: Value,
    },
    Changed {
        path: String,
        from: Option<Value>,
        to: Value,
    },
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_string()
    } else {
        format!("{path}.{key}")
    }
}

fn same_scalar(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        _ => left == right,
    }
}

/// Recursively compares `original` with `stored`.
pub fn diff(path: &str, original: &Value, stored: Option<&Value>, out: &mut Vec<Difference>) {
    let Some(stored) = stored else {
        out.push(Difference::Dropped {
            path: path.to_string(),
            value: original.clone(),
        });
        return;
    };
    match (original, stored) {
        (Value::Object(a), Value::Object(b)) => {
            for (key, value) in a {
                diff(&join(path, key), value, b.get(key), out);
            }
            for (key, value) in b {
                if !a.contains_key(key) {
                    out.push(Difference::Changed {
                        path: join(path, key),
                        from: None,
                        to: value.clone(),
                    });
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            for (index, value) in a.iter().enumerate() {
                diff(&join(path, &index.to_string()), value, b.get(index), out);
            }
            for (index, value) in b.iter().enumerate().skip(a.len()) {
                out.push(Difference::Changed {
                    path: join(path, &index.to_string()),
                    from: None,
                    to: value.clone(),
                });
            }
        }
        _ if same_scalar(original, stored) => {}
        _ => out.push(Difference::Changed {
            path: path.to_string(),
            from: Some(original.clone()),
            to: stored.clone(),
        }),
    }
}

/// Reports how each stored row differs from its dumped document. Rows and
/// documents correspond one to one, in insertion order.
pub fn compare_stored(
    def: &TableDef,
    prepared: &[PreparedRow],
    stored: &[Map<String, Value>],
    summary: &mut CollectionSummary,
    warnings: &mut Vec<Warning>,
) {
    for (row, stored) in prepared.iter().zip(stored) {
        let mut differences = Vec::new();
        diff(
            "",
            &Value::Object(row.original.clone()),
            Some(&Value::Object(stored.clone())),
            &mut differences,
        );
        let id = record_id(&row.original);
        let mut normalised = false;
        for difference in differences {
            let warning = match difference {
                Difference::Dropped { path, value } => Warning {
                    collection: def.key.to_string(),
                    id: id.clone(),
                    level: Level::Warning,
                    message: if def.column(&path).is_some() || path.contains('.') {
                        "cannot be stored in this shape; dropped".into()
                    } else {
                        "not part of the schema; dropped".into()
                    },
                    field: Some(path),
                    value: Some(value),
                },
                Difference::Changed { path, from, to } => {
                    let top = path.split('.').next().unwrap_or_default().to_string();
                    let level = if row.invalid_fields.contains(&top) {
                        Level::Warning
                    } else {
                        normalised = true;
                        Level::Note
                    };
                    Warning {
                        collection: def.key.to_string(),
                        id: id.clone(),
                        level,
                        message: match from {
                            Some(from) => format!("{} stored as {}", preview(&from), preview(&to)),
                            None => format!("stored with added {}", preview(&to)),
                        },
                        field: Some(path),
                        value: None,
                    }
                }
            };
            if warning.level == Level::Warning {
                summary.warnings += 1;
            }
            warnings.push(warning);
        }
        if normalised {
            summary.normalised += 1;
        }
    }
}

/// Imports one collection's documents into `table` (on the import transaction).
pub fn import_collection(
    conn: &Connection,
    table: &dyn ImportTable,
    documents: Vec<Document>,
    warnings: &mut Vec<Warning>,
) -> Result<CollectionSummary, String> {
    let def = table.def();
    let mut summary = CollectionSummary {
        name: def.key.to_string(),
        read: documents.len(),
        ..Default::default()
    };
    let mut prepared = Vec::with_capacity(documents.len());
    for document in documents {
        let row = prepare_document(def, document);
        table.insert_raw(conn, &row.row).map_err(|error| {
            format!(
                "Cannot import {} {}: {}",
                def.key,
                record_id(&row.original).unwrap_or_else(|| "(no id)".into()),
                error.message
            )
        })?;
        summary.imported += 1;
        if !row.invalid_fields.is_empty() {
            summary.invalid += 1;
        }
        prepared.push(row);
    }
    for row in &mut prepared {
        for warning in row.warnings.drain(..) {
            if warning.level == Level::Warning {
                summary.warnings += 1;
            }
            warnings.push(warning);
        }
    }
    let stored = table
        .scan_stored(conn)
        .map_err(|error| format!("Cannot read back {}: {}", def.key, error.message))?;
    if stored.len() != prepared.len() {
        return Err(format!(
            "Expected {} {} rows after the import but found {}.",
            prepared.len(),
            def.key,
            stored.len()
        ));
    }
    compare_stored(def, &prepared, &stored, &mut summary, warnings);
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bson::{DateTime, doc, oid::ObjectId};
    use serde_json::json;

    fn messages(row: &PreparedRow) -> Vec<(String, String)> {
        row.warnings
            .iter()
            .map(|w| (w.field.clone().unwrap_or_default(), w.message.clone()))
            .collect()
    }

    #[test]
    fn valid_documents_are_stored_like_create_one() {
        let row = prepare_document(
            &tables::team::TABLE,
            doc! {
                "_id": ObjectId::new(),
                "id": "team1",
                "createdOn": DateTime::from_millis(0),
                "updatedOn": "2024-01-02T03:04:05.000Z",
                "seasonId": "season1",
                "name": "Hawks",
                "color": "hsla(10, 50%, 50%, 1)",
                "division": 2.0,
                "phone": "  021 ",
            },
        );
        assert_eq!(
            Value::Object(row.row),
            json!({
                "id": "team1",
                "createdOn": "1970-01-01T00:00:00.000Z",
                "updatedOn": "2024-01-02T03:04:05.000Z",
                "seasonId": "season1",
                "name": "Hawks",
                "color": "hsla(10, 50%, 50%, 1)",
                "division": 2,
                "phone": "021",
            })
        );
        assert!(row.invalid_fields.is_empty());
        assert!(row.warnings.is_empty());
        assert_eq!(row.original["phone"], json!("  021 "));
    }

    #[test]
    fn invalid_and_missing_fields_are_kept_and_reported() {
        let row = prepare_document(
            &tables::member::TABLE,
            doc! {
                "id": "m1",
                "createdOn": "not a date",
                "updatedOn": "2024-01-01T00:00:00.000Z",
                "userId": "u1",
                "seasonId": "s1",
                "teamId": "t1",
            },
        );
        assert_eq!(row.row["createdOn"], json!("not a date"));
        assert!(!row.row.contains_key("pending"));
        assert_eq!(
            row.invalid_fields.iter().cloned().collect::<Vec<_>>(),
            ["createdOn", "pending"]
        );
        let messages = messages(&row);
        assert!(messages[0].1.contains("imported as stored"));
        assert!(messages[1].1.contains("required field is missing"));
    }

    #[test]
    fn missing_ids_fall_back_to_the_object_id() {
        let oid = ObjectId::parse_str("65a1b2c3d4e5f60718293a4b").unwrap();
        let row = prepare_document(&tables::session::TABLE, doc! {"_id": oid, "token": "x"});
        assert_eq!(row.row["id"], json!("65a1b2c3d4e5f60718293a4b"));
        assert_eq!(
            messages(&row)[0],
            ("id".into(), "document has no id; using its _id".into())
        );
    }

    #[test]
    fn top_level_nulls_become_missing_with_a_note() {
        let row = prepare_document(
            &tables::team::TABLE,
            doc! {"id": "t", "division": Bson::Null},
        );
        assert!(!row.row.contains_key("division"));
        assert!(!row.invalid_fields.contains("division"));
        assert_eq!(row.warnings[0].level, Level::Note);
    }

    #[test]
    fn legacy_users_keep_gender_for_the_backfill() {
        let row = prepare_document(
            &tables::user::TABLE,
            doc! {"id": "u1", "gender": "non-binary", "unknown": 1},
        );
        assert_eq!(row.row["gender"], json!("non-binary"));
        assert!(!row.row.contains_key("genderMatching"));
        assert!(!row.invalid_fields.contains("genderMatching"));
        assert!(!row.row.contains_key("unknown"));
    }

    #[test]
    fn diff_reports_dropped_and_changed_values() {
        let mut out = Vec::new();
        diff(
            "",
            &json!({"a": 1.0, "b": {"c": " x ", "d": [1, {"e": 2}]}, "f": "gone"}),
            Some(&json!({"a": 1, "b": {"c": "x", "d": [1, {}]}})),
            &mut out,
        );
        assert_eq!(
            out,
            vec![
                Difference::Changed {
                    path: "b.c".into(),
                    from: Some(json!(" x ")),
                    to: json!("x")
                },
                Difference::Dropped {
                    path: "b.d.1.e".into(),
                    value: json!(2)
                },
                Difference::Dropped {
                    path: "f".into(),
                    value: json!("gone")
                },
            ]
        );
    }
}
