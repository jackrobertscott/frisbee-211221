//! Port of `server/src/services/fixtureSchedule.ts`: date shifting and the
//! round-robin fixture planner behind `/FixtureAdjustMultiple` and
//! `/FixtureGenerate`.

use super::round_robin::{
    Pairing, extract_round_number, get_division_round_games, get_round_robin_pairings,
    reconstruct_division_team_order, uneven_division_error,
};
use crate::js;
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error, internal_error};
use crate::shared::schemas::{Fixture, FixtureGame, Team};
use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// `adjustment.unit`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DateUnit {
    Day,
    Week,
    Month,
}

/// `adjustment.direction`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DateDirection {
    Forward,
    Backward,
}

/// `TDateAdjustment`.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct DateAdjustment {
    pub amount: i64,
    pub unit: DateUnit,
    pub direction: DateDirection,
}

/// `TFixtureSlot`.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct FixtureSlot {
    pub id: String,
    pub time: String,
    pub place: String,
}

/// `TGeneratedFixture`: a fixture without its id and timestamps.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFixture {
    pub season_id: String,
    pub user_id: String,
    pub title: String,
    pub date: String,
    pub games: Vec<FixtureGame>,
    pub grading: bool,
}

/// `TShuffle`: reorders items in place.
pub trait Shuffle {
    fn shuffle<T>(&mut self, items: &mut [T]);
}

/// `shuffleInPlace`: a Fisher-Yates shuffle.
#[derive(Clone, Copy, Debug, Default)]
pub struct RandomShuffle;

impl Shuffle for RandomShuffle {
    fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = rand::random_range(0..=i);
            items.swap(i, j);
        }
    }
}

/// The local wall-clock time of a `Date` value (`getFullYear()`, ...).
fn local_naive(ms: i64) -> Option<NaiveDateTime> {
    let utc = DateTime::<Utc>::from_timestamp_millis(ms)?;
    Some(utc.with_timezone(&Local).naive_local())
}

/// The time value of a local wall-clock time (the `Date` setters' `UTC(t)`):
/// ambiguous times take the earlier instant and skipped times move forward.
fn local_to_ms(naive: NaiveDateTime) -> Option<i64> {
    Local
        .from_local_datetime(&naive)
        .earliest()
        .or_else(|| {
            Local
                .from_local_datetime(&(naive + chrono::Duration::hours(1)))
                .earliest()
        })
        .map(|local| local.timestamp_millis())
}

/// Moves `iso` to a new local calendar date, keeping the local time of day.
fn with_local_date(iso: &str, change: impl FnOnce(NaiveDate) -> Option<NaiveDate>) -> String {
    let moved = js::date::parse(iso)
        .and_then(local_naive)
        .and_then(|naive| {
            let date = change(naive.date())?;
            local_to_ms(date.and_time(naive.time()))
        });
    match moved {
        Some(ms) => js::date::to_iso_string(ms),
        // `toISOString` of an invalid date throws in TS
        None => iso.to_string(),
    }
}

fn add_days(date: NaiveDate, days: i64) -> Option<NaiveDate> {
    date.checked_add_signed(chrono::Duration::days(days))
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .and_then(|first| first.pred_opt())
        .map_or(28, |last| last.day())
}

/// `shiftFixtureDate(date, adjustment)`: moves an ISO date by whole days,
/// weeks or calendar months, keeping the local time of day. Month moves stay
/// within the target month.
pub fn shift_fixture_date(date: &str, adjustment: &DateAdjustment) -> String {
    let signed = match adjustment.direction {
        DateDirection::Backward => -adjustment.amount,
        DateDirection::Forward => adjustment.amount,
    };
    with_local_date(date, |current| match adjustment.unit {
        DateUnit::Month => {
            // clamp to the last day of a shorter month (31 Jan + 1 month -> 28 Feb)
            let months = i64::from(current.year()) * 12 + i64::from(current.month0()) + signed;
            let year = i32::try_from(months.div_euclid(12)).ok()?;
            let month = u32::try_from(months.rem_euclid(12)).ok()? + 1;
            let day = current.day().min(days_in_month(year, month));
            NaiveDate::from_ymd_opt(year, month, day)
        }
        DateUnit::Week => add_days(current, signed * 7),
        DateUnit::Day => add_days(current, signed),
    })
}

/// `assertTeamsCanBeScheduled(teams, slotCount)`: every team needs a division
/// and there must be enough slots.
pub fn assert_teams_can_be_scheduled(
    divisions: &[Option<f64>],
    slot_count: usize,
) -> AppResult<()> {
    if divisions.iter().any(Option::is_none) {
        return Err(bad_request_error(
            "Every team needs a division number",
            ErrorOptions::code("fixture.division_missing"),
        ));
    }
    if (slot_count as f64) * 2.0 < divisions.len() as f64 - 1.0 {
        return Err(bad_request_error(
            "Not enough slots have been added",
            ErrorOptions::code("fixture.slots_insufficient"),
        ));
    }
    Ok(())
}

/// Team ids per division number, in the order divisions are first seen.
pub type DivisionTeams = Vec<(f64, Vec<String>)>;

fn division_entry(divisions: &mut DivisionTeams, division: f64) -> &mut Vec<String> {
    let index = match divisions.iter().position(|(d, _)| *d == division) {
        Some(index) => index,
        None => {
            divisions.push((division, Vec::new()));
            divisions.len() - 1
        }
    };
    &mut divisions[index].1
}

/// `groupTeamIdsByDivision(teams)`: team ids per division number, in team order.
pub fn group_team_ids_by_division<'a>(
    teams: impl IntoIterator<Item = (&'a str, Option<f64>)>,
) -> DivisionTeams {
    let mut divisions = DivisionTeams::new();
    for (id, division) in teams {
        if let Some(division) = division {
            division_entry(&mut divisions, division).push(id.to_string());
        }
    }
    divisions
}

/// `getHighestRoundNumber(fixtures)`: the highest "Round N" among the titles.
pub fn get_highest_round_number<'a>(titles: impl IntoIterator<Item = &'a str>) -> Option<u64> {
    titles.into_iter().filter_map(extract_round_number).max()
}

/// `resolveDivisionTeamOrders(...)`: the rotation order per division.
/// Divisions that already have round games continue their existing rotation
/// (and come first); the rest get a freshly shuffled order.
pub fn resolve_division_team_orders(
    divisions: &DivisionTeams,
    existing_fixtures: &[Fixture],
    round_count: usize,
    shuffle: &mut impl Shuffle,
) -> AppResult<DivisionTeams> {
    let mut team_order = DivisionTeams::new();
    if get_highest_round_number(existing_fixtures.iter().map(|f| f.title.as_str())).is_some() {
        for (division, teams) in divisions {
            let set: HashSet<String> = teams.iter().cloned().collect();
            let round_games = get_division_round_games(existing_fixtures, &set);
            if !round_games.is_empty() {
                let order = reconstruct_division_team_order(teams, &round_games, round_count)?;
                *division_entry(&mut team_order, *division) = order;
            }
        }
    }
    for (division, teams) in divisions {
        if !team_order.iter().any(|(d, _)| d == division) {
            let mut order = teams.clone();
            shuffle.shuffle(&mut order);
            team_order.push((*division, order));
        }
    }
    Ok(team_order)
}

/// `TRoundPlanInput`.
#[derive(Clone, Debug)]
pub struct RoundPlanInput<'a> {
    pub season_id: &'a str,
    pub user_id: &'a str,
    pub starting_date: &'a str,
    pub round_count: usize,
    pub slots: &'a [FixtureSlot],
    pub teams: &'a [Team],
    pub existing_fixtures: &'a [Fixture],
}

/// `planFixtureRounds(input)` with the default random shuffle and game ids.
pub fn plan_fixture_rounds(input: &RoundPlanInput<'_>) -> AppResult<Vec<GeneratedFixture>> {
    plan_fixture_rounds_with(input, &mut RandomShuffle, &mut || {
        crate::utils::random::random_string(10)
    })
}

/// `planFixtureRounds(input, {shuffle, createGameId})`: builds the next
/// `roundCount` weekly "Round N" fixtures, continuing on from the highest
/// existing round. Each round's games come from every division's round-robin
/// pairings, shuffled across the slots.
pub fn plan_fixture_rounds_with(
    input: &RoundPlanInput<'_>,
    shuffle: &mut impl Shuffle,
    create_game_id: &mut dyn FnMut() -> String,
) -> AppResult<Vec<GeneratedFixture>> {
    let starting_round =
        get_highest_round_number(input.existing_fixtures.iter().map(|f| f.title.as_str()))
            .unwrap_or(0);
    let starting_round = usize::try_from(starting_round).unwrap_or(usize::MAX);
    let divisions =
        group_team_ids_by_division(input.teams.iter().map(|t| (t.id.as_str(), t.division)));
    let team_order = resolve_division_team_orders(
        &divisions,
        input.existing_fixtures,
        input.round_count,
        shuffle,
    )?;

    let mut fixtures = Vec::new();
    for r in 0..input.round_count {
        let round_index = starting_round.saturating_add(r);
        let date = with_local_date(input.starting_date, |start| add_days(start, r as i64 * 7));

        let mut pairings: Vec<Pairing> = Vec::new();
        for (_, division_teams) in &team_order {
            if !division_teams.len().is_multiple_of(2) {
                return Err(uneven_division_error());
            }
            pairings.extend(get_round_robin_pairings(division_teams, round_index));
        }
        shuffle.shuffle(&mut pairings);

        let games = pairings
            .into_iter()
            .enumerate()
            .map(|(index, [team1_id, team2_id])| {
                // TS reads `slots[index % 0]` as undefined and fails
                let slot = input
                    .slots
                    .get(index % input.slots.len().max(1))
                    .ok_or_else(|| {
                        internal_error(Some("No fixture slots to assign."), ErrorOptions::default())
                    })?;
                Ok(FixtureGame {
                    id: create_game_id(),
                    team1_id,
                    team2_id,
                    place: slot.place.clone(),
                    time: slot.time.clone(),
                    team1_score: None,
                    team2_score: None,
                })
            })
            .collect::<AppResult<Vec<_>>>()?;
        fixtures.push(GeneratedFixture {
            season_id: input.season_id.to_string(),
            user_id: input.user_id.to_string(),
            title: format!("Round {}", round_index as u128 + 1),
            date,
            games,
            grading: false,
        });
    }
    Ok(fixtures)
}

#[cfg(test)]
#[path = "fixture_schedule_tests.rs"]
mod tests;
