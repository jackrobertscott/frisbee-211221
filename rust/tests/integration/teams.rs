//! Port of `server/test/integration/teams.test.ts`.

use crate::common::actors::{
    Actor, NewMember, SignUp, add_member, create_season, create_team, sign_up,
};
use crate::common::{TestServer, assert_match};
use frisbee::db::Patch;
use frisbee::shared::schemas::{Member, Team, User};
use frisbee::tables::{FIXTURE, MEMBER, TEAM, USER};
use frisbee::utils::random::generate_id;
use serde_json::{Value, json};

const COLOR: &str = "hsla(120, 50%, 50%, 1)";

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

fn names(teams: &Value) -> Vec<String> {
    teams
        .as_array()
        .unwrap()
        .iter()
        .map(|team| team["name"].as_str().unwrap().to_string())
        .collect()
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

/// A player who captains a new team via TeamCurrentCreate.
struct CaptainOf {
    captain: Actor,
    team: Value,
}

async fn captain_of(server: &TestServer, season_id: &str, name: &str) -> CaptainOf {
    let captain = sign_up(server, SignUp::default()).await;
    let response = server
        .post_as(
            "/TeamCurrentCreate",
            json!({"seasonId": season_id, "name": name, "color": COLOR}),
            &captain.token,
        )
        .await;
    assert_eq!(
        response.status, 200,
        "Team current create failed: {}",
        response.body
    );
    CaptainOf {
        captain,
        team: response.body["team"].clone(),
    }
}

mod team_current_create {
    use super::*;

    #[tokio::test]
    async fn requires_a_signed_in_user() {
        let server = TestServer::start().await;
        let response = server
            .post(
                "/TeamCurrentCreate",
                json!({"seasonId": generate_id(), "name": "Anon", "color": COLOR}),
            )
            .await;
        assert_eq!(response.status, 401);
        assert_eq!(response.body["errorCode"], "auth.token_missing");
    }

    #[tokio::test]
    async fn makes_the_creator_the_confirmed_captain_and_sets_last_season_id() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": season["id"], "name": "Founders", "color": COLOR}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body["team"],
            &json!({"seasonId": season["id"], "name": "Founders", "color": COLOR}),
        );
        assert_match(
            &response.body["member"],
            &json!({
                "userId": player.user_id,
                "seasonId": season["id"],
                "teamId": response.body["team"]["id"],
                "captain": true,
                "pending": false,
            }),
        );
        let user = USER
            .get_one(server.db(), User::ID.eq(&player.user_id))
            .await
            .unwrap();
        assert_eq!(user.last_season_id, Some(id(&season)));
    }

    #[tokio::test]
    async fn rejects_when_season_sign_up_is_closed() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({"signUpOpen": false})).await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": season["id"], "name": "Late", "color": COLOR}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "team.signup_closed");
        assert_eq!(
            TEAM.count(server.db(), Team::SEASON_ID.eq(id(&season)))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn returns_404_for_a_missing_season() {
        let server = TestServer::start().await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": generate_id(), "name": "Lost", "color": COLOR}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 404);
    }

    #[tokio::test]
    async fn rejects_users_already_on_a_team_including_pending_in_the_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let CaptainOf { captain, .. } = captain_of(&server, &id(&season), "First").await;
        let again = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": season["id"], "name": "Second", "color": COLOR}),
                &captain.token,
            )
            .await;
        assert_eq!(again.status, 409);
        assert_eq!(again.body["errorCode"], "member.already_on_other_team");

        let team = create_team(&server, &admin, &id(&season), "Requested", json!({})).await;
        let requester = sign_up(&server, SignUp::default()).await;
        assert_eq!(
            server
                .post_as("/MemberRequestCreate", team["id"].clone(), &requester.token)
                .await
                .status,
            200
        );
        let pending = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": season["id"], "name": "Third", "color": COLOR}),
                &requester.token,
            )
            .await;
        assert_eq!(pending.status, 409);
        assert_eq!(pending.body["errorCode"], "member.already_on_other_team");
        assert_eq!(
            TEAM.count(server.db(), Team::SEASON_ID.eq(id(&season)))
                .await
                .unwrap(),
            2
        );

        // a membership in another season does not block
        let other_season = create_season(&server, &admin, json!({"name": "Other"})).await;
        let elsewhere = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": other_season["id"], "name": "Elsewhere", "color": COLOR}),
                &captain.token,
            )
            .await;
        assert_eq!(elsewhere.status, 200);
    }

    #[tokio::test]
    async fn rejects_colours_that_are_not_hsla_strings() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/TeamCurrentCreate",
                json!({"seasonId": season["id"], "name": "Red", "color": "#ff0000"}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 422);
        assert_eq!(response.body["errorCode"], "validation_error");
    }
}

mod team_current_update {
    use super::*;

    #[tokio::test]
    async fn requires_the_user_to_be_on_a_team() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let CaptainOf { team, .. } = captain_of(&server, &id(&season), "Guarded").await;
        let anonymous = server
            .post(
                "/TeamCurrentUpdate",
                json!({"teamId": team["id"], "name": "X", "color": COLOR}),
            )
            .await;
        assert_eq!(anonymous.status, 401);

        let loner = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/TeamCurrentUpdate",
                json!({"teamId": team["id"], "name": "X", "color": COLOR}),
                &loner.token,
            )
            .await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["errorCode"], "auth.team_required");
    }

    #[tokio::test]
    async fn lets_the_captain_update_team_details() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let CaptainOf { captain, team } = captain_of(&server, &id(&season), "Old Name").await;
        let response = server
            .post_as(
                "/TeamCurrentUpdate",
                json!({
                    "teamId": team["id"],
                    "name": "New Name",
                    "color": "hsla(200, 40%, 40%, 1)",
                    "phone": " 021 123 ",
                    "email": "team@example.com",
                }),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "id": team["id"],
                "name": "New Name",
                "color": "hsla(200, 40%, 40%, 1)",
                "phone": "021 123",
                "email": "team@example.com",
            }),
        );
        let stored = TEAM
            .get_one(server.db(), Team::ID.eq(id(&team)))
            .await
            .unwrap();
        assert_eq!(stored.name, "New Name");
    }

    #[tokio::test]
    async fn forbids_confirmed_non_captains() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let CaptainOf { team, .. } = captain_of(&server, &id(&season), "Captained").await;
        let player = sign_up(&server, SignUp::default()).await;
        add_member(
            &server,
            &admin,
            &id(&team),
            NewMember {
                email: Some(player.email.clone()),
                ..Default::default()
            },
        )
        .await;
        let response = server
            .post_as(
                "/TeamCurrentUpdate",
                json!({"teamId": team["id"], "name": "Hijack", "color": COLOR}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["errorCode"], "team.captain_required");
    }

    #[tokio::test]
    async fn forbids_pending_members_via_the_team_access_check() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let other_season = create_season(&server, &admin, json!({"name": "Other"})).await;
        let CaptainOf { team, .. } = captain_of(&server, &id(&season), "Pending Target").await;
        // the requester is confirmed on a team elsewhere so passes the team rule
        let CaptainOf {
            captain: requester, ..
        } = captain_of(&server, &id(&other_season), "Their Own").await;
        assert_eq!(
            server
                .post_as("/MemberRequestCreate", team["id"].clone(), &requester.token)
                .await
                .status,
            200
        );
        let response = server
            .post_as(
                "/TeamCurrentUpdate",
                json!({"teamId": team["id"], "name": "Hijack", "color": COLOR}),
                &requester.token,
            )
            .await;
        assert_eq!(response.status, 403);
        // a pending request is not membership, so the team access check rejects it
        assert_eq!(response.body["errorCode"], "team.access_forbidden");
    }

    #[tokio::test]
    async fn forbids_members_of_other_teams_and_admins_who_are_not_members() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let CaptainOf { team, .. } = captain_of(&server, &id(&season), "Target").await;
        let CaptainOf { captain: rival, .. } = captain_of(&server, &id(&season), "Rival").await;
        let rival_response = server
            .post_as(
                "/TeamCurrentUpdate",
                json!({"teamId": team["id"], "name": "Hijack", "color": COLOR}),
                &rival.token,
            )
            .await;
        assert_eq!(rival_response.status, 403);
        assert_eq!(rival_response.body["errorCode"], "team.access_forbidden");

        let admin_response = server
            .post_as(
                "/TeamCurrentUpdate",
                json!({"teamId": team["id"], "name": "Admin", "color": COLOR}),
                &admin.token,
            )
            .await;
        assert_eq!(admin_response.status, 403);
        assert_eq!(admin_response.body["errorCode"], "team.access_forbidden");
    }
}

mod team_create_team_update_and_team_delete {
    use super::*;

    #[tokio::test]
    async fn are_admin_only() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let team = create_team(&server, &admin, &id(&season), "Directory", json!({})).await;
        let CaptainOf { captain, .. } = captain_of(&server, &id(&season), "Captain Team").await;
        let calls = [
            (
                "/TeamCreate",
                json!({"seasonId": season["id"], "name": "X", "color": COLOR}),
            ),
            (
                "/TeamUpdate",
                json!({"teamId": team["id"], "name": "X", "color": COLOR}),
            ),
            ("/TeamDelete", json!({"teamId": team["id"]})),
        ];
        for (path, payload) in calls {
            let anonymous = server.post(path, payload.clone()).await;
            assert_eq!(anonymous.status, 401);
            let response = server.post_as(path, payload, &captain.token).await;
            assert_eq!(response.status, 403);
            assert_eq!(response.body["errorCode"], "auth.admin_required");
        }
        assert!(
            TEAM.maybe_one(server.db(), Team::ID.eq(id(&team)))
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn creates_a_team_for_an_existing_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let response = server
            .post_as(
                "/TeamCreate",
                json!({
                    "seasonId": season["id"],
                    "name": "Made",
                    "color": COLOR,
                    "phone": "123",
                    "email": "made@example.com",
                    "division": 2,
                }),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({
                "seasonId": season["id"],
                "name": "Made",
                "color": COLOR,
                "phone": "123",
                "email": "made@example.com",
                "division": 2,
            }),
        );
        // no captain/member is created for admin-created teams
        assert_eq!(
            MEMBER
                .count(server.db(), Member::TEAM_ID.eq(id(&response.body)))
                .await
                .unwrap(),
            0
        );

        let missing = server
            .post_as(
                "/TeamCreate",
                json!({"seasonId": generate_id(), "name": "Orphan", "color": COLOR}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn updates_a_team_including_its_division() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let team = create_team(&server, &admin, &id(&season), "Before", json!({})).await;
        let response = server
            .post_as(
                "/TeamUpdate",
                json!({"teamId": team["id"], "name": "After", "color": COLOR, "division": 2}),
                &admin.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({"id": team["id"], "name": "After", "division": 2}),
        );
        let stored = TEAM
            .get_one(server.db(), Team::ID.eq(id(&team)))
            .await
            .unwrap();
        let mut stored = serde_json::to_value(stored).unwrap();
        frisbee::js::normalize_numbers(&mut stored);
        assert_match(&stored, &json!({"name": "After", "division": 2}));

        let missing = server
            .post_as(
                "/TeamUpdate",
                json!({"teamId": generate_id(), "name": "X", "color": COLOR}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn deletes_a_team_and_its_members() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let team = create_team(&server, &admin, &id(&season), "Doomed", json!({})).await;
        let keep = create_team(&server, &admin, &id(&season), "Kept", json!({})).await;
        add_member(&server, &admin, &id(&team), NewMember::default()).await;
        add_member(&server, &admin, &id(&team), NewMember::default()).await;
        add_member(&server, &admin, &id(&keep), NewMember::default()).await;
        let response = server
            .post_as("/TeamDelete", json!({"teamId": team["id"]}), &admin.token)
            .await;
        assert_eq!(response.status, 204);
        let db = server.db();
        assert!(
            TEAM.maybe_one(db, Team::ID.eq(id(&team)))
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            MEMBER
                .count(db, Member::TEAM_ID.eq(id(&team)))
                .await
                .unwrap(),
            0
        );
        assert_eq!(
            MEMBER
                .count(db, Member::TEAM_ID.eq(id(&keep)))
                .await
                .unwrap(),
            1
        );

        // deleting a missing team silently succeeds
        let missing = server
            .post_as(
                "/TeamDelete",
                json!({"teamId": generate_id()}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 204);
    }
}

mod feature_dashboard_teams_load {
    use super::*;

    /// Fixture teams (binary name ordering puts "echo" after capitalised names):
    /// name     division phone  email      createdOn
    /// Alpha    2        0300   c@x.com    day 3
    /// Bravo    1        0100   a@x.com    day 1
    /// Charlie  -        -      b@x.com    day 5
    /// Delta    1        0200   -          day 2
    /// echo     -        0100   a@x.com    day 4
    async fn seed_teams(server: &TestServer, admin: &Actor) -> Value {
        let season = create_season(server, admin, json!({"name": "Dashboard"})).await;
        let day =
            |n: i64| frisbee::js::date::to_iso_string(1_767_225_600_000 + (n - 1) * 86_400_000);
        let teams = [
            json!({"name": "Alpha", "division": 2, "phone": "0300", "email": "c@x.com", "createdOn": day(3)}),
            json!({"name": "Bravo", "division": 1, "phone": "0100", "email": "a@x.com", "createdOn": day(1)}),
            json!({"name": "Charlie", "email": "b@x.com", "createdOn": day(5)}),
            json!({"name": "Delta", "division": 1, "phone": "0200", "createdOn": day(2)}),
            json!({"name": "echo", "phone": "0100", "email": "a@x.com", "createdOn": day(4)}),
        ];
        for mut team in teams {
            team["seasonId"] = season["id"].clone();
            team["color"] = json!(COLOR);
            TEAM.create_one(server.db(), team).await.unwrap();
        }
        season
    }

    async fn load(server: &TestServer, payload: Value) -> Value {
        let response = server.post("/FeatureDashboardTeamsLoad", payload).await;
        assert_eq!(response.status, 200);
        response.body
    }

    #[tokio::test]
    async fn is_public_and_defaults_to_division_ascending_with_missing_divisions_last() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = seed_teams(&server, &admin).await;
        let result = load(&server, json!({"seasonId": season["id"]})).await;
        assert_eq!(result["count"], 5);
        assert_eq!(
            names(&result["teams"]),
            ["Bravo", "Delta", "Alpha", "Charlie", "echo"]
        );
        // the helper sort field is not leaked
        assert!(result["teams"][0].get("_sortDivisionMissing").is_none());
    }

    #[tokio::test]
    async fn sorts_by_every_key_and_direction() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = seed_teams(&server, &admin).await;
        let expected: [(&str, [&str; 5], [&str; 5]); 5] = [
            (
                "division",
                ["Bravo", "Delta", "Alpha", "Charlie", "echo"],
                ["Alpha", "Bravo", "Delta", "Charlie", "echo"],
            ),
            (
                "name",
                ["Alpha", "Bravo", "Charlie", "Delta", "echo"],
                ["echo", "Delta", "Charlie", "Bravo", "Alpha"],
            ),
            (
                "phone",
                ["Charlie", "Bravo", "echo", "Delta", "Alpha"],
                ["Alpha", "Delta", "Bravo", "echo", "Charlie"],
            ),
            (
                "email",
                ["Delta", "Bravo", "echo", "Charlie", "Alpha"],
                ["Alpha", "Charlie", "Bravo", "echo", "Delta"],
            ),
            (
                "createdOn",
                ["Bravo", "Delta", "Alpha", "echo", "Charlie"],
                ["Charlie", "echo", "Alpha", "Delta", "Bravo"],
            ),
        ];
        for (sort_by, asc, desc) in expected {
            for (sort_direction, names_expected) in [("asc", asc), ("desc", desc)] {
                let result = load(
                    &server,
                    json!({"seasonId": season["id"], "sortBy": sort_by, "sortDirection": sort_direction}),
                )
                .await;
                assert_eq!(
                    (sort_by, sort_direction, names(&result["teams"])),
                    (
                        sort_by,
                        sort_direction,
                        names_expected.iter().map(|s| s.to_string()).collect()
                    )
                );
            }
        }
        // direction defaults to ascending
        assert_eq!(
            names(
                &load(&server, json!({"seasonId": season["id"], "sortBy": "name"})).await["teams"]
            ),
            ["Alpha", "Bravo", "Charlie", "Delta", "echo"]
        );
    }

    #[tokio::test]
    async fn searches_names_case_insensitively_and_counts_matches() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = seed_teams(&server, &admin).await;
        let result = load(&server, json!({"seasonId": season["id"], "search": "HA"})).await;
        assert_eq!(result["count"], 2);
        assert_eq!(names(&result["teams"]), ["Alpha", "Charlie"]);
        let none = load(&server, json!({"seasonId": season["id"], "search": ".*"})).await;
        assert_eq!(none, json!({"count": 0, "teams": []}));
        let empty = load(&server, json!({"seasonId": season["id"], "search": ""})).await;
        assert_eq!(empty["count"], 5);
    }

    #[tokio::test]
    async fn pages_with_skip_and_limit_after_sorting_while_count_stays_total() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = seed_teams(&server, &admin).await;
        let page = load(
            &server,
            json!({"seasonId": season["id"], "skip": 1, "limit": 2}),
        )
        .await;
        assert_eq!(page["count"], 5);
        assert_eq!(names(&page["teams"]), ["Delta", "Alpha"]);
        let last = load(
            &server,
            json!({
                "seasonId": season["id"],
                "sortBy": "name",
                "sortDirection": "desc",
                "skip": 4,
                "limit": 2,
            }),
        )
        .await;
        assert_eq!(names(&last["teams"]), ["Alpha"]);
        let searched = load(
            &server,
            json!({"seasonId": season["id"], "search": "a", "limit": 1}),
        )
        .await;
        assert_eq!(searched["count"], 4);
        assert_eq!(names(&searched["teams"]), ["Bravo"]);
    }

    #[tokio::test]
    async fn only_returns_teams_of_the_requested_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = seed_teams(&server, &admin).await;
        let other = create_season(&server, &admin, json!({"name": "Other"})).await;
        create_team(&server, &admin, &id(&other), "Outsider", json!({})).await;
        assert_eq!(
            load(&server, json!({"seasonId": season["id"]})).await["count"],
            5
        );
        assert_eq!(
            names(&load(&server, json!({"seasonId": other["id"]})).await["teams"]),
            ["Outsider"]
        );
    }

    #[tokio::test]
    async fn validates_paging_and_season() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = seed_teams(&server, &admin).await;
        let too_many = server
            .post(
                "/FeatureDashboardTeamsLoad",
                json!({"seasonId": season["id"], "limit": 101}),
            )
            .await;
        assert_eq!(too_many.status, 422);
        let negative = server
            .post(
                "/FeatureDashboardTeamsLoad",
                json!({"seasonId": season["id"], "skip": -1}),
            )
            .await;
        assert_eq!(negative.status, 422);
        let bad_sort = server
            .post(
                "/FeatureDashboardTeamsLoad",
                json!({"seasonId": season["id"], "sortBy": "id"}),
            )
            .await;
        assert_eq!(bad_sort.status, 422);
        let missing = server
            .post(
                "/FeatureDashboardTeamsLoad",
                json!({"seasonId": generate_id()}),
            )
            .await;
        assert_eq!(missing.status, 404);
    }
}

mod feature_team_setup_load {
    use super::*;

    #[tokio::test]
    async fn requires_a_signed_in_user() {
        let server = TestServer::start().await;
        let response = server
            .post("/FeatureTeamSetupLoad", json!({"seasonId": generate_id()}))
            .await;
        assert_eq!(response.status, 401);
    }

    #[tokio::test]
    async fn lists_teams_by_name_and_returns_the_pending_team() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        create_team(&server, &admin, &id(&season), "Zeta", json!({})).await;
        let target = create_team(&server, &admin, &id(&season), "Mu", json!({})).await;
        create_team(&server, &admin, &id(&season), "Beta", json!({})).await;
        let player = sign_up(&server, SignUp::default()).await;

        let before = server
            .post_as(
                "/FeatureTeamSetupLoad",
                json!({"seasonId": season["id"]}),
                &player.token,
            )
            .await;
        assert_eq!(before.status, 200);
        assert_eq!(names(&before.body["teams"]), ["Beta", "Mu", "Zeta"]);
        assert!(before.body.get("pendingTeam").is_none());

        server
            .post_as("/MemberRequestCreate", target["id"].clone(), &player.token)
            .await;
        let after = server
            .post_as(
                "/FeatureTeamSetupLoad",
                json!({"seasonId": season["id"], "search": "ET"}),
                &player.token,
            )
            .await;
        assert_eq!(names(&after.body["teams"]), ["Beta", "Zeta"]);
        assert_match(
            &after.body["pendingTeam"],
            &json!({"id": target["id"], "name": "Mu"}),
        );
    }

    #[tokio::test]
    async fn also_returns_the_team_of_a_confirmed_membership() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let CaptainOf { captain, team } = captain_of(&server, &id(&season), "Mine").await;
        let response = server
            .post_as(
                "/FeatureTeamSetupLoad",
                json!({"seasonId": season["id"]}),
                &captain.token,
            )
            .await;
        assert_match(&response.body["pendingTeam"], &json!({"id": team["id"]}));
    }

    #[tokio::test]
    async fn returns_404_for_a_missing_season() {
        let server = TestServer::start().await;
        let player = sign_up(&server, SignUp::default()).await;
        let response = server
            .post_as(
                "/FeatureTeamSetupLoad",
                json!({"seasonId": generate_id()}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 404);
    }
}

mod feature_competition_load {
    use super::*;

    #[tokio::test]
    async fn is_public_and_returns_teams_by_division_and_fixtures_by_date() {
        let server = TestServer::start().await;
        let admin = admin(&server).await;
        let season = create_season(&server, &admin, json!({})).await;
        let a = create_team(&server, &admin, &id(&season), "A Team", json!({})).await;
        let b = create_team(&server, &admin, &id(&season), "B Team", json!({})).await;
        create_team(&server, &admin, &id(&season), "C Team", json!({})).await;
        let db = server.db();
        TEAM.update_one(
            db,
            Team::ID.eq(id(&a)),
            Patch::new().set(Team::DIVISION, 2.0),
        )
        .await
        .unwrap();
        TEAM.update_one(
            db,
            Team::ID.eq(id(&b)),
            Patch::new().set(Team::DIVISION, 1.0),
        )
        .await
        .unwrap();
        let fixture = |title: &str, date: &str| {
            json!({
                "seasonId": season["id"],
                "userId": admin.user_id,
                "title": title,
                "date": date,
                "games": [],
            })
        };
        let later = FIXTURE
            .create_one(db, fixture("Later", "2026-06-02T00:00:00.000Z"))
            .await
            .unwrap();
        let earlier = FIXTURE
            .create_one(db, fixture("Earlier", "2026-06-01T00:00:00.000Z"))
            .await
            .unwrap();
        let response = server
            .post("/FeatureCompetitionLoad", json!({"seasonId": season["id"]}))
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(
            names(&response.body["teams"]),
            ["B Team", "A Team", "C Team"]
        );
        let fixture_ids: Vec<&str> = response.body["fixtures"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["id"].as_str().unwrap())
            .collect();
        assert_eq!(fixture_ids, [earlier.id.as_str(), later.id.as_str()]);

        let missing = server
            .post(
                "/FeatureCompetitionLoad",
                json!({"seasonId": generate_id()}),
            )
            .await;
        assert_eq!(missing.status, 404);
    }
}
