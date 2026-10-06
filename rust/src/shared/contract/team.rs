//! Port of `shared/src/endpoints/TeamDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_member, io_team};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;
use serde::{Deserialize, Serialize};

pub const TEAM_LIST_SORT_KEYS: [&str; 5] = ["name", "division", "phone", "email", "createdOn"];

/// `TTeamListSortKey`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TeamListSortKey {
    Name,
    Division,
    Phone,
    Email,
    CreatedOn,
}

io_schema! {
    pub fn team_current_create_payload() {
        io_team().pick(&["seasonId", "name", "color"])
    }
}
io_schema! {
    pub fn team_current_create_result() {
        io::object([("team", io_team()), ("member", io_member())])
    }
}
pub const TEAM_CURRENT_CREATE: EndpointDef =
    EndpointDef::new("TeamCurrentCreate", "/TeamCurrentCreate")
        .access(AuthPoint::TeamJoin)
        .payload(team_current_create_payload)
        .result(team_current_create_result);

io_schema! {
    pub fn team_current_update_payload() {
        io_team().pick(&["name", "color", "phone", "email"]).extend([("teamId", io_team().field("id"))])
    }
}
pub const TEAM_CURRENT_UPDATE: EndpointDef =
    EndpointDef::new("TeamCurrentUpdate", "/TeamCurrentUpdate")
        .access(AuthPoint::TeamManage)
        .payload(team_current_update_payload)
        .result(io_team);

io_schema! {
    pub fn team_create_payload() {
        io_team().pick(&["seasonId", "name", "color", "phone", "email", "division"])
    }
}
pub const TEAM_CREATE: EndpointDef = EndpointDef::new("TeamCreate", "/TeamCreate")
    .access(AuthPoint::TeamDirectoryManage)
    .payload(team_create_payload)
    .result(io_team);

io_schema! {
    pub fn team_update_payload() {
        io_team().pick(&["name", "color", "phone", "email", "division"]).extend([("teamId", io_team().field("id"))])
    }
}
pub const TEAM_UPDATE: EndpointDef = EndpointDef::new("TeamUpdate", "/TeamUpdate")
    .access(AuthPoint::TeamDirectoryManage)
    .payload(team_update_payload)
    .result(io_team);

io_schema! {
    pub fn team_delete_payload() {
        io::object([("teamId", io_team().field("id"))])
    }
}
pub const TEAM_DELETE: EndpointDef = EndpointDef::new("TeamDelete", "/TeamDelete")
    .access(AuthPoint::TeamDirectoryManage)
    .payload(team_delete_payload);

pub const DEFS: &[&EndpointDef] = &[
    &TEAM_CURRENT_CREATE,
    &TEAM_CURRENT_UPDATE,
    &TEAM_CREATE,
    &TEAM_UPDATE,
    &TEAM_DELETE,
];
