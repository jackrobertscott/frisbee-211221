//! Port of `shared/src/endpoints/SecurityDef.ts`.

use crate::io_schema;
use crate::shared::schemas::{
    io_season, io_session, io_team, io_user, io_user_email, io_user_safe,
};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;

io_schema! {
    /// Auth payload shared between endpoints.
    pub fn io_auth_payload() {
        io::object([
            ("user", io_user_safe()),
            ("session", io_session()),
            ("season", io::optional(io_season())),
            ("team", io::optional(io_team())),
        ])
    }
}

io_schema! {
    pub fn security_current_payload() {
        io::object([("seasonId", io::optional(io_season().field("id")))])
    }
}
io_schema! {
    pub fn security_current_result() {
        io::object([("season", io_season()), ("auth", io::optional(io_auth_payload()))])
    }
}
pub const SECURITY_CURRENT: EndpointDef = EndpointDef::new("SecurityCurrent", "/SecurityCurrent")
    .payload(security_current_payload)
    .result(security_current_result);

io_schema! {
    pub fn security_status_payload() {
        io::object([("email", io_user_email().field("value"))])
    }
}
io_schema! {
    pub fn security_status_result() {
        io::object([
            ("status", io::enumeration(&["unknown", "password", "unverified", "good"])),
            ("email", io_user_email().field("value")),
            ("firstName", io::optional(io_user().field("firstName"))),
        ])
    }
}
pub const SECURITY_STATUS: EndpointDef = EndpointDef::new("SecurityStatus", "/SecurityStatus")
    .payload(security_status_payload)
    .result(security_status_result);

io_schema! {
    pub fn security_login_payload() {
        io::object([
            ("seasonId", io::optional(io_season().field("id"))),
            ("email", io_user_email().field("value")),
            ("password", io::string()),
            ("userAgent", io_session().field("userAgent")),
        ])
    }
}
pub const SECURITY_LOGIN: EndpointDef = EndpointDef::new("SecurityLogin", "/SecurityLogin")
    .payload(security_login_payload)
    .result(io_auth_payload);

io_schema! {
    pub fn security_sign_up_payload() {
        io::object([
            ("seasonId", io::optional(io_season().field("id"))),
            ("email", io_user_email().field("value")),
            ("firstName", io_user().field("firstName")),
            ("lastName", io_user().field("lastName")),
            ("genderMatching", io_user().field("genderMatching")),
            ("termsAccepted", io_user().field("termsAccepted")),
            ("userAgent", io_session().field("userAgent")),
        ])
    }
}
pub const SECURITY_SIGN_UP: EndpointDef = EndpointDef::new("SecuritySignUp", "/SecuritySignUp")
    .payload(security_sign_up_payload)
    .result(io_auth_payload);

io_schema! {
    /// A bare email string.
    pub fn security_forgot_payload() {
        io_user_email().field("value")
    }
}
pub const SECURITY_FORGOT: EndpointDef =
    EndpointDef::new("SecurityForgot", "/SecurityForgot").payload(security_forgot_payload);

io_schema! {
    pub fn security_verify_payload() {
        io::object([
            ("seasonId", io::optional(io_season().field("id"))),
            ("email", io_user_email().field("value")),
            ("code", io_user_email().field("code")),
            ("newPassword", io::string()),
            ("userAgent", io_session().field("userAgent")),
        ])
    }
}
pub const SECURITY_VERIFY: EndpointDef = EndpointDef::new("SecurityVerify", "/SecurityVerify")
    .payload(security_verify_payload)
    .result(io_auth_payload);

pub const SECURITY_LOGOUT: EndpointDef = EndpointDef::new("SecurityLogout", "/SecurityLogout");

pub const DEFS: &[&EndpointDef] = &[
    &SECURITY_CURRENT,
    &SECURITY_STATUS,
    &SECURITY_LOGIN,
    &SECURITY_SIGN_UP,
    &SECURITY_FORGOT,
    &SECURITY_VERIFY,
    &SECURITY_LOGOUT,
];
