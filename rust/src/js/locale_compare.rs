//! `String.prototype.localeCompare` as Node runs it without a locale: ICU's
//! root collation at tertiary strength, non-ignorable punctuation.
//!
//! A reimplementation for the characters the app stores (Latin text,
//! digits, ASCII punctuation): strings compare first by base letters
//! (case- and accent-insensitive; whitespace < punctuation < symbols <
//! digits < letters), then by accents, then by case (lowercase first).
//! Other scripts sort after Latin by code point.

use std::cmp::Ordering;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// CLDR root order of the ASCII punctuation and symbols.
const ASCII_VARIABLE_ORDER: &str = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum Group {
    Space,
    Punct,
    Symbol,
    Digit,
    Latin,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Element {
    primary: (Group, u32),
    secondary: Vec<char>,
    upper: bool,
}

fn expand(c: char) -> Option<&'static str> {
    match c {
        'æ' | 'Æ' => Some("ae"),
        'œ' | 'Œ' => Some("oe"),
        'ß' => Some("ss"),
        'ø' | 'Ø' => Some("o"),
        'đ' | 'Đ' => Some("d"),
        'ł' | 'Ł' => Some("l"),
        _ => None,
    }
}

fn primary(c: char) -> (Group, u32) {
    if crate::js::is_whitespace(c) {
        return (Group::Space, c as u32);
    }
    if let Some(index) = ASCII_VARIABLE_ORDER.find(c) {
        let group = if index < ASCII_VARIABLE_ORDER.find('@').unwrap_or(0) {
            Group::Punct
        } else {
            Group::Symbol
        };
        return (group, index as u32);
    }
    if let Some(digit) = c.to_digit(10) {
        return (Group::Digit, digit);
    }
    if c.is_ascii_alphabetic() {
        return (Group::Latin, c.to_ascii_lowercase() as u32);
    }
    if c.is_alphanumeric() {
        let lower = c.to_lowercase().next().unwrap_or(c);
        return (Group::Other, lower as u32);
    }
    if c.is_ascii() || c.is_whitespace() {
        return (Group::Punct, 1000 + c as u32);
    }
    (Group::Symbol, 1000 + c as u32)
}

fn elements(value: &str) -> Vec<Element> {
    let mut out: Vec<Element> = Vec::new();
    for c in value.nfd() {
        if is_combining_mark(c) {
            if let Some(last) = out.last_mut() {
                last.secondary.push(c);
            }
            continue;
        }
        if c.is_control() && !crate::js::is_whitespace(c) {
            continue;
        }
        let upper = c.is_uppercase();
        match expand(c) {
            Some(letters) => {
                for letter in letters.chars() {
                    out.push(Element {
                        primary: primary(letter),
                        secondary: Vec::new(),
                        upper,
                    });
                }
            }
            None => out.push(Element {
                primary: primary(c),
                secondary: Vec::new(),
                upper,
            }),
        }
    }
    out
}

/// `left.localeCompare(right)`.
pub fn locale_compare(left: &str, right: &str) -> Ordering {
    if left == right {
        return Ordering::Equal;
    }
    let (a, b) = (elements(left), elements(right));
    let primaries = |e: &[Element]| e.iter().map(|x| x.primary).collect::<Vec<_>>();
    primaries(&a)
        .cmp(&primaries(&b))
        .then_with(|| {
            let secondaries =
                |e: &[Element]| e.iter().map(|x| x.secondary.clone()).collect::<Vec<_>>();
            secondaries(&a).cmp(&secondaries(&b))
        })
        .then_with(|| {
            let tertiaries = |e: &[Element]| e.iter().map(|x| x.upper).collect::<Vec<_>>();
            tertiaries(&a).cmp(&tertiaries(&b))
        })
        .then_with(|| left.cmp(right))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sorted by Node (`[...].sort((a, b) => a.localeCompare(b))`).
    #[test]
    fn sorts_like_node() {
        let expected = [
            "",
            " a",
            "_a",
            "-a",
            ",a",
            "!a",
            "?a",
            ".a",
            "'a",
            "\"a",
            "(a",
            "@a",
            "*a",
            "/a",
            "&a",
            "#a",
            "%a",
            "+a",
            "=a",
            "$a",
            "0",
            "1",
            "10",
            "2",
            "9a",
            "a",
            "A",
            "á",
            "Á",
            "a b",
            "a-b",
            "ab",
            "Ab",
            "abc",
            "Ætna",
            "Alpha",
            "alpha 2",
            "Alpha 2",
            "B",
            "bravo",
            "Bravo",
            "charlie",
            "u",
            "U",
            "ü",
            "ua",
            "Unknown team",
            "Unknown user",
            "Zeta",
            "zz",
        ];
        let mut shuffled: Vec<&str> = expected.iter().rev().copied().collect();
        shuffled.sort_by(|a, b| locale_compare(a, b));
        assert_eq!(shuffled, expected);
    }

    #[test]
    fn is_equal_only_for_identical_text() {
        assert_eq!(locale_compare("Team", "Team"), Ordering::Equal);
        assert_eq!(locale_compare("a", "A"), Ordering::Less);
        assert_eq!(locale_compare("resume", "résumé"), Ordering::Less);
    }

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
