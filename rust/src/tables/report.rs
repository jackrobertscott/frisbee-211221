//! Port of `server/src/tables/$Report.ts`.

use super::{default_id, default_now};
use crate::columns;
use crate::db::Record;
use crate::db::schema::{Direction::*, IndexDef, TableDef};
use crate::shared::schemas::{Report, io_report};

columns!(Report {
    ID: String = "id" / "id"(Text),
    CREATED_ON: String = "createdOn" / "created_on"(Text),
    UPDATED_ON: String = "updatedOn" / "updated_on"(Text),
    TEAM_ID: String = "teamId" / "team_id"(Text),
    TEAM_AGAINST_ID: String = "teamAgainstId" / "team_against_id"(Text),
    FIXTURE_ID: String = "fixtureId" / "fixture_id"(Text),
    USER_ID: String = "userId" / "user_id"(Text),
    SCORE_FOR: f64 = "scoreFor" / "score_for"(Real),
    SCORE_AGAINST: f64 = "scoreAgainst" / "score_against"(Real),
    MVP_MALE: String = "mvpMale" / "mvp_male"(Text),
    MVP_MALE2: String = "mvpMale2" / "mvp_male2"(Text),
    MVP_FEMALE: String = "mvpFemale" / "mvp_female"(Text),
    MVP_FEMALE2: String = "mvpFemale2" / "mvp_female2"(Text),
    SPIRIT: f64 = "spirit" / "spirit"(Real),
    SPIRIT_COMMENT: String = "spiritComment" / "spirit_comment"(Text),
    SPIRIT_P1: f64 = "spiritP1" / "spirit_p1"(Real),
    SPIRIT_P2: f64 = "spiritP2" / "spirit_p2"(Real),
    SPIRIT_P3: f64 = "spiritP3" / "spirit_p3"(Real),
    SPIRIT_P4: f64 = "spiritP4" / "spirit_p4"(Real),
    SPIRIT_P5: f64 = "spiritP5" / "spirit_p5"(Real),
});

pub static TABLE: TableDef = TableDef {
    key: "report",
    sql: "report",
    columns: &[
        Report::ID.def,
        Report::CREATED_ON.def,
        Report::UPDATED_ON.def,
        Report::TEAM_ID.def,
        Report::TEAM_AGAINST_ID.def,
        Report::FIXTURE_ID.def,
        Report::USER_ID.def,
        Report::SCORE_FOR.def,
        Report::SCORE_AGAINST.def,
        Report::MVP_MALE.def,
        Report::MVP_MALE2.def,
        Report::MVP_FEMALE.def,
        Report::MVP_FEMALE2.def,
        Report::SPIRIT.def,
        Report::SPIRIT_COMMENT.def,
        Report::SPIRIT_P1.def,
        Report::SPIRIT_P2.def,
        Report::SPIRIT_P3.def,
        Report::SPIRIT_P4.def,
        Report::SPIRIT_P5.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("fixtureId", Asc), ("createdOn", Desc)]),
        IndexDef::new(&[("fixtureId", Asc), ("teamId", Asc), ("teamAgainstId", Asc)]),
        IndexDef::new(&[("userId", Asc)]),
        IndexDef::new(&[("mvpMale", Asc)]),
        IndexDef::new(&[("mvpMale2", Asc)]),
        IndexDef::new(&[("mvpFemale", Asc)]),
        IndexDef::new(&[("mvpFemale2", Asc)]),
        IndexDef::new(&[("teamId", Asc)]),
        IndexDef::new(&[("teamAgainstId", Asc)]),
        IndexDef::new(&[("createdOn", Asc)]),
    ],
    schema: io_report,
    defaults: &[
        ("id", default_id),
        ("createdOn", default_now),
        ("updatedOn", default_now),
    ],
};

impl Record for Report {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
