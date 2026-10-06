//! Port of `shared/src/schemas/ioUserGenderMatching.ts`.
//!
//! Gender matching decides which MVP slot (male or female) a player is voted
//! into. It is not the player's gender identity, so only these two values exist.

use crate::io_schema;
use crate::shared::torva::{io, IoError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const USER_GENDER_MATCHINGS: [&str; 2] = ["male", "female"];

/// `TUserGenderMatching`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GenderMatching {
    Male,
    Female,
}

impl GenderMatching {
    pub fn as_str(self) -> &'static str {
        match self {
            GenderMatching::Male => "male",
            GenderMatching::Female => "female",
        }
    }
}

/// Used when a gender matching cannot be worked out, e.g. imports and backfills.
pub const FALLBACK_USER_GENDER_MATCHING: GenderMatching = GenderMatching::Female;

/// `isUserGenderMatching(value)`.
pub fn is_user_gender_matching(value: Option<&str>) -> bool {
    value.is_some_and(|v| USER_GENDER_MATCHINGS.contains(&v))
}

fn normalize_key(value: &str) -> String {
    crate::js::trim(value)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        .collect()
}

fn normalize_words(value: &str) -> Vec<String> {
    crate::js::trim(value)
        .to_lowercase()
        .split(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit()))
        .filter(|word| !word.is_empty())
        .map(str::to_string)
        .collect()
}

const MALE_ALIASES: [&str; 18] = [
    "male",
    "male matching",
    "male-matching",
    "mmp",
    "m",
    "man",
    "men",
    "mens",
    "boy",
    "boys",
    "masculine",
    "cis male",
    "cis man",
    "trans male",
    "trans man",
    "transgender male",
    "ftm",
    "female to male",
];

const FEMALE_ALIASES: [&str; 21] = [
    "female",
    "female matching",
    "female-matching",
    "fmp",
    "f",
    "woman",
    "women",
    "womens",
    "womxn",
    "girl",
    "girls",
    "lady",
    "ladies",
    "feminine",
    "cis female",
    "cis woman",
    "trans female",
    "trans woman",
    "transgender female",
    "mtf",
    "male to female",
];

fn alias_map() -> &'static HashMap<String, GenderMatching> {
    static MAP: OnceLock<HashMap<String, GenderMatching>> = OnceLock::new();
    MAP.get_or_init(|| {
        let mut map = HashMap::new();
        for (matching, aliases) in [
            (GenderMatching::Male, &MALE_ALIASES[..]),
            (GenderMatching::Female, &FEMALE_ALIASES[..]),
        ] {
            for alias in aliases {
                // later entries win, as with `new Map(entries)`
                map.insert(normalize_key(alias), matching);
            }
        }
        map
    })
}

fn has_word(words: &[String], candidates: &[&str]) -> bool {
    candidates.iter().any(|candidate| words.iter().any(|word| word == candidate))
}

/// Values that name neither matching, so a male/female word inside them is not trusted.
fn has_unmatched_key(key: &str, words: &[String]) -> bool {
    key.contains("nonbinary")
        || key.contains("genderdiverse")
        || key.contains("genderqueer")
        || key.contains("genderfluid")
        || key.starts_with("prefernot")
        || key.starts_with("decline")
        || key.contains("notsay")
        || key.contains("notanswer")
        || key.contains("selfdescribe")
        || has_word(
            words,
            &["nb", "enby", "x", "agender", "bigender", "other", "unspecified", "unknown", "undisclosed", "declined"],
        )
}

/// Maps free text (form input, CSV or GameDay values) to a gender matching.
/// Returns `None` when the value does not clearly name male or female.
pub fn normalize_user_gender_matching(value: &str) -> Option<GenderMatching> {
    let key = normalize_key(value);
    if key.is_empty() {
        return None;
    }
    if let Some(matching) = alias_map().get(&key) {
        return Some(*matching);
    }
    let words = normalize_words(value);
    if has_unmatched_key(&key, &words) {
        return None;
    }
    let mut inferred = Vec::new();
    if has_word(&words, &["female", "f", "woman", "women", "womens", "girl", "girls", "lady", "ladies"]) {
        inferred.push(GenderMatching::Female);
    }
    if has_word(&words, &["male", "m", "man", "men", "mens", "boy", "boys"]) {
        inferred.push(GenderMatching::Male);
    }
    if inferred.len() == 1 { inferred.first().copied() } else { None }
}

io_schema! {
    pub fn io_user_gender_matching() {
        io::custom(|value| match value {
            Some(Value::String(text)) => match normalize_user_gender_matching(text) {
                Some(matching) => Ok(Some(Value::String(matching.as_str().into()))),
                None => Err(IoError::message("Value is not a valid enum option.")),
            },
            _ => Err(IoError::message("Enum value is not a string.")),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn expect_all(values: &[&str], expected: Option<GenderMatching>) {
        for value in values {
            assert_eq!(normalize_user_gender_matching(value), expected, "{value}");
        }
    }

    mod normalize_user_gender_matching_tests {
        use super::*;

        #[test]
        fn maps_exact_aliases_regardless_of_case_spacing_and_punctuation() {
            expect_all(
                &[
                    "male", "Male", " MALE ", "m", "Man", "mens", "MMP", "Male-matching", "Male Matching", "trans man", "FTM",
                    "female to male",
                ],
                Some(GenderMatching::Male),
            );
            expect_all(
                &[
                    "female", "F", "Woman", "womxn", "Ladies", "FMP", "female-matching", "Trans Woman", "MTF", "male to female",
                ],
                Some(GenderMatching::Female),
            );
        }

        #[test]
        fn returns_undefined_for_empty_or_punctuation_only_values() {
            expect_all(&["", "   ", "!!!", "/"], None);
        }

        #[test]
        fn infers_a_single_matching_from_words_in_longer_values() {
            expect_all(&["Male (he/him)", "mens team", "Boys"], Some(GenderMatching::Male));
            expect_all(&["Woman, she/her", "female player"], Some(GenderMatching::Female));
        }

        #[test]
        fn does_not_match_non_binary_other_or_opt_out_values() {
            expect_all(
                &[
                    "non-binary",
                    "Non Binary",
                    "nonbinary",
                    "NB",
                    "x",
                    "Gender Diverse",
                    "non-binary person",
                    "nonbinary woman",
                    "nb male",
                    "other",
                    "Other: male",
                    "unspecified (male)",
                    "Prefer not to say",
                    "Declined to state",
                    "I self-describe as x",
                    "N/A",
                ],
                None,
            );
        }

        #[test]
        fn does_not_match_ambiguous_or_unrecognised_values() {
            expect_all(&["Male/Female", "man or woman", "femme", "W", "Females", "abc", "masc"], None);
        }
    }

    mod is_user_gender_matching_tests {
        use super::*;

        #[test]
        fn accepts_only_male_and_female() {
            assert!(is_user_gender_matching(Some("male")));
            assert!(is_user_gender_matching(Some("female")));
            assert!(!is_user_gender_matching(Some("non-binary")));
            assert!(!is_user_gender_matching(Some("other")));
            assert!(!is_user_gender_matching(None));
        }
    }

    mod io_user_gender_matching_tests {
        use super::*;

        #[test]
        fn normalises_valid_values() {
            assert_eq!(io_user_gender_matching().validate(&json!("Woman")), Ok(json!("female")));
        }

        #[test]
        fn rejects_non_strings_and_unrecognised_values() {
            assert_eq!(io_user_gender_matching().validate(&json!(1)), Err("Enum value is not a string.".to_string()));
            for value in ["abc", "non-binary", "other"] {
                assert_eq!(
                    io_user_gender_matching().validate(&json!(value)),
                    Err("Value is not a valid enum option.".to_string())
                );
            }
        }
    }
}
