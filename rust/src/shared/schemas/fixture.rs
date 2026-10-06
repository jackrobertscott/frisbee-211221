//! Port of `shared/src/schemas/ioFixture.ts`.

use crate::io_schema;
use crate::shared::torva::io;
use serde::{Deserialize, Serialize};

io_schema! {
    pub fn io_fixture_game() {
        io::object([
            ("id", io::id()),
            ("team1Id", io::id()),
            ("team2Id", io::id()),
            ("place", io::string()),
            ("time", io::string()),
            ("team1Score", io::optional(io::number())),
            ("team2Score", io::optional(io::number())),
        ])
    }
}

io_schema! {
    pub fn io_fixture() {
        io::object([
            ("id", io::id()),
            ("createdOn", io::date()),
            ("updatedOn", io::date()),
            ("seasonId", io::id()),
            ("userId", io::id()),
            ("title", io::string()),
            ("date", io::date()),
            ("games", io::array(io_fixture_game())),
            ("grading", io::optional(io::boolean())),
        ])
    }
}

/// One game of a fixture (`ioFixtureGame`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureGame {
    pub id: String,
    pub team1_id: String,
    pub team2_id: String,
    pub place: String,
    pub time: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team1_score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team2_score: Option<f64>,
}

/// `TFixture`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fixture {
    pub id: String,
    pub created_on: String,
    pub updated_on: String,
    pub season_id: String,
    pub user_id: String,
    pub title: String,
    pub date: String,
    pub games: Vec<FixtureGame>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grading: Option<bool>,
}
