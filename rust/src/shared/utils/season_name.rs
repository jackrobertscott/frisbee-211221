//! Port of `shared/src/utils/seasonName.ts`.
//!
//! Season names sort like `Intl.Collator('en', {numeric: true, sensitivity:
//! 'base'})` (and the matching Mongo collation): case and accents are ignored
//! and digit runs compare as numbers. SQLite uses the same comparison through
//! the `season_name` collation registered on every connection.

use std::cmp::Ordering;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// `seasonNameCollation`: the Mongo collation the TS server declared.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeasonNameCollation {
    pub locale: &'static str,
    pub numeric_ordering: bool,
    pub strength: u8,
}

pub const SEASON_NAME_COLLATION: SeasonNameCollation = SeasonNameCollation {
    locale: "en",
    numeric_ordering: true,
    strength: 1,
};

/// The SQLite collation name implementing [`compare_season_names`].
pub const SEASON_NAME_SQL_COLLATION: &str = "season_name";

#[derive(Debug, PartialEq, Eq)]
enum Element {
    Space,
    Punct(char),
    Symbol(char),
    Number(String),
    Letter(char),
    Other(char),
}

impl Element {
    fn rank(&self) -> u8 {
        match self {
            Element::Space => 0,
            Element::Punct(_) => 1,
            Element::Symbol(_) => 2,
            Element::Number(_) => 3,
            Element::Letter(_) => 4,
            Element::Other(_) => 5,
        }
    }
}

fn elements(value: &str) -> Vec<Element> {
    let folded: String = value
        .nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase();
    let mut out = Vec::new();
    let mut chars = folded.chars().peekable();
    while let Some(c) = chars.next() {
        if c.is_ascii_digit() {
            let mut digits = String::from(c);
            while let Some(next) = chars.peek().copied().filter(char::is_ascii_digit) {
                digits.push(next);
                chars.next();
            }
            let trimmed = digits.trim_start_matches('0');
            out.push(Element::Number(if trimmed.is_empty() {
                "0".into()
            } else {
                trimmed.into()
            }));
        } else if crate::js::is_whitespace(c) {
            out.push(Element::Space);
        } else if c.is_ascii_punctuation() && !"$+<=>^`|~".contains(c) {
            out.push(Element::Punct(c));
        } else if c.is_ascii_punctuation() {
            out.push(Element::Symbol(c));
        } else if c.is_alphabetic() {
            match c {
                'æ' => {
                    out.push(Element::Letter('a'));
                    out.push(Element::Letter('e'));
                }
                'ß' => {
                    out.push(Element::Letter('s'));
                    out.push(Element::Letter('s'));
                }
                'ø' => out.push(Element::Letter('o')),
                'đ' => out.push(Element::Letter('d')),
                'ł' => out.push(Element::Letter('l')),
                _ => out.push(Element::Letter(c)),
            }
        } else {
            out.push(Element::Other(c));
        }
    }
    out
}

fn compare_elements(left: &Element, right: &Element) -> Ordering {
    match left.rank().cmp(&right.rank()) {
        Ordering::Equal => {}
        other => return other,
    }
    match (left, right) {
        (Element::Number(a), Element::Number(b)) => a.len().cmp(&b.len()).then_with(|| a.cmp(b)),
        (Element::Punct(a), Element::Punct(b))
        | (Element::Symbol(a), Element::Symbol(b))
        | (Element::Letter(a), Element::Letter(b))
        | (Element::Other(a), Element::Other(b)) => a.cmp(b),
        _ => Ordering::Equal,
    }
}

/// `compareSeasonNames(left, right)` for strings.
pub fn compare_season_names(left: &str, right: &str) -> Ordering {
    let (a, b) = (elements(left), elements(right));
    for (x, y) in a.iter().zip(b.iter()) {
        match compare_elements(x, y) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    a.len().cmp(&b.len())
}

/// `compareSeasonNames` for arbitrary JSON values: `null`/missing count as
/// empty strings and everything else is stringified like `String(value)`.
pub fn compare_season_name_values(
    left: Option<&serde_json::Value>,
    right: Option<&serde_json::Value>,
) -> Ordering {
    let text = |value: Option<&serde_json::Value>| match value {
        None | Some(serde_json::Value::Null) => String::new(),
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Number(n)) => {
            crate::js::number_to_string(n.as_f64().unwrap_or(f64::NAN))
        }
        Some(other) => other.to_string(),
    };
    compare_season_names(&text(left), &text(right))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    mod compare_season_names_tests {
        use super::*;

        #[test]
        fn orders_numbers_numerically() {
            let mut names = vec!["Season 10", "Season 2", "Season 1"];
            names.sort_by(|a, b| compare_season_names(a, b));
            assert_eq!(names, ["Season 1", "Season 2", "Season 10"]);
        }

        #[test]
        fn ignores_case_and_accents() {
            assert_eq!(compare_season_names("summer", "SUMMER"), Ordering::Equal);
            assert_eq!(compare_season_names("Été", "ete"), Ordering::Equal);
        }

        #[test]
        fn orders_alphabetically() {
            assert_eq!(
                compare_season_names("Autumn 2024", "Winter 2023"),
                Ordering::Less
            );
            assert_eq!(
                compare_season_names("2025 Winter", "2024 Winter"),
                Ordering::Greater
            );
        }

        #[test]
        fn treats_null_and_undefined_as_empty_strings_and_stringifies_others() {
            assert_eq!(
                compare_season_name_values(None, Some(&json!(""))),
                Ordering::Equal
            );
            assert_eq!(
                compare_season_name_values(Some(&json!(null)), Some(&json!("a"))),
                Ordering::Less
            );
            assert_eq!(
                compare_season_name_values(Some(&json!(10)), Some(&json!(9))),
                Ordering::Greater
            );
        }

        #[test]
        fn exposes_matching_mongo_collation_options() {
            assert_eq!(
                SEASON_NAME_COLLATION,
                SeasonNameCollation {
                    locale: "en",
                    numeric_ordering: true,
                    strength: 1
                }
            );
        }
    }
}
