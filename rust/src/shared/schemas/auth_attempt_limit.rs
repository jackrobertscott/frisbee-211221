//! Port of `shared/src/schemas/ioAuthAttemptLimit.ts`.

use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttemptKind {
    Login,
    Verify,
    Delivery,
}

impl AttemptKind {
    pub fn as_str(self) -> &'static str {
        match self {
            AttemptKind::Login => "login",
            AttemptKind::Verify => "verify",
            AttemptKind::Delivery => "delivery",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttemptScope {
    Account,
    Client,
}

impl AttemptScope {
    pub fn as_str(self) -> &'static str {
        match self {
            AttemptScope::Account => "account",
            AttemptScope::Client => "client",
        }
    }
}

io_schema! {
    pub fn io_auth_attempt_limit() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("kind", io::enumeration(&["login", "verify", "delivery"])),
            ("scope", io::enumeration(&["account", "client"])),
            ("email", io::string().email().trim()),
            ("ip", io::optional(io::string().trim())),
            ("attempts", io::number().integer().min(0.0)),
            ("windowStartedAt", io::timestamp()),
            ("blockedUntil", io::timestamp()),
            ("lastSeenAt", io::timestamp()),
        ])
    }
}

/// `TAuthAttemptLimit`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthAttemptLimit {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub kind: AttemptKind,
    pub scope: AttemptScope,
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    pub attempts: i64,
    pub window_started_at: i64,
    pub blocked_until: i64,
    pub last_seen_at: i64,
}
