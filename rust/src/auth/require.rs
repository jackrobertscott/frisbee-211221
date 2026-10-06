//! Ports of `server/src/auth/requireUser.ts`, `requireAccess.ts` and
//! `requireTeam.ts`.

use super::sessions::{digest_request, is_session_valid, token_from_request};
use crate::db::Db;
use crate::http::endpoint::Ctx;
use crate::shared::auth_access::AuthPoint;
use crate::shared::errors::{forbidden_error, unauthorized_error, AppResult, ErrorOptions};
use crate::shared::schemas::{Member, Session, Team, User};
use crate::tables::{MEMBER, SESSION, TEAM, USER};

/// `requireUser(req)`: the signed-in user and session, or 401.
pub async fn require_user(ctx: &Ctx) -> AppResult<(User, Session)> {
    let Some(auth) = digest_request(&ctx.headers, &ctx.config().jwt_secret) else {
        if token_from_request(&ctx.headers).is_some() {
            return Err(unauthorized_error("Auth token is not valid.", ErrorOptions::code("auth.token_invalid")));
        }
        return Err(unauthorized_error("Auth token not present on request.", ErrorOptions::code("auth.token_missing")));
    };
    let db = ctx.db();
    let (user, session) = tokio::try_join!(
        USER.maybe_one(db, User::ID.eq(&auth.user_id)),
        SESSION.maybe_one(db, Session::ID.eq(&auth.session_id)),
    )?;
    match (user, session) {
        (Some(user), Some(session)) if is_session_valid(Some(&auth), Some(&session), crate::js::date::now_ms()) => {
            Ok((user, session))
        }
        _ => Err(unauthorized_error("Auth token is not valid.", ErrorOptions::code("auth.token_invalid"))),
    }
}

/// `requireAccess(req, point)`: `requireUser` plus the point's admin/team rule.
pub async fn require_access(ctx: &Ctx, point: AuthPoint) -> AppResult<(User, Session)> {
    let (user, session) = require_user(ctx).await?;
    let rule = point.rule();
    let is_admin = user.admin == Some(true);
    if rule.admin && !is_admin {
        return Err(forbidden_error("Failed because user is not an admin.", ErrorOptions::code("auth.admin_required")));
    }
    if rule.team && !is_admin {
        let member = MEMBER
            .maybe_one(ctx.db(), Member::USER_ID.eq(&user.id).and_also(Member::PENDING.eq(false)))
            .await?;
        if member.is_none() {
            return Err(forbidden_error("Failed because user is not on a team.", ErrorOptions::code("auth.team_required")));
        }
    }
    Ok((user, session))
}

/// `requireTeam(user, teamId)`: the team and the user's confirmed membership.
pub async fn require_team(db: &Db, user_id: &str, team_id: &str) -> AppResult<(Team, Member)> {
    let team = TEAM.get_one(db, Team::ID.eq(team_id)).await?;
    let member = MEMBER
        .maybe_one(
            db,
            Member::TEAM_ID.eq(&team.id).and_also(Member::USER_ID.eq(user_id)).and_also(Member::PENDING.eq(false)),
        )
        .await?;
    match member {
        Some(member) => Ok((team, member)),
        None => Err(forbidden_error(
            "User does not have sufficient access privileges.",
            ErrorOptions::code("team.access_forbidden"),
        )),
    }
}
