//! Port of `shared/src/utils/reportValidation.ts`.

/// `OfficialSpiritFields`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OfficialSpiritFields {
    pub spirit_comment: String,
    pub spirit_p1: Option<f64>,
    pub spirit_p2: Option<f64>,
    pub spirit_p3: Option<f64>,
    pub spirit_p4: Option<f64>,
    pub spirit_p5: Option<f64>,
}

pub const OFFICIAL_SPIRIT_COMMENT_MIN_TOTAL: f64 = 9.0;
pub const OFFICIAL_SPIRIT_COMMENT_MAX_TOTAL: f64 = 11.0;

/// `getOfficialSpiritScoreTotal(fields)`: the sum, or `None` when any score is missing.
pub fn get_official_spirit_score_total(fields: &OfficialSpiritFields) -> Option<f64> {
    Some(
        fields.spirit_p1?
            + fields.spirit_p2?
            + fields.spirit_p3?
            + fields.spirit_p4?
            + fields.spirit_p5?,
    )
}

/// `officialSpiritCommentRequired(fields)`.
pub fn official_spirit_comment_required(fields: &OfficialSpiritFields) -> bool {
    get_official_spirit_score_total(fields).is_some_and(|total| {
        !(OFFICIAL_SPIRIT_COMMENT_MIN_TOTAL..=OFFICIAL_SPIRIT_COMMENT_MAX_TOTAL).contains(&total)
    })
}

/// `hasSpiritComment(comment)`.
pub fn has_spirit_comment(comment: &str) -> bool {
    !crate::js::trim(comment).is_empty()
}

/// `validateOfficialSpiritComment(fields)`: the error message, if any.
pub fn validate_official_spirit_comment(fields: &OfficialSpiritFields) -> Option<&'static str> {
    if official_spirit_comment_required(fields) && !has_spirit_comment(&fields.spirit_comment) {
        return Some("A comment is required when the total spirit score is below 9 or above 11.");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scores(p1: f64, p2: f64, p3: f64, p4: f64, p5: f64) -> OfficialSpiritFields {
        OfficialSpiritFields {
            spirit_comment: String::new(),
            spirit_p1: Some(p1),
            spirit_p2: Some(p2),
            spirit_p3: Some(p3),
            spirit_p4: Some(p4),
            spirit_p5: Some(p5),
        }
    }

    fn with_comment(mut fields: OfficialSpiritFields, comment: &str) -> OfficialSpiritFields {
        fields.spirit_comment = comment.into();
        fields
    }

    const MESSAGE: &str =
        "A comment is required when the total spirit score is below 9 or above 11.";

    mod get_official_spirit_score_total_tests {
        use super::*;

        #[test]
        fn sums_all_five_scores() {
            assert_eq!(
                get_official_spirit_score_total(&scores(2.0, 2.0, 2.0, 2.0, 2.0)),
                Some(10.0)
            );
            assert_eq!(
                get_official_spirit_score_total(&scores(0.0, 0.0, 0.0, 0.0, 0.0)),
                Some(0.0)
            );
        }

        #[test]
        fn returns_undefined_when_any_score_is_missing() {
            let mut missing = scores(2.0, 2.0, 2.0, 2.0, 2.0);
            missing.spirit_p3 = None;
            assert_eq!(get_official_spirit_score_total(&missing), None);
            assert_eq!(
                get_official_spirit_score_total(&OfficialSpiritFields::default()),
                None
            );
        }
    }

    mod official_spirit_comment_required_tests {
        use super::*;

        #[test]
        fn requires_a_comment_outside_9_11_inclusive() {
            assert!(official_spirit_comment_required(&scores(
                2.0, 2.0, 2.0, 2.0, 0.0
            ))); // 8
            assert!(!official_spirit_comment_required(&scores(
                2.0, 2.0, 2.0, 2.0, 1.0
            ))); // 9
            assert!(!official_spirit_comment_required(&scores(
                2.0, 2.0, 2.0, 2.0, 2.0
            ))); // 10
            assert!(!official_spirit_comment_required(&scores(
                3.0, 2.0, 2.0, 2.0, 2.0
            ))); // 11
            assert!(official_spirit_comment_required(&scores(
                3.0, 3.0, 2.0, 2.0, 2.0
            ))); // 12
        }

        #[test]
        fn does_not_require_a_comment_for_incomplete_scores() {
            let partial = OfficialSpiritFields {
                spirit_p1: Some(0.0),
                ..Default::default()
            };
            assert!(!official_spirit_comment_required(&partial));
        }
    }

    mod has_spirit_comment_tests {
        use super::*;

        #[test]
        fn requires_non_whitespace_content() {
            assert!(has_spirit_comment("Great game"));
            assert!(!has_spirit_comment("   "));
            assert!(!has_spirit_comment(""));
        }
    }

    mod validate_official_spirit_comment_tests {
        use super::*;

        #[test]
        fn returns_an_error_when_a_required_comment_is_missing() {
            assert_eq!(
                validate_official_spirit_comment(&with_comment(
                    scores(0.0, 0.0, 0.0, 0.0, 0.0),
                    " "
                )),
                Some(MESSAGE)
            );
            assert_eq!(
                validate_official_spirit_comment(&with_comment(
                    scores(4.0, 4.0, 4.0, 4.0, 4.0),
                    ""
                )),
                Some(MESSAGE)
            );
        }

        #[test]
        fn passes_with_a_comment_or_an_in_range_total() {
            assert_eq!(
                validate_official_spirit_comment(&with_comment(
                    scores(0.0, 0.0, 0.0, 0.0, 0.0),
                    "Rough"
                )),
                None
            );
            assert_eq!(
                validate_official_spirit_comment(&with_comment(
                    scores(2.0, 2.0, 2.0, 2.0, 2.0),
                    ""
                )),
                None
            );
            assert_eq!(
                validate_official_spirit_comment(&OfficialSpiritFields::default()),
                None
            );
        }
    }
}
