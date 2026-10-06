//! Port of `shared/src/schemas/ioMember.ts`.

use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_member() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("userId", io::id()),
            ("seasonId", io::id()),
            ("teamId", io::id()),
            ("isMock", io::optional(io::boolean())), // for testing purposes
            ("captain", io::optional(io::boolean())),
            ("pending", io::boolean()),
        ])
    }
}

/// `TMember`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub user_id: String,
    pub season_id: String,
    pub team_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_mock: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub captain: Option<bool>,
    pub pending: bool,
}
