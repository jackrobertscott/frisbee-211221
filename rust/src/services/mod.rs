//! Port of `server/src/services`. Shared services live here; domain agents
//! add their own modules (one per TS service file).

pub mod auth_payload;
pub mod fixture_schedule;
pub mod missing_reports;
pub mod report_mvps;
pub mod round_robin;
pub mod season_deletion;
pub mod spirit_stats;
pub mod team_captaincy;
pub mod user_email;
pub mod user_fields;
