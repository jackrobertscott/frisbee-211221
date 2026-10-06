//! Port of `shared/src/schemas/ioSeason.ts`.

use super::double_option;
use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

pub const SEASON_GENDER_DIVISIONS: [&str; 3] = ["mixed", "men", "women"];

/// `TSeasonGenderDivision`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SeasonGenderDivision {
    Mixed,
    Men,
    Women,
}

impl SeasonGenderDivision {
    pub fn as_str(self) -> &'static str {
        match self {
            SeasonGenderDivision::Mixed => "mixed",
            SeasonGenderDivision::Men => "men",
            SeasonGenderDivision::Women => "women",
        }
    }
}

/// `isSeasonGenderDivision(value)`.
pub fn is_season_gender_division(value: &str) -> bool {
    SEASON_GENDER_DIVISIONS.contains(&value)
}

io_schema! {
    pub fn io_season_final_result() {
        io::object([
            ("teamId", io::id()),
            ("position", io::optional(io::null(io::number()))),
        ])
    }
}

io_schema! {
    pub fn io_season() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("name", io::string()),
            ("signUpOpen", io::boolean()),
            ("isHidden", io::optional(io::boolean())),
            ("useOfficialScoring", io::optional(io::boolean())),
            ("genderDivision", io::optional(io::enumeration(&SEASON_GENDER_DIVISIONS))),
            ("finalResults", io::optional(io::array(io_season_final_result()))),
        ])
    }
}

/// One entry of `season.finalResults`; `position` may be missing or `null`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonFinalResult {
    pub team_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none", with = "double_option")]
    pub position: Option<Option<f64>>,
}

/// `TSeason`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub name: String,
    pub sign_up_open: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_hidden: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub use_official_scoring: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gender_division: Option<SeasonGenderDivision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub final_results: Option<Vec<SeasonFinalResult>>,
}
