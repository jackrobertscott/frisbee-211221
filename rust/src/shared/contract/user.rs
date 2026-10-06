//! Port of `shared/src/endpoints/UserDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_user, io_user_email, io_user_safe};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::{
    EndpointDef, io_list_limit, io_list_skip, io_sort_direction,
};
use serde::{Deserialize, Serialize};

pub const USER_LIST_SORT_KEYS: [&str; 5] = [
    "firstName",
    "lastName",
    "email",
    "genderMatching",
    "createdOn",
];

/// `TUserListSortKey`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UserListSortKey {
    FirstName,
    LastName,
    Email,
    GenderMatching,
    CreatedOn,
}

io_schema! {
    pub fn user_profile_update_payload() {
        io::object([
            ("firstName", io::optional(io_user().field("firstName"))),
            ("lastName", io::optional(io_user().field("lastName"))),
            ("genderMatching", io::optional(io_user().field("genderMatching"))),
            ("avatarUrl", io_user().field("avatarUrl")),
        ])
    }
}
pub const USER_CURRENT_UPDATE: EndpointDef =
    EndpointDef::new("UserCurrentUpdate", "/UserCurrentUpdate")
        .access(AuthPoint::UserSelf)
        .payload(user_profile_update_payload)
        .result(io_user_safe);

io_schema! {
    pub fn user_email_payload() {
        io::object([("email", io_user_email().field("value"))])
    }
}
pub const USER_CURRENT_EMAIL_ADD: EndpointDef =
    EndpointDef::new("UserCurrentEmailAdd", "/UserCurrentEmailAdd")
        .access(AuthPoint::UserSelf)
        .payload(user_email_payload)
        .result(io_user_safe);

io_schema! {
    pub fn user_current_email_verify_payload() {
        io::object([("email", io_user_email().field("value")), ("code", io_user_email().field("code"))])
    }
}
pub const USER_CURRENT_EMAIL_VERIFY: EndpointDef =
    EndpointDef::new("UserCurrentEmailVerify", "/UserCurrentEmailVerify")
        .access(AuthPoint::UserSelf)
        .payload(user_current_email_verify_payload)
        .result(io_user_safe);

pub const USER_CURRENT_EMAIL_CODE_RESEND: EndpointDef =
    EndpointDef::new("UserCurrentEmailCodeResend", "/UserCurrentEmailCodeResend")
        .access(AuthPoint::UserSelf)
        .payload(user_email_payload)
        .result(io_user_safe);

pub const USER_CURRENT_EMAIL_PRIMARY_SET: EndpointDef =
    EndpointDef::new("UserCurrentEmailPrimarySet", "/UserCurrentEmailPrimarySet")
        .access(AuthPoint::UserSelf)
        .payload(user_email_payload)
        .result(io_user_safe);

pub const USER_CURRENT_EMAIL_REMOVE: EndpointDef =
    EndpointDef::new("UserCurrentEmailRemove", "/UserCurrentEmailRemove")
        .access(AuthPoint::UserSelf)
        .payload(user_email_payload)
        .result(io_user_safe);

io_schema! {
    pub fn user_id_email_payload() {
        io::object([("userId", io_user().field("id")), ("email", io_user_email().field("value"))])
    }
}
pub const USER_EMAIL_ADD: EndpointDef = EndpointDef::new("UserEmailAdd", "/UserEmailAdd")
    .access(AuthPoint::UserManage)
    .payload(user_id_email_payload)
    .result(io_user_safe);

pub const USER_EMAIL_PRIMARY_SET: EndpointDef =
    EndpointDef::new("UserEmailPrimarySet", "/UserEmailPrimarySet")
        .access(AuthPoint::UserManage)
        .payload(user_id_email_payload)
        .result(io_user_safe);

io_schema! {
    pub fn user_email_verified_set_payload() {
        io::object([
            ("userId", io_user().field("id")),
            ("email", io_user_email().field("value")),
            ("verified", io_user_email().field("verified")),
        ])
    }
}
pub const USER_EMAIL_VERIFIED_SET: EndpointDef =
    EndpointDef::new("UserEmailVerifiedSet", "/UserEmailVerifiedSet")
        .access(AuthPoint::UserManage)
        .payload(user_email_verified_set_payload)
        .result(io_user_safe);

pub const USER_EMAIL_REMOVE: EndpointDef = EndpointDef::new("UserEmailRemove", "/UserEmailRemove")
    .access(AuthPoint::UserManage)
    .payload(user_id_email_payload)
    .result(io_user_safe);

io_schema! {
    pub fn user_current_change_password_payload() {
        io::object([("oldPassword", io::string()), ("newPassword", io::string())])
    }
}
pub const USER_CURRENT_CHANGE_PASSWORD: EndpointDef =
    EndpointDef::new("UserCurrentChangePassword", "/UserCurrentChangePassword")
        .access(AuthPoint::UserSelf)
        .payload(user_current_change_password_payload)
        .result(io_user_safe);

io_schema! {
    pub fn user_list_payload() {
        io::object([
            ("search", io::optional(io::string().emptyok())),
            ("sortBy", io::optional(io::enumeration(&USER_LIST_SORT_KEYS))),
            ("sortDirection", io_sort_direction()),
            ("limit", io_list_limit()),
            ("skip", io_list_skip()),
        ])
    }
}
io_schema! {
    pub fn user_list_result() {
        io::object([("count", io::number()), ("users", io::array(io_user_safe()))])
    }
}
pub const USER_LIST: EndpointDef = EndpointDef::new("UserList", "/UserList")
    .access(AuthPoint::UserManage)
    .payload(user_list_payload)
    .result(user_list_result);

io_schema! {
    pub fn user_create_payload() {
        io::object([
            ("email", io_user_email().field("value")),
            ("firstName", io_user().field("firstName")),
            ("lastName", io_user().field("lastName")),
            ("genderMatching", io_user().field("genderMatching")),
            ("termsAccepted", io_user().field("termsAccepted")),
        ])
    }
}
pub const USER_CREATE: EndpointDef = EndpointDef::new("UserCreate", "/UserCreate")
    .access(AuthPoint::UserManage)
    .payload(user_create_payload)
    .result(io_user_safe);

io_schema! {
    pub fn user_update_payload() {
        io::object([
            ("userId", io_user().field("id")),
            ("firstName", io::optional(io_user().field("firstName"))),
            ("lastName", io::optional(io_user().field("lastName"))),
            ("genderMatching", io::optional(io_user().field("genderMatching"))),
            ("avatarUrl", io_user().field("avatarUrl")),
        ])
    }
}
pub const USER_UPDATE: EndpointDef = EndpointDef::new("UserUpdate", "/UserUpdate")
    .access(AuthPoint::UserManage)
    .payload(user_update_payload)
    .result(io_user_safe);

io_schema! {
    pub fn user_id_payload() {
        io::object([("userId", io_user().field("id"))])
    }
}
pub const USER_TOGGLE_ADMIN: EndpointDef = EndpointDef::new("UserToggleAdmin", "/UserToggleAdmin")
    .access(AuthPoint::UserManage)
    .payload(user_id_payload)
    .result(io_user_safe);

io_schema! {
    pub fn user_merge_payload() {
        io::object([("user1Id", io_user().field("id")), ("user2Id", io_user().field("id"))])
    }
}
pub const USER_MERGE: EndpointDef = EndpointDef::new("UserMerge", "/UserMerge")
    .access(AuthPoint::UserManage)
    .payload(user_merge_payload)
    .result(io_user_safe);

io_schema! {
    pub fn user_change_password_payload() {
        io::object([("userId", io_user().field("id")), ("newPassword", io::string())])
    }
}
pub const USER_CHANGE_PASSWORD: EndpointDef =
    EndpointDef::new("UserChangePassword", "/UserChangePassword")
        .access(AuthPoint::UserManage)
        .payload(user_change_password_payload)
        .result(io_user_safe);

pub const DEFS: &[&EndpointDef] = &[
    &USER_CURRENT_UPDATE,
    &USER_CURRENT_EMAIL_ADD,
    &USER_CURRENT_EMAIL_VERIFY,
    &USER_CURRENT_EMAIL_CODE_RESEND,
    &USER_CURRENT_EMAIL_PRIMARY_SET,
    &USER_CURRENT_EMAIL_REMOVE,
    &USER_EMAIL_ADD,
    &USER_EMAIL_PRIMARY_SET,
    &USER_EMAIL_VERIFIED_SET,
    &USER_EMAIL_REMOVE,
    &USER_CURRENT_CHANGE_PASSWORD,
    &USER_LIST,
    &USER_CREATE,
    &USER_UPDATE,
    &USER_TOGGLE_ADMIN,
    &USER_MERGE,
    &USER_CHANGE_PASSWORD,
];
