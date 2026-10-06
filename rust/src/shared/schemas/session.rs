//! Port of `shared/src/schemas/ioSession.ts`.

use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_session() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("expiresOn", io::date()),
            ("token", io::string()),
            ("userId", io::id()),
            ("ended", io::optional(io::boolean())),
            ("endedOn", io::optional(io::date())),
            ("userAgent", io::optional(io::string())),
        ])
    }
}

/// `TSession`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub expires_on: String,
    pub token: String,
    pub user_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
}
