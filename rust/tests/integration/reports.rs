//! Port of `server/test/integration/reports.test.ts`.

mod common;

use common::actors::{
    Actor, NewMember, SignUp, add_member, create_season, create_team, sign_up, unique_email,
};
use common::{TestServer, assert_match};
use frisbee::shared::schemas::{Fixture, Report};
use frisbee::tables::{FIXTURE, REPORT};
use serde_json::{Map, Value, json};

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

#[derive(Default)]
struct PlayerOptions {
    gender_matching: Option<&'static str>,
    first_name: Option<&'static str>,
    last_name: Option<&'static str>,
}

/// Signs up a player and adds them as a confirmed member of a team.
async fn player(
    server: &TestServer,
    admin: &Actor,
    team_id: &str,
    options: PlayerOptions,
) -> Actor {
    let email = unique_email("player");
    let actor = sign_up(
        server,
        SignUp {
            email: Some(email.clone()),
            gender_matching: Some(options.gender_matching.unwrap_or("female").into()),
            first_name: options.first_name.map(str::to_string),
            last_name: options.last_name.map(str::to_string),
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

fn gender(gender_matching: &'static str) -> PlayerOptions {
    PlayerOptions {
        gender_matching: Some(gender_matching),
        ..Default::default()
    }
}

async fn create_fixture(
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
            json!({
                "seasonId": season_id,
                "userId": user_id,
                "title": title,
                "date": date,
                "games": games,
            }),
        )
        .await
        .unwrap()
}

struct Setup {
    admin: Actor,
    season: Value,
    a: String,
    b: String,
    c: String,
    d: String,
    fixture: Fixture,
    alpha_player: Actor,
}

async fn setup(server: &TestServer, season_options: Value) -> Setup {
    let admin = sign_up(
        server,
        SignUp {
            admin: true,
            ..Default::default()
        },
    )
    .await;
    let season = create_season(server, &admin, season_options).await;
    let season_id = id(&season);
    let a = id(&create_team(server, &admin, &season_id, "Alpha", json!({})).await);
    let b = id(&create_team(server, &admin, &season_id, "Bravo", json!({})).await);
    let c = id(&create_team(server, &admin, &season_id, "Charlie", json!({})).await);
    let d = id(&create_team(server, &admin, &season_id, "Delta", json!({})).await);
    let fixture = create_fixture(
        server,
        &season_id,
        &admin.user_id,
        "Round 1",
        "2026-07-01T07:00:00.000Z",
        &[(&a, &b), (&c, &d)],
    )
    .await;
    let alpha_player = player(server, &admin, &a, PlayerOptions::default()).await;
    Setup {
        admin,
        season,
        a,
        b,
        c,
        d,
        fixture,
        alpha_player,
    }
}

fn report_payload(fixture: &Fixture, team_id: &str, team_against_id: &str, extra: Value) -> Value {
    let mut payload = json!({
        "fixtureId": fixture.id,
        "teamId": team_id,
        "teamAgainstId": team_against_id,
        "scoreFor": 13,
        "scoreAgainst": 11,
        "spirit": 10,
        "spiritComment": "",
    });
    merge(&mut payload, extra);
    payload
}

/// `{...value, ...extra}`; a `null` in `extra` stands for `undefined` (the key is dropped).
fn merge(value: &mut Value, extra: Value) {
    if let (Value::Object(target), Value::Object(extra)) = (value, extra) {
        for (key, item) in extra {
            if item.is_null() {
                target.remove(&key);
            } else {
                target.insert(key, item);
            }
        }
    }
}

fn official(p: [i64; 5]) -> Value {
    json!({
        "spiritP1": p[0],
        "spiritP2": p[1],
        "spiritP3": p[2],
        "spiritP4": p[3],
        "spiritP5": p[4],
    })
}

fn with(base: Value, extra: Value) -> Value {
    let mut value = base;
    let Value::Object(extra) = extra else {
        return value;
    };
    if let Value::Object(target) = &mut value {
        target.extend(extra);
    }
    value
}

async fn stored(server: &TestServer, report_id: &str) -> Report {
    REPORT
        .get_one(server.db(), Report::ID.eq(report_id))
        .await
        .unwrap()
}

mod report_create {
    use super::*;

    #[tokio::test]
    async fn lets_a_team_member_submit_a_report_for_their_own_matchup() {
        let server = TestServer::start().await;
        let Setup {
            a,
            b,
            fixture,
            alpha_player,
            ..
        } = setup(&server, json!({})).await;
        let response = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({"spiritComment": "Great game"})),
                &alpha_player.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "fixtureId": fixture.id,
                "teamId": a,
                "teamAgainstId": b,
                "userId": alpha_player.user_id,
                "scoreFor": 13,
                "scoreAgainst": 11,
                "spirit": 10,
                "spiritComment": "Great game",
            }),
        );
        assert!(response.body["id"].is_string());
        assert_eq!(
            REPORT
                .count(server.db(), Report::ID.eq(id(&response.body)))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn lets_an_admin_submit_on_behalf_of_any_team() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            c,
            d,
            fixture,
            ..
        } = setup(&server, json!({})).await;
        let response = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &d, &c, json!({})),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({"teamId": d, "teamAgainstId": c, "userId": admin.user_id}),
        );
    }

    #[tokio::test]
    async fn rejects_users_without_a_team_or_for_another_team() {
        let server = TestServer::start().await;
        let Setup {
            a,
            b,
            c,
            d,
            fixture,
            alpha_player,
            ..
        } = setup(&server, json!({})).await;
        let loner = sign_up(&server, SignUp::default()).await;
        let no_team = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({})),
                &loner.token,
            )
            .await;
        assert_eq!(no_team.status, 403);
        assert_eq!(no_team.body["errorCode"], "auth.team_required");

        let other_team = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &c, &d, json!({})),
                &alpha_player.token,
            )
            .await;
        assert_eq!(other_team.status, 403);
        assert_eq!(other_team.body["errorCode"], "team.access_forbidden");

        // a pending request does not count as membership
        let pending = sign_up(&server, SignUp::default()).await;
        let request = server
            .post_as("/MemberRequestCreate", json!(b), &pending.token)
            .await;
        assert_eq!(request.status, 200);
        let pending_report = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &b, &a, json!({})),
                &pending.token,
            )
            .await;
        assert_eq!(pending_report.status, 403);
        assert_eq!(pending_report.body["errorCode"], "auth.team_required");
        assert_eq!(
            REPORT
                .count(server.db(), Report::FIXTURE_ID.eq(&fixture.id))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn rejects_matchups_that_are_not_in_the_fixture() {
        let server = TestServer::start().await;
        let Setup {
            a,
            c,
            fixture,
            alpha_player,
            ..
        } = setup(&server, json!({})).await;
        let response = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &c, json!({})),
                &alpha_player.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "report.matchup_invalid");
    }

    #[tokio::test]
    async fn rejects_a_duplicate_report_for_the_same_fixture_and_matchup() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            fixture,
            alpha_player,
            ..
        } = setup(&server, json!({})).await;
        let first = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({})),
                &alpha_player.token,
            )
            .await;
        assert_eq!(first.status, 200);
        let duplicate = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({"scoreFor": 1})),
                &admin.token,
            )
            .await;
        assert_eq!(duplicate.status, 409);
        assert_eq!(duplicate.body["errorCode"], "report.already_submitted");
        // the opposition can still report on the same game
        let bravo_player = player(&server, &admin, &b, PlayerOptions::default()).await;
        let opposite = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &b, &a, json!({})),
                &bravo_player.token,
            )
            .await;
        assert_eq!(opposite.status, 200);
    }

    #[tokio::test]
    async fn validates_teams_and_fixtures_against_the_fixture_season() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            fixture,
            ..
        } = setup(&server, json!({})).await;
        let missing_fixture = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({"fixtureId": "missing"})),
                &admin.token,
            )
            .await;
        assert_eq!(missing_fixture.status, 404);
        assert_eq!(missing_fixture.body["errorCode"], "db.record_not_found");

        let missing_against = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, "missing", json!({})),
                &admin.token,
            )
            .await;
        assert_eq!(missing_against.status, 404);

        // a fixture from another season does not contain this season's teams
        let other_season = create_season(&server, &admin, json!({"name": "Other"})).await;
        let x = id(&create_team(&server, &admin, &id(&other_season), "X-Ray", json!({})).await);
        let y = id(&create_team(&server, &admin, &id(&other_season), "Yankee", json!({})).await);
        let other_fixture = create_fixture(
            &server,
            &id(&other_season),
            &admin.user_id,
            "Round 1",
            "2026-07-01T07:00:00.000Z",
            &[(&x, &y)],
        )
        .await;
        let mismatch = server
            .post_as(
                "/ReportCreate",
                report_payload(&other_fixture, &a, &b, json!({})),
                &admin.token,
            )
            .await;
        assert_eq!(mismatch.status, 400);
        assert_eq!(mismatch.body["errorCode"], "report.matchup_invalid");
    }

    #[tokio::test]
    async fn requires_a_comment_for_official_spirit_totals_outside_9_11() {
        let server = TestServer::start().await;
        let Setup {
            a,
            b,
            c,
            d,
            fixture,
            admin,
            ..
        } = setup(&server, json!({"useOfficialScoring": true})).await;
        let cases: [([i64; 5], &str, bool); 6] = [
            ([1, 2, 2, 2, 1], "", false),          // 8
            ([1, 2, 2, 2, 1], "   ", false),       // whitespace only
            ([3, 3, 2, 2, 2], "", false),          // 12
            ([2, 2, 2, 2, 1], "", true),           // 9
            ([3, 2, 2, 2, 2], "", true),           // 11
            ([1, 2, 2, 2, 1], "Rough game", true), // 8 with comment
        ];
        let matchups = [(&a, &b), (&b, &a), (&c, &d), (&d, &c)];
        let mut next = 0;
        for (p, comment, ok) in cases {
            let (team_id, against_id) = matchups[next];
            let response = server
                .post_as(
                    "/ReportCreate",
                    report_payload(
                        &fixture,
                        team_id,
                        against_id,
                        with(
                            json!({"spirit": null, "spiritComment": comment}),
                            official(p),
                        ),
                    ),
                    &admin.token,
                )
                .await;
            if ok {
                assert_eq!(response.status, 200);
                assert_match(&response.body, &official(p));
                next += 1;
            } else {
                assert_eq!(response.status, 400);
                assert_eq!(response.body["errorCode"], "report.spirit_comment_required");
            }
        }
    }

    #[tokio::test]
    async fn does_not_require_a_comment_when_spirit_parts_are_incomplete_or_scoring_is_simple() {
        let server = TestServer::start().await;
        let official1 = setup(&server, json!({"useOfficialScoring": true})).await;
        let partial = server
            .post_as(
                "/ReportCreate",
                report_payload(
                    &official1.fixture,
                    &official1.a,
                    &official1.b,
                    json!({"spiritP1": 0, "spiritP2": 0}),
                ),
                &official1.admin.token,
            )
            .await;
        assert_eq!(partial.status, 200);

        let simple = setup(&server, json!({})).await;
        let response = server
            .post_as(
                "/ReportCreate",
                report_payload(
                    &simple.fixture,
                    &simple.a,
                    &simple.b,
                    official([0, 0, 0, 0, 0]),
                ),
                &simple.admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
    }

    #[tokio::test]
    async fn checks_the_spirit_comment_before_duplicates_and_matchups() {
        let server = TestServer::start().await;
        let Setup {
            a,
            c,
            fixture,
            admin,
            ..
        } = setup(&server, json!({"useOfficialScoring": true})).await;
        let response = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &c, official([0, 0, 0, 0, 0])),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "report.spirit_comment_required");
    }

    #[tokio::test]
    async fn drops_mvp_slots_the_season_gender_division_does_not_use() {
        let server = TestServer::start().await;
        let cases = [
            ("men", ["mvpMale", "mvpMale2"], ["mvpFemale", "mvpFemale2"]),
            (
                "women",
                ["mvpFemale", "mvpFemale2"],
                ["mvpMale", "mvpMale2"],
            ),
        ];
        for (gender_division, kept, dropped) in cases {
            let Setup {
                admin,
                a,
                b,
                fixture,
                ..
            } = setup(&server, json!({"genderDivision": gender_division})).await;
            let man = player(&server, &admin, &b, gender("male")).await;
            let man2 = player(&server, &admin, &b, gender("male")).await;
            let woman = player(&server, &admin, &b, gender("female")).await;
            let woman2 = player(&server, &admin, &b, gender("female")).await;
            let response = server
                .post_as(
                    "/ReportCreate",
                    report_payload(
                        &fixture,
                        &a,
                        &b,
                        json!({
                            "mvpMale": man.user_id,
                            "mvpMale2": man2.user_id,
                            "mvpFemale": woman.user_id,
                            "mvpFemale2": woman2.user_id,
                        }),
                    ),
                    &admin.token,
                )
                .await;
            assert_eq!(response.status, 200);
            let stored = serde_json::to_value(stored(&server, &id(&response.body)).await).unwrap();
            for key in kept {
                assert!(stored[key].is_string(), "{key} kept");
            }
            for key in dropped {
                assert!(response.body.get(key).is_none(), "{key} dropped");
                assert!(stored.get(key).is_none(), "{key} not stored");
            }
        }
    }

    #[tokio::test]
    async fn drops_mvp_picks_whose_gender_matching_is_ineligible_for_the_slot() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            fixture,
            ..
        } = setup(&server, json!({})).await;
        let man = player(&server, &admin, &b, gender("male")).await;
        let woman = player(&server, &admin, &b, gender("female")).await;
        let man2 = player(&server, &admin, &b, gender("male")).await;
        let response = server
            .post_as(
                "/ReportCreate",
                report_payload(
                    &fixture,
                    &a,
                    &b,
                    json!({
                        "mvpMale": woman.user_id,   // ineligible
                        "mvpMale2": man2.user_id,   // eligible
                        "mvpFemale": man.user_id,   // ineligible
                        "mvpFemale2": "unknown-user", // unknown users are kept as-is
                    }),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        let stored = stored(&server, &id(&response.body)).await;
        assert_eq!(stored.mvp_male, None);
        assert_eq!(stored.mvp_male2, Some(man2.user_id));
        assert_eq!(stored.mvp_female, None);
        assert_eq!(stored.mvp_female2.as_deref(), Some("unknown-user"));
    }
}

mod report_update_and_report_delete {
    use super::*;

    #[tokio::test]
    async fn lets_an_admin_update_a_report_and_sanitises_it_like_create() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            fixture,
            alpha_player,
            ..
        } = setup(&server, json!({"useOfficialScoring": true})).await;
        let man = player(&server, &admin, &b, gender("male")).await;
        let woman = player(&server, &admin, &b, gender("female")).await;
        let created = server
            .post_as(
                "/ReportCreate",
                report_payload(
                    &fixture,
                    &a,
                    &b,
                    with(
                        official([2, 2, 2, 2, 2]),
                        json!({"mvpMale": man.user_id, "mvpFemale": woman.user_id}),
                    ),
                ),
                &alpha_player.token,
            )
            .await;
        assert_eq!(created.status, 200);
        let report_id = id(&created.body);

        let forbidden = server
            .post_as(
                "/ReportUpdate",
                json!({"reportId": report_id, "scoreFor": 1, "scoreAgainst": 2, "spiritComment": ""}),
                &alpha_player.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);
        assert_eq!(forbidden.body["errorCode"], "auth.admin_required");

        let needs_comment = server
            .post_as(
                "/ReportUpdate",
                with(
                    json!({"reportId": report_id, "scoreFor": 1, "scoreAgainst": 2, "spiritComment": ""}),
                    official([4, 4, 4, 4, 4]),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(needs_comment.status, 400);
        assert_eq!(
            needs_comment.body["errorCode"],
            "report.spirit_comment_required"
        );

        let updated = server
            .post_as(
                "/ReportUpdate",
                json!({
                    "reportId": report_id,
                    "scoreFor": 15,
                    "scoreAgainst": 7,
                    "spiritComment": "Edited",
                    "mvpMale": woman.user_id, // ineligible, dropped
                    "mvpFemale": woman.user_id,
                }),
                &admin.token,
            )
            .await;
        assert_eq!(updated.status, 200);
        assert_match(
            &updated.body,
            &with(
                json!({
                    "id": report_id,
                    "scoreFor": 15,
                    "scoreAgainst": 7,
                    "spiritComment": "Edited",
                    "mvpFemale": woman.user_id,
                }),
                // spirit parts not sent are kept
                official([2, 2, 2, 2, 2]),
            ),
        );
        assert!(updated.body.get("mvpMale").is_none());
        let after = stored(&server, &report_id).await;
        assert_eq!(after.mvp_male, None);
        assert_eq!(after.score_for, 15.0);
        assert!(after.updated_on >= after.created_on);

        // MVP picks left out of an update are kept
        let kept = server
            .post_as(
                "/ReportUpdate",
                json!({"reportId": report_id, "scoreFor": 15, "scoreAgainst": 7, "spiritComment": "Edited"}),
                &admin.token,
            )
            .await;
        assert_eq!(kept.status, 200);
        assert_eq!(
            stored(&server, &report_id).await.mvp_female,
            Some(woman.user_id.clone())
        );

        // null clears a pick
        let cleared = server
            .post_as(
                "/ReportUpdate",
                json!({
                    "reportId": report_id,
                    "scoreFor": 15,
                    "scoreAgainst": 7,
                    "spiritComment": "Edited",
                    "mvpFemale": null,
                }),
                &admin.token,
            )
            .await;
        assert_eq!(cleared.status, 200);
        assert!(cleared.body.get("mvpFemale").is_none());
        assert_eq!(stored(&server, &report_id).await.mvp_female, None);

        let missing = server
            .post_as(
                "/ReportUpdate",
                json!({"reportId": "missing", "scoreFor": 1, "scoreAgainst": 1, "spiritComment": ""}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn checks_the_spirit_comment_against_the_stored_spirit_parts() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            fixture,
            ..
        } = setup(&server, json!({"useOfficialScoring": true})).await;
        let created = server
            .post_as(
                "/ReportCreate",
                report_payload(
                    &fixture,
                    &a,
                    &b,
                    with(
                        official([0, 0, 0, 0, 0]),
                        json!({"spiritComment": "Rough game"}),
                    ),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(created.status, 200);
        let report_id = id(&created.body);

        let blanked = server
            .post_as(
                "/ReportUpdate",
                json!({"reportId": report_id, "scoreFor": 1, "scoreAgainst": 2, "spiritComment": ""}),
                &admin.token,
            )
            .await;
        assert_eq!(blanked.status, 400);
        assert_eq!(blanked.body["errorCode"], "report.spirit_comment_required");
        assert_eq!(
            stored(&server, &report_id).await.spirit_comment,
            "Rough game"
        );

        let rescored = server
            .post_as(
                "/ReportUpdate",
                with(
                    json!({"reportId": report_id, "scoreFor": 1, "scoreAgainst": 2, "spiritComment": ""}),
                    official([2, 2, 2, 2, 2]),
                ),
                &admin.token,
            )
            .await;
        assert_eq!(rescored.status, 200);
    }

    #[tokio::test]
    async fn lets_only_an_admin_delete_a_report() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            a,
            b,
            fixture,
            alpha_player,
            ..
        } = setup(&server, json!({})).await;
        let created = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({})),
                &alpha_player.token,
            )
            .await;
        let report_id = id(&created.body);
        let forbidden = server
            .post_as(
                "/ReportDelete",
                json!({"reportId": report_id}),
                &alpha_player.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);
        let deleted = server
            .post_as(
                "/ReportDelete",
                json!({"reportId": report_id}),
                &admin.token,
            )
            .await;
        assert_eq!(deleted.status, 204);
        assert!(
            REPORT
                .maybe_one(server.db(), Report::ID.eq(&report_id))
                .await
                .unwrap()
                .is_none()
        );
        // after deleting, the team can report again
        let again = server
            .post_as(
                "/ReportCreate",
                report_payload(&fixture, &a, &b, json!({})),
                &alpha_player.token,
            )
            .await;
        assert_eq!(again.status, 200);
    }
}

mod report_missing_list {
    use super::*;

    #[tokio::test]
    async fn groups_missing_reports_by_fixture_in_date_order() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            a,
            b,
            c,
            d,
            fixture,
            ..
        } = setup(&server, json!({})).await;
        let season_id = id(&season);
        let round2 = create_fixture(
            &server,
            &season_id,
            &admin.user_id,
            "Round 2",
            "2026-07-08T07:00:00.000Z",
            &[(&a, &c), (&b, &d)],
        )
        .await;
        // a second fixture sharing the "Round 2" title is listed separately
        let round2b = create_fixture(
            &server,
            &season_id,
            &admin.user_id,
            "Round 2",
            "2026-07-09T07:00:00.000Z",
            &[(&d, &a)],
        )
        .await;
        // earlier date sorts first even though it was created last
        let preseason = create_fixture(
            &server,
            &season_id,
            &admin.user_id,
            "Preseason",
            "2026-06-20T07:00:00.000Z",
            &[(&a, &b)],
        )
        .await;
        let complete = create_fixture(
            &server,
            &season_id,
            &admin.user_id,
            "Round 3",
            "2026-07-15T07:00:00.000Z",
            &[(&a, &d)],
        )
        .await;

        let submit = |f: &Fixture, team_id: &str, against_id: &str| {
            let value = json!({
                "fixtureId": f.id,
                "teamId": team_id,
                "teamAgainstId": against_id,
                "scoreFor": 1,
                "scoreAgainst": 1,
                "spiritComment": "",
            });
            let db = server.db().clone();
            async move { REPORT.create_one(&db, value).await.unwrap() }
        };
        submit(&fixture, &a, &b).await;
        submit(&fixture, &c, &d).await;
        submit(&fixture, &d, &c).await;
        submit(&round2, &c, &a).await;
        // a report against the wrong team does not satisfy the matchup
        submit(&round2, &b, &a).await;
        submit(&complete, &a, &d).await;
        submit(&complete, &d, &a).await;
        submit(&preseason, &a, &b).await;
        submit(&preseason, &b, &a).await;

        let outsider = sign_up(&server, SignUp::default()).await;
        let forbidden = server
            .post_as(
                "/ReportMissingList",
                json!({"seasonId": season_id}),
                &outsider.token,
            )
            .await;
        assert_eq!(forbidden.status, 403);

        let response = server
            .post_as(
                "/ReportMissingList",
                json!({"seasonId": season_id}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        let color = "hsla(0, 100%, 50%, 1)";
        let team = |team_id: &str, name: &str, against_id: &str, against_name: &str| {
            let mut value = Map::new();
            value.insert("id".into(), json!(team_id));
            value.insert("name".into(), json!(name));
            value.insert("color".into(), json!(color));
            value.insert("againstId".into(), json!(against_id));
            value.insert("againstName".into(), json!(against_name));
            Value::Object(value)
        };
        assert_eq!(
            response.body,
            json!([
                {
                    "title": "Round 1",
                    "fixtureId": fixture.id,
                    "date": fixture.date,
                    "missingTeams": [team(&b, "Bravo", &a, "Alpha")],
                },
                {
                    "title": "Round 2",
                    "fixtureId": round2.id,
                    "date": round2.date,
                    "missingTeams": [
                        team(&a, "Alpha", &c, "Charlie"),
                        team(&b, "Bravo", &d, "Delta"),
                        team(&d, "Delta", &b, "Bravo"),
                    ],
                },
                {
                    "title": "Round 2",
                    "fixtureId": round2b.id,
                    "date": round2b.date,
                    "missingTeams": [
                        team(&d, "Delta", &a, "Alpha"),
                        team(&a, "Alpha", &d, "Delta"),
                    ],
                },
            ])
        );
    }

    #[tokio::test]
    async fn returns_an_empty_list_for_a_season_with_nothing_missing() {
        let server = TestServer::start().await;
        let admin = sign_up(
            &server,
            SignUp {
                admin: true,
                ..Default::default()
            },
        )
        .await;
        let season = create_season(&server, &admin, json!({})).await;
        let response = server
            .post_as(
                "/ReportMissingList",
                json!({"seasonId": season["id"]}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body, json!([]));
    }
}
