//! Port of `server/src/services/spiritStats.ts`: spirit table rows with
//! averages adjusted for each scoring team's bias.

use crate::js;
use crate::queries::spirit_table::{SpiritReportScore, SpiritTableAggregate};
use crate::shared::contract::feature::{FeatureSpiritRow, FeatureSpiritSortKey};
use crate::shared::schemas::Team;
use crate::shared::utils::endpoint_def::SortDirection;
use std::cmp::Ordering;
use std::collections::HashMap;

const SPIRIT_SCORER_BIAS_SHRINKAGE_REPORTS: f64 = 3.0;

#[derive(Clone, Copy, Debug, Default)]
struct SpiritStats {
    spirit: f64,
    reports: f64,
}

/// `TAdjustedSpiritAverages`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AdjustedSpiritAverages {
    pub received_average_map: HashMap<String, f64>,
    pub allocated_average_map: HashMap<String, f64>,
}

fn add_spirit_stat(map: &mut HashMap<String, SpiritStats>, team_id: &str, spirit: f64) {
    let stats = map.entry(team_id.to_string()).or_default();
    stats.spirit += spirit;
    stats.reports += 1.0;
}

fn get_average_map(map: HashMap<String, SpiritStats>) -> HashMap<String, f64> {
    map.into_iter()
        .map(|(team_id, stats)| (team_id, stats.spirit / stats.reports))
        .collect()
}

/// `getAdjustedSpiritAverages(reports)`: average spirit per team after
/// removing each scoring team's bias — how far its average score sits from
/// the overall average, shrunk toward zero until it has scored enough reports
/// to trust.
pub fn get_adjusted_spirit_averages(reports: &[SpiritReportScore]) -> AdjustedSpiritAverages {
    let total = reports
        .iter()
        .fold(0.0, |total, report| total + report.spirit);
    let count = if reports.is_empty() {
        1.0
    } else {
        reports.len() as f64
    };
    let global_average = total / count;
    let mut scorer_stats = HashMap::new();
    for report in reports {
        add_spirit_stat(&mut scorer_stats, &report.team_id, report.spirit);
    }
    let scorer_bias: HashMap<&String, f64> = scorer_stats
        .iter()
        .map(|(team_id, stats)| {
            // Pull scorer bias toward zero until there are enough reports to trust it.
            let confidence = stats.reports / (stats.reports + SPIRIT_SCORER_BIAS_SHRINKAGE_REPORTS);
            let average = stats.spirit / stats.reports;
            (team_id, confidence * (average - global_average))
        })
        .collect();
    let mut received = HashMap::new();
    let mut allocated = HashMap::new();
    for report in reports {
        let adjusted = report.spirit - scorer_bias.get(&report.team_id).copied().unwrap_or(0.0);
        add_spirit_stat(&mut received, &report.team_against_id, adjusted);
        add_spirit_stat(&mut allocated, &report.team_id, adjusted);
    }
    AdjustedSpiritAverages {
        received_average_map: get_average_map(received),
        allocated_average_map: get_average_map(allocated),
    }
}

/// `buildSpiritRows(teams, aggregate)`: one row per team, in the order the
/// teams are given.
pub fn build_spirit_rows(
    teams: &[Team],
    aggregate: Option<&SpiritTableAggregate>,
) -> Vec<FeatureSpiritRow> {
    let empty = SpiritTableAggregate::default();
    let aggregate = aggregate.unwrap_or(&empty);
    let received_map: HashMap<&str, (f64, f64)> = aggregate
        .received
        .iter()
        .map(|row| (row.team_id.as_str(), (row.spirit, row.reports as f64)))
        .collect();
    let allocated_map: HashMap<&str, (f64, f64)> = aggregate
        .allocated
        .iter()
        .map(|row| (row.team_id.as_str(), (row.spirit, row.reports as f64)))
        .collect();
    let adjusted = get_adjusted_spirit_averages(&aggregate.reports);
    teams
        .iter()
        .map(|team| {
            let (received_spirit, received_reports) = received_map
                .get(team.id.as_str())
                .copied()
                .unwrap_or((0.0, 0.0));
            let (allocated_spirit, allocated_reports) = allocated_map
                .get(team.id.as_str())
                .copied()
                .unwrap_or((0.0, 0.0));
            let received_average = if received_reports > 0.0 {
                received_spirit / received_reports
            } else {
                0.0
            };
            let allocated_average = if allocated_reports > 0.0 {
                allocated_spirit / allocated_reports
            } else {
                0.0
            };
            let adjusted_received_average = adjusted
                .received_average_map
                .get(&team.id)
                .copied()
                .unwrap_or(0.0);
            let adjusted_allocated_average = adjusted
                .allocated_average_map
                .get(&team.id)
                .copied()
                .unwrap_or(0.0);
            // differences only mean something once a team has both scored and been scored
            let has_both = received_reports > 0.0 && allocated_reports > 0.0;
            FeatureSpiritRow {
                team: team.clone(),
                received_spirit,
                received_reports,
                received_average,
                adjusted_received_average,
                allocated_spirit,
                allocated_reports,
                allocated_average,
                adjusted_allocated_average,
                average_difference: if has_both {
                    allocated_average - received_average
                } else {
                    0.0
                },
                adjusted_difference: if has_both {
                    adjusted_allocated_average - adjusted_received_average
                } else {
                    0.0
                },
            }
        })
        .collect()
}

fn numeric(row: &FeatureSpiritRow, key: FeatureSpiritSortKey) -> f64 {
    match key {
        FeatureSpiritSortKey::Team | FeatureSpiritSortKey::Division => 0.0,
        FeatureSpiritSortKey::ReceivedSpirit => row.received_spirit,
        FeatureSpiritSortKey::ReceivedReports => row.received_reports,
        FeatureSpiritSortKey::ReceivedAverage => row.received_average,
        FeatureSpiritSortKey::AdjustedReceivedAverage => row.adjusted_received_average,
        FeatureSpiritSortKey::AllocatedSpirit => row.allocated_spirit,
        FeatureSpiritSortKey::AllocatedReports => row.allocated_reports,
        FeatureSpiritSortKey::AllocatedAverage => row.allocated_average,
        FeatureSpiritSortKey::AdjustedAllocatedAverage => row.adjusted_allocated_average,
        FeatureSpiritSortKey::AverageDifference => row.average_difference,
        FeatureSpiritSortKey::AdjustedDifference => row.adjusted_difference,
    }
}

/// `sortSpiritRows(rows, sortBy, sortDirection)`. The spirit table is
/// computed per request (the adjusted averages need every report) rather than
/// stored, so it is sorted here, stably. Division sorts keep teams without a
/// division last and break ties by team name ascending.
pub fn sort_spirit_rows(
    rows: &[FeatureSpiritRow],
    sort_by: FeatureSpiritSortKey,
    sort_direction: SortDirection,
) -> Vec<FeatureSpiritRow> {
    let directed = |ordering: Ordering| match sort_direction {
        SortDirection::Asc => ordering,
        SortDirection::Desc => ordering.reverse(),
    };
    let by_name =
        |a: &FeatureSpiritRow, b: &FeatureSpiritRow| js::locale_compare(&a.team.name, &b.team.name);
    let mut sorted = rows.to_vec();
    sorted.sort_by(|a, b| match sort_by {
        FeatureSpiritSortKey::Team => directed(by_name(a, b)),
        FeatureSpiritSortKey::Division => match (a.team.division, b.team.division) {
            (None, None) => by_name(a, b),
            (None, Some(_)) => Ordering::Greater,
            (Some(_), None) => Ordering::Less,
            (Some(x), Some(y)) => match x.partial_cmp(&y).unwrap_or(Ordering::Equal) {
                Ordering::Equal => by_name(a, b),
                other => directed(other),
            },
        },
        key => directed(
            numeric(a, key)
                .partial_cmp(&numeric(b, key))
                .unwrap_or(Ordering::Equal),
        ),
    });
    sorted
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queries::spirit_table::SpiritTeamTotal;

    const NOW: &str = "1970-01-01T00:00:00.000Z";

    fn team(id: &str, name: &str, division: Option<f64>) -> Team {
        Team {
            id: id.into(),
            created_on: NOW.into(),
            updated_on: NOW.into(),
            season_id: "s".into(),
            is_mock: None,
            name: name.into(),
            color: "hsla(0, 50%, 50%, 1)".into(),
            division,
            phone: None,
            email: None,
        }
    }

    fn score(team_id: &str, team_against_id: &str, spirit: f64) -> SpiritReportScore {
        SpiritReportScore {
            team_id: team_id.into(),
            team_against_id: team_against_id.into(),
            spirit,
        }
    }

    fn total(team_id: &str, spirit: f64, reports: i64) -> SpiritTeamTotal {
        SpiritTeamTotal {
            team_id: team_id.into(),
            spirit,
            reports,
        }
    }

    #[track_caller]
    fn close(actual: Option<&f64>, expected: f64) {
        let actual = *actual.expect("value");
        assert!((actual - expected).abs() < 0.005, "{actual} != {expected}");
    }

    mod get_adjusted_spirit_averages_tests {
        use super::*;

        #[test]
        fn leaves_scores_alone_when_every_scorer_matches_the_overall_average() {
            let result =
                get_adjusted_spirit_averages(&[score("a", "b", 10.0), score("b", "a", 10.0)]);
            assert_eq!(result.received_average_map.get("a"), Some(&10.0));
            assert_eq!(result.allocated_average_map.get("b"), Some(&10.0));
        }

        #[test]
        fn removes_a_shrunken_share_of_each_scorer_bias() {
            // a scores 14, b scores 10: overall 12, each bias is 2 shrunk by 1/(1+3)
            let result =
                get_adjusted_spirit_averages(&[score("a", "b", 14.0), score("b", "a", 10.0)]);
            close(result.received_average_map.get("b"), 13.5);
            close(result.received_average_map.get("a"), 10.5);
            close(result.allocated_average_map.get("a"), 13.5);
        }

        #[test]
        fn handles_no_reports() {
            assert!(
                get_adjusted_spirit_averages(&[])
                    .received_average_map
                    .is_empty()
            );
        }
    }

    mod build_spirit_rows_tests {
        use super::*;

        #[test]
        fn builds_a_row_per_team_with_zeros_for_teams_without_reports() {
            let rows = build_spirit_rows(
                &[
                    team("a", "A", None),
                    team("b", "B", None),
                    team("c", "C", None),
                ],
                Some(&SpiritTableAggregate {
                    received: vec![total("a", 20.0, 2), total("b", 12.0, 1)],
                    allocated: vec![total("a", 12.0, 1)],
                    reports: vec![
                        score("a", "b", 12.0),
                        score("b", "a", 10.0),
                        score("b", "a", 10.0),
                    ],
                }),
            );
            assert_eq!(
                rows.iter().map(|r| r.team.id.as_str()).collect::<Vec<_>>(),
                ["a", "b", "c"]
            );
            assert_eq!(rows[0].received_average, 10.0);
            assert_eq!(rows[0].allocated_average, 12.0);
            assert_eq!(rows[0].average_difference, 2.0);
            // b has only been scored, so differences stay zero
            assert_eq!(rows[1].average_difference, 0.0);
            assert_eq!(rows[1].adjusted_difference, 0.0);
            assert_eq!(rows[2].received_spirit, 0.0);
            assert_eq!(rows[2].received_reports, 0.0);
            assert_eq!(rows[2].adjusted_received_average, 0.0);
        }

        #[test]
        fn accepts_a_missing_aggregate() {
            assert_eq!(
                build_spirit_rows(&[team("a", "A", None)], None)[0].received_average,
                0.0
            );
        }
    }

    mod sort_spirit_rows_tests {
        use super::*;

        fn rows() -> Vec<FeatureSpiritRow> {
            [
                team("a", "Bravo", Some(2.0)),
                team("b", "Alpha", None),
                team("c", "Charlie", Some(1.0)),
                team("d", "Delta", Some(2.0)),
            ]
            .into_iter()
            .enumerate()
            .map(|(index, item)| FeatureSpiritRow {
                received_spirit: index as f64,
                ..build_spirit_rows(&[item], None).remove(0)
            })
            .collect()
        }

        fn names(sorted: &[FeatureSpiritRow]) -> Vec<&str> {
            sorted.iter().map(|r| r.team.name.as_str()).collect()
        }

        #[test]
        fn sorts_by_team_name() {
            assert_eq!(
                names(&sort_spirit_rows(
                    &rows(),
                    FeatureSpiritSortKey::Team,
                    SortDirection::Desc
                )),
                ["Delta", "Charlie", "Bravo", "Alpha"]
            );
        }

        #[test]
        fn keeps_missing_divisions_last_and_names_ascending_within_a_division() {
            assert_eq!(
                names(&sort_spirit_rows(
                    &rows(),
                    FeatureSpiritSortKey::Division,
                    SortDirection::Desc
                )),
                ["Bravo", "Delta", "Charlie", "Alpha"]
            );
        }

        #[test]
        fn sorts_numeric_columns_without_mutating_the_input() {
            let rows = rows();
            assert_eq!(
                names(&sort_spirit_rows(
                    &rows,
                    FeatureSpiritSortKey::ReceivedSpirit,
                    SortDirection::Desc
                )),
                ["Delta", "Charlie", "Alpha", "Bravo"]
            );
            assert_eq!(names(&rows), ["Bravo", "Alpha", "Charlie", "Delta"]);
        }
    }
}
