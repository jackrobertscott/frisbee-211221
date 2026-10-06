//! Port of `shared/src/utils/regex.ts`: case-insensitive matchers built from
//! user input, plus the shared email and hsla format checks.
//!
//! JavaScript regex classes are spelled out (`\s`, `\d`, `.`) because the Rust
//! `regex` crate's Unicode defaults differ slightly.

use crate::js;
use regex::{Regex, RegexBuilder};
use std::sync::OnceLock;

/// `regex.escape(value)`: backslash-escapes `.*+?^${}()|[]\` like the TS helper.
pub fn escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn case_insensitive(pattern: &str) -> Regex {
    RegexBuilder::new(pattern)
        .case_insensitive(true)
        .build()
        .unwrap_or_else(|_| Regex::new("$^").unwrap_or_else(|_| unreachable!()))
}

/// `regex.from(value)`: case-insensitive "contains".
pub fn from(value: &str) -> Regex {
    case_insensitive(&regex::escape(value))
}

/// `regex.normalize(value)`: case-insensitive whole-string match of the trimmed value.
pub fn normalize(value: &str) -> Regex {
    case_insensitive(&format!("^{}$", regex::escape(js::trim(value))))
}

/// `regex.startsWith(value)`.
pub fn starts_with(value: &str) -> Regex {
    case_insensitive(&format!("^{}", regex::escape(js::trim(value))))
}

/// `regex.endsWith(value)`.
pub fn ends_with(value: &str) -> Regex {
    case_insensitive(&format!("{}$", regex::escape(js::trim(value))))
}

/// `regex.email()`.
pub fn email() -> &'static Regex {
    static EMAIL: OnceLock<Regex> = OnceLock::new();
    EMAIL.get_or_init(|| {
        let ws = js::WS_CLASS;
        let local = format!(r#"[^<>()\[\]\\.,;:{ws}@"]+"#);
        let pattern = format!(
            r#"^(({local}(\.{local})*)|("[^\n\r\x{{2028}}\x{{2029}}]+"))@((\[[0-9]{{1,3}}\.[0-9]{{1,3}}\.[0-9]{{1,3}}\.[0-9]{{1,3}}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{{2,}}))$"#
        );
        Regex::new(&pattern).unwrap_or_else(|error| panic!("invalid email regex: {error}"))
    })
}

/// `regex.hsla()`: channels are plain decimals such as 40, 10.5 or .25; only
/// the hue may be negative.
pub fn hsla() -> &'static Regex {
    static HSLA: OnceLock<Regex> = OnceLock::new();
    HSLA.get_or_init(|| {
        let s = format!("[{}]*", js::WS_CLASS);
        let num = r"(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)";
        let pattern = format!(
            r"^hsla\({s}(-?{num}){s},{s}({num})%{s},{s}({num})%{s},{s}({num}){s}\)$"
        );
        Regex::new(&pattern).unwrap_or_else(|error| panic!("invalid hsla regex: {error}"))
    })
}

/// `regex.from(needle).test(haystack)` without compiling a regex: a
/// case-insensitive substring check (also registered in SQLite as `contains_ci`).
pub fn contains_ci(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    haystack.to_lowercase().contains(&needle.to_lowercase())
}

/// `regex.normalize(a).test(b)` without compiling a regex.
pub fn equals_ci(a: &str, b: &str) -> bool {
    js::trim(a).to_lowercase() == b.to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    // regex helpers (shared/src/torva/index.test.ts)
    #[test]
    fn escapes_special_characters() {
        assert_eq!(escape("a.b*c"), "a\\.b\\*c");
        assert!(from("a.b").is_match("xA.By"));
        assert!(!from("a.b").is_match("axb"));
    }

    #[test]
    fn builds_anchored_case_insensitive_matchers_from_trimmed_input() {
        assert!(normalize("  Foo ").is_match("foo"));
        assert!(!normalize("foo").is_match("foobar"));
        assert!(starts_with(" fo").is_match("Foobar"));
        assert!(!starts_with("bar").is_match("foobar"));
        assert!(ends_with("bar ").is_match("fooBAR"));
        assert!(!ends_with("foo").is_match("foobar"));
    }

    #[test]
    fn plain_helpers_match_the_regex_helpers() {
        assert!(contains_ci("xA.By", "a.b"));
        assert!(!contains_ci("axb", "a.b"));
        assert!(equals_ci("  Foo ", "foo"));
        assert!(!equals_ci("foo", "foobar"));
    }
}
