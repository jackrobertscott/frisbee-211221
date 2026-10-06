//! Port of `shared/src/endpoints/MemberDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_member, io_user, io_user_email, io_user_public};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;

io_schema! {
    /// A bare team id (the payload is the id string itself).
    pub fn member_team_id_payload() {
        io_member().field("teamId")
    }
}
io_schema! {
    /// A bare member id (the payload is the id string itself).
    pub fn member_id_payload() {
        io_member().field("id")
    }
}

io_schema! {
    pub fn member_list_of_team_result() {
        io::object([
            ("current", io::optional(io_member())),
            ("members", io::array(io_member())),
            ("users", io::array(io_user_public())),
        ])
    }
}
pub const MEMBER_LIST_OF_TEAM: EndpointDef = EndpointDef::new("MemberListOfTeam", "/MemberListOfTeam")
    .access(AuthPoint::MemberRead)
    .payload(member_team_id_payload)
    .result(member_list_of_team_result);

io_schema! {
    pub fn member_create_payload() {
        io::object([
            ("teamId", io_member().field("teamId")),
            ("email", io_user_email().field("value")),
            ("firstName", io::optional(io_user().field("firstName"))),
            ("lastName", io::optional(io_user().field("lastName"))),
            ("genderMatching", io::optional(io_user().field("genderMatching"))),
        ])
    }
}
pub const MEMBER_CREATE: EndpointDef = EndpointDef::new("MemberCreate", "/MemberCreate")
    .access(AuthPoint::MemberManage)
    .payload(member_create_payload)
    .result(io_member);

io_schema! {
    pub fn member_lookup_by_email_payload() {
        io::object([("teamId", io_member().field("teamId")), ("email", io_user_email().field("value"))])
    }
}
io_schema! {
    pub fn member_lookup_by_email_result() {
        io::object([("exists", io::boolean()), ("user", io::optional(io_user_public()))])
    }
}
pub const MEMBER_LOOKUP_BY_EMAIL: EndpointDef = EndpointDef::new("MemberLookupByEmail", "/MemberLookupByEmail")
    .access(AuthPoint::MemberManage)
    .payload(member_lookup_by_email_payload)
    .result(member_lookup_by_email_result);

pub const MEMBER_REMOVE: EndpointDef =
    EndpointDef::new("MemberRemove", "/MemberRemove").access(AuthPoint::MemberManage).payload(member_id_payload);

pub const MEMBER_REQUEST_CREATE: EndpointDef = EndpointDef::new("MemberRequestCreate", "/MemberRequestCreate")
    .access(AuthPoint::TeamJoin)
    .payload(member_team_id_payload)
    .result(io_member);

io_schema! {
    pub fn member_accept_or_decline_payload() {
        io::object([("memberId", io_member().field("id")), ("accept", io::boolean())])
    }
}
pub const MEMBER_ACCEPT_OR_DECLINE: EndpointDef = EndpointDef::new("MemberAcceptOrDecline", "/MemberAcceptOrDecline")
    .access(AuthPoint::MemberManage)
    .payload(member_accept_or_decline_payload);

pub const MEMBER_SET_CAPTAIN: EndpointDef = EndpointDef::new("MemberSetCaptain", "/MemberSetCaptain")
    .access(AuthPoint::MemberManage)
    .payload(member_id_payload)
    .result(io_member);

pub const DEFS: &[&EndpointDef] = &[
    &MEMBER_LIST_OF_TEAM,
    &MEMBER_CREATE,
    &MEMBER_LOOKUP_BY_EMAIL,
    &MEMBER_REMOVE,
    &MEMBER_REQUEST_CREATE,
    &MEMBER_ACCEPT_OR_DECLINE,
    &MEMBER_SET_CAPTAIN,
];
