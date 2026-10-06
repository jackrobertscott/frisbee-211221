//! Port of `server/src/services/teamCaptaincy.ts`.

use crate::auth::require::require_team;
use crate::db::Db;
use crate::shared::errors::{AppResult, ErrorOptions, forbidden_error};
use crate::shared::schemas::{Member, User};

/// `requireCaptainOrAdmin(user, teamId, message, allowMember)`: admins pass
/// straight through. Anyone else must be an active member of the team and
/// its captain (or satisfy `allow_member`), otherwise this fails with a
/// `member.captain_required` error carrying `message`.
pub async fn require_captain_or_admin(
    db: &Db,
    user: &User,
    team_id: &str,
    message: &str,
    allow_member: Option<&(dyn Fn(&Member) -> bool + Send + Sync)>,
) -> AppResult<()> {
    if user.admin == Some(true) {
        return Ok(());
    }
    let (_, member) = require_team(db, &user.id, team_id).await?;
    if member.captain == Some(true) || allow_member.is_some_and(|allow| allow(&member)) {
        return Ok(());
    }
    Err(forbidden_error(
        message,
        ErrorOptions::code("member.captain_required"),
    ))
}
