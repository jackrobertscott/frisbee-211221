//! Port of `shared/src/endpoints/FixtureDef.ts`.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::schemas::{io_fixture, io_fixture_game};
use crate::shared::torva::io;
use crate::shared::utils::endpoint_def::EndpointDef;

io_schema! {
    pub fn fixture_create_payload() {
        io_fixture().pick(&["seasonId", "title", "date", "games", "grading"])
    }
}
pub const FIXTURE_CREATE: EndpointDef = EndpointDef::new("FixtureCreate", "/FixtureCreate")
    .access(AuthPoint::FixtureManage)
    .payload(fixture_create_payload)
    .result(io_fixture);

io_schema! {
    pub fn fixture_update_payload() {
        io_fixture()
            .pick(&["title", "date", "games", "grading"])
            .extend([("fixtureId", io_fixture().field("id"))])
    }
}
pub const FIXTURE_UPDATE: EndpointDef = EndpointDef::new("FixtureUpdate", "/FixtureUpdate")
    .access(AuthPoint::FixtureManage)
    .payload(fixture_update_payload)
    .result(io_fixture);

io_schema! {
    pub fn fixture_delete_payload() {
        io::object([("fixtureId", io_fixture().field("id"))])
    }
}
pub const FIXTURE_DELETE: EndpointDef =
    EndpointDef::new("FixtureDelete", "/FixtureDelete").access(AuthPoint::FixtureManage).payload(fixture_delete_payload);

io_schema! {
    pub fn fixture_adjust_multiple_payload() {
        io::object([
            ("seasonId", io_fixture().field("seasonId")),
            ("referenceFixtureId", io_fixture().field("id")),
            ("amount", io::number().integer().min(0.0).max(1000.0)),
            ("unit", io::enumeration(&["day", "week", "month"])),
            ("direction", io::enumeration(&["forward", "backward"])),
        ])
    }
}
io_schema! {
    pub fn count_result() {
        io::object([("count", io::number())])
    }
}
pub const FIXTURE_ADJUST_MULTIPLE: EndpointDef = EndpointDef::new("FixtureAdjustMultiple", "/FixtureAdjustMultiple")
    .access(AuthPoint::FixtureManage)
    .payload(fixture_adjust_multiple_payload)
    .result(count_result);

io_schema! {
    pub fn fixture_generate_payload() {
        io::object([
            ("seasonId", io_fixture().field("seasonId")),
            ("startingDate", io_fixture().field("date")),
            ("roundCount", io::number().integer().min(1.0).max(100.0)),
            (
                "slots",
                io::array(io::object([
                    ("id", io_fixture_game().field("id")),
                    ("time", io_fixture_game().field("time")),
                    ("place", io_fixture_game().field("place")),
                ])),
            ),
        ])
    }
}
pub const FIXTURE_GENERATE: EndpointDef = EndpointDef::new("FixtureGenerate", "/FixtureGenerate")
    .access(AuthPoint::FixtureManage)
    .payload(fixture_generate_payload);

pub const DEFS: &[&EndpointDef] =
    &[&FIXTURE_CREATE, &FIXTURE_UPDATE, &FIXTURE_DELETE, &FIXTURE_ADJUST_MULTIPLE, &FIXTURE_GENERATE];
