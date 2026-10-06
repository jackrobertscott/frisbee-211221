//! BSON values to the JSON values the TS server works with.
//!
//! The TS server only ever writes strings, numbers, booleans, arrays and
//! objects (dates are ISO strings), so for its own data the conversion is
//! lossless. Other BSON types that older or hand-edited data may hold are
//! converted to their closest JSON form and reported as a [`Note`]:
//!
//! - `Date` → `new Date(ms).toISOString()` (the server's date format);
//! - `ObjectId` → its 24-character hex string;
//! - `Int32`/`Int64`/`Double` → JSON numbers (`3.0` becomes `3`, as in JS);
//! - `Decimal128` → a JSON number (a double, as the Node driver's
//!   `Number(decimal)`), or its string when it does not parse;
//! - `Symbol` → string; `undefined` → missing;
//! - binary, regex, code, timestamp, min/max keys and NaN/Infinity → relaxed
//!   extended JSON (`{"$binary": ...}`), which keeps the value readable.

use crate::js;
use bson::{Bson, Document};
use serde_json::{Map, Value};

/// A conversion that changed the value's BSON type.
#[derive(Clone, Debug, PartialEq)]
pub struct Note {
    /// Dotted path of the field (`games.0.time`).
    pub path: String,
    pub message: String,
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() {
        key.to_string()
    } else {
        format!("{path}.{key}")
    }
}

/// Converts a document's fields (in order), dropping `undefined` values.
pub fn document_to_json(
    document: Document,
    path: &str,
    notes: &mut Vec<Note>,
) -> Map<String, Value> {
    let mut map = Map::new();
    for (key, value) in document {
        let key = key.to_string();
        let field_path = join(path, &key);
        if let Some(value) = bson_to_json(value, &field_path, notes) {
            map.insert(key, value);
        }
    }
    map
}

/// Converts one value; `None` means the field is treated as missing.
pub fn bson_to_json(value: Bson, path: &str, notes: &mut Vec<Note>) -> Option<Value> {
    let mut note = |message: String| {
        notes.push(Note {
            path: path.to_string(),
            message,
        })
    };
    Some(match value {
        Bson::Null => Value::Null,
        Bson::Boolean(b) => Value::Bool(b),
        Bson::String(s) => Value::String(s),
        Bson::Int32(i) => Value::from(i),
        Bson::Int64(i) => Value::from(i),
        Bson::Double(f) if f.is_finite() => js::number(f),
        Bson::Double(f) => {
            note(format!("non-finite number {f} kept as extended JSON"));
            Bson::Double(f).into_relaxed_extjson()
        }
        Bson::DateTime(date) => {
            let ms = date.timestamp_millis();
            match js::date::try_to_iso_string(ms) {
                Some(iso) => Value::String(iso),
                None => {
                    note(format!(
                        "date {ms}ms is outside the JavaScript date range; kept as extended JSON"
                    ));
                    Bson::DateTime(date).into_relaxed_extjson()
                }
            }
        }
        Bson::Array(items) => Value::Array(
            items
                .into_iter()
                .enumerate()
                // `undefined` inside an array becomes `null`, as in JSON.stringify
                .map(|(index, item)| {
                    bson_to_json(item, &join(path, &index.to_string()), notes)
                        .unwrap_or(Value::Null)
                })
                .collect(),
        ),
        Bson::Document(document) => Value::Object(document_to_json(document, path, notes)),
        Bson::ObjectId(id) => {
            note("ObjectId converted to its hex string".into());
            Value::String(id.to_hex())
        }
        Bson::Decimal128(decimal) => {
            let text = decimal.to_string();
            let number = js::string_to_number(&text);
            if number.is_finite() {
                note(format!("Decimal128 {text} converted to a double"));
                js::number(number)
            } else {
                note(format!("Decimal128 {text} kept as a string"));
                Value::String(text)
            }
        }
        Bson::Symbol(symbol) => {
            note("symbol converted to a string".into());
            Value::String(symbol)
        }
        Bson::Undefined => {
            note("undefined value treated as missing".into());
            return None;
        }
        other => {
            note(format!(
                "BSON {:?} value kept as extended JSON",
                other.element_type()
            ));
            other.into_relaxed_extjson()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use bson::{Binary, DateTime, Decimal128, doc, oid::ObjectId, spec::BinarySubtype};
    use serde_json::json;

    fn convert(value: Bson) -> (Option<Value>, Vec<Note>) {
        let mut notes = Vec::new();
        (bson_to_json(value, "field", &mut notes), notes)
    }

    #[test]
    fn keeps_strings_booleans_and_null() {
        assert_eq!(convert(Bson::String("a".into())).0, Some(json!("a")));
        assert_eq!(convert(Bson::Boolean(true)).0, Some(json!(true)));
        assert_eq!(convert(Bson::Null).0, Some(Value::Null));
        assert!(convert(Bson::Null).1.is_empty());
    }

    #[test]
    fn converts_every_number_type_like_javascript() {
        assert_eq!(convert(Bson::Int32(7)).0, Some(json!(7)));
        assert_eq!(
            convert(Bson::Int64(1_700_000_000_000)).0,
            Some(json!(1_700_000_000_000_i64))
        );
        assert_eq!(convert(Bson::Double(3.0)).0, Some(json!(3)));
        assert_eq!(convert(Bson::Double(2.5)).0, Some(json!(2.5)));
        assert_eq!(convert(Bson::Double(-0.0)).0, Some(json!(0)));
        let (value, notes) = convert(Bson::Double(f64::NAN));
        assert_eq!(value, Some(json!({"$numberDouble": "NaN"})));
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn converts_dates_to_iso_strings() {
        let date = DateTime::from_millis(1_640_995_200_123);
        let (value, notes) = convert(Bson::DateTime(date));
        assert_eq!(value, Some(json!("2022-01-01T00:00:00.123Z")));
        assert!(notes.is_empty());
        let (value, notes) = convert(Bson::DateTime(DateTime::from_millis(-86_400_000)));
        assert_eq!(value, Some(json!("1969-12-31T00:00:00.000Z")));
        assert!(notes.is_empty());
        let (_, notes) = convert(Bson::DateTime(DateTime::MAX));
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn converts_object_ids_to_hex_with_a_note() {
        let id = ObjectId::parse_str("65a1b2c3d4e5f60718293a4b").unwrap();
        let (value, notes) = convert(Bson::ObjectId(id));
        assert_eq!(value, Some(json!("65a1b2c3d4e5f60718293a4b")));
        assert_eq!(notes[0].path, "field");
    }

    #[test]
    fn converts_decimals_to_numbers() {
        let decimal: Decimal128 = "12.50".parse().unwrap();
        let (value, notes) = convert(Bson::Decimal128(decimal));
        assert_eq!(value, Some(json!(12.5)));
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn treats_undefined_as_missing() {
        let (value, notes) = convert(Bson::Undefined);
        assert_eq!(value, None);
        assert_eq!(notes.len(), 1);
        let mut notes = Vec::new();
        let map = document_to_json(doc! {"a": 1, "b": Bson::Undefined}, "", &mut notes);
        assert_eq!(Value::Object(map), json!({"a": 1}));
    }

    #[test]
    fn keeps_exotic_types_as_extended_json() {
        let binary = Bson::Binary(Binary {
            subtype: BinarySubtype::Generic,
            bytes: vec![1, 2, 3],
        });
        let (value, notes) = convert(binary);
        assert_eq!(
            value,
            Some(json!({"$binary": {"base64": "AQID", "subType": "00"}}))
        );
        assert_eq!(notes.len(), 1);
    }

    #[test]
    fn converts_nested_documents_and_arrays_with_paths() {
        let mut notes = Vec::new();
        let map = document_to_json(
            doc! {
                "games": [{"id": "g1", "team1Score": 2.0, "at": DateTime::from_millis(0)}],
                "nested": {"oid": ObjectId::parse_str("65a1b2c3d4e5f60718293a4b").unwrap()},
            },
            "",
            &mut notes,
        );
        assert_eq!(
            Value::Object(map),
            json!({
                "games": [{"id": "g1", "team1Score": 2, "at": "1970-01-01T00:00:00.000Z"}],
                "nested": {"oid": "65a1b2c3d4e5f60718293a4b"},
            })
        );
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].path, "nested.oid");
    }
}
