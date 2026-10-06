//! Port of `server/src/services`. Shared services live here; domain agents
//! add their own modules (one per TS service file).

pub mod auth_payload;
pub mod season_deletion;
pub mod team_captaincy;
pub mod user_email;
pub mod user_fields;
