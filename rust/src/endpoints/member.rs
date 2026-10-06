//! Port of `server/src/endpoints/Member.ts` — endpoints for
//! `shared/src/endpoints/MemberDef.ts` (`crate::shared::contract::member`).

use crate::auth::require::require_team;
use crate::db::{Patch, Query};
use crate::http::endpoint::{Ctx, Endpoint};
use crate::js;
use crate::services::team_captaincy::require_captain_or_admin;
use crate::services::user_email;
use crate::services::user_fields::select_public_user_fields;
use crate::shared::contract::member::{
    MEMBER_ACCEPT_OR_DECLINE, MEMBER_CREATE, MEMBER_LIST_OF_TEAM, MEMBER_LOOKUP_BY_EMAIL,
    MEMBER_REMOVE, MEMBER_REQUEST_CREATE, MEMBER_SET_CAPTAIN,
};
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error, conflict_error};
use crate::shared::schemas::{GenderMatching, Member, Team, User, UserPublic};
use crate::tables::{MEMBER, TEAM, USER};
use serde::{Deserialize, Serialize};
use serde_json::json;

const ADD_MEMBERS_MESSAGE: &str = "Failed: only the team captain can add members.";

#[derive(Serialize)]
struct ListOfTeamResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    current: Option<Member>,
    members: Vec<Member>,
    users: Vec<UserPublic>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LookupPayload {
    team_id: String,
    email: String,
}

#[derive(Serialize)]
struct LookupResult {
    exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<UserPublic>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePayload {
    team_id: String,
    email: String,
    first_name: Option<String>,
    last_name: Option<String>,
    gender_matching: Option<GenderMatching>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcceptOrDeclinePayload {
    member_id: String,
    accept: bool,
}

async fn list_of_team(team_id: String, ctx: Ctx) -> AppResult<ListOfTeamResult> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let current = if user.admin != Some(true) {
        Some(require_team(db, &user.id, &team_id).await?.1)
    } else {
        MEMBER
            .maybe_one(
                db,
                Member::USER_ID
                    .eq(&user.id)
                    .and_also(Member::TEAM_ID.eq(&team_id)),
            )
            .await?
    };
    // pending and non-pending
    let members = MEMBER
        .get_many(db, Member::TEAM_ID.eq(&team_id), Query::new())
        .await?;
    let user_ids: Vec<String> = members.iter().map(|m| m.user_id.clone()).collect();
    let users = USER
        .get_many(db, User::ID.is_in(user_ids), Query::new())
        .await?;
    Ok(ListOfTeamResult {
        current,
        members,
        users: users.iter().map(select_public_user_fields).collect(),
    })
}

async fn lookup_by_email(payload: LookupPayload, ctx: Ctx) -> AppResult<LookupResult> {
    let (current, _) = ctx.require_access().await?;
    require_captain_or_admin(ctx.db(), &current, &payload.team_id, ADD_MEMBERS_MESSAGE, None)
        .await?;
    let user = user_email::maybe_user(ctx.db(), &payload.email).await?;
    Ok(LookupResult {
        exists: user.is_some(),
        user: user.as_ref().map(select_public_user_fields),
    })
}

async fn create(payload: CreatePayload, ctx: Ctx) -> AppResult<Member> {
    let (current, _) = ctx.require_access().await?;
    let db = ctx.db();
    require_captain_or_admin(db, &current, &payload.team_id, ADD_MEMBERS_MESSAGE, None).await?;
    let team = TEAM.get_one(db, Team::ID.eq(&payload.team_id)).await?;
    let user = match user_email::maybe_user(db, &payload.email).await? {
        Some(user) => user,
        None => {
            let first_name = payload.first_name.filter(|v| !js::trim(v).is_empty());
            let last_name = payload.last_name.filter(|v| !js::trim(v).is_empty());
            let (Some(first_name), Some(last_name), Some(gender_matching)) =
                (first_name, last_name, payload.gender_matching)
            else {
                return Err(bad_request_error(
                    "First name, last name, and gender matching are required for a new user.",
                    ErrorOptions::code("member.user_details_required"),
                ));
            };
            let emails = [user_email::create(
                &ctx.config().jwt_secret,
                &payload.email,
                true,
                None,
            )?];
            USER.create_one(
                db,
                json!({
                    "firstName": first_name,
                    "lastName": last_name,
                    "genderMatching": gender_matching,
                    "termsAccepted": false,
                    "emails": emails,
                }),
            )
            .await?
        }
    };
    let member = MEMBER
        .maybe_one(
            db,
            Member::USER_ID
                .eq(&user.id)
                .and_also(Member::SEASON_ID.eq(&team.season_id)),
        )
        .await?;
    if let Some(member) = member {
        if member.team_id != team.id {
            return Err(conflict_error(
                "User is already a member of another team.",
                ErrorOptions::code("member.already_on_other_team"),
            ));
        }
        return MEMBER
            .update_one(
                db,
                Member::ID.eq(&member.id),
                Patch::new()
                    .set(Member::PENDING, false)
                    .set(Member::UPDATED_ON, js::date::now_iso()),
            )
            .await;
    }
    MEMBER
        .create_one(
            db,
            json!({
                "userId": user.id,
                "seasonId": team.season_id,
                "teamId": team.id,
                "pending": false,
            }),
        )
        .await
}

async fn remove(member_id: String, ctx: Ctx) -> AppResult<()> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let Some(member_delete) = MEMBER.maybe_one(db, Member::ID.eq(&member_id)).await? else {
        return Ok(());
    };
    let delete_id = member_delete.id.clone();
    // members may leave
    let is_self = move |member: &Member| member.id == delete_id;
    require_captain_or_admin(
        db,
        &user,
        &member_delete.team_id,
        "Failed: only the team captain can delete members.",
        Some(&is_self),
    )
    .await?;
    if member_delete.captain == Some(true) {
        let successor = MEMBER
            .maybe_one_sorted(
                db,
                Member::PENDING
                    .eq(false)
                    .and_also(Member::TEAM_ID.eq(&member_delete.team_id))
                    .and_also(Member::ID.ne(&member_delete.id)),
                Query::new().sort([Member::CREATED_ON.asc()]),
            )
            .await?;
        if let Some(successor) = successor {
            MEMBER
                .update_one(
                    db,
                    Member::ID.eq(&successor.id),
                    Patch::new().set(Member::CAPTAIN, true),
                )
                .await?;
        }
    }
    MEMBER.delete_one(db, Member::ID.eq(&member_id)).await?;
    Ok(())
}

async fn request_create(team_id: String, ctx: Ctx) -> AppResult<Member> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let team = TEAM.get_one(db, Team::ID.eq(&team_id)).await?;
    let member = MEMBER
        .maybe_one(
            db,
            Member::USER_ID
                .eq(&user.id)
                .and_also(Member::TEAM_ID.eq(&team.id)),
        )
        .await?;
    if member.is_some() {
        return Err(conflict_error(
            "You have already requested membership to this team.",
            ErrorOptions::code("member.request_exists"),
        ));
    }
    let elsewhere = MEMBER
        .count(
            db,
            Member::USER_ID
                .eq(&user.id)
                .and_also(Member::SEASON_ID.eq(&team.season_id)),
        )
        .await?;
    if elsewhere > 0 {
        return Err(conflict_error(
            "You have already requested membership to another team.",
            ErrorOptions::code("member.request_exists"),
        ));
    }
    MEMBER
        .create_one(
            db,
            json!({
                "seasonId": team.season_id,
                "teamId": team.id,
                "userId": user.id,
                "pending": true,
            }),
        )
        .await
}

async fn accept_or_decline(payload: AcceptOrDeclinePayload, ctx: Ctx) -> AppResult<()> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let member = MEMBER.get_one(db, Member::ID.eq(&payload.member_id)).await?;
    require_captain_or_admin(
        db,
        &user,
        &member.team_id,
        "Failed: only the team captain can accept or deny members.",
        None,
    )
    .await?;
    if payload.accept {
        MEMBER
            .update_one(
                db,
                Member::ID.eq(&member.id),
                Patch::new().set(Member::PENDING, false),
            )
            .await?;
    } else {
        MEMBER.delete_one(db, Member::ID.eq(&member.id)).await?;
    }
    Ok(())
}

async fn set_captain(member_id: String, ctx: Ctx) -> AppResult<Member> {
    let (user, _) = ctx.require_access().await?;
    let db = ctx.db();
    let member = MEMBER.get_one(db, Member::ID.eq(&member_id)).await?;
    if member.captain == Some(true) {
        return Err(conflict_error(
            "This member is already the captain of the team.",
            ErrorOptions::code("member.already_captain"),
        ));
    }
    require_captain_or_admin(
        db,
        &user,
        &member.team_id,
        "Failed: only the team captain can perform this action.",
        None,
    )
    .await?;
    // the team may have no captain yet (ignore a missing one)
    let _ = MEMBER
        .update_one(
            db,
            Member::TEAM_ID
                .eq(&member.team_id)
                .and_also(Member::CAPTAIN.eq(true)),
            Patch::new().set(Member::CAPTAIN, false),
        )
        .await;
    MEMBER
        .update_one(
            db,
            Member::ID.eq(&member.id),
            Patch::new()
                .set(Member::CAPTAIN, true)
                .set(Member::PENDING, false),
        )
        .await
}

/// The Member endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&MEMBER_LIST_OF_TEAM, list_of_team),
        Endpoint::new(&MEMBER_LOOKUP_BY_EMAIL, lookup_by_email),
        Endpoint::new(&MEMBER_CREATE, create),
        Endpoint::new(&MEMBER_REMOVE, remove),
        Endpoint::new(&MEMBER_REQUEST_CREATE, request_create),
        Endpoint::new(&MEMBER_ACCEPT_OR_DECLINE, accept_or_decline),
        Endpoint::new(&MEMBER_SET_CAPTAIN, set_captain),
    ]
}
