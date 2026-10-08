//! Port of `server/test/integration/dashboards.test.ts`.

use crate::common::actors::{
    Actor, NewMember, SignUp, add_member, create_season, create_team, sign_up, unique_email,
};
use crate::common::{Response, TestServer, assert_match};
use frisbee::db::Patch;
use frisbee::shared::schemas::{Fixture, Report, Team};
use frisbee::tables::{FIXTURE, REPORT, TEAM};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

const COLOR: &str = "hsla(0, 100%, 50%, 1)";

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

fn ids(values: &Value) -> Vec<String> {
    values.as_array().unwrap().iter().map(id).collect()
}

fn sorted(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values
}

/// The JSON a record serialises to, with numbers as `JSON.stringify` prints them.
fn json_of<T: serde::Serialize>(value: &T) -> Value {
    let mut value = serde_json::to_value(value).unwrap();
    frisbee::js::normalize_numbers(&mut value);
    value
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

async fn team(
    server: &TestServer,
    admin: &Actor,
    season_id: &str,
    name: &str,
    division: Option<f64>,
) -> String {
    let created = create_team(server, admin, season_id, name, json!({})).await;
    if let Some(division) = division {
        TEAM.update_one(
            server.db(),
            Team::ID.eq(id(&created)),
            Patch::new().set(Team::DIVISION, division),
        )
        .await
        .unwrap();
    }
    id(&created)
}

async fn player(
    server: &TestServer,
    admin: &Actor,
    team_id: &str,
    first_name: Option<&str>,
    last_name: Option<&str>,
    gender_matching: Option<&str>,
) -> Actor {
    let email = unique_email("player");
    let actor = sign_up(
        server,
        SignUp {
            email: Some(email.clone()),
            gender_matching: Some(gender_matching.unwrap_or("female").into()),
            first_name: first_name.map(str::to_string),
            last_name: last_name.map(str::to_string),
            ..Default::default()
        },
    )
    .await;
    add_member(
        server,
        admin,
        team_id,
        NewMember {
            email: Some(email),
            ..Default::default()
        },
    )
    .await;
    actor
}

async fn fixture(
    server: &TestServer,
    season_id: &str,
    user_id: &str,
    title: &str,
    date: &str,
    pairs: &[(&str, &str)],
) -> Fixture {
    let compact: String = title.chars().filter(|c| !c.is_whitespace()).collect();
    let games: Vec<Value> = pairs
        .iter()
        .enumerate()
        .map(|(i, (team1, team2))| {
            json!({
                "id": format!("{compact}g{i}"),
                "team1Id": team1,
                "team2Id": team2,
                "place": format!("Field {}", i + 1),
                "time": "6pm",
            })
        })
        .collect();
    FIXTURE
        .create_one(
            server.db(),
            json!({"seasonId": season_id, "userId": user_id, "title": title, "date": date, "games": games}),
        )
        .await
        .unwrap()
}

/// `report(value)`: a stored report with zero scores and no comment by default.
async fn report(server: &TestServer, value: Value) -> Report {
    let mut record = json!({"scoreFor": 0, "scoreAgainst": 0, "spiritComment": ""});
    if let (Value::Object(record), Value::Object(value)) = (&mut record, value) {
        record.extend(value);
    }
    REPORT.create_one(server.db(), record).await.unwrap()
}

/// `new Date(Date.UTC(2026, 6, 1, 12, minutes)).toISOString()`.
fn minutes_after(minutes: u32) -> String {
    format!("2026-07-01T12:{minutes:02}:00.000Z")
}

fn report_ids(rows: &Value) -> Vec<String> {
    rows.as_array()
        .unwrap()
        .iter()
        .map(|row| id(&row["report"]))
        .collect()
}

mod feature_dashboard_reports_load {
    use super::*;

    struct Setup {
        admin: Actor,
        season: Value,
        alpha: String,
        bravo: String,
        charlie: String,
        delta: String,
        round1: Fixture,
        semi: Fixture,
        reports: Vec<Report>,
    }

    async fn setup(server: &TestServer) -> Setup {
        let admin = admin(server).await;
        let season = create_season(server, &admin, json!({"genderDivision": "men"})).await;
        let season_id = id(&season);
        let alpha = team(server, &admin, &season_id, "Alpha", Some(1.0)).await;
        let bravo = team(server, &admin, &season_id, "Bravo", Some(1.0)).await;
        let charlie = team(server, &admin, &season_id, "Charlie", Some(2.0)).await;
        let delta = team(server, &admin, &season_id, "Delta", Some(2.0)).await;
        let round1 = fixture(
            server,
            &season_id,
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&alpha, &bravo), (&charlie, &delta)],
        )
        .await;
        let semi = fixture(
            server,
            &season_id,
            &admin.user_id,
            "Semi Final",
            "2026-07-08T07:00:00.000Z",
            &[(&alpha, &charlie)],
        )
        .await;
        let zelda = sign_up(
            server,
            SignUp {
                first_name: Some("Zelda".into()),
                last_name: Some("Quartz".into()),
                ..Default::default()
            },
        )
        .await;
        let reports = vec![
            report(
                server,
                json!({
                    "fixtureId": round1.id,
                    "teamId": alpha,
                    "teamAgainstId": bravo,
                    "userId": zelda.user_id,
                    "createdOn": minutes_after(1),
                    "spiritComment": "Windy day",
                    "mvpMale": "male-mvp",
                    "mvpFemale": "female-mvp",
                }),
            )
            .await,
            report(
                server,
                json!({
                    "fixtureId": round1.id,
                    "teamId": bravo,
                    "teamAgainstId": alpha,
                    "userId": admin.user_id,
                    "createdOn": minutes_after(2),
                }),
            )
            .await,
            report(
                server,
                json!({
                    "fixtureId": round1.id,
                    "teamId": charlie,
                    "teamAgainstId": delta,
                    "userId": "ghost-user",
                    "createdOn": minutes_after(3),
                }),
            )
            .await,
            report(
                server,
                json!({
                    "fixtureId": semi.id,
                    "teamId": alpha,
                    "teamAgainstId": charlie,
                    "createdOn": minutes_after(4),
                }),
            )
            .await,
        ];
        // another season's report never shows up
        let other = create_season(server, &admin, json!({"name": "Other"})).await;
        let other_team = team(server, &admin, &id(&other), "Alpha Other", None).await;
        let other_fixture = fixture(
            server,
            &id(&other),
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&other_team, &other_team)],
        )
        .await;
        report(
            server,
            json!({
                "fixtureId": other_fixture.id,
                "teamId": other_team,
                "teamAgainstId": other_team,
                "createdOn": minutes_after(5),
            }),
        )
        .await;
        Setup {
            admin,
            season,
            alpha,
            bravo,
            charlie,
            delta,
            round1,
            semi,
            reports,
        }
    }

    async fn load(server: &TestServer, admin: &Actor, payload: Value) -> Response {
        server
            .post_as("/FeatureDashboardReportsLoad", payload, &admin.token)
            .await
    }

    #[tokio::test]
    async fn pages_reports_newest_first_with_joined_names_and_the_season_context() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            alpha,
            bravo,
            charlie,
            delta,
            round1,
            semi,
            reports,
        } = setup(&server).await;
        let outsider = sign_up(&server, SignUp::default()).await;
        let forbidden = server
            .post_as(
                "/FeatureDashboardReportsLoad",
                json!({"seasonId": season["id"]}),
                &outsider.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);

        let all = load(&server, &admin, json!({"seasonId": season["id"]})).await;
        assert_eq!(all.status, 200);
        assert_eq!(all.body["count"], 4);
        let newest_first: Vec<String> = reports.iter().rev().map(|r| r.id.clone()).collect();
        assert_eq!(report_ids(&all.body["reports"]), newest_first);
        assert_eq!(
            ids(&all.body["fixtures"]),
            [round1.id.clone(), semi.id.clone()]
        );
        assert_eq!(
            ids(&all.body["teams"]),
            [alpha.clone(), bravo.clone(), charlie.clone(), delta.clone()]
        );

        let by_id: HashMap<String, Value> = all.body["reports"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| (id(&row["report"]), row.clone()))
            .collect();
        let first = &by_id[&reports[0].id];
        let mut keys: Vec<&String> = first.as_object().unwrap().keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "againstColor",
                "againstName",
                "fixtureTitle",
                "report",
                "submitterName",
                "teamColor",
                "teamName"
            ]
        );
        assert_match(
            first,
            &json!({
                "report": {
                    "id": reports[0].id,
                    "teamId": alpha,
                    "teamAgainstId": bravo,
                    "fixtureId": round1.id,
                    "spiritComment": "Windy day",
                    "mvpMale": "male-mvp",
                },
                "fixtureTitle": "Round 1",
                "teamName": "Alpha",
                "teamColor": COLOR,
                "againstName": "Bravo",
                "againstColor": COLOR,
                "submitterName": "Zelda Quartz",
            }),
        );
        // a "men" season hides the female MVP slots in rows
        assert!(first["report"].get("mvpFemale").is_none());
        // unknown submitters fall back to the user id, missing submitters to "..."
        assert_eq!(by_id[&reports[2].id]["submitterName"], "ghost-user");
        assert_eq!(by_id[&reports[3].id]["submitterName"], "...");

        let page = load(
            &server,
            &admin,
            json!({"seasonId": season["id"], "skip": 1, "limit": 2}),
        )
        .await;
        assert_eq!(page.body["count"], 4);
        assert_eq!(
            report_ids(&page.body["reports"]),
            [reports[2].id.clone(), reports[1].id.clone()]
        );
        let last = load(
            &server,
            &admin,
            json!({"seasonId": season["id"], "skip": 3, "limit": 2}),
        )
        .await;
        assert_eq!(report_ids(&last.body["reports"]), [reports[0].id.clone()]);
    }

    #[tokio::test]
    async fn searches_fixture_titles_team_names_submitters_and_comments() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            reports,
            ..
        } = setup(&server).await;
        let search = |term: &str, extra: Value| {
            let mut payload = json!({"seasonId": season["id"], "search": term});
            if let (Value::Object(payload), Value::Object(extra)) = (&mut payload, extra) {
                payload.extend(extra);
            }
            let server = &server;
            let admin = &admin;
            async move {
                let response = load(server, admin, payload).await;
                assert_eq!(response.status, 200);
                (
                    response.body["count"].as_i64().unwrap(),
                    report_ids(&response.body["reports"]),
                )
            }
        };
        let pick = |indexes: &[usize]| -> Vec<String> {
            indexes.iter().map(|i| reports[*i].id.clone()).collect()
        };

        assert_eq!(search("semi", json!({})).await, (1, pick(&[3])));
        // matches either side of the matchup
        assert_eq!(search("charlie", json!({})).await, (2, pick(&[3, 2])));
        assert_eq!(search("DELTA", json!({})).await, (1, pick(&[2])));
        assert_eq!(search("zelda quartz", json!({})).await, (1, pick(&[0])));
        assert_eq!(search("ghost-user", json!({})).await, (1, pick(&[2])));
        assert_eq!(search("windy", json!({})).await, (1, pick(&[0])));
        assert_eq!(
            search("  round 1  ", json!({})).await,
            (3, pick(&[2, 1, 0]))
        );
        assert_eq!(
            search("round 1", json!({"limit": 1, "skip": 1})).await,
            (3, pick(&[1]))
        );
        assert_eq!(search("(", json!({})).await, (0, vec![]));
        // a blank search is no filter at all
        assert_eq!(search("   ", json!({})).await.0, 4);
    }

    #[tokio::test]
    async fn returns_an_empty_result_for_a_season_without_reports() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let response = load(&server, &admin, json!({"seasonId": season["id"]})).await;
        assert_eq!(
            response.body,
            json!({"count": 0, "reports": [], "fixtures": [], "teams": []})
        );
    }
}

mod feature_dashboard_spirit_load {
    use super::*;

    struct Setup {
        admin: Actor,
        season: Value,
        a: String,
        b: String,
        c: String,
        d: String,
        e: String,
        f: Fixture,
    }

    async fn setup(server: &TestServer, use_official_scoring: bool) -> Setup {
        let admin = admin(server).await;
        let season = create_season(
            server,
            &admin,
            json!({"useOfficialScoring": use_official_scoring}),
        )
        .await;
        let season_id = id(&season);
        let a = team(server, &admin, &season_id, "Alpha", Some(2.0)).await;
        let b = team(server, &admin, &season_id, "Bravo", Some(2.0)).await;
        let c = team(server, &admin, &season_id, "Charlie", Some(1.0)).await;
        let d = team(server, &admin, &season_id, "Delta", Some(1.0)).await;
        let e = team(server, &admin, &season_id, "Echo", None).await;
        let f = fixture(
            server,
            &season_id,
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&a, &b), (&c, &d)],
        )
        .await;
        Setup {
            admin,
            season,
            a,
            b,
            c,
            d,
            e,
            f,
        }
    }

    fn spirit(use_official_scoring: bool, total: i64) -> Value {
        if use_official_scoring {
            json!({
                "spiritP1": total - 6,
                "spiritP2": 2,
                "spiritP3": 2,
                "spiritP4": 2,
                "spiritP5": 0,
                // ignored under official scoring
                "spirit": 99,
            })
        } else {
            json!({
                "spirit": total,
                // ignored under simple scoring
                "spiritP1": 50,
            })
        }
    }

    fn with(base: Value, extra: Value) -> Value {
        let mut value = base;
        if let (Value::Object(target), Value::Object(extra)) = (&mut value, extra) {
            target.extend(extra);
        }
        value
    }

    async fn sums_averages_and_adjusts_spirit(use_official_scoring: bool) {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            c,
            d,
            e,
            f,
        } = setup(&server, use_official_scoring).await;
        for (team_id, against, total) in [(&a, &b, 10), (&b, &a, 6), (&c, &d, 8), (&d, &c, 8)] {
            report(
                &server,
                with(
                    json!({"fixtureId": f.id, "teamId": team_id, "teamAgainstId": against}),
                    spirit(use_official_scoring, total),
                ),
            )
            .await;
        }

        let response = server
            .post_as(
                "/FeatureDashboardSpiritLoad",
                json!({"seasonId": season["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        let rows = response.body["rows"].as_array().unwrap().clone();
        // default: adjustedReceivedAverage desc, ties keep division/name team order
        assert_eq!(
            rows.iter().map(|r| id(&r["team"])).collect::<Vec<_>>(),
            [b.clone(), c.clone(), d.clone(), a.clone(), e.clone()]
        );

        let row = |team_id: &str| -> Value {
            let found = rows
                .iter()
                .find(|r| r["team"]["id"] == team_id)
                .expect("row for team");
            let mut rest: Map<String, Value> = found.as_object().unwrap().clone();
            rest.remove("team");
            Value::Object(rest)
        };
        // global average 8: Alpha's reporter bias is +0.5, Bravo's -0.5 (1 / (1 + 3) shrinkage)
        assert_eq!(
            row(&a),
            json!({
                "receivedSpirit": 6,
                "receivedReports": 1,
                "receivedAverage": 6,
                "adjustedReceivedAverage": 6.5,
                "allocatedSpirit": 10,
                "allocatedReports": 1,
                "allocatedAverage": 10,
                "adjustedAllocatedAverage": 9.5,
                "averageDifference": 4,
                "adjustedDifference": 3,
            })
        );
        assert_eq!(
            row(&b),
            json!({
                "receivedSpirit": 10,
                "receivedReports": 1,
                "receivedAverage": 10,
                "adjustedReceivedAverage": 9.5,
                "allocatedSpirit": 6,
                "allocatedReports": 1,
                "allocatedAverage": 6,
                "adjustedAllocatedAverage": 6.5,
                "averageDifference": -4,
                "adjustedDifference": -3,
            })
        );
        assert_match(
            &row(&c),
            &json!({
                "receivedSpirit": 8,
                "adjustedReceivedAverage": 8,
                "adjustedAllocatedAverage": 8,
                "averageDifference": 0,
            }),
        );
        assert_eq!(
            row(&e),
            json!({
                "receivedSpirit": 0,
                "receivedReports": 0,
                "receivedAverage": 0,
                "adjustedReceivedAverage": 0,
                "allocatedSpirit": 0,
                "allocatedReports": 0,
                "allocatedAverage": 0,
                "adjustedAllocatedAverage": 0,
                "averageDifference": 0,
                "adjustedDifference": 0,
            })
        );
    }

    #[tokio::test]
    async fn sums_averages_and_adjusts_spirit_simple_scoring() {
        sums_averages_and_adjusts_spirit(false).await;
    }

    #[tokio::test]
    async fn sums_averages_and_adjusts_spirit_official_scoring() {
        sums_averages_and_adjusts_spirit(true).await;
    }

    #[tokio::test]
    async fn sorts_by_every_key_in_both_directions() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            c,
            d,
            f,
            ..
        } = setup(&server, false).await;
        for (team_id, against, total) in [(&a, &b, 10), (&b, &a, 6), (&c, &d, 7), (&d, &c, 9)] {
            report(
                &server,
                json!({"fixtureId": f.id, "teamId": team_id, "teamAgainstId": against, "spirit": total}),
            )
            .await;
        }
        let order = |sort_by: &str, sort_direction: Option<&str>| {
            let mut payload = json!({"seasonId": season["id"], "sortBy": sort_by});
            if let Some(direction) = sort_direction {
                payload["sortDirection"] = json!(direction);
            }
            let server = &server;
            let token = admin.token.clone();
            async move {
                let response = server
                    .post_as("/FeatureDashboardSpiritLoad", payload, &token)
                    .await;
                assert_eq!(response.status, 200);
                response.body["rows"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|r| r["team"]["name"].as_str().unwrap().to_string())
                    .collect::<Vec<_>>()
            }
        };
        assert_eq!(
            order("team", Some("asc")).await,
            ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]
        );
        assert_eq!(
            order("team", Some("desc")).await,
            ["Echo", "Delta", "Charlie", "Bravo", "Alpha"]
        );
        // teams without a division stay last; names break ties ascending in both directions
        assert_eq!(
            order("division", Some("asc")).await,
            ["Charlie", "Delta", "Alpha", "Bravo", "Echo"]
        );
        assert_eq!(
            order("division", Some("desc")).await,
            ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]
        );
        // received: Alpha 6, Bravo 10, Charlie 9, Delta 7, Echo 0
        assert_eq!(
            order("receivedSpirit", Some("desc")).await,
            ["Bravo", "Charlie", "Delta", "Alpha", "Echo"]
        );
        assert_eq!(
            order("receivedAverage", Some("asc")).await,
            ["Echo", "Alpha", "Delta", "Charlie", "Bravo"]
        );
        // allocated: Alpha 10, Bravo 6, Charlie 7, Delta 9
        assert_eq!(
            order("allocatedSpirit", Some("desc")).await,
            ["Alpha", "Delta", "Charlie", "Bravo", "Echo"]
        );
        assert_eq!(
            order("allocatedAverage", Some("asc")).await,
            ["Echo", "Bravo", "Charlie", "Delta", "Alpha"]
        );
        // difference (allocated - received): Alpha 4, Bravo -4, Charlie -2, Delta 2, Echo 0
        assert_eq!(
            order("averageDifference", Some("desc")).await,
            ["Alpha", "Delta", "Echo", "Charlie", "Bravo"]
        );
        assert_eq!(
            order("averageDifference", Some("asc")).await,
            ["Bravo", "Charlie", "Echo", "Delta", "Alpha"]
        );
        // report counts tie, so the team order is kept
        assert_eq!(
            order("receivedReports", Some("desc")).await,
            ["Charlie", "Delta", "Alpha", "Bravo", "Echo"]
        );
        assert_eq!(
            order("allocatedReports", Some("asc")).await,
            ["Echo", "Charlie", "Delta", "Alpha", "Bravo"]
        );
        for key in [
            "adjustedReceivedAverage",
            "adjustedAllocatedAverage",
            "adjustedDifference",
        ] {
            assert_eq!(order(key, Some("desc")).await.len(), 5);
        }
        // default direction is descending
        assert_eq!(
            order("receivedSpirit", None).await,
            order("receivedSpirit", Some("desc")).await
        );

        let invalid = server
            .post_as(
                "/FeatureDashboardSpiritLoad",
                json!({"seasonId": season["id"], "sortBy": "id"}),
                &admin.token,
            )
            .await;
        assert_eq!(invalid.status, 422);
        assert_eq!(invalid.body["errorCode"], "validation_error");
    }

    #[tokio::test]
    async fn is_admin_only() {
        let server = TestServer::start().await;
        let Setup { season, .. } = setup(&server, false).await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/FeatureDashboardSpiritLoad",
                json!({"seasonId": season["id"]}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["errorCode"], "auth.admin_required");
    }
}

mod feature_dashboard_mvp_load {
    use super::*;

    struct Users {
        f1: Actor,
        f3: Actor,
        m2: Actor,
    }

    struct Setup {
        admin: Actor,
        season: Value,
        a: String,
        b: String,
        d: String,
        users: Users,
    }

    async fn setup(server: &TestServer, season_options: Value) -> Setup {
        let admin = admin(server).await;
        let season = create_season(server, &admin, season_options).await;
        let season_id = id(&season);
        let a = team(server, &admin, &season_id, "Alpha", Some(1.0)).await;
        let b = team(server, &admin, &season_id, "Bravo", Some(2.0)).await;
        let c = team(server, &admin, &season_id, "Charlie", Some(1.0)).await;
        let d = team(server, &admin, &season_id, "Delta", None).await;
        let f = fixture(
            server,
            &season_id,
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&a, &b), (&c, &d)],
        )
        .await;
        let person = |team_id: String, first_name: &'static str, gender: &'static str| {
            let admin = admin.clone();
            async move {
                player(
                    server,
                    &admin,
                    &team_id,
                    Some(first_name),
                    Some("P"),
                    Some(gender),
                )
                .await
            }
        };
        let m1 = person(b.clone(), "Aaron", "male").await;
        let f1 = person(b.clone(), "Bella", "female").await;
        let m3 = person(b.clone(), "Carl", "male").await;
        let f3 = person(b.clone(), "Dana", "female").await;
        let m2 = person(a.clone(), "Zack", "male").await;
        let f2 = person(a.clone(), "Yara", "female").await;
        let d1 = person(d.clone(), "Adam", "male").await;
        report(
            server,
            json!({
                "fixtureId": f.id,
                "teamId": a,
                "teamAgainstId": b,
                "mvpMale": m1.user_id,
                "mvpMale2": m3.user_id,
                "mvpFemale": f1.user_id,
                "mvpFemale2": f3.user_id,
            }),
        )
        .await;
        report(
            server,
            json!({
                "fixtureId": f.id,
                "teamId": b,
                "teamAgainstId": a,
                "mvpMale": m2.user_id,
                "mvpFemale2": f2.user_id,
            }),
        )
        .await;
        report(
            server,
            json!({"fixtureId": f.id, "teamId": c, "teamAgainstId": d, "mvpMale": d1.user_id}),
        )
        .await;
        Setup {
            admin,
            season,
            a,
            b,
            d,
            users: Users { f1, f3, m2 },
        }
    }

    async fn load(server: &TestServer, admin: &Actor, season_id: &Value) -> Vec<Value> {
        let response = server
            .post_as(
                "/FeatureDashboardMvpLoad",
                json!({"seasonId": season_id}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        response.body["rows"].as_array().unwrap().clone()
    }

    fn names_and_votes(rows: &[Value]) -> Vec<(String, i64)> {
        rows.iter()
            .map(|r| {
                (
                    r["userName"].as_str().unwrap().to_string(),
                    r["votes"].as_i64().unwrap(),
                )
            })
            .collect()
    }

    fn expected(rows: &[(&str, i64)]) -> Vec<(String, i64)> {
        rows.iter().map(|(n, v)| (n.to_string(), *v)).collect()
    }

    #[tokio::test]
    async fn awards_5_3_points_under_official_scoring_ordered_by_votes_division_and_name() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            d,
            users,
        } = setup(&server, json!({"useOfficialScoring": true})).await;
        let rows = load(&server, &admin, &season["id"]).await;
        assert_eq!(
            names_and_votes(&rows),
            expected(&[
                ("Zack P", 5),
                ("Aaron P", 5),
                ("Bella P", 5),
                ("Adam P", 5),
                ("Yara P", 3),
                ("Carl P", 3),
                ("Dana P", 3),
            ])
        );
        assert_eq!(
            rows[0],
            json!({
                "userId": users.m2.user_id,
                "userName": "Zack P",
                "teamId": a,
                "teamName": "Alpha",
                "division": 1,
                "votes": 5,
                "genderMatching": "male",
            })
        );
        assert_match(
            &rows[2],
            &json!({"teamId": b, "division": 2, "genderMatching": "female"}),
        );
        assert_match(&rows[3], &json!({"teamId": d, "teamName": "Delta"}));
        assert!(rows[3].get("division").is_none());
        assert_match(
            &rows[6],
            &json!({"userId": users.f3.user_id, "genderMatching": "female"}),
        );
    }

    #[tokio::test]
    async fn awards_1_point_for_primary_picks_only_under_simple_scoring() {
        let server = TestServer::start().await;
        let Setup { admin, season, .. } = setup(&server, json!({})).await;
        let rows = load(&server, &admin, &season["id"]).await;
        assert_eq!(
            names_and_votes(&rows),
            expected(&[("Zack P", 1), ("Aaron P", 1), ("Bella P", 1), ("Adam P", 1)])
        );
    }

    #[tokio::test]
    async fn counts_only_the_slots_the_season_gender_division_uses() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            users,
            ..
        } = setup(&server, json!({"genderDivision": "men"})).await;
        let f = fixture(
            &server,
            &id(&season),
            &admin.user_id,
            "Round 2",
            "2026-07-08T07:00:00.000Z",
            &[(&a, &b)],
        )
        .await;
        // a woman voted into the male slot is still filtered out by her gender matching
        report(
            &server,
            json!({"fixtureId": f.id, "teamId": a, "teamAgainstId": b, "mvpMale": users.f1.user_id}),
        )
        .await;
        let rows = load(&server, &admin, &season["id"]).await;
        assert_eq!(
            names_and_votes(&rows),
            expected(&[("Zack P", 1), ("Aaron P", 1), ("Adam P", 1)])
        );

        let women = setup(
            &server,
            json!({"genderDivision": "women", "useOfficialScoring": true}),
        )
        .await;
        let women_rows = load(&server, &women.admin, &women.season["id"]).await;
        assert_eq!(
            names_and_votes(&women_rows),
            expected(&[("Bella P", 5), ("Yara P", 3), ("Dana P", 3)])
        );
    }
}

mod fixture_and_report_editor_loaders {
    use super::*;

    struct Setup {
        admin: Actor,
        season: Value,
        a: String,
        b: String,
        c: String,
        d: String,
        earlier: Fixture,
        later: Fixture,
    }

    async fn setup(server: &TestServer) -> Setup {
        let admin = admin(server).await;
        let season = create_season(server, &admin, json!({})).await;
        let season_id = id(&season);
        let a = team(server, &admin, &season_id, "Alpha", Some(2.0)).await;
        let b = team(server, &admin, &season_id, "Bravo", Some(1.0)).await;
        let c = team(server, &admin, &season_id, "Charlie", None).await;
        let d = team(server, &admin, &season_id, "Delta", Some(1.0)).await;
        let later = fixture(
            server,
            &season_id,
            &admin.user_id,
            "Round 2",
            "2026-07-08T07:00:00.000Z",
            &[(&b, &a), (&a, &d)],
        )
        .await;
        let earlier = fixture(
            server,
            &season_id,
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&a, &b), (&c, &d)],
        )
        .await;
        Setup {
            admin,
            season,
            a,
            b,
            c,
            d,
            earlier,
            later,
        }
    }

    #[tokio::test]
    async fn loads_the_competition_with_teams_by_division_and_fixtures_by_date() {
        let server = TestServer::start().await;
        let Setup {
            season,
            a,
            b,
            c,
            d,
            earlier,
            later,
            ..
        } = setup(&server).await;
        let response = server
            .post("/FeatureCompetitionLoad", json!({"seasonId": season["id"]}))
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(ids(&response.body["teams"]), [b, d, a, c]);
        assert_eq!(ids(&response.body["fixtures"]), [earlier.id, later.id]);

        let missing = server
            .post("/FeatureCompetitionLoad", json!({"seasonId": "missing"}))
            .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn loads_a_public_fixture_view() {
        let server = TestServer::start().await;
        let Setup {
            season,
            a,
            b,
            c,
            d,
            earlier,
            ..
        } = setup(&server).await;
        let response = server
            .post("/FeatureFixtureViewLoad", json!({"fixtureId": earlier.id}))
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["fixture"], json_of(&earlier));
        assert_eq!(ids(&response.body["teams"]), [b, d, a, c]);
        assert_match(
            &response.body["teams"][0],
            &json!({"seasonId": season["id"], "name": "Bravo", "color": COLOR}),
        );
        assert!(response.body["teams"][0].get("_id").is_none());
        let missing = server
            .post("/FeatureFixtureViewLoad", json!({"fixtureId": "missing"}))
            .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn loads_a_fixture_tally_with_its_reports_newest_first_admin_only() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            c,
            d,
            earlier,
            later,
            ..
        } = setup(&server).await;
        let older = report(
            &server,
            json!({"fixtureId": earlier.id, "teamId": a, "teamAgainstId": b, "createdOn": minutes_after(1)}),
        )
        .await;
        let newer = report(
            &server,
            json!({"fixtureId": earlier.id, "teamId": b, "teamAgainstId": a, "createdOn": minutes_after(2)}),
        )
        .await;
        report(
            &server,
            json!({"fixtureId": later.id, "teamId": a, "teamAgainstId": d}),
        )
        .await;

        let outsider = sign_up(&server, SignUp::default()).await;
        let forbidden = server
            .post_as(
                "/FeatureFixtureTallyLoad",
                json!({"fixtureId": earlier.id}),
                &outsider.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);

        let response = server
            .post_as(
                "/FeatureFixtureTallyLoad",
                json!({"fixtureId": earlier.id}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["fixture"]["id"], earlier.id.as_str());
        assert_eq!(ids(&response.body["teams"]), [b, d, a, c]);
        assert_eq!(
            response.body["reports"],
            json!([json_of(&newer), json_of(&older)])
        );
    }

    #[tokio::test]
    async fn loads_report_editor_options_with_the_opposition_players() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            d,
            later,
            ..
        } = setup(&server).await;
        let alpha_player = player(&server, &admin, &a, None, None, None).await;
        let bravo1 = player(&server, &admin, &b, Some("Bo"), None, Some("male")).await;
        let bravo2 = player(&server, &admin, &b, Some("Bea"), None, None).await;
        let delta1 = player(&server, &admin, &d, Some("Dee"), None, None).await;
        // pending requests are not offered as MVP options
        let pending = sign_up(&server, SignUp::default()).await;
        let request = server
            .post_as("/MemberRequestCreate", json!(b), &pending.token)
            .await;
        assert_eq!(request.status, 200);

        let plain = server
            .post_as(
                "/FeatureReportEditorLoad",
                json!({"seasonId": season["id"]}),
                &alpha_player.token,
            )
            .await;
        assert_eq!(plain.status, 200);
        assert_eq!(plain.body["againstOptions"], json!([]));
        assert_eq!(plain.body["fixtures"].as_array().unwrap().len(), 2);
        assert_eq!(plain.body["teams"].as_array().unwrap().len(), 4);

        let response = server
            .post_as(
                "/FeatureReportEditorLoad",
                json!({"seasonId": season["id"], "fixtureId": later.id, "teamId": a}),
                &alpha_player.token,
            )
            .await;
        assert_eq!(response.status, 200);
        let options = response.body["againstOptions"].as_array().unwrap();
        // one option per game in fixture order
        assert_eq!(
            options.iter().map(|o| id(&o["team"])).collect::<Vec<_>>(),
            [b.clone(), d.clone()]
        );
        assert_eq!(
            sorted(ids(&options[0]["users"])),
            sorted(vec![bravo1.user_id.clone(), bravo2.user_id.clone()])
        );
        assert_eq!(
            ids(&options[1]["users"]),
            std::slice::from_ref(&delta1.user_id)
        );
        // only public user fields are exposed
        let mut keys: Vec<&String> = options[0]["users"][0].as_object().unwrap().keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "createdOn",
                "firstName",
                "genderMatching",
                "id",
                "lastName",
                "updatedOn"
            ]
        );
    }

    #[tokio::test]
    async fn validates_report_editor_team_and_fixture_access() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            c,
            earlier,
            ..
        } = setup(&server).await;
        let alpha_player = player(&server, &admin, &a, None, None, None).await;
        let call = |actor: &Actor, payload: Value| {
            let mut body = json!({"seasonId": season["id"]});
            if let (Value::Object(body), Value::Object(payload)) = (&mut body, payload) {
                body.extend(payload);
            }
            let token = actor.token.clone();
            let server = &server;
            async move {
                server
                    .post_as("/FeatureReportEditorLoad", body, &token)
                    .await
            }
        };

        let loner = sign_up(&server, SignUp::default()).await;
        let no_team = call(&loner, json!({})).await;
        assert_eq!(no_team.status, 403);
        assert_eq!(no_team.body["errorCode"], "auth.team_required");

        let other_team = call(&alpha_player, json!({"fixtureId": earlier.id, "teamId": b})).await;
        assert_eq!(other_team.status, 403);
        assert_eq!(other_team.body["errorCode"], "team.access_forbidden");

        let bye = fixture(
            &server,
            &id(&season),
            &admin.user_id,
            "Bye",
            "2026-07-20T07:00:00.000Z",
            &[(&a, &b)],
        )
        .await;
        let not_playing = call(&admin, json!({"fixtureId": bye.id, "teamId": c})).await;
        assert_eq!(not_playing.status, 400);
        assert_eq!(not_playing.body["errorCode"], "report.matchup_invalid");

        let other_season = create_season(&server, &admin, json!({"name": "Other"})).await;
        let x = team(&server, &admin, &id(&other_season), "X-Ray", None).await;
        let other_fixture = fixture(
            &server,
            &id(&other_season),
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&x, &x)],
        )
        .await;
        let wrong_fixture = call(
            &alpha_player,
            json!({"fixtureId": other_fixture.id, "teamId": a}),
        )
        .await;
        assert_eq!(wrong_fixture.status, 400);
        assert_eq!(wrong_fixture.body["errorCode"], "report.fixture_invalid");

        // admins must pick a team from the requested season
        let wrong_team = call(&admin, json!({"fixtureId": earlier.id, "teamId": x})).await;
        assert_eq!(wrong_team.status, 404);
    }
}

mod feature_dashboard_user_memberships_load {
    use super::*;

    #[tokio::test]
    async fn returns_a_user_memberships_with_their_seasons_and_teams() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let spring = create_season(&server, &admin, json!({"name": "Spring"})).await;
        let autumn = create_season(&server, &admin, json!({"name": "Autumn"})).await;
        let spring_team = team(&server, &admin, &id(&spring), "Spring Team", None).await;
        let autumn_team = team(&server, &admin, &id(&autumn), "Autumn Team", None).await;
        let email = unique_email("member");
        let target = sign_up(
            &server,
            SignUp {
                email: Some(email.clone()),
                ..Default::default()
            },
        )
        .await;
        let member = |team_id: String, email: Option<String>| {
            let server = &server;
            let admin = admin.clone();
            async move {
                add_member(
                    server,
                    &admin,
                    &team_id,
                    NewMember {
                        email,
                        ..Default::default()
                    },
                )
                .await
            }
        };
        let m1 = member(spring_team.clone(), Some(email.clone())).await;
        let m2 = member(autumn_team.clone(), Some(email.clone())).await;
        // another user's membership is not included
        member(spring_team.clone(), None).await;

        let forbidden = server
            .post_as(
                "/FeatureDashboardUserMembershipsLoad",
                json!({"userId": target.user_id}),
                &target.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);

        let response = server
            .post_as(
                "/FeatureDashboardUserMembershipsLoad",
                json!({"userId": target.user_id}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(
            sorted(ids(&response.body["members"])),
            sorted(vec![id(&m1), id(&m2)])
        );
        assert_eq!(
            sorted(ids(&response.body["seasons"])),
            sorted(vec![id(&spring), id(&autumn)])
        );
        assert_eq!(
            sorted(ids(&response.body["teams"])),
            sorted(vec![spring_team, autumn_team])
        );
        assert_match(
            &response.body["members"][0],
            &json!({"userId": target.user_id, "pending": false}),
        );

        let empty = server
            .post_as(
                "/FeatureDashboardUserMembershipsLoad",
                json!({"userId": admin.user_id}),
                &admin.token,
            )
            .await;
        assert_eq!(
            empty.body,
            json!({"members": [], "seasons": [], "teams": []})
        );

        let missing = server
            .post_as(
                "/FeatureDashboardUserMembershipsLoad",
                json!({"userId": "missing"}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 404);
    }
}
