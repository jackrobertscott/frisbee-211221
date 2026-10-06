//! Port of `shared/src/endpoints/FeatureDef.ts`.

use super::report::io_report_search_row;
use super::team::TEAM_LIST_SORT_KEYS;
use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_fixture, io_member, io_report, io_season, io_team, io_user_public};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::{io_list_limit, io_list_skip, io_sort_direction, EndpointDef};
use serde::{Deserialize, Serialize};

pub const FEATURE_SPIRIT_SORT_KEYS: [&str; 12] = [
    "team",
    "division",
    "receivedSpirit",
    "receivedReports",
    "receivedAverage",
    "adjustedReceivedAverage",
    "allocatedSpirit",
    "allocatedReports",
    "allocatedAverage",
    "adjustedAllocatedAverage",
    "averageDifference",
    "adjustedDifference",
];

/// `TFeatureSpiritSortKey`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FeatureSpiritSortKey {
    Team,
    Division,
    ReceivedSpirit,
    ReceivedReports,
    ReceivedAverage,
    AdjustedReceivedAverage,
    AllocatedSpirit,
    AllocatedReports,
    AllocatedAverage,
    AdjustedAllocatedAverage,
    AverageDifference,
    AdjustedDifference,
}

io_schema! {
    pub fn io_feature_against_option() {
        io::object([("team", io_team()), ("users", io::array(io_user_public()))])
    }
}

io_schema! {
    pub fn io_feature_spirit_row() {
        io::object([
            ("team", io_team()),
            ("receivedSpirit", io::number()),
            ("receivedReports", io::number()),
            ("receivedAverage", io::number()),
            ("adjustedReceivedAverage", io::number()),
            ("allocatedSpirit", io::number()),
            ("allocatedReports", io::number()),
            ("allocatedAverage", io::number()),
            ("adjustedAllocatedAverage", io::number()),
            ("averageDifference", io::number()),
            ("adjustedDifference", io::number()),
        ])
    }
}

io_schema! {
    pub fn io_feature_mvp_row() {
        io::object([
            ("userId", io_user_public().field("id")),
            ("userName", io::string()),
            ("teamId", io::optional(io_team().field("id"))),
            ("teamName", io::optional(io_team().field("name"))),
            ("division", io_team().field("division")),
            ("votes", io::number()),
            ("genderMatching", io_user_public().field("genderMatching")),
        ])
    }
}

io_schema! {
    pub fn feature_season_id_payload() {
        io::object([("seasonId", io_season().field("id"))])
    }
}
io_schema! {
    pub fn feature_competition_load_result() {
        io::object([("teams", io::array(io_team())), ("fixtures", io::array(io_fixture()))])
    }
}
pub const FEATURE_COMPETITION_LOAD: EndpointDef = EndpointDef::new("FeatureCompetitionLoad", "/FeatureCompetitionLoad")
    .payload(feature_season_id_payload)
    .result(feature_competition_load_result);

io_schema! {
    pub fn feature_dashboard_teams_load_payload() {
        io::object([
            ("seasonId", io_season().field("id")),
            ("search", io::optional(io::string().emptyok())),
            ("sortBy", io::optional(io::enumeration(&TEAM_LIST_SORT_KEYS))),
            ("sortDirection", io_sort_direction()),
            ("limit", io_list_limit()),
            ("skip", io_list_skip()),
        ])
    }
}
io_schema! {
    pub fn feature_dashboard_teams_load_result() {
        io::object([("count", io::number()), ("teams", io::array(io_team()))])
    }
}
pub const FEATURE_DASHBOARD_TEAMS_LOAD: EndpointDef =
    EndpointDef::new("FeatureDashboardTeamsLoad", "/FeatureDashboardTeamsLoad")
        .payload(feature_dashboard_teams_load_payload)
        .result(feature_dashboard_teams_load_result);

io_schema! {
    pub fn feature_dashboard_reports_load_payload() {
        io::object([
            ("seasonId", io_season().field("id")),
            ("search", io::optional(io::string().emptyok())),
            ("limit", io_list_limit()),
            ("skip", io_list_skip()),
        ])
    }
}
io_schema! {
    pub fn feature_dashboard_reports_load_result() {
        io::object([
            ("count", io::number()),
            ("reports", io::array(io_report_search_row())),
            ("fixtures", io::array(io_fixture())),
            ("teams", io::array(io_team())),
        ])
    }
}
pub const FEATURE_DASHBOARD_REPORTS_LOAD: EndpointDef =
    EndpointDef::new("FeatureDashboardReportsLoad", "/FeatureDashboardReportsLoad")
        .access(AuthPoint::ReportManage)
        .payload(feature_dashboard_reports_load_payload)
        .result(feature_dashboard_reports_load_result);

io_schema! {
    pub fn feature_report_editor_load_payload() {
        io::object([
            ("seasonId", io_season().field("id")),
            ("fixtureId", io::optional(io_fixture().field("id"))),
            ("teamId", io::optional(io_team().field("id"))),
        ])
    }
}
io_schema! {
    pub fn feature_report_editor_load_result() {
        io::object([
            ("fixtures", io::array(io_fixture())),
            ("teams", io::array(io_team())),
            ("againstOptions", io::array(io_feature_against_option())),
        ])
    }
}
pub const FEATURE_REPORT_EDITOR_LOAD: EndpointDef = EndpointDef::new("FeatureReportEditorLoad", "/FeatureReportEditorLoad")
    .access(AuthPoint::ReportWrite)
    .payload(feature_report_editor_load_payload)
    .result(feature_report_editor_load_result);

io_schema! {
    pub fn feature_dashboard_spirit_load_payload() {
        io::object([
            ("seasonId", io_season().field("id")),
            ("sortBy", io::optional(io::enumeration(&FEATURE_SPIRIT_SORT_KEYS))),
            ("sortDirection", io_sort_direction()),
        ])
    }
}
io_schema! {
    pub fn feature_dashboard_spirit_load_result() {
        io::object([("rows", io::array(io_feature_spirit_row()))])
    }
}
pub const FEATURE_DASHBOARD_SPIRIT_LOAD: EndpointDef =
    EndpointDef::new("FeatureDashboardSpiritLoad", "/FeatureDashboardSpiritLoad")
        .access(AuthPoint::ReportManage)
        .payload(feature_dashboard_spirit_load_payload)
        .result(feature_dashboard_spirit_load_result);

io_schema! {
    /// Votes descending, then division ascending (unassigned last), then player name.
    pub fn feature_dashboard_mvp_load_result() {
        io::object([("rows", io::array(io_feature_mvp_row()))])
    }
}
pub const FEATURE_DASHBOARD_MVP_LOAD: EndpointDef = EndpointDef::new("FeatureDashboardMvpLoad", "/FeatureDashboardMvpLoad")
    .access(AuthPoint::ReportManage)
    .payload(feature_season_id_payload)
    .result(feature_dashboard_mvp_load_result);

io_schema! {
    pub fn feature_fixture_id_payload() {
        io::object([("fixtureId", io_fixture().field("id"))])
    }
}
io_schema! {
    pub fn feature_fixture_tally_load_result() {
        io::object([("fixture", io_fixture()), ("teams", io::array(io_team())), ("reports", io::array(io_report()))])
    }
}
pub const FEATURE_FIXTURE_TALLY_LOAD: EndpointDef = EndpointDef::new("FeatureFixtureTallyLoad", "/FeatureFixtureTallyLoad")
    .access(AuthPoint::FixtureManage)
    .payload(feature_fixture_id_payload)
    .result(feature_fixture_tally_load_result);

io_schema! {
    pub fn feature_fixture_view_load_result() {
        io::object([("fixture", io_fixture()), ("teams", io::array(io_team()))])
    }
}
pub const FEATURE_FIXTURE_VIEW_LOAD: EndpointDef = EndpointDef::new("FeatureFixtureViewLoad", "/FeatureFixtureViewLoad")
    .payload(feature_fixture_id_payload)
    .result(feature_fixture_view_load_result);

io_schema! {
    pub fn feature_team_setup_load_payload() {
        io::object([("seasonId", io_season().field("id")), ("search", io::optional(io::string().emptyok()))])
    }
}
io_schema! {
    pub fn feature_team_setup_load_result() {
        io::object([("teams", io::array(io_team())), ("pendingTeam", io::optional(io_team()))])
    }
}
pub const FEATURE_TEAM_SETUP_LOAD: EndpointDef = EndpointDef::new("FeatureTeamSetupLoad", "/FeatureTeamSetupLoad")
    .access(AuthPoint::TeamJoin)
    .payload(feature_team_setup_load_payload)
    .result(feature_team_setup_load_result);

io_schema! {
    pub fn feature_dashboard_user_memberships_load_payload() {
        io::object([("userId", io_user_public().field("id"))])
    }
}
io_schema! {
    pub fn feature_dashboard_user_memberships_load_result() {
        io::object([
            ("members", io::array(io_member())),
            ("seasons", io::array(io_season())),
            ("teams", io::array(io_team())),
        ])
    }
}
pub const FEATURE_DASHBOARD_USER_MEMBERSHIPS_LOAD: EndpointDef =
    EndpointDef::new("FeatureDashboardUserMembershipsLoad", "/FeatureDashboardUserMembershipsLoad")
        .access(AuthPoint::UserManage)
        .payload(feature_dashboard_user_memberships_load_payload)
        .result(feature_dashboard_user_memberships_load_result);

pub const DEFS: &[&EndpointDef] = &[
    &FEATURE_COMPETITION_LOAD,
    &FEATURE_DASHBOARD_TEAMS_LOAD,
    &FEATURE_DASHBOARD_REPORTS_LOAD,
    &FEATURE_REPORT_EDITOR_LOAD,
    &FEATURE_DASHBOARD_SPIRIT_LOAD,
    &FEATURE_DASHBOARD_MVP_LOAD,
    &FEATURE_FIXTURE_TALLY_LOAD,
    &FEATURE_FIXTURE_VIEW_LOAD,
    &FEATURE_TEAM_SETUP_LOAD,
    &FEATURE_DASHBOARD_USER_MEMBERSHIPS_LOAD,
];
