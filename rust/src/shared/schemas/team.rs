//! Port of `shared/src/schemas/ioTeam.ts`.

use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_team() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("seasonId", io::id()),
            ("isMock", io::optional(io::boolean())), // for testing purposes
            ("name", io::string()),
            ("color", io::color()),
            ("division", io::optional(io::number())),
            ("phone", io::optional(io::string().trim().emptyok())),
            ("email", io::optional(io::string().trim().email().emptyok())),
        ])
    }
}

/// `TTeam`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub season_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_mock: Option<bool>,
    pub name: String,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub division: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}
