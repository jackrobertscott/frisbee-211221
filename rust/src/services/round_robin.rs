//! Port of `server/src/services/roundRobin.ts`: circle-method round robin
//! pairings and recovery of the rotation behind existing "Round N" fixtures.

use crate::js;
use crate::shared::errors::{AppError, AppResult, ErrorOptions, bad_request_error};
use crate::shared::schemas::Fixture;
use indexmap::IndexMap;
use regex::{Regex, RegexBuilder};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

/// A pair of team ids playing each other: `[team1Id, team2Id]`.
pub type Pairing = [String; 2];

/// Division games keyed by their round number (from "Round N" titles), in
/// the order the rounds were first seen.
pub type RoundGames = IndexMap<u64, Vec<Pairing>>;

const BYE_ID: &str = "__BYE__";

fn round_title_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        RegexBuilder::new(&format!(r"Round[{}]+([0-9]+)", js::WS_CLASS))
            .case_insensitive(true)
            .build()
            .unwrap_or_else(|error| panic!("invalid round title regex: {error}"))
    })
}

/// `extractRoundNumber(title)`: the number in a title such as "Round 3".
pub fn extract_round_number(title: &str) -> Option<u64> {
    let captures = round_title_pattern().captures(title)?;
    let digits = captures.get(1)?.as_str();
    Some(digits.parse::<u64>().unwrap_or(u64::MAX))
}

/// `unevenDivisionError()`.
pub fn uneven_division_error() -> AppError {
    bad_request_error(
        "Fixture generation failed: each division must contain an even number of teams to create valid round-robin matchups. Please add or remove a team in the affected division.",
        ErrorOptions::code("fixture.uneven_division"),
    )
}

fn round_robin_invalid_error(reason: &str) -> AppError {
    bad_request_error(
        format!("Fixture generation failed: {reason}"),
        ErrorOptions::code("fixture.round_robin_invalid"),
    )
}

/// `getRoundRobinPairings(teams, round)`: the first team stays fixed and the
/// rest rotate once per round; home and away swap on every alternate cycle.
pub fn get_round_robin_pairings(teams: &[String], round: usize) -> Vec<Pairing> {
    if teams.len() < 2 {
        return Vec::new();
    }
    // Support odd team counts by adding a bye placeholder.
    let mut working: Vec<String> = teams.to_vec();
    if !working.len().is_multiple_of(2) {
        working.push(BYE_ID.to_string());
    }
    let total_rounds = working.len() - 1;
    let current_cycle = round / total_rounds;
    let current_round_in_cycle = round % total_rounds;

    let fixed = working[0].clone();
    let mut rotating: Vec<String> = working[1..].to_vec();
    let rotation = current_round_in_cycle % rotating.len();
    rotating.rotate_left(rotation);
    let mut adjusted = vec![fixed];
    adjusted.extend(rotating);

    let mut pairings = Vec::new();
    for i in 0..adjusted.len() / 2 {
        let mut home = adjusted[i].clone();
        let mut away = adjusted[adjusted.len() - 1 - i].clone();
        if current_cycle % 2 == 1 {
            std::mem::swap(&mut home, &mut away);
        }
        if home == BYE_ID || away == BYE_ID {
            continue;
        }
        pairings.push([home, away]);
    }
    pairings
}

/// `getDivisionRoundGames(fixtures, divisionTeamSet)`: the games played purely
/// within a division, grouped by round.
pub fn get_division_round_games(fixtures: &[Fixture], division: &HashSet<String>) -> RoundGames {
    let mut round_games = RoundGames::new();
    for fixture in fixtures {
        let Some(round_number) = extract_round_number(&fixture.title) else {
            continue;
        };
        let division_games: Vec<Pairing> = fixture
            .games
            .iter()
            .filter(|game| division.contains(&game.team1_id) && division.contains(&game.team2_id))
            .map(|game| [game.team1_id.clone(), game.team2_id.clone()])
            .collect();
        if division_games.is_empty() {
            continue;
        }
        round_games
            .entry(round_number)
            .or_default()
            .extend(division_games);
    }
    round_games
}

fn sorted_pair([a, b]: &Pairing) -> Pairing {
    if a <= b {
        [a.clone(), b.clone()]
    } else {
        [b.clone(), a.clone()]
    }
}

fn normalize_pairing(pairing: &Pairing) -> String {
    sorted_pair(pairing).join("::")
}

fn serialize_pairings(pairings: &[Pairing]) -> String {
    let mut keys: Vec<String> = pairings.iter().map(normalize_pairing).collect();
    keys.sort();
    keys.join("|")
}

fn build_canonical_order_from_round_pairings(pairings: &[Pairing]) -> Vec<String> {
    let mut normalized: Vec<Pairing> = pairings.iter().map(sorted_pair).collect();
    normalized.sort_by(|a, b| js::locale_compare(&normalize_pairing(a), &normalize_pairing(b)));
    let left = normalized.iter().map(|[a, _]| a.clone());
    let right = normalized.iter().rev().map(|[_, b]| b.clone());
    left.chain(right).collect()
}

fn get_round_opponent_map(pairings: &[Pairing]) -> HashMap<String, String> {
    let mut opponents = HashMap::new();
    for [a, b] in pairings {
        opponents.insert(a.clone(), b.clone());
        opponents.insert(b.clone(), a.clone());
    }
    opponents
}

fn set_order_position(
    order: &mut [Option<String>],
    index: usize,
    team_id: &str,
    used: &mut HashSet<String>,
) -> bool {
    if let Some(existing) = &order[index] {
        return existing == team_id;
    }
    if used.contains(team_id) {
        return false;
    }
    order[index] = Some(team_id.to_string());
    used.insert(team_id.to_string());
    true
}

fn reconstruct_order_from_first_two_rounds(
    fixed_team_id: &str,
    round_one: &HashMap<String, String>,
    round_two: &HashMap<String, String>,
    team_count: usize,
) -> Option<Vec<String>> {
    let mut order: Vec<Option<String>> = vec![None; team_count];
    let mut used = HashSet::new();

    if !set_order_position(&mut order, 0, fixed_team_id, &mut used) {
        return None;
    }
    let round_two_opponent = round_two.get(fixed_team_id)?;
    let round_one_opponent = round_one.get(fixed_team_id)?;
    if !set_order_position(&mut order, 1, round_two_opponent, &mut used) {
        return None;
    }
    if !set_order_position(&mut order, team_count - 1, round_one_opponent, &mut used) {
        return None;
    }

    for i in 1..team_count / 2 {
        let left = order[i].clone()?;
        let right_source = order[team_count - i].clone()?;
        let mirrored = round_one.get(&left)?;
        if !set_order_position(&mut order, team_count - 1 - i, mirrored, &mut used) {
            return None;
        }
        let next = round_two.get(&right_source)?;
        if i + 1 < team_count && !set_order_position(&mut order, i + 1, next, &mut used) {
            return None;
        }
    }

    if used.len() != team_count {
        return None;
    }
    let resolved: Vec<String> = order.into_iter().flatten().collect();
    (resolved.len() == team_count).then_some(resolved)
}

/// Throws unless every existing round is a complete, valid division round.
fn validate_round_games(
    division_teams: &[String],
    round_games: &RoundGames,
    round_numbers: &[u64],
) -> AppResult<()> {
    if round_numbers.first() != Some(&1) {
        return Err(round_robin_invalid_error(
            "existing round-robin fixtures must start at Round 1.",
        ));
    }
    let highest = *round_numbers.last().unwrap_or(&0);
    for round_number in 1..=highest {
        if !round_games.contains_key(&round_number) {
            return Err(round_robin_invalid_error(&format!(
                "existing round-robin fixtures are missing Round {round_number}."
            )));
        }
    }

    let division: HashSet<&String> = division_teams.iter().collect();
    let expected_games = division_teams.len() / 2;
    for (round_number, pairings) in round_games {
        if pairings.len() != expected_games {
            return Err(round_robin_invalid_error(&format!(
                "Round {round_number} does not contain the expected number of division games."
            )));
        }
        let mut teams_in_round: HashSet<&String> = HashSet::new();
        for [a, b] in pairings {
            if !division.contains(a) || !division.contains(b) {
                return Err(round_robin_invalid_error(&format!(
                    "Round {round_number} includes a team outside the current division."
                )));
            }
            if a == b {
                return Err(round_robin_invalid_error(&format!(
                    "Round {round_number} includes a team playing itself."
                )));
            }
            if teams_in_round.contains(a) || teams_in_round.contains(b) {
                return Err(round_robin_invalid_error(&format!(
                    "Round {round_number} schedules the same team more than once in this division."
                )));
            }
            teams_in_round.insert(a);
            teams_in_round.insert(b);
        }
        if teams_in_round.len() != division_teams.len() {
            return Err(round_robin_invalid_error(&format!(
                "Round {round_number} is missing division teams."
            )));
        }
    }
    Ok(())
}

struct Candidate {
    order: Vec<String>,
    signature: String,
    order_key: String,
}

/// `reconstructDivisionTeamOrder(divisionTeams, roundGames, futureRoundCount)`:
/// recovers the team order that [`get_round_robin_pairings`] must have been
/// given to produce the existing rounds, so new rounds continue the same
/// rotation. When several orders fit, the one with the lexicographically
/// smallest upcoming rounds (then order) wins.
pub fn reconstruct_division_team_order(
    division_teams: &[String],
    round_games: &RoundGames,
    future_round_count: usize,
) -> AppResult<Vec<String>> {
    if !division_teams.len().is_multiple_of(2) {
        return Err(uneven_division_error());
    }
    let mut round_numbers: Vec<u64> = round_games.keys().copied().collect();
    round_numbers.sort_unstable();
    validate_round_games(division_teams, round_games, &round_numbers)?;
    let highest = *round_numbers.last().unwrap_or(&0);

    let observed: Vec<(u64, String)> = round_games
        .iter()
        .map(|(round, pairings)| (*round, serialize_pairings(pairings)))
        .collect();
    let opponent_maps: HashMap<u64, HashMap<String, String>> = round_games
        .iter()
        .map(|(round, pairings)| (*round, get_round_opponent_map(pairings)))
        .collect();

    let (Some(round_one_pairings), Some(round_one)) = (round_games.get(&1), opponent_maps.get(&1))
    else {
        return Err(round_robin_invalid_error(
            "existing round-robin fixtures must include Round 1.",
        ));
    };

    let rounds_to_validate = future_round_count.max(1);
    let highest_index = usize::try_from(highest).unwrap_or(usize::MAX);
    let future_signature = |order: &[String]| -> String {
        (highest_index..highest_index.saturating_add(rounds_to_validate))
            .map(|round| serialize_pairings(&get_round_robin_pairings(order, round)))
            .collect::<Vec<_>>()
            .join("||")
    };
    let matches_observed = |order: &[String]| -> bool {
        observed.iter().all(|(round, signature)| {
            let index = usize::try_from(*round - 1).unwrap_or(usize::MAX);
            serialize_pairings(&get_round_robin_pairings(order, index)) == *signature
        })
    };

    let mut best: Option<Candidate> = None;
    let mut register = |order: Vec<String>| {
        if !matches_observed(&order) {
            return;
        }
        let signature = future_signature(&order);
        let order_key = order.join("::");
        let better = match &best {
            None => true,
            Some(current) => {
                signature < current.signature
                    || (signature == current.signature && order_key < current.order_key)
            }
        };
        if better {
            best = Some(Candidate {
                order,
                signature,
                order_key,
            });
        }
    };

    if division_teams.len() == 2 {
        let [a, b] = round_one_pairings[0].clone();
        register(vec![a, b]);
    } else if highest == 1 {
        register(build_canonical_order_from_round_pairings(
            round_one_pairings,
        ));
    } else {
        let Some(round_two) = opponent_maps.get(&2) else {
            return Err(round_robin_invalid_error(
                "existing round-robin fixtures are missing Round 2.",
            ));
        };
        for fixed in division_teams {
            if let Some(order) = reconstruct_order_from_first_two_rounds(
                fixed,
                round_one,
                round_two,
                division_teams.len(),
            ) {
                register(order);
            }
        }
    }

    best.map(|candidate| candidate.order).ok_or_else(|| {
        round_robin_invalid_error(
            "existing fixtures do not match the expected round-robin pattern.",
        )
    })
}

#[cfg(test)]
#[path = "round_robin_tests.rs"]
mod tests;
