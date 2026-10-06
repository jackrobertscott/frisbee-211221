//! Port of `shared/src/schemas/ioReport.ts`.

use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_report() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("teamId", io::id()),
            ("teamAgainstId", io::id()),
            ("fixtureId", io::id()),
            ("userId", io::optional(io::id())),
            ("scoreFor", io::number()),
            ("scoreAgainst", io::number()),
            // MVPs
            ("mvpMale", io::optional(io::id())),    // 5 points
            ("mvpMale2", io::optional(io::id())),   // 3 points
            ("mvpFemale", io::optional(io::id())),  // 5 points
            ("mvpFemale2", io::optional(io::id())), // 3 points
            // Spirit
            ("spirit", io::optional(io::number())), // Non-Official version of the Spirit of the Game
            ("spiritComment", io::string().emptyok()),
            ("spiritP1", io::optional(io::number())), // Rules Knowledge and Use
            ("spiritP2", io::optional(io::number())), // Fouls and Body Contact
            ("spiritP3", io::optional(io::number())), // Fair-Mindedness
            ("spiritP4", io::optional(io::number())), // Attitude and Self-Control
            ("spiritP5", io::optional(io::number())), // Communication
        ])
    }
}

/// `TReport`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub team_id: String,
    pub team_against_id: String,
    pub fixture_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    pub score_for: f64,
    pub score_against: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mvp_male: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mvp_male2: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mvp_female: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mvp_female2: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spirit: Option<f64>,
    pub spirit_comment: String,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "spiritP1")]
    pub spirit_p1: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "spiritP2")]
    pub spirit_p2: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "spiritP3")]
    pub spirit_p3: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "spiritP4")]
    pub spirit_p4: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "spiritP5")]
    pub spirit_p5: Option<f64>,
}
