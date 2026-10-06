//! Port of `server/src/services/authPayload.ts`.

use crate::db::{Db, Patch};
use crate::services::user_fields::select_safe_user_fields;
use crate::shared::errors::AppResult;
use crate::shared::schemas::{Member, Season, Session, Team, User, UserSafe};
use crate::tables::{MEMBER, SEASON, TEAM, USER};
use serde::Serialize;

/// `TAuthPayload`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPayload {
    pub user: UserSafe,
    pub session: Session,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team: Option<Team>,
}

/// `buildAuthPayload(user, session, seasonId)`: the signed-in user's session
/// payload. With a season it also includes the user's confirmed team in that
/// season and records it as their last season.
pub async fn build_auth_payload(
    db: &Db,
    raw_user: User,
    session: Session,
    season_id: Option<&str>,
) -> AppResult<AuthPayload> {
    let mut user = raw_user;
    let mut team = None;
    if let Some(season_id) = season_id.filter(|id| !id.is_empty()) {
        let season = SEASON.get_one(db, Season::ID.eq(season_id)).await?;
        let member = MEMBER
            .maybe_one(
                db,
                Member::USER_ID
                    .eq(&user.id)
                    .and_also(Member::SEASON_ID.eq(season_id))
                    .and_also(Member::PENDING.eq(false)),
            )
            .await?;
        if let Some(member) = member {
            team = Some(TEAM.get_one(db, Team::ID.eq(&member.team_id)).await?);
        }
        if user.last_season_id.as_deref() != Some(season.id.as_str()) {
            user = USER
                .update_one(
                    db,
                    User::ID.eq(&user.id),
                    Patch::new().set(User::LAST_SEASON_ID, season.id),
                )
                .await?;
        }
    }
    Ok(AuthPayload {
        user: select_safe_user_fields(&user),
        session,
        team,
    })
}
