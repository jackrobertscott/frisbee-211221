//! Port of `server/src/tables/$Season.ts`. `finalResults` is a JSON array column.

use super::{default_false, default_id, default_now};
use crate::columns;
use crate::db::Record;
use crate::db::schema::{Collation, Direction::*, IndexDef, TableDef};
use crate::shared::schemas::{Season, SeasonFinalResult, SeasonGenderDivision, io_season};

columns!(Season {
    ID: String = "id" / "id" (Text),
    CREATED_ON: String = "createdOn" / "created_on" (Text),
    UPDATED_ON: String = "updatedOn" / "updated_on" (Text),
    NAME: String = "name" / "name" (Text),
    SIGN_UP_OPEN: bool = "signUpOpen" / "sign_up_open" (Bool),
    IS_HIDDEN: bool = "isHidden" / "is_hidden" (Bool),
    USE_OFFICIAL_SCORING: bool = "useOfficialScoring" / "use_official_scoring" (Bool),
    GENDER_DIVISION: SeasonGenderDivision = "genderDivision" / "gender_division" (Text),
    FINAL_RESULTS: Vec<SeasonFinalResult> = "finalResults" / "final_results" (Json),
});

pub static TABLE: TableDef = TableDef {
    key: "season",
    sql: "season",
    columns: &[
        Season::ID.def,
        Season::CREATED_ON.def,
        Season::UPDATED_ON.def,
        Season::NAME.def,
        Season::SIGN_UP_OPEN.def,
        Season::IS_HIDDEN.def,
        Season::USE_OFFICIAL_SCORING.def,
        Season::GENDER_DIVISION.def,
        Season::FINAL_RESULTS.def,
    ],
    legacy_columns: &[],
    indexes: &[
        IndexDef::new(&[("id", Asc)]).unique(),
        IndexDef::new(&[("name", Asc)]).collation(Collation::SeasonName),
        IndexDef::new(&[("createdOn", Desc)]),
    ],
    schema: io_season,
    defaults: &[
        ("id", default_id),
        ("createdOn", default_now),
        ("updatedOn", default_now),
        ("signUpOpen", default_false),
    ],
};

impl Record for Season {
    fn table() -> &'static TableDef {
        &TABLE
    }
}
