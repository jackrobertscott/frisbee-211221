//! Port of `server/src/gameday/types.ts`: the GameDay exporter's input and
//! output shapes and their validation.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// `TGamedayExportInput`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayExportInput {
    pub starting_url: String,
    pub username: String,
    pub password: String,
    pub association: String,
    pub competition: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headless: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_channel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub report_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debug: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<String>>,
}

/// `TGamedayExportMember`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayExportMember {
    pub team_name: String,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub gender: String,
}

/// `TGamedayExportOutput`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GamedayExportOutput {
    pub members: Vec<GamedayExportMember>,
}

fn read_required_string(record: &Map<String, Value>, key: &str, trim: bool) -> Result<String, String> {
    let Some(Value::String(value)) = record.get(key) else {
        return Err(format!("{key} is required."));
    };
    let normalized = if trim { crate::js::trim(value).to_string() } else { value.clone() };
    if normalized.is_empty() {
        return Err(format!("{key} is required."));
    }
    Ok(normalized)
}

fn read_optional_string(record: &Map<String, Value>, key: &str) -> Result<Option<String>, String> {
    match record.get(key) {
        None => Ok(None),
        Some(Value::String(value)) => {
            let normalized = crate::js::trim(value);
            Ok((!normalized.is_empty()).then(|| normalized.to_string()))
        }
        Some(_) => Err(format!("{key} must be a string.")),
    }
}

fn read_optional_boolean(record: &Map<String, Value>, key: &str) -> Result<Option<bool>, String> {
    match record.get(key) {
        None => Ok(None),
        Some(Value::Bool(value)) => Ok(Some(*value)),
        Some(_) => Err(format!("{key} must be a boolean.")),
    }
}

fn read_optional_number(record: &Map<String, Value>, key: &str) -> Result<Option<f64>, String> {
    match record.get(key) {
        None => Ok(None),
        Some(Value::Number(n)) if n.as_f64().is_some_and(f64::is_finite) => Ok(n.as_f64()),
        Some(_) => Err(format!("{key} must be a finite number.")),
    }
}

fn read_optional_string_array(record: &Map<String, Value>, key: &str) -> Result<Option<Vec<String>>, String> {
    match record.get(key) {
        None => Ok(None),
        Some(Value::Array(items)) if items.iter().all(Value::is_string) => Ok(Some(
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|item| crate::js::trim(item).to_string())
                .filter(|item| !item.is_empty())
                .collect(),
        )),
        Some(_) => Err(format!("{key} must be an array of strings.")),
    }
}

/// `parseGamedayExportInput(value)`.
pub fn parse_gameday_export_input(value: &Value) -> Result<GamedayExportInput, String> {
    // arrays count as records in JavaScript; their missing keys fail below
    let empty = Map::new();
    let record = match value {
        Value::Object(map) => map,
        Value::Array(_) => &empty,
        _ => return Err("Input must be an object.".into()),
    };
    Ok(GamedayExportInput {
        starting_url: read_required_string(record, "startingUrl", true)?,
        username: read_required_string(record, "username", true)?,
        password: read_required_string(record, "password", false)?,
        association: read_required_string(record, "association", true)?,
        competition: read_required_string(record, "competition", true)?,
        headless: read_optional_boolean(record, "headless")?,
        browser_channel: read_optional_string(record, "browserChannel")?,
        browser_executable_path: read_optional_string(record, "browserExecutablePath")?,
        report_id: read_optional_string(record, "reportId")?,
        timeout_ms: read_optional_number(record, "timeoutMs")?,
        debug: read_optional_boolean(record, "debug")?,
        fields: read_optional_string_array(record, "fields")?,
        headers: read_optional_string_array(record, "headers")?,
    })
}

fn is_gameday_export_member(value: &Value) -> bool {
    let Value::Object(map) = value else { return false };
    ["teamName", "firstName", "lastName", "email", "gender"].iter().all(|key| map.get(*key).is_some_and(Value::is_string))
}

/// `isGamedayExportOutput(value)`.
pub fn is_gameday_export_output(value: &Value) -> bool {
    match value.get("members") {
        Some(Value::Array(members)) if value.is_object() => members.iter().all(is_gameday_export_member),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn base() -> Value {
        json!({
            "startingUrl": " https://example.com ",
            "username": " user ",
            "password": " pass ",
            "association": " Assoc ",
            "competition": " Comp ",
        })
    }

    fn with(extra: Value) -> Value {
        let mut map = base().as_object().cloned().unwrap();
        for (key, value) in extra.as_object().cloned().unwrap() {
            if value == json!("__undefined__") {
                map.remove(&key);
            } else {
                map.insert(key, value);
            }
        }
        Value::Object(map)
    }

    fn error(value: Value) -> String {
        parse_gameday_export_input(&value).unwrap_err()
    }

    mod parse_gameday_export_input_tests {
        use super::*;

        #[test]
        fn trims_required_strings_except_the_password() {
            assert_eq!(
                parse_gameday_export_input(&base()).unwrap(),
                GamedayExportInput {
                    starting_url: "https://example.com".into(),
                    username: "user".into(),
                    password: " pass ".into(),
                    association: "Assoc".into(),
                    competition: "Comp".into(),
                    ..Default::default()
                }
            );
        }

        #[test]
        fn parses_optional_fields() {
            let parsed = parse_gameday_export_input(&with(json!({
                "headless": false,
                "browserChannel": " chrome ",
                "browserExecutablePath": "   ",
                "reportId": "r1",
                "timeoutMs": 5000,
                "debug": true,
                "fields": [" a ", "", "  ", "b"],
                "headers": []
            })))
            .unwrap();
            assert_eq!(parsed.headless, Some(false));
            assert_eq!(parsed.browser_channel.as_deref(), Some("chrome"));
            assert_eq!(parsed.browser_executable_path, None);
            assert_eq!(parsed.report_id.as_deref(), Some("r1"));
            assert_eq!(parsed.timeout_ms, Some(5000.0));
            assert_eq!(parsed.debug, Some(true));
            assert_eq!(parsed.fields, Some(vec!["a".to_string(), "b".to_string()]));
            assert_eq!(parsed.headers, Some(vec![]));
        }

        #[test]
        fn ignores_unknown_keys() {
            let parsed = parse_gameday_export_input(&with(json!({"extra": 1}))).unwrap();
            assert!(serde_json::to_value(parsed).unwrap().get("extra").is_none());
        }

        #[test]
        fn rejects_non_objects() {
            assert_eq!(error(Value::Null), "Input must be an object.");
            assert_eq!(error(json!("x")), "Input must be an object.");
        }

        #[test]
        fn accepts_arrays_as_the_input_object_missing_required_fields_then_fail() {
            assert_eq!(error(json!([])), "startingUrl is required.");
        }

        #[test]
        fn rejects_missing_or_blank_required_strings() {
            assert_eq!(error(with(json!({"startingUrl": "__undefined__"}))), "startingUrl is required.");
            assert_eq!(error(with(json!({"username": "  "}))), "username is required.");
            assert_eq!(error(with(json!({"password": ""}))), "password is required.");
            assert_eq!(error(with(json!({"competition": 1}))), "competition is required.");
        }

        #[test]
        fn accepts_a_whitespace_only_password() {
            assert_eq!(parse_gameday_export_input(&with(json!({"password": "   "}))).unwrap().password, "   ");
        }

        #[test]
        fn rejects_wrongly_typed_optional_fields() {
            assert_eq!(error(with(json!({"headless": "true"}))), "headless must be a boolean.");
            assert_eq!(error(with(json!({"reportId": 1}))), "reportId must be a string.");
            assert_eq!(error(with(json!({"browserChannel": null}))), "browserChannel must be a string.");
            assert_eq!(error(with(json!({"timeoutMs": "5"}))), "timeoutMs must be a finite number.");
            // NaN cannot be written in JSON; null is the closest non-number
            assert_eq!(error(with(json!({"timeoutMs": null}))), "timeoutMs must be a finite number.");
            assert_eq!(error(with(json!({"fields": "a"}))), "fields must be an array of strings.");
            assert_eq!(error(with(json!({"headers": ["a", 1]}))), "headers must be an array of strings.");
        }
    }

    mod is_gameday_export_output_tests {
        use super::*;

        fn member() -> Value {
            json!({"teamName": "T", "firstName": "F", "lastName": "L", "email": "e@example.com", "gender": "male"})
        }

        fn member_with(key: &str, value: Value) -> Value {
            let mut map = member().as_object().cloned().unwrap();
            if value.is_null() {
                map.remove(key);
            } else {
                map.insert(key.into(), value);
            }
            Value::Object(map)
        }

        #[test]
        fn accepts_valid_outputs() {
            assert!(is_gameday_export_output(&json!({"members": []})));
            assert!(is_gameday_export_output(&json!({"members": [member()], "extra": 1})));
            assert!(is_gameday_export_output(&json!({"members": [member_with("gender", json!(""))]})));
        }

        #[test]
        fn rejects_invalid_outputs() {
            assert!(!is_gameday_export_output(&Value::Null));
            assert!(!is_gameday_export_output(&json!({})));
            assert!(!is_gameday_export_output(&json!({"members": {}})));
            assert!(!is_gameday_export_output(&json!({"members": [null]})));
            assert!(!is_gameday_export_output(&json!({"members": [member_with("email", Value::Null)]})));
            assert!(!is_gameday_export_output(&json!({"members": [member(), member_with("teamName", json!(1))]})));
        }
    }
}
