//! `String.prototype.localeCompare` (no locale argument, as the TS server
//! calls it): an approximation of the ICU root collation Node uses.
//!
//! Strings compare first on their base characters across the whole string
//! (whitespace < punctuation < symbols < digits < letters < anything else;
//! letters alphabetically, ignoring case and accents), then on accents, then
//! on case (lowercase before uppercase).

use std::cmp::Ordering;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// ASCII punctuation and symbols in ICU root order.
const ASCII_PUNCTUATION_ORDER: &str = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";

/// One collation element: primary (group, value), secondary (accents) and
/// tertiary (uppercase) weights.
#[derive(Clone, Debug, PartialEq, Eq)]
struct Element {
    primary: (u8, u32),
    accents: Vec<char>,
    upper: bool,
}

fn element(c: char) -> Element {
    let mut decomposed = std::iter::once(c).nfd();
    let base = decomposed.next().unwrap_or(c);
    let accents: Vec<char> = decomposed.filter(|m| is_combining_mark(*m)).collect();
    let upper = base.is_uppercase();
    let primary = if crate::js::is_whitespace(base) {
        (0, base as u32)
    } else if let Some(rank) = ASCII_PUNCTUATION_ORDER.find(base) {
        (1, rank as u32)
    } else if base.is_ascii_digit() {
        (3, base as u32 - '0' as u32)
    } else if base.is_alphabetic() {
        let lower = base.to_lowercase().next().unwrap_or(base);
        (4, lower as u32)
    } else if base.is_ascii() {
        (2, base as u32)
    } else {
        (5, base as u32)
    };
    Element {
        primary,
        accents,
        upper,
    }
}

/// `left.localeCompare(right)` as an [`Ordering`].
pub fn locale_compare(left: &str, right: &str) -> Ordering {
    if left == right {
        return Ordering::Equal;
    }
    let a: Vec<Element> = left.chars().map(element).collect();
    let b: Vec<Element> = right.chars().map(element).collect();
    let primary = |items: &[Element]| items.iter().map(|e| e.primary).collect::<Vec<_>>();
    let secondary = |items: &[Element]| items.iter().map(|e| e.accents.clone()).collect::<Vec<_>>();
    let tertiary = |items: &[Element]| items.iter().map(|e| e.upper).collect::<Vec<_>>();
    primary(&a)
        .cmp(&primary(&b))
        .then_with(|| secondary(&a).cmp(&secondary(&b)))
        .then_with(|| tertiary(&a).cmp(&tertiary(&b)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_letters_alphabetically_ignoring_case_first() {
        assert_eq!(locale_compare("a", "B"), Ordering::Less);
        assert_eq!(locale_compare("B", "a"), Ordering::Greater);
        assert_eq!(locale_compare("a", "A"), Ordering::Less);
        assert_eq!(locale_compare("Alpha", "alpha"), Ordering::Greater);
        assert_eq!(locale_compare("echo", "Delta"), Ordering::Greater);
    }

    #[test]
    fn orders_punctuation_before_digits_before_letters() {
        assert_eq!(locale_compare("a::b", "a0"), Ordering::Less);
        assert_eq!(locale_compare("1", "a"), Ordering::Less);
        assert_eq!(locale_compare(" ", "_"), Ordering::Less);
        assert_eq!(locale_compare("ab", "abc"), Ordering::Less);
    }

    #[test]
    fn treats_accents_as_secondary() {
        assert_eq!(locale_compare("e", "é"), Ordering::Less);
        assert_eq!(locale_compare("é", "f"), Ordering::Less);
        assert_eq!(locale_compare("same", "same"), Ordering::Equal);
    }
}
