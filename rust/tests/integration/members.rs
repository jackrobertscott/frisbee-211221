//! Port of `server/test/integration/members.test.ts`.

use crate::common::actors::{
    Actor, NewMember, SignUp, add_member, create_season, create_team, sign_up, unique_email,
};
use crate::common::{TestServer, assert_match};
use frisbee::db::{Filter, Patch};
use frisbee::shared::schemas::{Member, User, UserEmail};
use frisbee::tables::{MEMBER, USER};
use frisbee::utils::random::{generate_id, random_string};
use serde_json::{Value, json};

const COLOR: &str = "hsla(10, 60%, 50%, 1)";

fn id(value: &Value) -> String {
    value["id"].as_str().unwrap().to_string()
}

/// A season with a team captained by a fresh player.
struct Setup {
    admin: Actor,
    season: Value,
    captain: Actor,
    team: Value,
    captain_member: Value,
}

async fn setup_team(server: &TestServer, sign_up_open: bool) -> Setup {
    let admin = sign_up(
        server,
        SignUp {
            admin: true,
            ..Default::default()
        },
    )
    .await;
    let season = create_season(
        server,
        &admin,
        json!({"name": format!("Season {}", random_string(6)), "signUpOpen": sign_up_open}),
    )
    .await;
    let captain = sign_up(server, SignUp::default()).await;
    let response = server
        .post_as(
            "/TeamCurrentCreate",
            json!({"seasonId": season["id"], "name": "Captained", "color": COLOR}),
            &captain.token,
        )
        .await;
    assert_eq!(
        response.status, 200,
        "Team current create failed: {}",
        response.body
    );
    Setup {
        admin,
        season,
        captain,
        team: response.body["team"].clone(),
        captain_member: response.body["member"].clone(),
    }
}

/// Signs up a player and confirms them on the team.
async fn confirmed_player(server: &TestServer, admin: &Actor, team_id: &str) -> (Actor, Member) {
    let actor = sign_up(server, SignUp::default()).await;
    add_member(
        server,
        admin,
        team_id,
        NewMember {
            email: Some(actor.email.clone()),
            ..Default::default()
        },
    )
    .await;
    let member = MEMBER
        .get_one(
            server.db(),
            Member::USER_ID
                .eq(&actor.user_id)
                .and_also(Member::TEAM_ID.eq(team_id)),
        )
        .await
        .unwrap();
    (actor, member)
}

async fn pending_player(server: &TestServer, team_id: &str) -> (Actor, Value) {
    let actor = sign_up(server, SignUp::default()).await;
    let response = server
        .post_as("/MemberRequestCreate", json!(team_id), &actor.token)
        .await;
    assert_eq!(response.status, 200, "Request failed: {}", response.body);
    (actor, response.body)
}

async fn set_created_on(server: &TestServer, member_id: &str, day: i64) {
    MEMBER
        .update_one(
            server.db(),
            Member::ID.eq(member_id),
            Patch::new().set(
                Member::CREATED_ON,
                frisbee::js::date::to_iso_string(1_767_225_600_000 + (day - 1) * 86_400_000),
            ),
        )
        .await
        .unwrap();
}

async fn get_member(server: &TestServer, member_id: &str) -> Member {
    MEMBER
        .get_one(server.db(), Member::ID.eq(member_id))
        .await
        .unwrap()
}

async fn maybe_member(server: &TestServer, member_id: &str) -> Option<Member> {
    MEMBER
        .maybe_one(server.db(), Member::ID.eq(member_id))
        .await
        .unwrap()
}

mod member_list_of_team {
    use super::*;

    #[tokio::test]
    async fn enforces_sign_in_team_membership_and_team_access() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            team,
            ..
        } = setup_team(&server, true).await;
        let anonymous = server.post("/MemberListOfTeam", team["id"].clone()).await;
        assert_eq!(anonymous.status, 401);

        let loner = sign_up(&server, SignUp::default()).await;
        let no_team = server
            .post_as("/MemberListOfTeam", team["id"].clone(), &loner.token)
            .await;
        assert_eq!(no_team.status, 403);
        assert_eq!(no_team.body["errorCode"], "auth.team_required");

        let other_team = create_team(&server, &admin, &id(&season), "Other", json!({})).await;
        let (outsider, _) = confirmed_player(&server, &admin, &id(&other_team)).await;
        let wrong_team = server
            .post_as("/MemberListOfTeam", team["id"].clone(), &outsider.token)
            .await;
        assert_eq!(wrong_team.status, 403);
        assert_eq!(wrong_team.body["errorCode"], "team.access_forbidden");

        // a pending requester (not confirmed anywhere) is not on a team
        let (pending, _) = pending_player(&server, &id(&team)).await;
        let pending_response = server
            .post_as("/MemberListOfTeam", team["id"].clone(), &pending.token)
            .await;
        assert_eq!(pending_response.status, 403);
        assert_eq!(pending_response.body["errorCode"], "auth.team_required");
    }

    #[tokio::test]
    async fn lists_confirmed_and_pending_members_with_public_user_fields() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain,
            captain_member,
            ..
        } = setup_team(&server, true).await;
        let (_, confirmed) = confirmed_player(&server, &admin, &id(&team)).await;
        let (_, pending) = pending_player(&server, &id(&team)).await;

        let response = server
            .post_as("/MemberListOfTeam", team["id"].clone(), &captain.token)
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body["current"],
            &json!({"id": captain_member["id"], "captain": true}),
        );
        let mut ids: Vec<String> = response.body["members"]
            .as_array()
            .unwrap()
            .iter()
            .map(id)
            .collect();
        ids.sort();
        let mut expected = vec![id(&captain_member), confirmed.id, id(&pending)];
        expected.sort();
        assert_eq!(ids, expected);
        let users = response.body["users"].as_array().unwrap();
        assert_eq!(users.len(), 3);
        for user in users {
            assert!(user.get("emails").is_none());
            assert!(user.get("password").is_none());
            assert!(user["firstName"].is_string());
        }
    }

    #[tokio::test]
    async fn lets_admins_list_any_team_without_being_a_member() {
        let server = TestServer::start().await;
        let Setup { admin, team, .. } = setup_team(&server, true).await;
        let response = server
            .post_as("/MemberListOfTeam", team["id"].clone(), &admin.token)
            .await;
        assert_eq!(response.status, 200);
        assert!(response.body.get("current").is_none());
        assert_eq!(response.body["members"].as_array().unwrap().len(), 1);
    }
}

mod member_lookup_by_email {
    use super::*;

    #[tokio::test]
    async fn is_available_to_captains_and_admins_only() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain,
            ..
        } = setup_team(&server, true).await;
        let (player, _) = confirmed_player(&server, &admin, &id(&team)).await;
        let target = sign_up(
            &server,
            SignUp {
                first_name: Some("Target".into()),
                ..Default::default()
            },
        )
        .await;

        let non_captain = server
            .post_as(
                "/MemberLookupByEmail",
                json!({"teamId": team["id"], "email": target.email}),
                &player.token,
            )
            .await;
        assert_eq!(non_captain.status, 403);
        assert_eq!(non_captain.body["errorCode"], "member.captain_required");

        let by_captain = server
            .post_as(
                "/MemberLookupByEmail",
                json!({"teamId": team["id"], "email": format!("  {} ", target.email.to_uppercase())}),
                &captain.token,
            )
            .await;
        assert_eq!(by_captain.status, 200);
        assert_eq!(by_captain.body["exists"], true);
        assert_match(
            &by_captain.body["user"],
            &json!({"id": target.user_id, "firstName": "Target"}),
        );
        assert!(by_captain.body["user"].get("emails").is_none());

        let by_admin = server
            .post_as(
                "/MemberLookupByEmail",
                json!({"teamId": team["id"], "email": unique_email("user")}),
                &admin.token,
            )
            .await;
        assert_eq!(by_admin.status, 200);
        assert_eq!(by_admin.body, json!({"exists": false}));
    }
}

mod member_create {
    use super::*;

    #[tokio::test]
    async fn creates_a_new_user_when_the_email_is_unknown() {
        let server = TestServer::start().await;
        let Setup {
            team,
            season,
            captain,
            ..
        } = setup_team(&server, true).await;
        let email = unique_email("new");
        let response = server
            .post_as(
                "/MemberCreate",
                json!({
                    "teamId": team["id"],
                    "email": email,
                    "firstName": "New",
                    "lastName": "Person",
                    "genderMatching": "female",
                }),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({"teamId": team["id"], "seasonId": season["id"], "pending": false}),
        );
        assert!(response.body.get("captain").is_none());
        let user = USER
            .get_one(
                server.db(),
                User::ID.eq(response.body["userId"].as_str().unwrap()),
            )
            .await
            .unwrap();
        assert_match(
            &serde_json::to_value(&user).unwrap(),
            &json!({
                "firstName": "New",
                "lastName": "Person",
                "genderMatching": "female",
                "termsAccepted": false,
            }),
        );
        assert_match(
            &json!(
                user.emails
                    .iter()
                    .map(
                        |e| json!({"value": e.value, "primary": e.primary, "verified": e.verified})
                    )
                    .collect::<Vec<_>>()
            ),
            &json!([{"value": email, "primary": true, "verified": false}]),
        );
    }

    #[tokio::test]
    async fn requires_user_details_for_a_new_email() {
        let server = TestServer::start().await;
        let Setup { team, captain, .. } = setup_team(&server, true).await;
        let email = unique_email("nodetails");
        let response = server
            .post_as(
                "/MemberCreate",
                json!({
                    "teamId": team["id"],
                    "email": email,
                    "firstName": "  ",
                    "lastName": "Person",
                    "genderMatching": "male",
                }),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 400);
        assert_eq!(response.body["errorCode"], "member.user_details_required");
        let no_gender_matching = server
            .post_as(
                "/MemberCreate",
                json!({"teamId": team["id"], "email": email, "firstName": "A", "lastName": "B"}),
                &captain.token,
            )
            .await;
        assert_eq!(no_gender_matching.status, 400);
        assert_eq!(
            no_gender_matching.body["errorCode"],
            "member.user_details_required"
        );
        assert_eq!(
            USER.count(server.db(), User::EMAILS.any(UserEmail::VALUE.eq(email)))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn adds_an_existing_user_without_needing_details() {
        let server = TestServer::start().await;
        let Setup { team, captain, .. } = setup_team(&server, true).await;
        let existing = sign_up(
            &server,
            SignUp {
                first_name: Some("Existing".into()),
                ..Default::default()
            },
        )
        .await;
        let users_before = USER.count(server.db(), Filter::all()).await.unwrap();
        let response = server
            .post_as(
                "/MemberCreate",
                json!({"teamId": team["id"], "email": existing.email.to_uppercase()}),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({"userId": existing.user_id, "teamId": team["id"], "pending": false}),
        );
        assert_eq!(
            USER.count(server.db(), Filter::all()).await.unwrap(),
            users_before
        );
        let user = USER
            .get_one(server.db(), User::ID.eq(&existing.user_id))
            .await
            .unwrap();
        assert_eq!(user.first_name, "Existing");
    }

    #[tokio::test]
    async fn confirms_a_pending_request_and_is_idempotent_for_existing_members() {
        let server = TestServer::start().await;
        let Setup { team, captain, .. } = setup_team(&server, true).await;
        let (actor, member) = pending_player(&server, &id(&team)).await;
        let response = server
            .post_as(
                "/MemberCreate",
                json!({"teamId": team["id"], "email": actor.email}),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({"id": member["id"], "pending": false}),
        );
        let again = server
            .post_as(
                "/MemberCreate",
                json!({"teamId": team["id"], "email": actor.email}),
                &captain.token,
            )
            .await;
        assert_eq!(again.status, 200);
        assert_eq!(again.body["id"], member["id"]);
        assert_eq!(
            MEMBER
                .count(server.db(), Member::USER_ID.eq(&actor.user_id))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn rejects_users_already_on_another_team_in_the_season() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            team,
            captain,
            ..
        } = setup_team(&server, true).await;
        let other = create_team(&server, &admin, &id(&season), "Other", json!({})).await;
        let (actor, _) = confirmed_player(&server, &admin, &id(&other)).await;
        let response = server
            .post_as(
                "/MemberCreate",
                json!({"teamId": team["id"], "email": actor.email}),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 409);
        assert_eq!(response.body["errorCode"], "member.already_on_other_team");
    }

    #[tokio::test]
    async fn is_limited_to_captains_and_admins() {
        let server = TestServer::start().await;
        let Setup { admin, team, .. } = setup_team(&server, true).await;
        let (player, _) = confirmed_player(&server, &admin, &id(&team)).await;
        let response = server
            .post_as(
                "/MemberCreate",
                json!({
                    "teamId": team["id"],
                    "email": unique_email("user"),
                    "firstName": "A",
                    "lastName": "B",
                    "genderMatching": "male",
                }),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["errorCode"], "member.captain_required");

        let anonymous = server
            .post(
                "/MemberCreate",
                json!({"teamId": team["id"], "email": unique_email("user")}),
            )
            .await;
        assert_eq!(anonymous.status, 401);

        let missing_team = server
            .post_as(
                "/MemberCreate",
                json!({
                    "teamId": generate_id(),
                    "email": unique_email("user"),
                    "firstName": "A",
                    "lastName": "B",
                    "genderMatching": "male",
                }),
                &admin.token,
            )
            .await;
        assert_eq!(missing_team.status, 404);
    }
}

mod member_request_create {
    use super::*;

    #[tokio::test]
    async fn creates_a_pending_membership_and_rejects_duplicates() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            team,
            ..
        } = setup_team(&server, true).await;
        let anonymous = server
            .post("/MemberRequestCreate", team["id"].clone())
            .await;
        assert_eq!(anonymous.status, 401);

        let (actor, member) = pending_player(&server, &id(&team)).await;
        assert_match(
            &member,
            &json!({
                "teamId": team["id"],
                "seasonId": season["id"],
                "userId": actor.user_id,
                "pending": true,
            }),
        );

        let duplicate = server
            .post_as("/MemberRequestCreate", team["id"].clone(), &actor.token)
            .await;
        assert_eq!(duplicate.status, 409);
        assert_eq!(duplicate.body["errorCode"], "member.request_exists");

        let other = create_team(&server, &admin, &id(&season), "Other", json!({})).await;
        let other_team = server
            .post_as("/MemberRequestCreate", other["id"].clone(), &actor.token)
            .await;
        assert_eq!(other_team.status, 409);
        assert_eq!(other_team.body["errorCode"], "member.request_exists");

        let missing = server
            .post_as("/MemberRequestCreate", json!(generate_id()), &actor.token)
            .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn does_not_require_season_sign_up_to_be_open() {
        let server = TestServer::start().await;
        let admin = sign_up(
            &server,
            SignUp {
                admin: true,
                ..Default::default()
            },
        )
        .await;
        let closed = create_season(
            &server,
            &admin,
            json!({"name": "Closed", "signUpOpen": false}),
        )
        .await;
        let team = create_team(&server, &admin, &id(&closed), "Closed Team", json!({})).await;
        // requests only check the team, not the season's signUpOpen flag
        let (_, member) = pending_player(&server, &id(&team)).await;
        assert_eq!(member["pending"], true);
    }
}

mod member_accept_or_decline {
    use super::*;

    #[tokio::test]
    async fn lets_the_captain_accept_a_request() {
        let server = TestServer::start().await;
        let Setup { team, captain, .. } = setup_team(&server, true).await;
        let (_, member) = pending_player(&server, &id(&team)).await;
        let response = server
            .post_as(
                "/MemberAcceptOrDecline",
                json!({"memberId": member["id"], "accept": true}),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 204);
        assert!(!get_member(&server, &id(&member)).await.pending);
    }

    #[tokio::test]
    async fn lets_the_captain_decline_a_request_by_deleting_it() {
        let server = TestServer::start().await;
        let Setup { team, captain, .. } = setup_team(&server, true).await;
        let (_, member) = pending_player(&server, &id(&team)).await;
        let response = server
            .post_as(
                "/MemberAcceptOrDecline",
                json!({"memberId": member["id"], "accept": false}),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 204);
        assert!(maybe_member(&server, &id(&member)).await.is_none());
    }

    #[tokio::test]
    async fn forbids_non_captains_and_handles_missing_members() {
        let server = TestServer::start().await;
        let Setup { admin, team, .. } = setup_team(&server, true).await;
        let (player, _) = confirmed_player(&server, &admin, &id(&team)).await;
        let (_, member) = pending_player(&server, &id(&team)).await;
        let response = server
            .post_as(
                "/MemberAcceptOrDecline",
                json!({"memberId": member["id"], "accept": true}),
                &player.token,
            )
            .await;
        assert_eq!(response.status, 403);
        assert_eq!(response.body["errorCode"], "member.captain_required");
        assert!(get_member(&server, &id(&member)).await.pending);

        let by_admin = server
            .post_as(
                "/MemberAcceptOrDecline",
                json!({"memberId": member["id"], "accept": true}),
                &admin.token,
            )
            .await;
        assert_eq!(by_admin.status, 204);

        let missing = server
            .post_as(
                "/MemberAcceptOrDecline",
                json!({"memberId": generate_id(), "accept": true}),
                &admin.token,
            )
            .await;
        assert_eq!(missing.status, 404);
    }
}

mod member_set_captain {
    use super::*;

    #[tokio::test]
    async fn moves_the_captaincy_to_another_member() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain,
            captain_member,
            ..
        } = setup_team(&server, true).await;
        let (_, member) = confirmed_player(&server, &admin, &id(&team)).await;
        let response = server
            .post_as("/MemberSetCaptain", json!(member.id), &captain.token)
            .await;
        assert_eq!(response.status, 200);
        assert_match(
            &response.body,
            &json!({"id": member.id, "captain": true, "pending": false}),
        );
        assert_eq!(
            get_member(&server, &id(&captain_member)).await.captain,
            Some(false)
        );
        assert_eq!(
            MEMBER
                .count(
                    server.db(),
                    Member::TEAM_ID
                        .eq(id(&team))
                        .and_also(Member::CAPTAIN.eq(true)),
                )
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn confirms_a_pending_member_made_captain() {
        let server = TestServer::start().await;
        let Setup { team, captain, .. } = setup_team(&server, true).await;
        let (_, member) = pending_player(&server, &id(&team)).await;
        let response = server
            .post_as("/MemberSetCaptain", member["id"].clone(), &captain.token)
            .await;
        assert_eq!(response.status, 200);
        let stored = get_member(&server, &id(&member)).await;
        assert_eq!((stored.captain, stored.pending), (Some(true), false));
    }

    #[tokio::test]
    async fn rejects_the_current_captain_and_non_captain_callers() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain,
            captain_member,
            ..
        } = setup_team(&server, true).await;
        let already = server
            .post_as(
                "/MemberSetCaptain",
                captain_member["id"].clone(),
                &captain.token,
            )
            .await;
        assert_eq!(already.status, 409);
        assert_eq!(already.body["errorCode"], "member.already_captain");

        let (player, member) = confirmed_player(&server, &admin, &id(&team)).await;
        let forbidden = server
            .post_as("/MemberSetCaptain", json!(member.id), &player.token)
            .await;
        assert_eq!(forbidden.status, 403);
        assert_eq!(forbidden.body["errorCode"], "member.captain_required");
        assert_eq!(get_member(&server, &member.id).await.captain, None);
    }

    #[tokio::test]
    async fn lets_admins_set_a_captain_on_a_team_without_one() {
        let server = TestServer::start().await;
        let Setup { admin, season, .. } = setup_team(&server, true).await;
        let team = create_team(&server, &admin, &id(&season), "Captainless", json!({})).await;
        let (_, member) = confirmed_player(&server, &admin, &id(&team)).await;
        let response = server
            .post_as("/MemberSetCaptain", json!(member.id), &admin.token)
            .await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["captain"], true);
    }
}

mod member_remove {
    use super::*;

    #[tokio::test]
    async fn passes_the_captaincy_to_the_oldest_confirmed_member() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain,
            captain_member,
            ..
        } = setup_team(&server, true).await;
        let (_, pending_oldest) = pending_player(&server, &id(&team)).await;
        let (_, newer) = confirmed_player(&server, &admin, &id(&team)).await;
        let (_, older) = confirmed_player(&server, &admin, &id(&team)).await;
        set_created_on(&server, &id(&captain_member), 1).await;
        set_created_on(&server, &id(&pending_oldest), 2).await;
        set_created_on(&server, &older.id, 3).await;
        set_created_on(&server, &newer.id, 4).await;

        let response = server
            .post_as(
                "/MemberRemove",
                captain_member["id"].clone(),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 204);
        assert!(maybe_member(&server, &id(&captain_member)).await.is_none());
        assert_eq!(get_member(&server, &older.id).await.captain, Some(true));
        assert_eq!(get_member(&server, &newer.id).await.captain, None);
        assert_eq!(
            get_member(&server, &id(&pending_oldest)).await.captain,
            None
        );
    }

    #[tokio::test]
    async fn leaves_no_captain_when_no_confirmed_member_remains() {
        let server = TestServer::start().await;
        let Setup {
            team,
            captain,
            captain_member,
            ..
        } = setup_team(&server, true).await;
        let (_, pending) = pending_player(&server, &id(&team)).await;
        let response = server
            .post_as(
                "/MemberRemove",
                captain_member["id"].clone(),
                &captain.token,
            )
            .await;
        assert_eq!(response.status, 204);
        assert_eq!(
            MEMBER
                .count(
                    server.db(),
                    Member::TEAM_ID
                        .eq(id(&team))
                        .and_also(Member::CAPTAIN.eq(true)),
                )
                .await
                .unwrap(),
            0
        );
        assert_eq!(get_member(&server, &id(&pending)).await.captain, None);
    }

    #[tokio::test]
    async fn lets_non_captains_remove_only_themselves() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain_member,
            ..
        } = setup_team(&server, true).await;
        let (player, member) = confirmed_player(&server, &admin, &id(&team)).await;
        let (_, teammate) = confirmed_player(&server, &admin, &id(&team)).await;

        let other = server
            .post_as("/MemberRemove", json!(teammate.id), &player.token)
            .await;
        assert_eq!(other.status, 403);
        assert_eq!(other.body["errorCode"], "member.captain_required");
        assert!(maybe_member(&server, &teammate.id).await.is_some());

        let captain_attempt = server
            .post_as("/MemberRemove", captain_member["id"].clone(), &player.token)
            .await;
        assert_eq!(captain_attempt.status, 403);

        let own = server
            .post_as("/MemberRemove", json!(member.id), &player.token)
            .await;
        assert_eq!(own.status, 204);
        assert!(maybe_member(&server, &member.id).await.is_none());
        assert_eq!(
            get_member(&server, &id(&captain_member)).await.captain,
            Some(true)
        );
    }

    #[tokio::test]
    async fn lets_captains_and_admins_remove_members() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            team,
            captain,
            ..
        } = setup_team(&server, true).await;
        let (_, first) = confirmed_player(&server, &admin, &id(&team)).await;
        let (_, second) = pending_player(&server, &id(&team)).await;
        assert_eq!(
            server
                .post_as("/MemberRemove", json!(first.id), &captain.token)
                .await
                .status,
            204
        );
        assert_eq!(
            server
                .post_as("/MemberRemove", second["id"].clone(), &admin.token)
                .await
                .status,
            204
        );
        assert_eq!(
            MEMBER
                .count(server.db(), Member::TEAM_ID.eq(id(&team)))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn ignores_missing_members_and_blocks_other_teams_and_pending_requesters() {
        let server = TestServer::start().await;
        let Setup {
            admin,
            season,
            team,
            ..
        } = setup_team(&server, true).await;
        let missing = server
            .post_as("/MemberRemove", json!(generate_id()), &admin.token)
            .await;
        assert_eq!(missing.status, 204);

        let other_team = create_team(&server, &admin, &id(&season), "Other", json!({})).await;
        let (outsider, _) = confirmed_player(&server, &admin, &id(&other_team)).await;
        let (requester, request) = pending_player(&server, &id(&team)).await;
        let outsider_response = server
            .post_as("/MemberRemove", request["id"].clone(), &outsider.token)
            .await;
        assert_eq!(outsider_response.status, 403);
        assert_eq!(outsider_response.body["errorCode"], "team.access_forbidden");

        // a pending requester cannot withdraw their own request
        let withdraw = server
            .post_as("/MemberRemove", request["id"].clone(), &requester.token)
            .await;
        assert_eq!(withdraw.status, 403);
        assert_eq!(withdraw.body["errorCode"], "auth.team_required");
        assert!(maybe_member(&server, &id(&request)).await.is_some());
    }
}
