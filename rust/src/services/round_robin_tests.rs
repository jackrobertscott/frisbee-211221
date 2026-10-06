//! Port of `server/src/services/roundRobin.test.ts`.

use super::*;
use crate::shared::schemas::{Fixture, FixtureGame};

fn teams_of(count: usize) -> Vec<String> {
    (1..=count).map(|i| format!("T{i}")).collect()
}

fn s(values: &[&str]) -> Vec<String> {
    values.iter().map(|v| v.to_string()).collect()
}

fn p(a: &str, b: &str) -> Pairing {
    [a.to_string(), b.to_string()]
}

fn pair_key([a, b]: &Pairing) -> String {
    let mut pair = [a.clone(), b.clone()];
    pair.sort();
    pair.join("::")
}

fn round_signature(pairings: &[Pairing]) -> String {
    let mut keys: Vec<String> = pairings.iter().map(pair_key).collect();
    keys.sort();
    keys.join("|")
}

/// Observed rounds as stored in fixtures: Round N is round index N - 1.
fn observed_rounds(order: &[String], round_count: usize) -> RoundGames {
    (0..round_count)
        .map(|index| (index as u64 + 1, get_round_robin_pairings(order, index)))
        .collect()
}

#[track_caller]
fn expect_fixture_error(result: AppResult<Vec<String>>, error_code: &str, message: Option<&str>) {
    let error = result.expect_err("Expected function to throw");
    assert_eq!(error.status_code, 400);
    assert_eq!(error.error_code, error_code);
    if let Some(message) = message {
        assert_eq!(error.message, message);
    }
}

mod extract_round_number_tests {
    use super::*;

    #[test]
    fn reads_the_number_after_round_case_insensitively() {
        assert_eq!(extract_round_number("Round 3"), Some(3));
        assert_eq!(extract_round_number("round   12 (rescheduled)"), Some(12));
        assert_eq!(extract_round_number("Semi Final - Round 2"), Some(2));
    }

    #[test]
    fn returns_null_for_titles_without_a_round_number() {
        assert_eq!(extract_round_number("Grand Final"), None);
        assert_eq!(extract_round_number("Round"), None);
        assert_eq!(extract_round_number("Round1"), None);
    }
}

mod get_round_robin_pairings_tests {
    use super::*;

    #[test]
    fn pairs_a_fixed_first_team_against_a_rotating_circle() {
        let teams = s(&["A", "B", "C", "D"]);
        assert_eq!(
            get_round_robin_pairings(&teams, 0),
            [p("A", "D"), p("B", "C")]
        );
        assert_eq!(
            get_round_robin_pairings(&teams, 1),
            [p("A", "B"), p("C", "D")]
        );
        assert_eq!(
            get_round_robin_pairings(&teams, 2),
            [p("A", "C"), p("D", "B")]
        );
    }

    #[test]
    fn swaps_home_and_away_on_alternate_cycles() {
        let teams = s(&["A", "B", "C", "D"]);
        assert_eq!(
            get_round_robin_pairings(&teams, 3),
            [p("D", "A"), p("C", "B")]
        );
        assert_eq!(
            get_round_robin_pairings(&teams, 5),
            [p("C", "A"), p("B", "D")]
        );
        assert_eq!(
            get_round_robin_pairings(&teams, 6),
            get_round_robin_pairings(&teams, 0)
        );
    }

    #[test]
    fn does_not_mutate_the_input() {
        let teams = s(&["A", "B", "C", "D"]);
        get_round_robin_pairings(&teams, 2);
        assert_eq!(teams, s(&["A", "B", "C", "D"]));
    }

    fn covers_every_pairing_exactly_once_per_cycle(count: usize) {
        let teams = teams_of(count);
        let rounds_per_cycle = if count.is_multiple_of(2) { count - 1 } else { count };
        let games_per_round = count / 2;
        for cycle in 0..3 {
            let mut seen: HashMap<String, usize> = HashMap::new();
            for r in 0..rounds_per_cycle {
                let round = cycle * rounds_per_cycle + r;
                let pairings = get_round_robin_pairings(&teams, round);
                assert_eq!(pairings.len(), games_per_round);
                let playing: Vec<&String> = pairings.iter().flatten().collect();
                let unique: HashSet<&String> = playing.iter().copied().collect();
                assert_eq!(unique.len(), playing.len());
                assert!(playing.iter().all(|team| teams.contains(team)));
                for [home, away] in &pairings {
                    assert_ne!(home, away);
                    let key = pair_key(&[home.clone(), away.clone()]);
                    *seen.entry(key.clone()).or_default() += 1;
                    // which side is home flips each cycle
                    let reference = get_round_robin_pairings(&teams, r)
                        .into_iter()
                        .find(|pair| pair_key(pair) == key)
                        .expect("reference pairing");
                    if cycle.is_multiple_of(2) {
                        assert_eq!([home.clone(), away.clone()], reference);
                    } else {
                        assert_eq!([away.clone(), home.clone()], reference);
                    }
                }
            }
            assert_eq!(seen.len(), count * (count - 1) / 2);
            assert!(seen.values().all(|value| *value == 1));
        }
    }

    macro_rules! covers_cases {
        ($($name:ident: $count:expr,)*) => {
            $(
                #[test]
                fn $name() {
                    covers_every_pairing_exactly_once_per_cycle($count);
                }
            )*
        };
    }

    covers_cases! {
        covers_every_pairing_exactly_once_per_cycle_for_2_teams: 2,
        covers_every_pairing_exactly_once_per_cycle_for_3_teams: 3,
        covers_every_pairing_exactly_once_per_cycle_for_4_teams: 4,
        covers_every_pairing_exactly_once_per_cycle_for_5_teams: 5,
        covers_every_pairing_exactly_once_per_cycle_for_6_teams: 6,
        covers_every_pairing_exactly_once_per_cycle_for_7_teams: 7,
        covers_every_pairing_exactly_once_per_cycle_for_8_teams: 8,
        covers_every_pairing_exactly_once_per_cycle_for_10_teams: 10,
    }

    #[test]
    fn gives_each_team_in_an_odd_division_one_bye_per_cycle() {
        let teams = teams_of(5);
        let mut byes: HashMap<String, usize> = HashMap::new();
        for round in 0..5 {
            let playing: HashSet<String> = get_round_robin_pairings(&teams, round)
                .into_iter()
                .flatten()
                .collect();
            for team in teams.iter().filter(|team| !playing.contains(*team)) {
                *byes.entry(team.clone()).or_default() += 1;
            }
        }
        let expected: HashMap<String, usize> = teams.iter().map(|team| (team.clone(), 1)).collect();
        assert_eq!(byes, expected);
    }

    #[test]
    fn returns_no_games_for_a_single_team() {
        assert!(get_round_robin_pairings(&s(&["A"]), 0).is_empty());
    }

    #[test]
    fn returns_no_games_for_no_teams() {
        assert!(get_round_robin_pairings(&[], 0).is_empty());
        assert!(get_round_robin_pairings(&[], 3).is_empty());
    }
}

mod get_division_round_games_tests {
    use super::*;

    fn fixture(title: &str, games: &[(&str, &str)]) -> Fixture {
        Fixture {
            id: title.into(),
            created_on: "2024-01-01T00:00:00.000Z".into(),
            updated_on: "2024-01-01T00:00:00.000Z".into(),
            season_id: "s1".into(),
            user_id: "u1".into(),
            title: title.into(),
            date: "2024-01-01T00:00:00.000Z".into(),
            games: games
                .iter()
                .enumerate()
                .map(|(index, (team1, team2))| FixtureGame {
                    id: format!("{title}-{index}"),
                    team1_id: team1.to_string(),
                    team2_id: team2.to_string(),
                    place: "Field 1".into(),
                    time: "6pm".into(),
                    team1_score: None,
                    team2_score: None,
                })
                .collect(),
            grading: None,
        }
    }

    fn division() -> HashSet<String> {
        s(&["A", "B", "C", "D"]).into_iter().collect()
    }

    #[test]
    fn groups_division_only_games_by_round_number() {
        let rounds = get_division_round_games(
            &[
                fixture("Round 1", &[("A", "B"), ("C", "D"), ("E", "F")]),
                fixture("round 2 - catch up", &[("A", "C"), ("B", "E")]),
            ],
            &division(),
        );
        let entries: Vec<(u64, Vec<Pairing>)> = rounds.into_iter().collect();
        assert_eq!(
            entries,
            [(1, vec![p("A", "B"), p("C", "D")]), (2, vec![p("A", "C")])]
        );
    }

    #[test]
    fn ignores_fixtures_without_a_round_number_or_division_games() {
        let rounds = get_division_round_games(
            &[
                fixture("Grand Final", &[("A", "B")]),
                fixture("Round1", &[("A", "B")]),
                fixture("Round 3", &[("E", "F")]),
            ],
            &division(),
        );
        assert_eq!(rounds.len(), 0);
    }

    #[test]
    fn merges_fixtures_sharing_a_round_number() {
        let rounds = get_division_round_games(
            &[
                fixture("Round 4", &[("A", "B")]),
                fixture("ROUND   4 late", &[("C", "D")]),
            ],
            &division(),
        );
        assert_eq!(rounds.get(&4), Some(&vec![p("A", "B"), p("C", "D")]));
    }

    #[test]
    fn reads_the_first_round_number_in_the_title() {
        let rounds = get_division_round_games(
            &[fixture("Round 12 (was Round 11)", &[("A", "B")])],
            &division(),
        );
        assert_eq!(rounds.keys().copied().collect::<Vec<_>>(), [12]);
    }
}

mod reconstruct_division_team_order_tests {
    use super::*;

    #[track_caller]
    fn expect_reproduces(order: &[String], rounds: &RoundGames) {
        for (round_number, pairings) in rounds {
            assert_eq!(
                round_signature(&get_round_robin_pairings(order, *round_number as usize - 1)),
                round_signature(pairings)
            );
        }
    }

    fn rounds_of(entries: Vec<(u64, Vec<Pairing>)>) -> RoundGames {
        entries.into_iter().collect()
    }

    #[test]
    fn reconstructs_a_two_team_order_from_round_one() {
        let rounds = rounds_of(vec![(1, vec![p("B", "A")])]);
        assert_eq!(
            reconstruct_division_team_order(&s(&["A", "B"]), &rounds, 1).unwrap(),
            s(&["B", "A"])
        );
    }

    #[test]
    fn builds_a_canonical_order_from_a_single_observed_round() {
        let rounds = rounds_of(vec![(1, vec![p("D", "A"), p("C", "B")])]);
        let order = reconstruct_division_team_order(&s(&["A", "B", "C", "D"]), &rounds, 3).unwrap();
        assert_eq!(order, s(&["A", "B", "C", "D"]));
        expect_reproduces(&order, &rounds);
    }

    fn recovers_an_order(count: usize, round_count: usize) {
        let mut original = teams_of(count);
        original.reverse();
        let rounds = observed_rounds(&original, round_count);
        let division_teams = teams_of(count);
        let order = reconstruct_division_team_order(&division_teams, &rounds, 4).unwrap();
        let mut sorted = order.clone();
        sorted.sort();
        let mut expected = division_teams.clone();
        expected.sort();
        assert_eq!(sorted, expected);
        expect_reproduces(&order, &rounds);
        if round_count >= count - 1 {
            // a full observed cycle pins down the schedule, so future rounds match
            for round in round_count..round_count + 4 {
                assert_eq!(
                    round_signature(&get_round_robin_pairings(&order, round)),
                    round_signature(&get_round_robin_pairings(&original, round))
                );
            }
        } else {
            // partial cycles are ambiguous: the chosen order may schedule the
            // remaining rounds differently from the original, but never
            // repeats a pairing within the cycle
            let played: HashSet<String> = rounds.values().flatten().map(pair_key).collect();
            for round in round_count..count - 1 {
                for pair in get_round_robin_pairings(&order, round) {
                    assert!(!played.contains(&pair_key(&pair)));
                }
            }
        }
    }

    macro_rules! recovers_cases {
        ($($name:ident: ($count:expr, $rounds:expr),)*) => {
            $(
                #[test]
                fn $name() {
                    recovers_an_order($count, $rounds);
                }
            )*
        };
    }

    recovers_cases! {
        recovers_an_order_reproducing_2_observed_rounds_for_4_teams: (4, 2),
        recovers_an_order_reproducing_3_observed_rounds_for_4_teams: (4, 3),
        recovers_an_order_reproducing_5_observed_rounds_for_4_teams: (4, 5),
        recovers_an_order_reproducing_2_observed_rounds_for_6_teams: (6, 2),
        recovers_an_order_reproducing_3_observed_rounds_for_6_teams: (6, 3),
        recovers_an_order_reproducing_5_observed_rounds_for_6_teams: (6, 5),
        recovers_an_order_reproducing_7_observed_rounds_for_6_teams: (6, 7),
        recovers_an_order_reproducing_2_observed_rounds_for_8_teams: (8, 2),
        recovers_an_order_reproducing_3_observed_rounds_for_8_teams: (8, 3),
        recovers_an_order_reproducing_7_observed_rounds_for_8_teams: (8, 7),
        recovers_an_order_reproducing_9_observed_rounds_for_8_teams: (8, 9),
        recovers_an_order_reproducing_2_observed_rounds_for_10_teams: (10, 2),
        recovers_an_order_reproducing_3_observed_rounds_for_10_teams: (10, 3),
        recovers_an_order_reproducing_9_observed_rounds_for_10_teams: (10, 9),
        recovers_an_order_reproducing_11_observed_rounds_for_10_teams: (10, 11),
    }

    #[test]
    fn picks_a_deterministic_order_when_observed_rounds_are_ambiguous() {
        let original = s(&["T6", "T5", "T4", "T3", "T2", "T1"]);
        let rounds = observed_rounds(&original, 2);
        assert_eq!(
            reconstruct_division_team_order(&teams_of(6), &rounds, 4).unwrap(),
            s(&["T5", "T6", "T3", "T4", "T1", "T2"])
        );
    }

    #[test]
    fn is_independent_of_the_division_team_order_and_home_away_sides() {
        let original = s(&["C", "F", "A", "E", "B", "D"]);
        let rounds = observed_rounds(&original, 3);
        let flipped: RoundGames = rounds
            .iter()
            .map(|(round, pairings)| {
                let mut swapped: Vec<Pairing> = pairings
                    .iter()
                    .map(|[a, b]| [b.clone(), a.clone()])
                    .collect();
                swapped.reverse();
                (*round, swapped)
            })
            .collect();
        let first =
            reconstruct_division_team_order(&s(&["A", "B", "C", "D", "E", "F"]), &rounds, 2)
                .unwrap();
        let second =
            reconstruct_division_team_order(&s(&["F", "E", "D", "C", "B", "A"]), &flipped, 2)
                .unwrap();
        assert_eq!(second, first);
        expect_reproduces(&first, &rounds);
    }

    #[test]
    fn rejects_odd_divisions() {
        expect_fixture_error(
            reconstruct_division_team_order(&s(&["A", "B", "C"]), &RoundGames::new(), 1),
            "fixture.uneven_division",
            None,
        );
    }

    #[test]
    fn rejects_rounds_that_do_not_start_at_round_1() {
        let message =
            "Fixture generation failed: existing round-robin fixtures must start at Round 1.";
        expect_fixture_error(
            reconstruct_division_team_order(&s(&["A", "B"]), &RoundGames::new(), 1),
            "fixture.round_robin_invalid",
            Some(message),
        );
        expect_fixture_error(
            reconstruct_division_team_order(
                &s(&["A", "B"]),
                &rounds_of(vec![(2, vec![p("A", "B")])]),
                1,
            ),
            "fixture.round_robin_invalid",
            Some(message),
        );
    }

    #[test]
    fn rejects_gaps_between_rounds() {
        let mut rounds = observed_rounds(&s(&["A", "B", "C", "D"]), 3);
        rounds.shift_remove(&2);
        expect_fixture_error(
            reconstruct_division_team_order(&s(&["A", "B", "C", "D"]), &rounds, 1),
            "fixture.round_robin_invalid",
            Some("Fixture generation failed: existing round-robin fixtures are missing Round 2."),
        );
    }

    #[test]
    fn rejects_rounds_with_the_wrong_number_of_games() {
        expect_fixture_error(
            reconstruct_division_team_order(
                &s(&["A", "B", "C", "D"]),
                &rounds_of(vec![(1, vec![p("A", "B")])]),
                1,
            ),
            "fixture.round_robin_invalid",
            Some(
                "Fixture generation failed: Round 1 does not contain the expected number of division games.",
            ),
        );
    }

    #[test]
    fn rejects_teams_outside_the_division() {
        expect_fixture_error(
            reconstruct_division_team_order(
                &s(&["A", "B", "C", "D"]),
                &rounds_of(vec![(1, vec![p("A", "B"), p("C", "X")])]),
                1,
            ),
            "fixture.round_robin_invalid",
            Some(
                "Fixture generation failed: Round 1 includes a team outside the current division.",
            ),
        );
    }

    #[test]
    fn rejects_teams_playing_themselves() {
        expect_fixture_error(
            reconstruct_division_team_order(
                &s(&["A", "B", "C", "D"]),
                &rounds_of(vec![(1, vec![p("A", "A"), p("C", "D")])]),
                1,
            ),
            "fixture.round_robin_invalid",
            Some("Fixture generation failed: Round 1 includes a team playing itself."),
        );
    }

    #[test]
    fn rejects_teams_scheduled_twice_in_a_round() {
        expect_fixture_error(
            reconstruct_division_team_order(
                &s(&["A", "B", "C", "D"]),
                &rounds_of(vec![(1, vec![p("A", "B"), p("A", "C")])]),
                1,
            ),
            "fixture.round_robin_invalid",
            Some(
                "Fixture generation failed: Round 1 schedules the same team more than once in this division.",
            ),
        );
    }

    #[test]
    fn rejects_rounds_that_do_not_follow_the_round_robin_pattern() {
        let round = vec![p("A", "B"), p("C", "D")];
        expect_fixture_error(
            reconstruct_division_team_order(
                &s(&["A", "B", "C", "D"]),
                &rounds_of(vec![(1, round.clone()), (2, round)]),
                1,
            ),
            "fixture.round_robin_invalid",
            Some(
                "Fixture generation failed: existing fixtures do not match the expected round-robin pattern.",
            ),
        );
    }

    #[test]
    fn accepts_later_rounds_for_a_two_team_division() {
        // two-team divisions only consider round one; Round 2 is the swapped pairing
        let order = reconstruct_division_team_order(
            &s(&["A", "B"]),
            &rounds_of(vec![(1, vec![p("A", "B")]), (2, vec![p("B", "A")])]),
            1,
        )
        .unwrap();
        assert_eq!(order, s(&["A", "B"]));
    }
}
