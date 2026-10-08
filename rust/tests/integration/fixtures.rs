//! Port of `server/test/integration/fixtures.test.ts`.

use crate::common::actors::{Actor, SignUp, create_season, create_team, sign_up};
use crate::common::{CallOptions, Response, TestServer, assert_match};
use chrono::{DateTime, Local, TimeZone, Utc};
use frisbee::db::{Patch, Query};
use frisbee::shared::schemas::{Fixture, Team};
use frisbee::tables::{FIXTURE, TEAM};
use serde_json::{Value, json};
use std::collections::HashSet;

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

async fn admin(server: &TestServer) -> Actor {
    sign_up(
        server,
        SignUp {
            admin: true,
            ..Default::default()
        },
    )
    .await
}

async fn set_division(server: &TestServer, team_id: &str, division: f64) {
    TEAM.update_one(
        server.db(),
        Team::ID.eq(team_id),
        Patch::new().set(Team::DIVISION, division),
    )
    .await
    .unwrap();
}

/// Creates a season with `counts[i]` teams in division `i + 1`.
async fn season_with_divisions(
    server: &TestServer,
    admin: &Actor,
    counts: &[usize],
) -> (Value, Vec<Vec<String>>) {
    let season = create_season(server, admin, json!({})).await;
    let mut divisions = Vec::new();
    for (d, count) in counts.iter().enumerate() {
        let mut ids = Vec::new();
        for t in 0..*count {
            let team = create_team(
                server,
                admin,
                &id(&season),
                &format!("D{} Team {}", d + 1, t + 1),
                json!({}),
            )
            .await;
            set_division(server, &id(&team), (d + 1) as f64).await;
            ids.push(id(&team));
        }
        divisions.push(ids);
    }
    (season, divisions)
}

fn slots(count: usize) -> Value {
    Value::Array(
        (0..count)
            .map(|i| {
                json!({
                    "id": format!("slot{}", i + 1),
                    "time": format!("{}:00", 10 + i),
                    "place": format!("Field {}", i + 1),
                })
            })
            .collect(),
    )
}

fn pair_key(a: &str, b: &str) -> String {
    let mut pair = [a, b];
    pair.sort();
    pair.join("::")
}

fn round_number_of(fixture: &Fixture) -> u32 {
    fixture.title.replace("Round ", "").parse().unwrap()
}

async fn season_fixtures(server: &TestServer, season_id: &str) -> Vec<Fixture> {
    FIXTURE
        .get_many(
            server.db(),
            Fixture::SEASON_ID.eq(season_id),
            Query::new().sort([Fixture::DATE.asc()]),
        )
        .await
        .unwrap()
}

/// Mirrors the server's local-time calendar arithmetic (`setMonth` / `setDate`).
fn shift_date(iso: &str, unit: &str, amount: i64) -> String {
    let utc: DateTime<Utc> = iso.parse().unwrap();
    let local = utc.with_timezone(&Local).naive_local();
    let date = match unit {
        "month" => {
            let months = i64::from(chrono::Datelike::year(&local)) * 12
                + i64::from(chrono::Datelike::month0(&local))
                + amount;
            chrono::NaiveDate::from_ymd_opt(
                months.div_euclid(12) as i32,
                months.rem_euclid(12) as u32 + 1,
                chrono::Datelike::day(&local),
            )
            .unwrap()
        }
        "week" => local.date() + chrono::Duration::days(amount * 7),
        _ => local.date() + chrono::Duration::days(amount),
    };
    let shifted = Local
        .from_local_datetime(&date.and_time(local.time()))
        .earliest()
        .unwrap();
    frisbee::js::date::to_iso_string(shifted.timestamp_millis())
}

#[track_caller]
fn expect_rounds_valid(fixtures: &[Fixture], divisions: &[Vec<String>]) {
    for fixture in fixtures {
        for division in divisions {
            let set: HashSet<&String> = division.iter().collect();
            let games: Vec<_> = fixture
                .games
                .iter()
                .filter(|g| set.contains(&g.team1_id) || set.contains(&g.team2_id))
                .collect();
            // every game stays within its division
            for g in &games {
                assert!(set.contains(&g.team1_id) && set.contains(&g.team2_id));
                assert_ne!(g.team1_id, g.team2_id);
            }
            // each team plays exactly once per round
            let mut played: Vec<String> = games
                .iter()
                .flat_map(|g| [g.team1_id.clone(), g.team2_id.clone()])
                .collect();
            played.sort();
            let mut expected = division.clone();
            expected.sort();
            assert_eq!(played, expected);
        }
    }
}

fn division_pairings(fixtures: &[Fixture], division: &[String]) -> Vec<String> {
    let set: HashSet<&String> = division.iter().collect();
    fixtures
        .iter()
        .flat_map(|f| {
            f.games
                .iter()
                .filter(|g| set.contains(&g.team1_id) && set.contains(&g.team2_id))
                .map(|g| pair_key(&g.team1_id, &g.team2_id))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn unique(values: &[String]) -> usize {
    values.iter().collect::<HashSet<_>>().len()
}

mod fixture_management {
    use super::*;

    #[tokio::test]
    async fn creates_updates_and_deletes_fixtures_as_an_admin() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let a = create_team(&server, &admin, &id(&season), "Alpha", json!({})).await;
        let b = create_team(&server, &admin, &id(&season), "Bravo", json!({})).await;

        let created = server
            .post_as(
                "/FixtureCreate",
                json!({
                    "seasonId": season["id"],
                    "title": "Week 1",
                    "date": "2026-06-10T08:00:00.000Z",
                    "games": [{"id": "g1", "team1Id": a["id"], "team2Id": b["id"], "place": "Field 1", "time": "6pm"}],
                }),
                &admin.token,
            )
            .await;
        assert_eq!(created.status, 200);
        assert_match(
            &created.body,
            &json!({
                "seasonId": season["id"],
                "userId": admin.user_id,
                "title": "Week 1",
                "date": "2026-06-10T08:00:00.000Z",
                "games": [{"id": "g1", "team1Id": a["id"], "team2Id": b["id"], "place": "Field 1", "time": "6pm"}],
            }),
        );
        assert!(created.body.get("grading").is_none());
        let fixture_id = id(&created.body);

        let updated = server
            .post_as(
                "/FixtureUpdate",
                json!({
                    "fixtureId": fixture_id,
                    "title": "Week 1 (moved)",
                    "date": "2026-06-11T08:00:00.000Z",
                    "games": [{
                        "id": "g1",
                        "team1Id": a["id"],
                        "team2Id": b["id"],
                        "place": "Field 2",
                        "time": "7pm",
                        "team1Score": 13,
                        "team2Score": 9,
                    }],
                    "grading": true,
                }),
                &admin.token,
            )
            .await;
        assert_eq!(updated.status, 200);
        assert_match(
            &updated.body,
            &json!({
                "id": fixture_id,
                "title": "Week 1 (moved)",
                "date": "2026-06-11T08:00:00.000Z",
                "grading": true,
            }),
        );
        assert_match(
            &updated.body["games"][0],
            &json!({"team1Score": 13, "team2Score": 9}),
        );
        let stored = FIXTURE
            .get_one(server.db(), Fixture::ID.eq(&fixture_id))
            .await
            .unwrap();
        assert_eq!(stored.title, "Week 1 (moved)");

        let deleted = server
            .post_as(
                "/FixtureDelete",
                json!({"fixtureId": fixture_id}),
                &admin.token,
            )
            .await;
        assert_eq!(deleted.status, 204);
        assert!(
            FIXTURE
                .maybe_one(server.db(), Fixture::ID.eq(&fixture_id))
                .await
                .unwrap()
                .is_none()
        );

        // deleting a missing fixture is a silent no-op
        let again = server
            .post_as(
                "/FixtureDelete",
                json!({"fixtureId": fixture_id}),
                &admin.token,
            )
            .await;
        assert_eq!(again.status, 204);
    }

    #[tokio::test]
    async fn rejects_fixture_writes_from_non_admins_and_unknown_seasons() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let player = sign_up(&server, SignUp::default()).await;
        let season = create_season(&server, &admin, json!({})).await;
        let payload = json!({
            "seasonId": season["id"],
            "title": "Nope",
            "date": "2026-06-10T08:00:00.000Z",
            "games": [],
        });
        let anonymous = server.post("/FixtureCreate", payload.clone()).await;
        assert_eq!(anonymous.status, 401);
        let forbidden = server
            .post_as("/FixtureCreate", payload.clone(), &player.token)
            .await;
        assert_eq!(forbidden.status, 403);
        assert_eq!(forbidden.body["errorCode"], "auth.admin_required");

        let fixture = FIXTURE
            .create_one(
                server.db(),
                json!({
                    "seasonId": season["id"],
                    "userId": admin.user_id,
                    "title": "Existing",
                    "date": "2026-06-10T08:00:00.000Z",
                    "games": [],
                }),
            )
            .await
            .unwrap();
        let cases = [
            (
                "/FixtureUpdate",
                json!({"fixtureId": fixture.id, "title": "X", "date": fixture.date, "games": []}),
            ),
            ("/FixtureDelete", json!({"fixtureId": fixture.id})),
            (
                "/FixtureAdjustMultiple",
                json!({
                    "seasonId": season["id"],
                    "referenceFixtureId": fixture.id,
                    "amount": 1,
                    "unit": "day",
                    "direction": "forward",
                }),
            ),
            (
                "/FixtureGenerate",
                json!({"seasonId": season["id"], "startingDate": fixture.date, "roundCount": 1, "slots": []}),
            ),
        ];
        for (path, body) in cases {
            let response = server.post_as(path, body, &player.token).await;
            assert_eq!(response.status, 403, "{path}");
            assert_eq!(response.body["errorCode"], "auth.admin_required");
        }
        let stored = FIXTURE
            .get_one(server.db(), Fixture::ID.eq(&fixture.id))
            .await
            .unwrap();
        assert_eq!(stored.title, "Existing");

        let mut missing_payload = payload.clone();
        missing_payload["seasonId"] = json!("missing-season");
        let missing_season = server
            .post_as("/FixtureCreate", missing_payload, &admin.token)
            .await;
        assert_eq!(missing_season.status, 404);
        assert_eq!(missing_season.body["errorCode"], "db.record_not_found");

        let missing_fixture = server
            .post_as(
                "/FixtureUpdate",
                json!({"fixtureId": "missing", "title": "X", "date": fixture.date, "games": []}),
                &admin.token,
            )
            .await;
        assert_eq!(missing_fixture.status, 404);
        assert_eq!(missing_fixture.body["errorCode"], "db.record_not_found");
    }
}

mod fixture_adjust_multiple {
    use super::*;

    struct Setup {
        admin: Actor,
        season: Value,
        fixtures: Vec<Fixture>,
        other_fixture: Fixture,
    }

    async fn setup(server: &TestServer) -> Setup {
        let admin = admin(server).await;
        let season = create_season(server, &admin, json!({})).await;
        let other = create_season(server, &admin, json!({"name": "Other"})).await;
        let dates = [
            "2026-06-03T07:00:00.000Z",
            "2026-06-10T07:00:00.000Z",
            "2026-06-17T07:00:00.000Z",
            "2026-06-24T07:00:00.000Z",
        ];
        let mut fixtures = Vec::new();
        for (i, date) in dates.iter().enumerate() {
            fixtures.push(
                FIXTURE
                    .create_one(
                        server.db(),
                        json!({
                            "seasonId": season["id"],
                            "userId": admin.user_id,
                            "title": format!("Week {}", i + 1),
                            "date": date,
                            "games": [],
                        }),
                    )
                    .await
                    .unwrap(),
            );
        }
        let other_fixture = FIXTURE
            .create_one(
                server.db(),
                json!({
                    "seasonId": other["id"],
                    "userId": admin.user_id,
                    "title": "Other season",
                    "date": "2026-06-30T07:00:00.000Z",
                    "games": [],
                }),
            )
            .await
            .unwrap();
        Setup {
            admin,
            season,
            fixtures,
            other_fixture,
        }
    }

    async fn adjust(
        server: &TestServer,
        admin: &Actor,
        season_id: &Value,
        reference_fixture_id: &str,
        amount: i64,
        unit: &str,
        direction: &str,
    ) -> Response {
        server
            .call(
                "/FixtureAdjustMultiple",
                Some(json!({
                    "seasonId": season_id,
                    "referenceFixtureId": reference_fixture_id,
                    "amount": amount,
                    "unit": unit,
                    "direction": direction,
                })),
                CallOptions::token(&admin.token),
            )
            .await
    }

    async fn moves_fixtures_on_or_after_the_reference(unit: &str, direction: &str, amount: i64) {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            fixtures,
            other_fixture,
        } = setup(&server).await;
        let response = adjust(
            &server,
            &admin,
            &season["id"],
            &fixtures[1].id,
            amount,
            unit,
            direction,
        )
        .await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!({"count": 3}));

        let signed = if direction == "backward" {
            -amount
        } else {
            amount
        };
        let mut after = Vec::new();
        for fixture in &fixtures {
            after.push(
                FIXTURE
                    .get_one(server.db(), Fixture::ID.eq(&fixture.id))
                    .await
                    .unwrap(),
            );
        }
        assert_eq!(after[0].date, fixtures[0].date);
        for i in 1..fixtures.len() {
            assert_eq!(after[i].date, shift_date(&fixtures[i].date, unit, signed));
            assert!(after[i].updated_on >= fixtures[i].updated_on);
        }
        // fixtures from other seasons are untouched
        let other = FIXTURE
            .get_one(server.db(), Fixture::ID.eq(&other_fixture.id))
            .await
            .unwrap();
        assert_eq!(other.date, other_fixture.date);
    }

    #[tokio::test]
    async fn moves_fixtures_on_after_the_reference_by_3_day_forward() {
        moves_fixtures_on_or_after_the_reference("day", "forward", 3).await;
    }

    #[tokio::test]
    async fn moves_fixtures_on_after_the_reference_by_2_day_backward() {
        moves_fixtures_on_or_after_the_reference("day", "backward", 2).await;
    }

    #[tokio::test]
    async fn moves_fixtures_on_after_the_reference_by_1_week_forward() {
        moves_fixtures_on_or_after_the_reference("week", "forward", 1).await;
    }

    #[tokio::test]
    async fn moves_fixtures_on_after_the_reference_by_2_week_backward() {
        moves_fixtures_on_or_after_the_reference("week", "backward", 2).await;
    }

    #[tokio::test]
    async fn moves_fixtures_on_after_the_reference_by_1_month_forward() {
        moves_fixtures_on_or_after_the_reference("month", "forward", 1).await;
    }

    #[tokio::test]
    async fn moves_fixtures_on_after_the_reference_by_1_month_backward() {
        moves_fixtures_on_or_after_the_reference("month", "backward", 1).await;
    }

    #[tokio::test]
    async fn counts_only_the_reference_when_it_is_the_last_fixture_and_allows_zero_amounts() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            fixtures,
            ..
        } = setup(&server).await;
        let last = adjust(
            &server,
            &admin,
            &season["id"],
            &fixtures[3].id,
            1,
            "day",
            "forward",
        )
        .await;
        assert_eq!(last.body, json!({"count": 1}));
        let zero = adjust(
            &server,
            &admin,
            &season["id"],
            &fixtures[0].id,
            0,
            "week",
            "forward",
        )
        .await;
        assert_eq!(zero.body, json!({"count": 4}));
        let first = FIXTURE
            .get_one(server.db(), Fixture::ID.eq(&fixtures[0].id))
            .await
            .unwrap();
        assert_eq!(first.date, fixtures[0].date);
    }

    #[tokio::test]
    async fn returns_404_for_an_unknown_reference_fixture() {
        let server = TestServer::start().await;
        let Setup { admin, season, .. } = setup(&server).await;
        let response = adjust(
            &server,
            &admin,
            &season["id"],
            "missing",
            1,
            "day",
            "forward",
        )
        .await;
        assert_eq!(response.status, 404);
        assert_eq!(response.body["errorCode"], "db.record_not_found");
    }
}

mod fixture_generate {
    use super::*;

    async fn generate(
        server: &TestServer,
        admin: &Actor,
        season_id: &Value,
        starting_date: &str,
        round_count: usize,
        slot_count: usize,
    ) -> Response {
        server
            .call(
                "/FixtureGenerate",
                Some(json!({
                    "seasonId": season_id,
                    "startingDate": starting_date,
                    "roundCount": round_count,
                    "slots": slots(slot_count),
                })),
                CallOptions::token(&admin.token),
            )
            .await
    }

    fn titles(fixtures: &[Fixture]) -> Vec<&str> {
        fixtures.iter().map(|f| f.title.as_str()).collect()
    }

    #[tokio::test]
    async fn requires_every_team_to_have_a_division() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, _) = season_with_divisions(&server, &admin, &[2]).await;
        create_team(&server, &admin, &id(&season), "No Division", json!({})).await;
        let response = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            1,
            4,
        )
        .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "fixture.division_missing");
        assert!(season_fixtures(&server, &id(&season)).await.is_empty());
    }

    #[tokio::test]
    async fn requires_enough_slots_for_the_teams() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, _) = season_with_divisions(&server, &admin, &[4, 4]).await;
        // 8 teams need at least ceil(7 / 2) = 4 slots
        let response = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            1,
            3,
        )
        .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "fixture.slots_insufficient");
        assert!(season_fixtures(&server, &id(&season)).await.is_empty());
    }

    #[tokio::test]
    async fn rejects_divisions_with_an_odd_number_of_teams() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, _) = season_with_divisions(&server, &admin, &[4, 3]).await;
        let response = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            1,
            4,
        )
        .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "fixture.uneven_division");
        assert!(season_fixtures(&server, &id(&season)).await.is_empty());
    }

    #[tokio::test]
    async fn generates_weekly_round_robin_rounds_within_each_division() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, divisions) = season_with_divisions(&server, &admin, &[4, 4]).await;
        let start = "2026-07-01T07:00:00.000Z";
        let response = generate(&server, &admin, &season["id"], start, 3, 4).await;
        assert_eq!(response.status, 204);

        let fixtures = season_fixtures(&server, &id(&season)).await;
        assert_eq!(titles(&fixtures), ["Round 1", "Round 2", "Round 3"]);
        assert_eq!(
            fixtures.iter().map(|f| f.date.clone()).collect::<Vec<_>>(),
            [
                shift_date(start, "week", 0),
                shift_date(start, "week", 1),
                shift_date(start, "week", 2)
            ]
        );
        let slot_list = slots(4);
        for fixture in &fixtures {
            assert_eq!(fixture.user_id, admin.user_id);
            assert_eq!(fixture.grading, Some(false));
            assert_eq!(fixture.games.len(), 4);
            // one game per slot when the slot count matches the game count
            let mut places: Vec<&str> = fixture.games.iter().map(|g| g.place.as_str()).collect();
            places.sort();
            assert_eq!(places, ["Field 1", "Field 2", "Field 3", "Field 4"]);
            for game in &fixture.games {
                let slot = slot_list
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|s| s["place"] == game.place.as_str())
                    .unwrap();
                assert_eq!(slot["time"], game.time.as_str());
                assert!(!game.id.is_empty());
            }
        }
        expect_rounds_valid(&fixtures, &divisions);
        for division in &divisions {
            let pairings = division_pairings(&fixtures, division);
            assert_eq!(pairings.len(), 6);
            assert_eq!(unique(&pairings), 6);
        }
    }

    #[tokio::test]
    async fn reuses_slots_when_there_are_more_games_than_slots() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, divisions) = season_with_divisions(&server, &admin, &[6]).await;
        let response = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            5,
            3,
        )
        .await;
        assert_eq!(response.status, 204);
        let fixtures = season_fixtures(&server, &id(&season)).await;
        assert_eq!(fixtures.len(), 5);
        for fixture in &fixtures {
            let mut places: Vec<&str> = fixture.games.iter().map(|g| g.place.as_str()).collect();
            places.sort();
            assert_eq!(places, ["Field 1", "Field 2", "Field 3"]);
        }
        expect_rounds_valid(&fixtures, &divisions);
        assert_eq!(unique(&division_pairings(&fixtures, &divisions[0])), 15);
    }

    #[tokio::test]
    async fn continues_the_round_robin_after_a_single_existing_round() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, divisions) = season_with_divisions(&server, &admin, &[4, 4]).await;
        let first = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            1,
            4,
        )
        .await;
        assert_eq!(first.status, 204);
        let second_start = "2026-07-15T07:00:00.000Z";
        let second = generate(&server, &admin, &season["id"], second_start, 2, 4).await;
        assert_eq!(second.status, 204);

        let fixtures = season_fixtures(&server, &id(&season)).await;
        assert_eq!(titles(&fixtures), ["Round 1", "Round 2", "Round 3"]);
        assert_eq!(fixtures[1].date, shift_date(second_start, "week", 0));
        assert_eq!(fixtures[2].date, shift_date(second_start, "week", 1));
        expect_rounds_valid(&fixtures, &divisions);
        for division in &divisions {
            assert_eq!(unique(&division_pairings(&fixtures, division)), 6);
        }
    }

    #[tokio::test]
    async fn continues_the_round_robin_after_two_existing_rounds_and_into_the_next_cycle() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, divisions) = season_with_divisions(&server, &admin, &[6]).await;
        let first = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            2,
            3,
        )
        .await;
        assert_eq!(first.status, 204);
        let second = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-15T07:00:00.000Z",
            3,
            3,
        )
        .await;
        assert_eq!(second.status, 204);

        let fixtures = season_fixtures(&server, &id(&season)).await;
        assert_eq!(
            fixtures.iter().map(round_number_of).collect::<Vec<_>>(),
            [1, 2, 3, 4, 5]
        );
        expect_rounds_valid(&fixtures, &divisions);
        // a full cycle of 5 rounds covers all 15 pairings exactly once
        assert_eq!(unique(&division_pairings(&fixtures, &divisions[0])), 15);

        // the next cycle replays every pairing exactly once more
        let third = generate(
            &server,
            &admin,
            &season["id"],
            "2026-08-05T07:00:00.000Z",
            5,
            3,
        )
        .await;
        assert_eq!(third.status, 204);
        let fixtures = season_fixtures(&server, &id(&season)).await;
        assert_eq!(
            fixtures.iter().map(round_number_of).collect::<Vec<_>>(),
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        );
        expect_rounds_valid(&fixtures, &divisions);
        let second_cycle = division_pairings(&fixtures[5..], &divisions[0]);
        assert_eq!(second_cycle.len(), 15);
        assert_eq!(unique(&second_cycle), 15);
    }

    #[tokio::test]
    async fn rejects_continuing_when_existing_rounds_break_the_round_robin_pattern() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, divisions) = season_with_divisions(&server, &admin, &[4]).await;
        let [a, b, c, d] = [
            &divisions[0][0],
            &divisions[0][1],
            &divisions[0][2],
            &divisions[0][3],
        ];
        // Round 1 and Round 2 repeat the same pairings
        for n in [1, 2] {
            FIXTURE
                .create_one(
                    server.db(),
                    json!({
                        "seasonId": season["id"],
                        "userId": admin.user_id,
                        "title": format!("Round {n}"),
                        "date": format!("2026-07-0{n}T07:00:00.000Z"),
                        "games": [
                            {"id": format!("x{n}1"), "team1Id": a, "team2Id": b, "place": "P", "time": "T"},
                            {"id": format!("x{n}2"), "team1Id": c, "team2Id": d, "place": "P", "time": "T"},
                        ],
                    }),
                )
                .await
                .unwrap();
        }
        let response = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-15T07:00:00.000Z",
            1,
            2,
        )
        .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "fixture.round_robin_invalid");
    }

    #[tokio::test]
    async fn ignores_existing_fixtures_without_a_round_title() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let (season, divisions) = season_with_divisions(&server, &admin, &[2]).await;
        FIXTURE
            .create_one(
                server.db(),
                json!({
                    "seasonId": season["id"],
                    "userId": admin.user_id,
                    "title": "Preseason",
                    "date": "2026-06-01T07:00:00.000Z",
                    "games": [],
                }),
            )
            .await
            .unwrap();
        let response = generate(
            &server,
            &admin,
            &season["id"],
            "2026-07-01T07:00:00.000Z",
            2,
            1,
        )
        .await;
        assert_eq!(response.status, 204);
        let fixtures = season_fixtures(&server, &id(&season)).await;
        assert_eq!(titles(&fixtures), ["Preseason", "Round 1", "Round 2"]);
        expect_rounds_valid(&fixtures[1..], &divisions);
    }
}
