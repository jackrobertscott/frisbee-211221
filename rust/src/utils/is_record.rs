//! Port of `server/src/utils/isRecord.ts`.

use serde_json::Value;

/// `isRecord(value)`: `typeof value === 'object' && value !== null` — true for
/// objects *and arrays*, as in JavaScript.
pub fn is_record(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Object(_)) | Some(Value::Array(_)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matches_javascript_object_checks() {
        assert!(is_record(Some(&json!({}))));
        assert!(is_record(Some(&json!([]))));
        assert!(!is_record(Some(&Value::Null)));
        assert!(!is_record(Some(&json!("x"))));
        assert!(!is_record(None));
    }
}
