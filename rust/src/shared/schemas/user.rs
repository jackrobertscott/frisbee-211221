//! Port of `shared/src/schemas/ioUser.ts`.

use super::user_gender_matching::{GenderMatching, io_user_gender_matching};
use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_user_email() {
        io::object([
            ("value", io::string().email().trim()),
            ("verified", io::boolean()),
            ("code", io::string()),
            ("createdOn", io::date()),
            ("primary", io::boolean()),
        ])
    }
}

io_schema! {
    pub fn io_user_email_safe() {
        io_user_email().pick(&["value", "verified", "createdOn", "primary"])
    }
}

io_schema! {
    pub fn io_user() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("userMergedIds", io::optional(io::array(io::id()))),
            ("admin", io::optional(io::boolean())),
            ("isMock", io::optional(io::boolean())), // for testing purposes
            ("firstName", io::string()),
            ("lastName", io::string()),
            ("genderMatching", io_user_gender_matching()),
            ("password", io::optional(io::string())),
            // this array may be empty for some old users that were imported without an email
            ("emails", io::array(io_user_email())),
            ("avatarUrl", io::optional(io::string().trim())),
            ("bio", io::optional(io::string().trim())),
            ("termsAccepted", io::boolean()),
            ("lastSeasonId", io::optional(io::id())),
        ])
    }
}

io_schema! {
    pub fn io_user_safe() {
        io_user().omit(&["password", "emails"]).extend([("emails", io::array(io_user_email_safe()))])
    }
}

io_schema! {
    pub fn io_user_public() {
        io_user().pick(&["id", "createdOn", "updatedOn", "firstName", "lastName", "genderMatching", "avatarUrl"])
    }
}

/// `TUserEmail`: `code` holds the HMAC digest of the current security code.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEmail {
    pub value: String,
    pub verified: bool,
    pub code: String,
    pub created_on: String,
    pub primary: bool,
}

/// `TUserEmailSafe`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEmailSafe {
    pub value: String,
    pub verified: bool,
    pub created_on: String,
    pub primary: bool,
}

/// `TUser`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_merged_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub admin: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_mock: Option<bool>,
    pub first_name: String,
    pub last_name: String,
    pub gender_matching: GenderMatching,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    pub emails: Vec<UserEmail>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    pub terms_accepted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_season_id: Option<String>,
}

/// `TUserSafe`: the user without the password or email codes.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSafe {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_merged_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub admin: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_mock: Option<bool>,
    pub first_name: String,
    pub last_name: String,
    pub gender_matching: GenderMatching,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    pub terms_accepted: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_season_id: Option<String>,
    pub emails: Vec<UserEmailSafe>,
}

/// `TUserPublic`: what any signed-in user may see about another user.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPublic {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub first_name: String,
    pub last_name: String,
    pub gender_matching: GenderMatching,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}
