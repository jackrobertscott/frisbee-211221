//! Port of `shared/src/endpoints/ReportDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_fixture, io_report, io_team};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_report_search_row() {
        io::object([
            ("report", io_report()),
            ("fixtureTitle", io_fixture().field("title")),
            ("teamName", io_team().field("name")),
            ("teamColor", io::optional(io_team().field("color"))),
            ("againstName", io_team().field("name")),
            ("againstColor", io::optional(io_team().field("color"))),
            ("submitterName", io::string()),
        ])
    }
}

/// `TReportSearchRow`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSearchRow {
    pub report: crate::shared::schemas::Report,
    pub fixture_title: String,
    pub team_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_color: Option<String>,
    pub against_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub against_color: Option<String>,
    pub submitter_name: String,
}

io_schema! {
    pub fn report_create_payload() {
        io_report().pick(&[
            "teamId",
            "teamAgainstId",
            "fixtureId",
            "scoreFor",
            "scoreAgainst",
            "mvpMale",
            "mvpFemale",
            "mvpMale2",
            "mvpFemale2",
            "spirit",
            "spiritComment",
            "spiritP1",
            "spiritP2",
            "spiritP3",
            "spiritP4",
            "spiritP5",
        ])
    }
}
pub const REPORT_CREATE: EndpointDef = EndpointDef::new("ReportCreate", "/ReportCreate")
    .access(AuthPoint::ReportWrite)
    .payload(report_create_payload)
    .result(io_report);

io_schema! {
    /// An MVP pick in an update: omitted keeps the stored pick, null clears it.
    pub fn io_report_mvp_update() {
        io::optional(io::null(io::id()))
    }
}

io_schema! {
    pub fn report_update_payload() {
        io_report()
            .pick(&[
                "scoreFor",
                "scoreAgainst",
                "spirit",
                "spiritComment",
                "spiritP1",
                "spiritP2",
                "spiritP3",
                "spiritP4",
                "spiritP5",
            ])
            .extend([
                ("reportId", io_report().field("id")),
                ("mvpMale", io_report_mvp_update()),
                ("mvpFemale", io_report_mvp_update()),
                ("mvpMale2", io_report_mvp_update()),
                ("mvpFemale2", io_report_mvp_update()),
            ])
    }
}
pub const REPORT_UPDATE: EndpointDef = EndpointDef::new("ReportUpdate", "/ReportUpdate")
    .access(AuthPoint::ReportManage)
    .payload(report_update_payload)
    .result(io_report);

io_schema! {
    pub fn report_delete_payload() {
        io::object([("reportId", io_report().field("id"))])
    }
}
pub const REPORT_DELETE: EndpointDef = EndpointDef::new("ReportDelete", "/ReportDelete")
    .access(AuthPoint::ReportManage)
    .payload(report_delete_payload);

io_schema! {
    pub fn report_missing_list_payload() {
        io::object([("seasonId", io_fixture().field("seasonId"))])
    }
}
io_schema! {
    pub fn report_missing_list_result() {
        io::array(io::object([
            ("title", io_fixture().field("title")),
            ("fixtureId", io_fixture().field("id")),
            ("date", io_fixture().field("date")),
            (
                "missingTeams",
                io::array(io::object([
                    ("id", io_team().field("id")),
                    ("name", io_team().field("name")),
                    ("color", io::optional(io_team().field("color"))),
                    ("againstId", io::optional(io_team().field("id"))),
                    ("againstName", io::optional(io_team().field("name"))),
                ])),
            ),
        ]))
    }
}
pub const REPORT_MISSING_LIST: EndpointDef =
    EndpointDef::new("ReportMissingList", "/ReportMissingList")
        .access(AuthPoint::ReportManage)
        .payload(report_missing_list_payload)
        .result(report_missing_list_result);

pub const DEFS: &[&EndpointDef] = &[
    &REPORT_CREATE,
    &REPORT_UPDATE,
    &REPORT_DELETE,
    &REPORT_MISSING_LIST,
];
