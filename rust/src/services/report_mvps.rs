//! Port of `server/src/services/reportMvps.ts`: MVP picks are cleared for
//! slots the season does not use and for players whose gender matching does
//! not fit the slot.

use crate::db::{Db, Query};
use crate::shared::errors::AppResult;
use crate::shared::schemas::{GenderMatching, Season, User};
use crate::shared::utils::season_gender_division::{
    MvpGenderSlot, SeasonMvpFields, is_user_eligible_for_mvp_slot, sanitize_season_mvp_fields,
};
use crate::tables::USER;
use std::collections::HashMap;

/// `collectMvpUserIds(fields)`: the non-empty user ids referenced by the MVP fields.
pub fn collect_mvp_user_ids(fields: &SeasonMvpFields) -> Vec<String> {
    [
        &fields.mvp_male,
        &fields.mvp_male2,
        &fields.mvp_female,
        &fields.mvp_female2,
    ]
    .into_iter()
    .filter_map(|user_id| user_id.as_ref().filter(|id| !id.is_empty()).cloned())
    .collect()
}

/// `dropIneligibleMvps(fields, usersById)`: clears picks whose user is known
/// to be ineligible for the slot. Empty picks are cleared; users missing from
/// the map are kept.
pub fn drop_ineligible_mvps(
    fields: &SeasonMvpFields,
    users_by_id: &HashMap<String, GenderMatching>,
) -> SeasonMvpFields {
    let valid = |slot: MvpGenderSlot, user_id: &Option<String>| -> Option<String> {
        let user_id = user_id.as_ref().filter(|id| !id.is_empty())?;
        match users_by_id.get(user_id) {
            Some(gender_matching) if !is_user_eligible_for_mvp_slot(*gender_matching, slot) => None,
            _ => Some(user_id.clone()),
        }
    };
    SeasonMvpFields {
        mvp_male: valid(GenderMatching::Male, &fields.mvp_male),
        mvp_male2: valid(GenderMatching::Male, &fields.mvp_male2),
        mvp_female: valid(GenderMatching::Female, &fields.mvp_female),
        mvp_female2: valid(GenderMatching::Female, &fields.mvp_female2),
    }
}

/// `sanitizeReportMvps(season, body)`: clears MVP slots the season does not
/// use, then any pick whose user is ineligible for that slot.
pub async fn sanitize_report_mvps(
    db: &Db,
    season: &Season,
    body: &SeasonMvpFields,
) -> AppResult<SeasonMvpFields> {
    let fields = sanitize_season_mvp_fields(Some(season), body);
    let user_ids = collect_mvp_user_ids(&fields);
    if user_ids.is_empty() {
        return Ok(fields);
    }
    let users = USER
        .get_many(db, User::ID.is_in(user_ids), Query::new())
        .await?;
    let users_by_id = users
        .into_iter()
        .map(|user| (user.id, user.gender_matching))
        .collect();
    Ok(drop_ineligible_mvps(&fields, &users_by_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn some(value: &str) -> Option<String> {
        Some(value.to_string())
    }

    mod collect_mvp_user_ids_tests {
        use super::*;

        #[test]
        fn returns_the_non_empty_picks() {
            assert_eq!(
                collect_mvp_user_ids(&SeasonMvpFields {
                    mvp_male: some("M1"),
                    mvp_male2: some(""),
                    mvp_female: None,
                    mvp_female2: some("F2"),
                }),
                ["M1", "F2"]
            );
            assert!(collect_mvp_user_ids(&SeasonMvpFields::default()).is_empty());
        }
    }

    mod drop_ineligible_mvps_tests {
        use super::*;

        fn users() -> HashMap<String, GenderMatching> {
            HashMap::from([
                ("man".to_string(), GenderMatching::Male),
                ("woman".to_string(), GenderMatching::Female),
            ])
        }

        #[test]
        fn keeps_eligible_picks_and_picks_for_unknown_users() {
            assert_eq!(
                drop_ineligible_mvps(
                    &SeasonMvpFields {
                        mvp_male: some("man"),
                        mvp_male2: some("ghost"),
                        mvp_female: some("woman"),
                        mvp_female2: None,
                    },
                    &users()
                ),
                SeasonMvpFields {
                    mvp_male: some("man"),
                    mvp_male2: some("ghost"),
                    mvp_female: some("woman"),
                    mvp_female2: None,
                }
            );
        }

        #[test]
        fn clears_picks_in_the_wrong_gender_matching_slot_and_empty_picks() {
            assert_eq!(
                drop_ineligible_mvps(
                    &SeasonMvpFields {
                        mvp_male: some("woman"),
                        mvp_male2: some(""),
                        mvp_female: some("man"),
                        mvp_female2: some("woman"),
                    },
                    &users()
                ),
                SeasonMvpFields {
                    mvp_male: None,
                    mvp_male2: None,
                    mvp_female: None,
                    mvp_female2: some("woman"),
                }
            );
        }
    }
}
