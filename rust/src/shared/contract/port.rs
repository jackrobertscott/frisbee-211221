//! Port of `shared/src/endpoints/PortDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_gameday_import_config_safe, io_gameday_import_run, io_season};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;

/// Multipart upload: no JSON payload; fields and the file are read from the body.
pub const PORT_IMPORT: EndpointDef = EndpointDef::new("PortImport", "/PortImport").access(AuthPoint::PortManage).multipart();

io_schema! {
    pub fn port_export_payload() {
        io::object([("fileType", io::enumeration(&["csv", "json"]))])
    }
}
pub const PORT_EXPORT: EndpointDef = EndpointDef::new("PortExport", "/PortExport")
    .access(AuthPoint::PortManage)
    .payload(port_export_payload)
    .result(io::any);

io_schema! {
    pub fn io_port_member_import_summary() {
        io::object([
            ("rowsImported", io::number()),
            ("teamsCreated", io::number()),
            ("usersCreated", io::number()),
            ("membersCreated", io::number()),
            ("note", io::optional(io::string().emptyok())),
        ])
    }
}

io_schema! {
    pub fn port_season_id_payload() {
        io::object([("seasonId", io_season().field("id"))])
    }
}
io_schema! {
    pub fn port_gameday_import_load_result() {
        io::object([
            ("config", io::optional(io_gameday_import_config_safe())),
            ("runs", io::array(io_gameday_import_run())),
        ])
    }
}
pub const PORT_GAMEDAY_IMPORT_LOAD: EndpointDef = EndpointDef::new("PortGamedayImportLoad", "/PortGamedayImportLoad")
    .access(AuthPoint::PortManage)
    .payload(port_season_id_payload)
    .result(port_gameday_import_load_result);

io_schema! {
    pub fn port_gameday_import_save_payload() {
        io::object([
            ("seasonId", io_season().field("id")),
            ("username", io::string().trim()),
            ("password", io::optional(io::string().emptyok())),
            ("association", io::string().trim()),
            ("competition", io::string().trim()),
            ("scheduleEnabled", io::boolean()),
            ("scheduleStartOn", io::optional(io::date())),
            ("scheduleEndOn", io::optional(io::date())),
        ])
    }
}
pub const PORT_GAMEDAY_IMPORT_SAVE: EndpointDef = EndpointDef::new("PortGamedayImportSave", "/PortGamedayImportSave")
    .access(AuthPoint::PortManage)
    .payload(port_gameday_import_save_payload)
    .result(io_gameday_import_config_safe);

pub const PORT_GAMEDAY_IMPORT: EndpointDef = EndpointDef::new("PortGamedayImport", "/PortGamedayImport")
    .access(AuthPoint::PortManage)
    .payload(port_season_id_payload)
    .result(io_port_member_import_summary);

io_schema! {
    pub fn port_mock_generate_payload() {
        io::object([
            ("seasonId", io_season().field("id")),
            ("teams", io::number().integer().min(1.0).max(500.0)),
            ("usersPerTeam", io::number().integer().min(1.0).max(100.0)),
        ])
    }
}
pub const PORT_MOCK_GENERATE: EndpointDef = EndpointDef::new("PortMockGenerate", "/PortMockGenerate")
    .access(AuthPoint::PortManage)
    .payload(port_mock_generate_payload);

pub const PORT_DELETE_ALL_MOCK_DATA: EndpointDef =
    EndpointDef::new("PortDeleteAllMockData", "/PortDeleteAllMockData").access(AuthPoint::PortManage);

pub const DEFS: &[&EndpointDef] = &[
    &PORT_IMPORT,
    &PORT_EXPORT,
    &PORT_GAMEDAY_IMPORT_LOAD,
    &PORT_GAMEDAY_IMPORT_SAVE,
    &PORT_GAMEDAY_IMPORT,
    &PORT_MOCK_GENERATE,
    &PORT_DELETE_ALL_MOCK_DATA,
];
