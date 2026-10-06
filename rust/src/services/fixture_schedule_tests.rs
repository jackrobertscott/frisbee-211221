//! Port of `server/src/services/fixtureSchedule.test.ts`.

use super::*;
use crate::services::round_robin::get_round_robin_pairings;
use chrono::Timelike;

struct KeepOrder;
impl Shuffle for KeepOrder {
    fn shuffle<T>(&mut self, _items: &mut [T]) {}
}

struct ReverseOrder;
impl Shuffle for ReverseOrder {
    fn shuffle<T>(&mut self, items: &mut [T]) {
        items.reverse();
    }
}

fn sequential_ids() -> impl FnMut() -> String {
    let mut next = 0;
    move || {
        next += 1;
        format!("G{next}")
    }
}

fn s(values: &[&str]) -> Vec<String> {
    values.iter().map(|v| v.to_string()).collect()
}

fn fixture_of(title: &str, pairings: &[Pairing]) -> Fixture {
    let date = "2026-01-01T00:00:00.000Z";
    Fixture {
        id: format!("F-{title}"),
        created_on: date.into(),
        updated_on: date.into(),
        season_id: "S".into(),
        user_id: "U".into(),
        title: title.into(),
        date: date.into(),
        games: pairings
            .iter()
            .enumerate()
            .map(|(index, [team1_id, team2_id])| FixtureGame {
                id: format!("{title}-{index}"),
                team1_id: team1_id.clone(),
                team2_id: team2_id.clone(),
                place: "Field".into(),
                time: "18:00".into(),
                team1_score: None,
                team2_score: None,
            })
            .collect(),
        grading: None,
    }
}

/// `new Date(year, monthIndex, day, hours, minutes).toISOString()`.
fn local_iso(year: i32, month_index: u32, day: u32, hours: u32, minutes: u32) -> String {
    let naive = NaiveDate::from_ymd_opt(year, month_index + 1, day)
        .and_then(|d| d.and_hms_opt(hours, minutes, 0))
        .unwrap();
    js::date::to_iso_string(local_to_ms(naive).unwrap())
}

/// `[getFullYear(), getMonth() + 1, getDate(), getHours()]`.
fn local(iso: &str) -> [i64; 4] {
    let naive = local_naive(js::date::parse(iso).unwrap()).unwrap();
    [
        i64::from(naive.year()),
        i64::from(naive.month()),
        i64::from(naive.day()),
        i64::from(naive.hour()),
    ]
}

fn adjustment(amount: i64, unit: DateUnit, direction: DateDirection) -> DateAdjustment {
    DateAdjustment {
        amount,
        unit,
        direction,
    }
}

fn team(id: &str, division: Option<f64>) -> Team {
    Team {
        id: id.into(),
        created_on: "1970-01-01T00:00:00.000Z".into(),
        updated_on: "1970-01-01T00:00:00.000Z".into(),
        season_id: "S".into(),
        is_mock: None,
        name: id.into(),
        color: "hsla(0, 50%, 50%, 1)".into(),
        division,
        phone: None,
        email: None,
    }
}

mod shift_fixture_date_tests {
    use super::*;
    use DateDirection::*;
    use DateUnit::*;

    fn date() -> String {
        local_iso(2026, 0, 31, 18, 30)
    }

    #[test]
    fn moves_forward_and_backward_by_days() {
        assert_eq!(
            local(&shift_fixture_date(&date(), &adjustment(3, Day, Forward))),
            [2026, 2, 3, 18]
        );
        assert_eq!(
            local(&shift_fixture_date(&date(), &adjustment(3, Day, Backward))),
            [2026, 1, 28, 18]
        );
    }

    #[test]
    fn moves_by_weeks_of_seven_days() {
        assert_eq!(
            local(&shift_fixture_date(&date(), &adjustment(2, Week, Forward))),
            [2026, 2, 14, 18]
        );
    }

    #[test]
    fn moves_by_calendar_months_clamping_to_the_end_of_shorter_months() {
        // 31 Jan + 1 month -> 28 Feb, 31 Jan - 2 months -> 30 Nov
        assert_eq!(
            local(&shift_fixture_date(&date(), &adjustment(1, Month, Forward))),
            [2026, 2, 28, 18]
        );
        assert_eq!(
            local(&shift_fixture_date(
                &date(),
                &adjustment(2, Month, Backward)
            )),
            [2025, 11, 30, 18]
        );
        let leap = local_iso(2028, 0, 31, 18, 30);
        assert_eq!(
            local(&shift_fixture_date(&leap, &adjustment(1, Month, Forward))),
            [2028, 2, 29, 18]
        );
        let mid_month = local_iso(2026, 2, 15, 18, 30);
        assert_eq!(
            local(&shift_fixture_date(
                &mid_month,
                &adjustment(13, Month, Forward)
            )),
            [2027, 4, 15, 18]
        );
    }

    #[test]
    fn leaves_the_date_unchanged_for_a_zero_amount() {
        assert_eq!(
            shift_fixture_date(&date(), &adjustment(0, Month, Backward)),
            date()
        );
    }
}

mod assert_teams_can_be_scheduled_tests {
    use super::*;

    #[test]
    fn requires_every_team_to_have_a_division() {
        let error = assert_teams_can_be_scheduled(&[Some(1.0), None], 10).unwrap_err();
        assert_eq!(error.status_code, 400);
        assert_eq!(error.error_code, "fixture.division_missing");
    }

    #[test]
    fn checks_divisions_before_slots() {
        let error = assert_teams_can_be_scheduled(&[None, None, None, None], 0).unwrap_err();
        assert_eq!(error.error_code, "fixture.division_missing");
    }

    #[test]
    fn requires_at_least_teams_minus_1_over_2_slots() {
        let teams = vec![Some(1.0); 6];
        let error = assert_teams_can_be_scheduled(&teams, 2).unwrap_err();
        assert_eq!(error.status_code, 400);
        assert_eq!(error.error_code, "fixture.slots_insufficient");
        assert!(assert_teams_can_be_scheduled(&teams, 3).is_ok());
    }
}

mod group_team_ids_by_division_tests {
    use super::*;

    #[test]
    fn groups_team_ids_by_division_in_team_order() {
        let divisions =
            group_team_ids_by_division([("A", Some(2.0)), ("B", Some(1.0)), ("C", Some(2.0))]);
        assert_eq!(divisions, vec![(2.0, s(&["A", "C"])), (1.0, s(&["B"]))]);
    }
}

mod get_highest_round_number_tests {
    use super::*;

    #[test]
    fn returns_the_largest_round_number_among_titles() {
        assert_eq!(
            get_highest_round_number(["Round 2", "Final", "Round 10", "Round 3"]),
            Some(10)
        );
    }

    #[test]
    fn returns_undefined_when_no_title_has_a_round_number() {
        assert_eq!(get_highest_round_number([]), None);
        assert_eq!(get_highest_round_number(["Final"]), None);
    }
}

mod resolve_division_team_orders_tests {
    use super::*;

    #[test]
    fn shuffles_a_copy_of_each_division_when_there_are_no_rounds_yet() {
        let divisions = vec![(1.0, s(&["A", "B"])), (2.0, s(&["C", "D"]))];
        let orders = resolve_division_team_orders(&divisions, &[], 3, &mut ReverseOrder).unwrap();
        assert_eq!(orders, vec![(1.0, s(&["B", "A"])), (2.0, s(&["D", "C"]))]);
        assert_eq!(divisions[0].1, s(&["A", "B"]));
    }

    #[test]
    fn continues_the_existing_rotation_for_divisions_with_round_games() {
        let order = s(&["A", "B", "C", "D"]);
        let existing = [
            fixture_of("Round 1", &get_round_robin_pairings(&order, 0)),
            fixture_of("Round 2", &get_round_robin_pairings(&order, 1)),
        ];
        let divisions = vec![(1.0, s(&["E", "F"])), (2.0, s(&["D", "C", "B", "A"]))];
        let orders =
            resolve_division_team_orders(&divisions, &existing, 1, &mut KeepOrder).unwrap();
        // reconstructed divisions come first, shuffled ones after
        assert_eq!(
            orders.iter().map(|(d, _)| *d).collect::<Vec<_>>(),
            [2.0, 1.0]
        );
        let sorted = |pairs: Vec<Pairing>| -> Vec<Pairing> {
            pairs
                .into_iter()
                .map(|mut pair| {
                    pair.sort();
                    pair
                })
                .collect()
        };
        let resolved = sorted(get_round_robin_pairings(&orders[0].1, 2));
        for pair in sorted(get_round_robin_pairings(&order, 2)) {
            assert!(resolved.contains(&pair));
        }
        assert_eq!(orders[1].1, s(&["E", "F"]));
    }
}

mod plan_fixture_rounds_tests {
    use super::*;

    fn slots() -> Vec<FixtureSlot> {
        vec![
            FixtureSlot {
                id: "s1".into(),
                place: "Field 1".into(),
                time: "18:00".into(),
            },
            FixtureSlot {
                id: "s2".into(),
                place: "Field 2".into(),
                time: "19:00".into(),
            },
        ]
    }

    fn starting_date() -> String {
        local_iso(2026, 2, 1, 18, 0)
    }

    fn input<'a>(
        starting_date: &'a str,
        slots: &'a [FixtureSlot],
        round_count: usize,
        teams: &'a [Team],
        existing_fixtures: &'a [Fixture],
    ) -> RoundPlanInput<'a> {
        RoundPlanInput {
            season_id: "S",
            user_id: "U",
            starting_date,
            round_count,
            slots,
            teams,
            existing_fixtures,
        }
    }

    fn division_teams(ids: &[&str], division: f64) -> Vec<Team> {
        ids.iter().map(|id| team(id, Some(division))).collect()
    }

    fn game(id: &str, team1: &str, team2: &str, place: &str, time: &str) -> FixtureGame {
        FixtureGame {
            id: id.into(),
            team1_id: team1.into(),
            team2_id: team2.into(),
            place: place.into(),
            time: time.into(),
            team1_score: None,
            team2_score: None,
        }
    }

    #[test]
    fn builds_weekly_rounds_from_the_round_robin_pairings() {
        let (start, slots) = (starting_date(), slots());
        let teams = division_teams(&["A", "B", "C", "D"], 1.0);
        let fixtures = plan_fixture_rounds_with(
            &input(&start, &slots, 3, &teams, &[]),
            &mut KeepOrder,
            &mut sequential_ids(),
        )
        .unwrap();
        assert_eq!(
            fixtures
                .iter()
                .map(|f| f.title.as_str())
                .collect::<Vec<_>>(),
            ["Round 1", "Round 2", "Round 3"]
        );
        let start_day = i64::from(local_naive(js::date::parse(&start).unwrap()).unwrap().day());
        assert_eq!(
            fixtures
                .iter()
                .map(|f| local(&f.date)[2] - start_day)
                .collect::<Vec<_>>(),
            [0, 7, 14]
        );
        assert_eq!(
            fixtures[0],
            GeneratedFixture {
                season_id: "S".into(),
                user_id: "U".into(),
                title: "Round 1".into(),
                date: start.clone(),
                grading: false,
                games: vec![
                    game("G1", "A", "D", "Field 1", "18:00"),
                    game("G2", "B", "C", "Field 2", "19:00"),
                ],
            }
        );
    }

    #[test]
    fn cycles_slots_across_games_from_every_division() {
        let (start, slots) = (starting_date(), slots());
        let mut teams = division_teams(&["A", "B"], 1.0);
        teams.extend(division_teams(&["C", "D", "E", "F"], 2.0));
        let fixtures = plan_fixture_rounds_with(
            &input(&start, &slots, 1, &teams, &[]),
            &mut KeepOrder,
            &mut sequential_ids(),
        )
        .unwrap();
        let games: Vec<[&str; 3]> = fixtures[0]
            .games
            .iter()
            .map(|g| [g.team1_id.as_str(), g.team2_id.as_str(), g.place.as_str()])
            .collect();
        assert_eq!(
            games,
            [
                ["A", "B", "Field 1"],
                ["C", "F", "Field 2"],
                ["D", "E", "Field 1"]
            ]
        );
    }

    #[test]
    fn continues_numbering_and_rotation_after_existing_rounds() {
        let (start, slots) = (starting_date(), slots());
        let order = s(&["A", "B", "C", "D"]);
        let teams = division_teams(&["A", "B", "C", "D"], 1.0);
        let existing = [
            fixture_of("Round 1", &get_round_robin_pairings(&order, 0)),
            fixture_of("Round 2", &get_round_robin_pairings(&order, 1)),
        ];
        let fixtures = plan_fixture_rounds_with(
            &input(&start, &slots, 1, &teams, &existing),
            &mut KeepOrder,
            &mut sequential_ids(),
        )
        .unwrap();
        assert_eq!(fixtures.len(), 1);
        assert_eq!(fixtures[0].title, "Round 3");
        let key = |pairs: Vec<Pairing>| -> Vec<String> {
            let mut keys: Vec<String> = pairs
                .into_iter()
                .map(|mut pair| {
                    pair.sort();
                    pair.join("-")
                })
                .collect();
            keys.sort();
            keys
        };
        assert_eq!(
            key(fixtures[0]
                .games
                .iter()
                .map(|g| [g.team1_id.clone(), g.team2_id.clone()])
                .collect()),
            key(get_round_robin_pairings(&order, 2))
        );
    }

    #[test]
    fn rejects_divisions_with_an_odd_number_of_teams() {
        let (start, slots) = (starting_date(), slots());
        let teams = division_teams(&["A", "B", "C"], 1.0);
        let error = plan_fixture_rounds_with(
            &input(&start, &slots, 1, &teams, &[]),
            &mut KeepOrder,
            &mut sequential_ids(),
        )
        .unwrap_err();
        assert_eq!(error.status_code, 400);
        assert_eq!(error.error_code, "fixture.uneven_division");
    }

    #[test]
    fn uses_a_random_shuffle_and_random_game_ids_by_default() {
        let (start, slots) = (starting_date(), slots());
        let teams = division_teams(&["A", "B", "C", "D"], 1.0);
        let fixtures = plan_fixture_rounds(&input(&start, &slots, 1, &teams, &[])).unwrap();
        let games = &fixtures[0].games;
        assert_eq!(games.len(), 2);
        let playing: HashSet<&str> = games
            .iter()
            .flat_map(|g| [g.team1_id.as_str(), g.team2_id.as_str()])
            .collect();
        assert_eq!(playing, HashSet::from(["A", "B", "C", "D"]));
        for game in games {
            assert_eq!(game.id.len(), 10);
            assert!(
                game.id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            );
        }
    }
}

mod shuffle_in_place_tests {
    use super::*;

    #[test]
    fn returns_the_same_array_holding_the_same_items() {
        let mut items = vec![1, 2, 3, 4, 5];
        let before = items.as_ptr();
        RandomShuffle.shuffle(&mut items);
        assert_eq!(items.as_ptr(), before);
        let mut sorted = items.clone();
        sorted.sort();
        assert_eq!(sorted, [1, 2, 3, 4, 5]);
    }
}
