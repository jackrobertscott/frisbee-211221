//! Port of `shared/src/endpoints/SeasonDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::io_season;
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;

io_schema! {
    pub fn season_list_payload() {
        io::object([("search", io::optional(io::string().emptyok()))])
    }
}
io_schema! {
    pub fn season_list_result() {
        io::array(io_season())
    }
}
pub const SEASON_LIST: EndpointDef = EndpointDef::new("SeasonList", "/SeasonList")
    .payload(season_list_payload)
    .result(season_list_result);

io_schema! {
    pub fn season_create_payload() {
        io_season()
            .pick(&["name", "useOfficialScoring", "genderDivision"])
            .extend([("signUpOpen", io::optional(io_season().field("signUpOpen")))])
    }
}
pub const SEASON_CREATE: EndpointDef = EndpointDef::new("SeasonCreate", "/SeasonCreate")
    .access(AuthPoint::SeasonManage)
    .payload(season_create_payload)
    .result(io_season);

io_schema! {
    pub fn season_update_payload() {
        io_season()
            .pick(&["name", "isHidden", "signUpOpen", "genderDivision", "finalResults"])
            .extend([("seasonId", io_season().field("id"))])
    }
}
pub const SEASON_UPDATE: EndpointDef = EndpointDef::new("SeasonUpdate", "/SeasonUpdate")
    .access(AuthPoint::SeasonManage)
    .payload(season_update_payload)
    .result(io_season);

io_schema! {
    pub fn season_id_payload() {
        io::object([("seasonId", io_season().field("id"))])
    }
}
io_schema! {
    pub fn season_delete_status_result() {
        io::object([("canDelete", io::boolean())])
    }
}
pub const SEASON_DELETE_STATUS: EndpointDef =
    EndpointDef::new("SeasonDeleteStatus", "/SeasonDeleteStatus")
        .access(AuthPoint::SeasonManage)
        .payload(season_id_payload)
        .result(season_delete_status_result);

io_schema! {
    pub fn season_delete_payload() {
        io::object([("seasonId", io_season().field("id")), ("password", io::string())])
    }
}
pub const SEASON_DELETE: EndpointDef = EndpointDef::new("SeasonDelete", "/SeasonDelete")
    .access(AuthPoint::SeasonManage)
    .payload(season_delete_payload);

pub const DEFS: &[&EndpointDef] = &[
    &SEASON_LIST,
    &SEASON_CREATE,
    &SEASON_UPDATE,
    &SEASON_DELETE_STATUS,
    &SEASON_DELETE,
];
