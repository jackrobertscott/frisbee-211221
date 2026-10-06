//! Port of `shared/src/utils/seasonGenderDivision.ts`.

use crate::shared::schemas::{GenderMatching, Season, SeasonGenderDivision};

/// MVP slots line up one-to-one with gender matchings.
pub type MvpGenderSlot = GenderMatching;

/// `TSeasonMvpFields`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SeasonMvpFields {
    pub mvp_male: Option<String>,
    pub mvp_male2: Option<String>,
    pub mvp_female: Option<String>,
    pub mvp_female2: Option<String>,
}

/// Anything carrying a season's `genderDivision`.
pub trait HasGenderDivision {
    fn gender_division(&self) -> Option<SeasonGenderDivision>;
}

impl HasGenderDivision for Season {
    fn gender_division(&self) -> Option<SeasonGenderDivision> {
        self.gender_division
    }
}

impl HasGenderDivision for Option<SeasonGenderDivision> {
    fn gender_division(&self) -> Option<SeasonGenderDivision> {
        *self
    }
}

/// `getSeasonGenderDivision(season)`: defaults to mixed.
pub fn get_season_gender_division(season: Option<&dyn HasGenderDivision>) -> SeasonGenderDivision {
    season.and_then(|s| s.gender_division()).unwrap_or(SeasonGenderDivision::Mixed)
}

/// `isSeasonMvpSlotEnabled(season, slot)`.
pub fn is_season_mvp_slot_enabled(season: Option<&dyn HasGenderDivision>, slot: MvpGenderSlot) -> bool {
    match get_season_gender_division(season) {
        SeasonGenderDivision::Mixed => true,
        SeasonGenderDivision::Men => slot == GenderMatching::Male,
        SeasonGenderDivision::Women => slot == GenderMatching::Female,
    }
}

/// `isUserEligibleForMvpSlot(user, slot)`.
pub fn is_user_eligible_for_mvp_slot(gender_matching: GenderMatching, slot: MvpGenderSlot) -> bool {
    gender_matching == slot
}

/// `getSeasonMvpSlots(season)`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MvpSlots {
    pub male: bool,
    pub female: bool,
}

pub fn get_season_mvp_slots(season: Option<&dyn HasGenderDivision>) -> MvpSlots {
    MvpSlots {
        male: is_season_mvp_slot_enabled(season, GenderMatching::Male),
        female: is_season_mvp_slot_enabled(season, GenderMatching::Female),
    }
}

/// `sanitizeSeasonMvpFields(season, fields)`: clears picks for disabled slots.
pub fn sanitize_season_mvp_fields(season: Option<&dyn HasGenderDivision>, fields: &SeasonMvpFields) -> SeasonMvpFields {
    let slots = get_season_mvp_slots(season);
    SeasonMvpFields {
        mvp_male: if slots.male { fields.mvp_male.clone() } else { None },
        mvp_male2: if slots.male { fields.mvp_male2.clone() } else { None },
        mvp_female: if slots.female { fields.mvp_female.clone() } else { None },
        mvp_female2: if slots.female { fields.mvp_female2.clone() } else { None },
    }
}

/// Result of [`is_report_mvp_complete_for_season`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MvpCompleteness {
    Complete,
    Partial,
    Empty,
}

impl MvpCompleteness {
    pub fn as_str(self) -> &'static str {
        match self {
            MvpCompleteness::Complete => "complete",
            MvpCompleteness::Partial => "partial",
            MvpCompleteness::Empty => "empty",
        }
    }
}

fn truthy(value: &Option<String>) -> bool {
    value.as_deref().is_some_and(|v| !v.is_empty())
}

/// `isReportMvpCompleteForSeason(report, season, useOfficialScoring)`.
pub fn is_report_mvp_complete_for_season(
    report: &SeasonMvpFields,
    season: Option<&dyn HasGenderDivision>,
    use_official_scoring: Option<bool>,
) -> MvpCompleteness {
    let slots = get_season_mvp_slots(season);
    let mut primary = Vec::new();
    if slots.male {
        primary.push(&report.mvp_male);
    }
    if slots.female {
        primary.push(&report.mvp_female);
    }
    let mut secondary = Vec::new();
    if use_official_scoring == Some(true) {
        if slots.male {
            secondary.push(&report.mvp_male2);
        }
        if slots.female {
            secondary.push(&report.mvp_female2);
        }
    }
    let required: Vec<&Option<String>> = primary.iter().chain(secondary.iter()).copied().collect();
    if required.is_empty() || required.iter().all(|v| truthy(v)) {
        return MvpCompleteness::Complete;
    }
    if primary.iter().any(|v| truthy(v)) {
        return MvpCompleteness::Partial;
    }
    MvpCompleteness::Empty
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIXED: Option<SeasonGenderDivision> = Some(SeasonGenderDivision::Mixed);
    const MEN: Option<SeasonGenderDivision> = Some(SeasonGenderDivision::Men);
    const WOMEN: Option<SeasonGenderDivision> = Some(SeasonGenderDivision::Women);
    const UNSET: Option<SeasonGenderDivision> = None;

    fn s(value: &Option<SeasonGenderDivision>) -> Option<&dyn HasGenderDivision> {
        Some(value)
    }

    fn fields(male: Option<&str>, male2: Option<&str>, female: Option<&str>, female2: Option<&str>) -> SeasonMvpFields {
        SeasonMvpFields {
            mvp_male: male.map(str::to_string),
            mvp_male2: male2.map(str::to_string),
            mvp_female: female.map(str::to_string),
            mvp_female2: female2.map(str::to_string),
        }
    }

    mod get_season_gender_division_tests {
        use super::*;

        #[test]
        fn defaults_to_mixed() {
            assert_eq!(get_season_gender_division(None), SeasonGenderDivision::Mixed);
            assert_eq!(get_season_gender_division(s(&UNSET)), SeasonGenderDivision::Mixed);
            assert_eq!(get_season_gender_division(s(&MEN)), SeasonGenderDivision::Men);
            assert_eq!(get_season_gender_division(s(&WOMEN)), SeasonGenderDivision::Women);
        }
    }

    mod mvp_slots {
        use super::*;

        #[test]
        fn enables_slots_by_division() {
            assert_eq!(get_season_mvp_slots(None), MvpSlots { male: true, female: true });
            assert_eq!(get_season_mvp_slots(s(&MIXED)), MvpSlots { male: true, female: true });
            assert_eq!(get_season_mvp_slots(s(&MEN)), MvpSlots { male: true, female: false });
            assert_eq!(get_season_mvp_slots(s(&WOMEN)), MvpSlots { male: false, female: true });
            assert!(!is_season_mvp_slot_enabled(s(&MEN), GenderMatching::Female));
            assert!(is_season_mvp_slot_enabled(s(&WOMEN), GenderMatching::Female));
        }

        #[test]
        fn only_lets_users_fill_the_slot_of_their_gender_matching() {
            assert!(is_user_eligible_for_mvp_slot(GenderMatching::Male, GenderMatching::Male));
            assert!(!is_user_eligible_for_mvp_slot(GenderMatching::Male, GenderMatching::Female));
            assert!(is_user_eligible_for_mvp_slot(GenderMatching::Female, GenderMatching::Female));
            assert!(!is_user_eligible_for_mvp_slot(GenderMatching::Female, GenderMatching::Male));
        }
    }

    mod sanitize_season_mvp_fields_tests {
        use super::*;

        #[test]
        fn clears_fields_for_disabled_slots() {
            let all = fields(Some("m1"), Some("m2"), Some("f1"), Some("f2"));
            assert_eq!(sanitize_season_mvp_fields(s(&MIXED), &all), all);
            assert_eq!(sanitize_season_mvp_fields(s(&MEN), &all), fields(Some("m1"), Some("m2"), None, None));
            assert_eq!(sanitize_season_mvp_fields(s(&WOMEN), &all), fields(None, None, Some("f1"), Some("f2")));
        }
    }

    mod is_report_mvp_complete_for_season_tests {
        use super::*;
        use MvpCompleteness::*;

        #[test]
        fn requires_primary_mvps_for_enabled_slots() {
            assert_eq!(is_report_mvp_complete_for_season(&fields(None, None, None, None), s(&MIXED), Some(false)), Empty);
            assert_eq!(is_report_mvp_complete_for_season(&fields(Some("a"), None, None, None), s(&MIXED), Some(false)), Partial);
            assert_eq!(
                is_report_mvp_complete_for_season(&fields(Some("a"), None, Some("b"), None), s(&MIXED), Some(false)),
                Complete
            );
            assert_eq!(is_report_mvp_complete_for_season(&fields(Some("a"), None, None, None), s(&MEN), Some(false)), Complete);
            assert_eq!(is_report_mvp_complete_for_season(&fields(None, None, Some("b"), None), s(&MEN), Some(false)), Empty);
        }

        #[test]
        fn requires_secondary_mvps_only_with_official_scoring() {
            let primary = fields(Some("a"), None, Some("b"), None);
            assert_eq!(is_report_mvp_complete_for_season(&primary, s(&MIXED), None), Complete);
            assert_eq!(is_report_mvp_complete_for_season(&primary, s(&MIXED), Some(true)), Partial);
            assert_eq!(
                is_report_mvp_complete_for_season(&fields(Some("a"), Some("c"), Some("b"), Some("d")), s(&MIXED), Some(true)),
                Complete
            );
            assert_eq!(
                is_report_mvp_complete_for_season(&fields(None, None, Some("b"), Some("d")), s(&WOMEN), Some(true)),
                Complete
            );
        }

        #[test]
        fn treats_secondary_only_reports_as_empty() {
            assert_eq!(
                is_report_mvp_complete_for_season(&fields(None, Some("c"), None, Some("d")), s(&MIXED), Some(true)),
                Empty
            );
        }
    }
}
