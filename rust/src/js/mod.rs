//! JavaScript semantics the TypeScript server relies on implicitly.
//!
//! The Rust server must produce byte-identical results for things like
//! `String.prototype.trim`, `Number(value)`, `String(number)` and
//! `JSON.stringify`, so those behaviours live here instead of being
//! approximated with Rust's own (slightly different) definitions.

pub mod date;
pub mod locale_compare;

use serde_json::{Number, Value};

/// Characters JavaScript treats as whitespace in `trim()` and the regex `\s`
/// class (WhiteSpace + LineTerminator). Rust's `char::is_whitespace` differs:
/// it includes U+0085 and excludes U+FEFF.
pub fn is_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// The JavaScript `\s` class written out for the Rust `regex` crate.
pub const WS_CLASS: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

/// `String.prototype.trim()`.
pub fn trim(value: &str) -> &str {
    value.trim_matches(is_whitespace)
}

/// `value.replace(/\s+/g, replacement)`.
pub fn replace_whitespace_runs(value: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_run = false;
    for c in value.chars() {
        if is_whitespace(c) {
            if !in_run {
                out.push_str(replacement);
                in_run = true;
            }
        } else {
            in_run = false;
            out.push(c);
        }
    }
    out
}

/// `/\s/.test(value)`.
pub fn has_whitespace(value: &str) -> bool {
    value.chars().any(is_whitespace)
}

/// `String(number)` for finite numbers (and the special values).
pub fn number_to_string(value: f64) -> String {
    if value.is_nan() {
        return "NaN".into();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    if value == 0.0 {
        return "0".into();
    }
    let abs = value.abs();
    if (1e-7..1e21).contains(&abs) {
        if value.fract() == 0.0 && abs < 9.007_199_254_740_992e15 {
            return format!("{}", value as i64);
        }
        // Rust's Display prints the shortest round-tripping decimal, as JS does.
        return format!("{value}");
    }
    // exponent form: JS prints e.g. 1e+21, 1.5e-7
    let formatted = format!("{value:e}");
    match formatted.split_once('e') {
        Some((mantissa, exponent)) if !exponent.starts_with('-') => {
            format!("{mantissa}e+{exponent}")
        }
        _ => formatted,
    }
}

/// `Number(value)` for a string, returning `NaN` where JavaScript would.
pub fn string_to_number(value: &str) -> f64 {
    let trimmed = trim(value);
    if trimmed.is_empty() {
        return 0.0;
    }
    let (sign, unsigned) = match trimmed.as_bytes()[0] {
        b'+' => (1.0, &trimmed[1..]),
        b'-' => (-1.0, &trimmed[1..]),
        _ => (1.0, trimmed),
    };
    if unsigned == "Infinity" {
        return sign * f64::INFINITY;
    }
    let lower_prefix = unsigned.get(..2).map(|p| p.to_ascii_lowercase());
    if let Some(prefix) = lower_prefix.as_deref() {
        let radix = match prefix {
            "0x" => Some(16),
            "0o" => Some(8),
            "0b" => Some(2),
            _ => None,
        };
        if let Some(radix) = radix {
            // signed radix literals are NaN in JavaScript
            if sign < 0.0 || trimmed.starts_with('+') {
                return f64::NAN;
            }
            let digits = &unsigned[2..];
            if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
                return f64::NAN;
            }
            return digits.chars().fold(0.0, |acc, c| {
                acc * f64::from(radix) + f64::from(c.to_digit(radix).unwrap_or(0))
            });
        }
    }
    if !is_decimal_literal(unsigned) {
        return f64::NAN;
    }
    unsigned
        .parse::<f64>()
        .map(|v| sign * v)
        .unwrap_or(f64::NAN)
}

fn is_decimal_literal(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    let mut int_digits = 0;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
        int_digits += 1;
    }
    let mut frac_digits = 0;
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
            frac_digits += 1;
        }
    }
    if int_digits == 0 && frac_digits == 0 {
        return false;
    }
    if index < bytes.len() && (bytes[index] == b'e' || bytes[index] == b'E') {
        index += 1;
        if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
            index += 1;
        }
        let start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == start {
            return false;
        }
    }
    index == bytes.len()
}

/// `Number.isInteger(value)`.
pub fn is_integer(value: f64) -> bool {
    value.is_finite() && value.fract() == 0.0
}

/// A JSON number holding `value` the way `JSON.stringify` would print it:
/// whole numbers without a fraction, `-0` as `0`. Non-finite values become
/// `null`, as in JavaScript.
pub fn number(value: f64) -> Value {
    if !value.is_finite() {
        return Value::Null;
    }
    if value.fract() == 0.0 && value.abs() < 9.2e18 {
        return Value::Number(Number::from(value as i64));
    }
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

/// Reads a JSON number as a JavaScript number.
pub fn as_f64(value: &Value) -> Option<f64> {
    value.as_f64()
}

/// Rewrites every number in `value` into its JavaScript form (see [`number`]),
/// so serialising produces the same text as `JSON.stringify`.
pub fn normalize_numbers(value: &mut Value) {
    match value {
        Value::Number(n) => {
            if n.is_f64()
                && let Some(f) = n.as_f64()
            {
                *value = number(f);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(normalize_numbers),
        Value::Object(map) => map.values_mut().for_each(normalize_numbers),
        _ => {}
    }
}

/// `JSON.stringify(value)` (numbers normalised first).
pub fn stringify(value: &Value) -> String {
    let mut normalized = value.clone();
    normalize_numbers(&mut normalized);
    serde_json::to_string(&normalized).unwrap_or_else(|_| "null".into())
}

/// `typeof value` for JSON values (`undefined` is `None`).
pub fn type_of(value: Option<&Value>) -> &'static str {
    match value {
        None => "undefined",
        Some(Value::Null) => "object",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) | Some(Value::Object(_)) => "object",
    }
}

/// `toUpperCase()` / `toLowerCase()` helpers that match JavaScript for the
/// characters the server deals with (Rust uses the same Unicode mappings).
pub fn to_lower(value: &str) -> String {
    value.to_lowercase()
}

pub fn to_upper(value: &str) -> String {
    value.to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trims_javascript_whitespace_only() {
        assert_eq!(trim("\u{FEFF} a \u{3000}"), "a");
        assert_eq!(trim("\u{0085}a"), "\u{0085}a");
    }

    #[test]
    fn parses_numbers_like_javascript() {
        assert_eq!(string_to_number(" 42 "), 42.0);
        assert_eq!(string_to_number("1e2"), 100.0);
        assert_eq!(string_to_number(".5"), 0.5);
        assert_eq!(string_to_number("5."), 5.0);
        assert_eq!(string_to_number("0x10"), 16.0);
        assert!(string_to_number("-0x10").is_nan());
        assert!(string_to_number("abc").is_nan());
        assert!(string_to_number("inf").is_nan());
        assert_eq!(string_to_number("-Infinity"), f64::NEG_INFINITY);
        assert!(string_to_number("1_000").is_nan());
    }

    #[test]
    fn formats_numbers_like_javascript() {
        assert_eq!(number_to_string(1.0), "1");
        assert_eq!(number_to_string(0.5), "0.5");
        assert_eq!(number_to_string(-3.0), "-3");
        assert_eq!(number_to_string(1e21), "1e+21");
        assert_eq!(number_to_string(-0.0), "0");
    }

    #[test]
    fn stringifies_like_json_stringify() {
        assert_eq!(
            stringify(&json!({"a": 3.0, "b": [1.5, -0.0]})),
            r#"{"a":3,"b":[1.5,0]}"#
        );
    }
}
