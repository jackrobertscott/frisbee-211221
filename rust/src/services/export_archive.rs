//! Port of `server/src/services/exportArchive.ts`: a zip of every dataset
//! (fixture games, final results, seasons, reports, memberships, teams, user
//! emails, users) as CSV or JSON files.
//!
//! The tables are loaded in SQL order (`createdOn`, season names with the
//! season-name collation). The exported rows are derived from several
//! tables at once (labels, fallbacks like "Unknown team", MVP eligibility),
//! so, as in the TS service, they are ordered after they are built, with
//! JavaScript's `localeCompare` and `compareSeasonNames`.

use crate::db::{Collation, Db, Filter, Query};
use crate::js;
use crate::js::locale_compare::locale_compare;
use crate::services::user_email;
use crate::shared::errors::{AppError, AppResult};
use crate::shared::schemas::{
    Fixture, FixtureGame, GenderMatching, Member, Report, Season, Team, User, UserEmail,
};
use crate::shared::utils::season_gender_division::{
    HasGenderDivision, get_season_gender_division, get_season_mvp_slots,
    is_user_eligible_for_mvp_slot,
};
use crate::shared::utils::season_name::{compare_season_name_values, compare_season_names};
use crate::tables::{FIXTURE, MEMBER, REPORT, SEASON, TEAM, USER};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::io::Write;

/// `TExportFileType`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFileType {
    Csv,
    Json,
}

impl ExportFileType {
    pub fn as_str(self) -> &'static str {
        match self {
            ExportFileType::Csv => "csv",
            ExportFileType::Json => "json",
        }
    }
}

/// The zipped export and its download file name.
#[derive(Clone, Debug)]
pub struct ExportArchive {
    pub buffer: Vec<u8>,
    pub filename: String,
}

type Record = Map<String, Value>;

struct Context {
    fixtures: Vec<Fixture>,
    members: Vec<Member>,
    reports: Vec<Report>,
    seasons: Vec<Season>,
    teams: Vec<Team>,
    users: Vec<User>,
    seasons_by_id: HashMap<String, Season>,
    fixtures_by_id: HashMap<String, Fixture>,
    teams_by_id: HashMap<String, Team>,
    users_by_id: HashMap<String, User>,
}

impl Context {
    fn season(&self, id: &str) -> Option<&Season> {
        self.seasons_by_id.get(id)
    }
    fn team(&self, id: &str) -> Option<&Team> {
        self.teams_by_id.get(id)
    }
    fn user(&self, id: &str) -> Option<&User> {
        self.users_by_id.get(id)
    }
    fn fixture(&self, id: &str) -> Option<&Fixture> {
        self.fixtures_by_id.get(id)
    }
    /// A report's season: its fixture's, else its team's.
    fn report_season(&self, report: &Report) -> Option<&Season> {
        self.fixture(&report.fixture_id)
            .and_then(|fixture| self.season(&fixture.season_id))
            .or_else(|| {
                self.team(&report.team_id)
                    .and_then(|team| self.season(&team.season_id))
            })
    }
}

struct Dataset {
    filename: &'static str,
    fields: &'static [&'static str],
    sort_records: bool,
    build: fn(&Context) -> Vec<Record>,
}

const EXPORT_DATASETS: [Dataset; 8] = [
    Dataset {
        filename: "fixture-games",
        fields: &[
            "seasonName",
            "fixtureDate",
            "fixtureTitle",
            "gameTime",
            "gamePlace",
            "team1Name",
            "team1Score",
            "team2Name",
            "team2Score",
            "grading",
            "fixtureCreatedByName",
            "fixtureCreatedByEmail",
        ],
        sort_records: false,
        build: build_fixture_games,
    },
    Dataset {
        filename: "season-final-results",
        fields: &["seasonName", "position", "teamName"],
        sort_records: true,
        build: build_season_final_results,
    },
    Dataset {
        filename: "seasons",
        fields: &[
            "name",
            "signUpOpen",
            "scoringSystem",
            "genderDivision",
            "isHidden",
        ],
        sort_records: false,
        build: build_seasons,
    },
    Dataset {
        filename: "reports",
        fields: &[
            "seasonName",
            "fixtureDate",
            "fixtureTitle",
            "teamName",
            "againstTeamName",
            "scoreFor",
            "scoreAgainst",
            "spiritSimple",
            "spiritP1",
            "spiritP2",
            "spiritP3",
            "spiritP4",
            "spiritP5",
            "spiritComment",
            "mvpMaleName",
            "mvpMaleEmail",
            "mvpMale2Name",
            "mvpMale2Email",
            "mvpFemaleName",
            "mvpFemaleEmail",
            "mvpFemale2Name",
            "mvpFemale2Email",
            "submittedByName",
            "submittedByEmail",
        ],
        sort_records: false,
        build: build_reports,
    },
    Dataset {
        filename: "memberships",
        fields: &[
            "seasonName",
            "teamName",
            "userName",
            "userEmail",
            "captain",
            "pending",
        ],
        sort_records: true,
        build: build_memberships,
    },
    Dataset {
        filename: "teams",
        fields: &["seasonName", "name", "division", "color", "email", "phone"],
        sort_records: false,
        build: build_teams,
    },
    Dataset {
        filename: "user-emails",
        fields: &[
            "userName",
            "email",
            "primary",
            "verified",
            "createdOn",
            "userPrimaryEmail",
        ],
        sort_records: false,
        build: build_user_emails,
    },
    Dataset {
        filename: "users",
        fields: &[
            "firstName",
            "lastName",
            "primaryEmail",
            "primaryEmailVerified",
            "genderMatching",
            "admin",
            "termsAccepted",
            "createdOn",
        ],
        sort_records: false,
        build: build_users,
    },
];

/// A record from `(key, value)` pairs.
fn record<const N: usize>(entries: [(&str, Value); N]) -> Record {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

fn text(value: impl Into<String>) -> Value {
    Value::String(value.into())
}

fn opt_text(value: Option<&str>) -> Value {
    value.map(text).unwrap_or(Value::Null)
}

fn num(value: Option<f64>) -> Value {
    value.map(js::number).unwrap_or(Value::Null)
}

fn yes(flag: bool) -> Value {
    text(if flag { "Yes" } else { "" })
}

/// `String(value ?? '')`.
fn js_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => js::number_to_string(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::Bool(b)) => b.to_string(),
        Some(other) => other.to_string(),
    }
}

fn compare_text(left: &str, right: &str) -> Ordering {
    locale_compare(left, right)
}

fn build_fixture_games(context: &Context) -> Vec<Record> {
    let season_label = |fixture: &Fixture| season_label(context.season(&fixture.season_id));
    let team_label = |id: &str| team_label(context.team(id));
    let mut fixtures: Vec<&Fixture> = context.fixtures.iter().collect();
    fixtures.sort_by(|left, right| {
        compare_season_names(&season_label(left), &season_label(right))
            .then_with(|| compare_text(&left.date, &right.date))
            .then_with(|| compare_text(&left.title, &right.title))
    });
    fixtures
        .into_iter()
        .flat_map(|fixture| {
            let season = context.season(&fixture.season_id);
            let created_by = context.user(&fixture.user_id);
            let mut games: Vec<&FixtureGame> = fixture.games.iter().collect();
            games.sort_by(|left, right| {
                compare_text(&team_label(&left.team1_id), &team_label(&right.team1_id)).then_with(
                    || compare_text(&team_label(&left.team2_id), &team_label(&right.team2_id)),
                )
            });
            games
                .into_iter()
                .map(|game| {
                    record([
                        ("seasonName", text(season_label_of(season))),
                        ("fixtureTitle", text(&fixture.title)),
                        (
                            "fixtureDate",
                            text(human_readable_date(Some(&fixture.date))),
                        ),
                        ("grading", yes(fixture.grading == Some(true))),
                        ("fixtureCreatedByName", text(user_name(created_by))),
                        ("fixtureCreatedByEmail", opt_text(primary_email(created_by))),
                        ("gameTime", text(&game.time)),
                        ("gamePlace", text(&game.place)),
                        ("team1Name", text(team_label(&game.team1_id))),
                        ("team1Score", num(game.team1_score)),
                        ("team2Name", text(team_label(&game.team2_id))),
                        ("team2Score", num(game.team2_score)),
                    ])
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

fn build_season_final_results(context: &Context) -> Vec<Record> {
    let mut rows: Vec<Record> = context
        .seasons
        .iter()
        .flat_map(|season| {
            season
                .final_results
                .iter()
                .flatten()
                .map(|result| {
                    record([
                        ("seasonName", text(&season.name)),
                        ("position", num(result.position.flatten())),
                        ("teamName", text(team_label(context.team(&result.team_id)))),
                    ])
                })
                .collect::<Vec<_>>()
        })
        .collect();
    rows.sort_by(|a, b| {
        compare_season_name_values(a.get("seasonName"), b.get("seasonName")).then_with(|| {
            compare_text(&js_string(a.get("teamName")), &js_string(b.get("teamName")))
        })
    });
    rows
}

fn build_seasons(context: &Context) -> Vec<Record> {
    context
        .seasons
        .iter()
        .map(|season| {
            let scoring = if season.use_official_scoring == Some(true) {
                "Official"
            } else {
                "Simple"
            };
            record([
                ("name", text(&season.name)),
                ("signUpOpen", yes(season.sign_up_open)),
                ("isHidden", yes(season.is_hidden == Some(true))),
                ("scoringSystem", text(scoring)),
                (
                    "genderDivision",
                    text(
                        get_season_gender_division(Some(season as &dyn HasGenderDivision)).as_str(),
                    ),
                ),
            ])
        })
        .collect()
}

fn fixture_game_for_report<'a>(
    fixture: Option<&'a Fixture>,
    report: &Report,
) -> Option<&'a FixtureGame> {
    fixture?.games.iter().find(|game| {
        (game.team1_id == report.team_id && game.team2_id == report.team_against_id)
            || (game.team1_id == report.team_against_id && game.team2_id == report.team_id)
    })
}

fn build_reports(context: &Context) -> Vec<Record> {
    let mut reports: Vec<&Report> = context.reports.iter().collect();
    reports.sort_by(|left, right| {
        let left_fixture = context.fixture(&left.fixture_id);
        let right_fixture = context.fixture(&right.fixture_id);
        let left_game = fixture_game_for_report(left_fixture, left);
        let right_game = fixture_game_for_report(right_fixture, right);
        let fixture_text = |fixture: Option<&Fixture>, pick: fn(&Fixture) -> &str| {
            fixture.map(pick).unwrap_or_default().to_string()
        };
        let game_text = |game: Option<&FixtureGame>, pick: fn(&FixtureGame) -> &str| {
            game.map(pick).unwrap_or_default().to_string()
        };
        compare_season_names(
            &season_label_of(context.report_season(left)),
            &season_label_of(context.report_season(right)),
        )
        .then_with(|| {
            compare_text(
                &fixture_text(left_fixture, |f| &f.date),
                &fixture_text(right_fixture, |f| &f.date),
            )
        })
        .then_with(|| {
            compare_text(
                &fixture_text(left_fixture, |f| &f.title),
                &fixture_text(right_fixture, |f| &f.title),
            )
        })
        .then_with(|| {
            compare_text(
                &game_text(left_game, |g| &g.time),
                &game_text(right_game, |g| &g.time),
            )
        })
        .then_with(|| {
            compare_text(
                &game_text(left_game, |g| &g.place),
                &game_text(right_game, |g| &g.place),
            )
        })
        .then_with(|| {
            compare_text(
                &team_label(context.team(&left.team_id)),
                &team_label(context.team(&right.team_id)),
            )
        })
        .then_with(|| {
            compare_text(
                &team_label(context.team(&left.team_against_id)),
                &team_label(context.team(&right.team_against_id)),
            )
        })
    });

    reports
        .into_iter()
        .map(|report| {
            let fixture = context.fixture(&report.fixture_id);
            let submitted_by = report.user_id.as_deref().and_then(|id| context.user(id));
            let season = context.report_season(report);
            let slots = get_season_mvp_slots(season.map(|s| s as &dyn HasGenderDivision));
            let mvp = |enabled: bool, id: &Option<String>, slot: GenderMatching| {
                if enabled {
                    mvp_user_for_slot(context, id.as_deref(), slot)
                } else {
                    None
                }
            };
            let mvp_male = mvp(slots.male, &report.mvp_male, GenderMatching::Male);
            let mvp_male2 = mvp(slots.male, &report.mvp_male2, GenderMatching::Male);
            let mvp_female = mvp(slots.female, &report.mvp_female, GenderMatching::Female);
            let mvp_female2 = mvp(slots.female, &report.mvp_female2, GenderMatching::Female);
            let name = |user: Option<&User>| {
                user.map(|u| text(user_name(Some(u))))
                    .unwrap_or(Value::Null)
            };
            let email = |user: Option<&User>| opt_text(primary_email(user));
            record([
                ("seasonName", text(season_label_of(season))),
                ("fixtureTitle", opt_text(fixture.map(|f| f.title.as_str()))),
                (
                    "fixtureDate",
                    text(human_readable_date(fixture.map(|f| f.date.as_str()))),
                ),
                ("teamName", text(team_label(context.team(&report.team_id)))),
                (
                    "againstTeamName",
                    text(team_label(context.team(&report.team_against_id))),
                ),
                ("submittedByName", name(submitted_by)),
                ("submittedByEmail", email(submitted_by)),
                ("scoreFor", js::number(report.score_for)),
                ("scoreAgainst", js::number(report.score_against)),
                ("mvpMaleName", name(mvp_male)),
                ("mvpMaleEmail", email(mvp_male)),
                ("mvpMale2Name", name(mvp_male2)),
                ("mvpMale2Email", email(mvp_male2)),
                ("mvpFemaleName", name(mvp_female)),
                ("mvpFemaleEmail", email(mvp_female)),
                ("mvpFemale2Name", name(mvp_female2)),
                ("mvpFemale2Email", email(mvp_female2)),
                ("spiritSimple", num(report.spirit)),
                ("spiritP1", num(report.spirit_p1)),
                ("spiritP2", num(report.spirit_p2)),
                ("spiritP3", num(report.spirit_p3)),
                ("spiritP4", num(report.spirit_p4)),
                ("spiritP5", num(report.spirit_p5)),
                ("spiritComment", text(&report.spirit_comment)),
            ])
        })
        .collect()
}

fn build_memberships(context: &Context) -> Vec<Record> {
    let mut rows: Vec<Record> = context
        .members
        .iter()
        .map(|member| {
            let team = context.team(&member.team_id);
            let season = context
                .season(&member.season_id)
                .or_else(|| team.and_then(|t| context.season(&t.season_id)));
            let user = context.user(&member.user_id);
            record([
                ("seasonName", text(season_label_of(season))),
                ("teamName", text(team_label(team))),
                (
                    "userName",
                    user.map(|u| text(user_name(Some(u))))
                        .unwrap_or(Value::Null),
                ),
                ("userEmail", opt_text(primary_email(user))),
                ("captain", yes(member.captain == Some(true))),
                ("pending", text(if member.pending { "Pending" } else { "" })),
            ])
        })
        .collect();
    rows.sort_by(|a, b| {
        compare_season_name_values(a.get("seasonName"), b.get("seasonName"))
            .then_with(|| {
                compare_text(&js_string(a.get("teamName")), &js_string(b.get("teamName")))
            })
            .then_with(|| {
                compare_text(&js_string(a.get("userName")), &js_string(b.get("userName")))
            })
            .then_with(|| {
                compare_text(
                    &js_string(a.get("userEmail")),
                    &js_string(b.get("userEmail")),
                )
            })
    });
    rows
}

fn build_teams(context: &Context) -> Vec<Record> {
    let mut rows: Vec<Record> = context
        .teams
        .iter()
        .map(|team| {
            record([
                (
                    "seasonName",
                    text(season_label_of(context.season(&team.season_id))),
                ),
                ("name", text(&team.name)),
                ("division", num(team.division)),
                ("color", text(&team.color)),
                ("email", opt_text(team.email.as_deref())),
                ("phone", opt_text(team.phone.as_deref())),
            ])
        })
        .collect();
    rows.sort_by(|a, b| {
        compare_season_name_values(a.get("seasonName"), b.get("seasonName"))
            .then_with(|| {
                compare_text(&js_string(a.get("division")), &js_string(b.get("division")))
            })
            .then_with(|| compare_text(&js_string(a.get("name")), &js_string(b.get("name"))))
    });
    rows
}

fn build_user_emails(context: &Context) -> Vec<Record> {
    // order users, keeping each user's emails together with the primary
    // first; users arrive sorted by createdOn, which the stable sort keeps
    // as the final tie-breaker
    let mut users: Vec<&User> = context.users.iter().collect();
    users.sort_by(|a, b| {
        compare_text(&user_name(Some(a)), &user_name(Some(b))).then_with(|| {
            compare_text(
                primary_email(Some(a)).unwrap_or_default(),
                primary_email(Some(b)).unwrap_or_default(),
            )
        })
    });
    users
        .into_iter()
        .flat_map(|user| {
            sort_user_emails(&user.emails)
                .into_iter()
                .map(|email| {
                    record([
                        ("userName", text(user_name(Some(user)))),
                        ("userPrimaryEmail", opt_text(primary_email(Some(user)))),
                        ("email", text(&email.value)),
                        ("verified", yes(email.verified)),
                        ("primary", yes(email.primary)),
                        (
                            "createdOn",
                            text(human_readable_date(Some(&email.created_on))),
                        ),
                    ])
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

fn build_users(context: &Context) -> Vec<Record> {
    let mut rows: Vec<Record> = context
        .users
        .iter()
        .map(|user| {
            record([
                ("firstName", text(&user.first_name)),
                ("lastName", text(&user.last_name)),
                ("primaryEmail", opt_text(primary_email(Some(user)))),
                (
                    "primaryEmailVerified",
                    yes(user_email::primary(user).is_some_and(|e| e.verified)),
                ),
                ("genderMatching", text(user.gender_matching.as_str())),
                ("admin", yes(user.admin == Some(true))),
                ("termsAccepted", yes(user.terms_accepted)),
                (
                    "createdOn",
                    text(human_readable_date(Some(&user.created_on))),
                ),
            ])
        })
        .collect();
    rows.sort_by(|a, b| {
        compare_text(
            &js_string(a.get("firstName")),
            &js_string(b.get("firstName")),
        )
        .then_with(|| compare_text(&js_string(a.get("lastName")), &js_string(b.get("lastName"))))
    });
    rows
}

/// `createExportArchive(fileType)`.
pub async fn create_export_archive(db: &Db, file_type: ExportFileType) -> AppResult<ExportArchive> {
    let generated_on = js::date::now_iso();
    let context = load_export_context(db).await?;
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for dataset in &EXPORT_DATASETS {
        let built = (dataset.build)(&context);
        let records = if dataset.sort_records {
            sort_export_records(built, dataset.fields)
        } else {
            built
        };
        let content = match file_type {
            ExportFileType::Json => jsonify(&records, dataset.fields)?,
            ExportFileType::Csv => csvify(&records, dataset.fields),
        };
        zip.start_file(
            format!("{}.{}", dataset.filename, file_type.as_str()),
            options,
        )
        .map_err(AppError::internal_from)?;
        zip.write_all(content.as_bytes())?;
    }
    let buffer = zip.finish().map_err(AppError::internal_from)?.into_inner();
    Ok(ExportArchive {
        buffer,
        filename: export_filename(&generated_on, file_type),
    })
}

fn csvify(records: &[Record], fields: &[&str]) -> String {
    let headings = ordered_headings(records, fields);
    if headings.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        headings
            .iter()
            .map(|heading| csv_escape(&csv_heading(heading)))
            .collect::<Vec<_>>()
            .join(","),
    ];
    for record in records {
        lines.push(
            headings
                .iter()
                .map(|heading| csv_escape(&csv_value(record.get(heading))))
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

fn jsonify(records: &[Record], fields: &[&str]) -> AppResult<String> {
    let headings = ordered_headings(records, fields);
    let ordered: Vec<Value> = records
        .iter()
        .map(|record| {
            Value::Object(
                headings
                    .iter()
                    .map(|heading| {
                        (
                            heading.clone(),
                            record.get(heading).cloned().unwrap_or(Value::Null),
                        )
                    })
                    .collect(),
            )
        })
        .collect();
    let mut out = serde_json::to_string_pretty(&ordered)?;
    out.push('\n');
    Ok(out)
}

fn ordered_headings(records: &[Record], fields: &[&str]) -> Vec<String> {
    let mut headings: Vec<String> = fields.iter().map(|f| f.to_string()).collect();
    for record in records {
        for key in record.keys() {
            if !headings.contains(key) {
                headings.push(key.clone());
            }
        }
    }
    headings
}

fn csv_value(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        // stop spreadsheet apps from running user-entered text as a formula
        Some(Value::String(s)) => {
            if s.starts_with(['=', '+', '-', '@', '\t', '\r']) {
                format!("'{s}")
            } else {
                s.clone()
            }
        }
        Some(Value::Number(n)) => js::number_to_string(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::Bool(b)) => b.to_string(),
        Some(other) => js::stringify(other),
    }
}

fn csv_escape(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

/// `_csvHeading`: `team1Score` → `TEAM1_SCORE`.
fn csv_heading(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::new();
    for (index, &c) in chars.iter().enumerate() {
        if index > 0 && c.is_ascii_uppercase() {
            let prev = chars[index - 1];
            let next_lower = chars.get(index + 1).is_some_and(|n| n.is_ascii_lowercase());
            // `([a-z\d])([A-Z])` and `([A-Z]+)([A-Z][a-z])`
            if prev.is_ascii_lowercase()
                || prev.is_ascii_digit()
                || (prev.is_ascii_uppercase() && next_lower)
            {
                out.push('_');
            }
        }
        out.push(c);
    }
    let mut collapsed = String::new();
    let mut in_run = false;
    for c in out.chars() {
        if c.is_ascii_alphanumeric() {
            collapsed.push(c);
            in_run = false;
        } else if !in_run {
            collapsed.push('_');
            in_run = true;
        }
    }
    collapsed.to_ascii_uppercase()
}

fn export_filename(generated_on: &str, file_type: ExportFileType) -> String {
    let stamp = generated_on.replace([':', '.'], "-");
    format!("frisbee-export-{}-{stamp}.zip", file_type.as_str())
}

async fn load_export_context(db: &Db) -> AppResult<Context> {
    let by_created = || Query::new().sort([Fixture::CREATED_ON.asc()]);
    let fixtures = FIXTURE.get_many(db, Filter::all(), by_created()).await?;
    let members = MEMBER
        .get_many(
            db,
            Filter::all(),
            Query::new().sort([Member::CREATED_ON.asc()]),
        )
        .await?;
    let reports = REPORT
        .get_many(
            db,
            Filter::all(),
            Query::new().sort([Report::CREATED_ON.asc()]),
        )
        .await?;
    let seasons = SEASON
        .get_many(
            db,
            Filter::all(),
            Query::new().sort([Season::NAME.asc().collate(Collation::SeasonName)]),
        )
        .await?;
    let teams = TEAM
        .get_many(
            db,
            Filter::all(),
            Query::new().sort([Team::CREATED_ON.asc()]),
        )
        .await?;
    let users = USER
        .get_many(
            db,
            Filter::all(),
            Query::new().sort([User::CREATED_ON.asc()]),
        )
        .await?;
    Ok(Context {
        seasons_by_id: seasons.iter().map(|s| (s.id.clone(), s.clone())).collect(),
        fixtures_by_id: fixtures.iter().map(|f| (f.id.clone(), f.clone())).collect(),
        teams_by_id: teams.iter().map(|t| (t.id.clone(), t.clone())).collect(),
        users_by_id: users.iter().map(|u| (u.id.clone(), u.clone())).collect(),
        fixtures,
        members,
        reports,
        seasons,
        teams,
        users,
    })
}

fn sort_export_records(mut records: Vec<Record>, fields: &[&str]) -> Vec<Record> {
    records.sort_by(|left, right| {
        fields
            .iter()
            .map(|field| compare_export_values(field, left.get(*field), right.get(*field)))
            .find(|ordering| *ordering != Ordering::Equal)
            .unwrap_or(Ordering::Equal)
    });
    records
}

fn compare_export_values(field: &str, left: Option<&Value>, right: Option<&Value>) -> Ordering {
    if field == "seasonName" {
        return compare_season_name_values(left, right);
    }
    let number = |value: Option<&Value>| value.and_then(|v| v.as_f64().filter(|_| v.is_number()));
    if number(left).is_some() || number(right).is_some() {
        const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;
        let l = number(left).unwrap_or(MAX_SAFE_INTEGER);
        let r = number(right).unwrap_or(MAX_SAFE_INTEGER);
        return l.partial_cmp(&r).unwrap_or(Ordering::Equal);
    }
    compare_text(&js_string(left), &js_string(right))
}

/// `_userName`: first and last name, or "Unknown user".
fn user_name(user: Option<&User>) -> String {
    let name = user
        .map(|u| {
            [u.first_name.as_str(), u.last_name.as_str()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let name = js::trim(&name);
    if name.is_empty() {
        "Unknown user".into()
    } else {
        name.to_string()
    }
}

fn mvp_user_for_slot<'a>(
    context: &'a Context,
    user_id: Option<&str>,
    slot: GenderMatching,
) -> Option<&'a User> {
    let user = context.user(user_id.filter(|id| !id.is_empty())?)?;
    is_user_eligible_for_mvp_slot(user.gender_matching, slot).then_some(user)
}

fn primary_email(user: Option<&User>) -> Option<&str> {
    user_email::primary(user?).map(|email| email.value.as_str())
}

fn sort_user_emails(emails: &[UserEmail]) -> Vec<&UserEmail> {
    let mut sorted: Vec<&UserEmail> = emails.iter().collect();
    sorted.sort_by(|a, b| match (a.primary, b.primary) {
        (x, y) if x == y => compare_text(&a.value, &b.value),
        (true, _) => Ordering::Less,
        _ => Ordering::Greater,
    });
    sorted
}

fn season_label(season: Option<&Season>) -> String {
    season_label_of(season)
}

fn season_label_of(season: Option<&Season>) -> String {
    season
        .map(|s| s.name.clone())
        .unwrap_or_else(|| "Unknown season".into())
}

fn team_label(team: Option<&Team>) -> String {
    team.map(|t| t.name.clone())
        .unwrap_or_else(|| "Unknown team".into())
}

/// `_humanReadableDate`: `toLocaleDateString('en-AU')` (`dd/mm/yyyy` in the
/// server's time zone), the text itself when it is not a date, or `''`.
pub fn human_readable_date(date: Option<&str>) -> String {
    use chrono::{Datelike, Local, TimeZone};
    let Some(date) = date.filter(|d| !d.is_empty()) else {
        return String::new();
    };
    let Some(local) = js::date::parse(date).and_then(|ms| Local.timestamp_millis_opt(ms).single())
    else {
        return date.to_string();
    };
    format!("{:02}/{:02}/{}", local.day(), local.month(), local.year())
}

#[cfg(test)]
#[path = "export_archive_tests.rs"]
mod tests;
