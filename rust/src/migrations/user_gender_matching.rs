//! Port of `server/src/migrations/userGenderMatching.ts`.
//!
//! Backfills `genderMatching` on users still stored with the old `gender`
//! field (rows imported from the Mongo database keep it in the legacy
//! `gender` column). Male and female carry over; anyone else (non-binary,
//! other) gets the MVP slot they were picked in most, or the fallback when
//! there is no clear winner. The old `gender` field is removed. Users that
//! are already migrated are not matched, so this is a no-op after the first run.

use crate::db::Db;
use crate::log;
use crate::shared::errors::AppResult;
use crate::shared::schemas::{
    FALLBACK_USER_GENDER_MATCHING, GenderMatching, User, normalize_user_gender_matching,
};
use crate::tables::{USER, user as user_table};
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct MvpSlotPicks {
    male_picks: i64,
    female_picks: i64,
}

fn read_stored_gender_matching(record: &Map<String, Value>) -> Option<GenderMatching> {
    ["genderMatching", "gender"]
        .iter()
        .filter_map(|key| record.get(*key).and_then(Value::as_str))
        .find_map(normalize_user_gender_matching)
}

fn pick_majority_slot(picks: Option<&MvpSlotPicks>) -> Option<GenderMatching> {
    let picks = picks?;
    if picks.male_picks == picks.female_picks {
        return None;
    }
    Some(if picks.male_picks > picks.female_picks {
        GenderMatching::Male
    } else {
        GenderMatching::Female
    })
}

/// `runUserGenderMatchingMigration()`.
pub async fn run_user_gender_matching_migration(db: &Db) -> AppResult<()> {
    let pending: Vec<Map<String, Value>> = USER
        .scan_stored(
            db,
            User::GENDER_MATCHING.not_in([GenderMatching::Male, GenderMatching::Female]),
        )
        .await?
        .into_iter()
        .filter(|record| record.get("id").is_some_and(Value::is_string))
        .collect();
    if pending.is_empty() {
        return Ok(());
    }

    log::log(format!(
        "Backfilling gender matching for {} users...",
        pending.len()
    ));

    let unmatched_ids: Vec<String> = pending
        .iter()
        .filter(|record| read_stored_gender_matching(record).is_none())
        .filter_map(|record| record.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let ids = unmatched_ids.clone();
    let picks_by_user_id = db
        .call(move |c| user_table::mvp_slot_picks(c, &ids))
        .await?;

    let mut male = 0;
    let mut female = 0;
    let mut from_votes = 0;
    for record in &pending {
        let id = record
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let stored = read_stored_gender_matching(record);
        let voted = if stored.is_some() {
            None
        } else {
            pick_majority_slot(
                picks_by_user_id
                    .get(&id)
                    .map(|(male, female)| MvpSlotPicks {
                        male_picks: *male,
                        female_picks: *female,
                    })
                    .as_ref(),
            )
        };
        if voted.is_some() {
            from_votes += 1;
        }
        let gender_matching = stored.or(voted).unwrap_or(FALLBACK_USER_GENDER_MATCHING);
        db.call(move |c| user_table::set_gender_matching_clearing_legacy(c, &id, gender_matching))
            .await?;
        match gender_matching {
            GenderMatching::Male => male += 1,
            GenderMatching::Female => female += 1,
        }
    }

    log::log(
        [
            "Gender matching backfill results:".to_string(),
            format!("- male: {male}"),
            format!("- female: {female}"),
            format!("- non-binary/other assigned from MVP votes: {from_votes}"),
            format!(
                "- non-binary/other assigned {} by default: {}",
                FALLBACK_USER_GENDER_MATCHING.as_str(),
                unmatched_ids.len() - from_votes
            ),
        ]
        .join("\n"),
    );
    Ok(())
}
