//! Port of `server/src/gameday/importMembers.ts`: runs a GameDay export for a
//! saved config, imports the exported members and records the run.

use super::credentials::decrypt_gameday_password;
use super::types::{GamedayExportInput, GamedayExportMember};
use crate::app::AppState;
use crate::db::Patch;
use crate::js::date::now_iso;
use crate::log;
use crate::services::member_import::{ImportObject, MemberImportSummary, import_member_objects};
use crate::shared::errors::AppResult;
use crate::shared::schemas::{
    FALLBACK_USER_GENDER_MATCHING, GamedayImportConfig, GamedayImportRun, GamedayImportRunStatus,
    GamedayImportRunTrigger, GenderMatching, normalize_user_gender_matching,
};
use crate::tables::GAMEDAY_IMPORT_RUN;
use serde::Serialize;
use serde_json::json;
use std::collections::BTreeSet;

pub const GAMEDAY_STARTING_URL: &str = "https://membership.mygameday.app/";
const MAX_GAMEDAY_INVALID_ROW_NOTE_DETAILS: usize = 25;

/// `TGamedayImportSummary`: the member import summary plus a note.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamedayImportSummary {
    pub rows_imported: usize,
    pub teams_created: usize,
    pub users_created: usize,
    pub members_created: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl GamedayImportSummary {
    fn new(summary: MemberImportSummary, note: Option<String>) -> Self {
        GamedayImportSummary {
            rows_imported: summary.rows_imported,
            teams_created: summary.teams_created,
            users_created: summary.users_created,
            members_created: summary.members_created,
            note,
        }
    }
}

struct PreparedImport {
    objects: Vec<ImportObject>,
    note: Option<String>,
}

struct InvalidMemberRow {
    row_number: usize,
    reasons: Vec<&'static str>,
    member: GamedayExportMember,
}

/// `runGamedayImportWithHistory(config, trigger)`.
pub async fn run_gameday_import_with_history(
    state: &AppState,
    config: &GamedayImportConfig,
    trigger: GamedayImportRunTrigger,
) -> AppResult<GamedayImportSummary> {
    let db = &state.db;
    let run: GamedayImportRun = GAMEDAY_IMPORT_RUN
        .create_one(
            db,
            json!({
                "configId": config.id,
                "seasonId": config.season_id,
                "trigger": trigger,
                "status": GamedayImportRunStatus::Running,
                "association": config.association,
                "competition": config.competition,
                "startedOn": now_iso(),
            }),
        )
        .await?;

    match run_gameday_import(state, config).await {
        Ok(summary) => {
            let as_number = |n: usize| n as f64;
            GAMEDAY_IMPORT_RUN
                .update_one(
                    db,
                    GamedayImportRun::ID.eq(&run.id),
                    Patch::new()
                        .set(GamedayImportRun::STATUS, GamedayImportRunStatus::Succeeded)
                        .set(GamedayImportRun::FINISHED_ON, now_iso())
                        .set(
                            GamedayImportRun::ROWS_IMPORTED,
                            as_number(summary.rows_imported),
                        )
                        .set(
                            GamedayImportRun::TEAMS_CREATED,
                            as_number(summary.teams_created),
                        )
                        .set(
                            GamedayImportRun::USERS_CREATED,
                            as_number(summary.users_created),
                        )
                        .set(
                            GamedayImportRun::MEMBERS_CREATED,
                            as_number(summary.members_created),
                        )
                        .set_opt(GamedayImportRun::NOTE, summary.note.clone()),
                )
                .await?;
            Ok(summary)
        }
        Err(error) => {
            GAMEDAY_IMPORT_RUN
                .update_one(
                    db,
                    GamedayImportRun::ID.eq(&run.id),
                    Patch::new()
                        .set(GamedayImportRun::STATUS, GamedayImportRunStatus::Failed)
                        .set(GamedayImportRun::FINISHED_ON, now_iso())
                        .set(GamedayImportRun::ERROR_MESSAGE, error.message.clone()),
                )
                .await?;
            Err(error)
        }
    }
}

async fn run_gameday_import(
    state: &AppState,
    config: &GamedayImportConfig,
) -> AppResult<GamedayImportSummary> {
    let secret = &state.config.jwt_secret;
    let input = GamedayExportInput {
        starting_url: GAMEDAY_STARTING_URL.into(),
        username: config.username.clone(),
        password: decrypt_gameday_password(secret, &config.password_encrypted)?,
        association: config.association.clone(),
        competition: config.competition.clone(),
        ..Default::default()
    };
    let result = state.gameday_exporter().export(input).await?;
    let prepared = prepare_gameday_import(result.members);
    let summary =
        import_member_objects(&state.db, secret, prepared.objects, &config.season_id).await?;
    Ok(GamedayImportSummary::new(summary, prepared.note))
}

fn prepare_gameday_import(members: Vec<GamedayExportMember>) -> PreparedImport {
    let mut unrecognised_genders = BTreeSet::new();
    let mut invalid_rows = Vec::new();
    let mut objects = Vec::new();

    for (index, member) in members.into_iter().enumerate() {
        let reasons = read_invalid_gameday_member_reasons(&member);
        if !reasons.is_empty() {
            invalid_rows.push(InvalidMemberRow {
                row_number: index + 2,
                reasons,
                member,
            });
            continue;
        }
        let gender_matching =
            normalize_gameday_gender_matching(&member.gender, &mut unrecognised_genders);
        let mut object = ImportObject::new();
        object.insert("team_name".into(), member.team_name);
        object.insert("email_address".into(), member.email);
        object.insert("first_name".into(), member.first_name);
        object.insert("last_name".into(), member.last_name);
        object.insert("gender_matching".into(), gender_matching.as_str().into());
        objects.push(object);
    }

    let notes: Vec<String> = [
        format_invalid_gameday_rows_note(&invalid_rows),
        format_unrecognised_genders_note(&unrecognised_genders),
    ]
    .into_iter()
    .flatten()
    .collect();
    let note = notes.join("\n\n");
    PreparedImport {
        objects,
        note: (!note.is_empty()).then_some(note),
    }
}

fn read_invalid_gameday_member_reasons(member: &GamedayExportMember) -> Vec<&'static str> {
    let mut reasons = Vec::new();
    let blank = |value: &str| crate::js::trim(value).is_empty();
    if blank(&member.team_name) {
        reasons.push("missing team name");
    }
    if blank(&member.first_name) {
        reasons.push("missing first name");
    }
    if blank(&member.last_name) {
        reasons.push("missing last name");
    }
    reasons
}

fn format_invalid_gameday_rows_note(invalid_rows: &[InvalidMemberRow]) -> Option<String> {
    if invalid_rows.is_empty() {
        return None;
    }
    let visible = &invalid_rows[..invalid_rows.len().min(MAX_GAMEDAY_INVALID_ROW_NOTE_DETAILS)];
    let hidden_count = invalid_rows.len() - visible.len();
    let mut lines = vec![
        format!(
            "Skipped {}.",
            format_count(
                invalid_rows.len(),
                "invalid GameDay member row",
                "invalid GameDay member rows"
            )
        ),
        String::new(),
        "Rows skipped:".into(),
    ];
    lines.extend(visible.iter().map(format_invalid_gameday_row_note));
    if hidden_count > 0 {
        lines.push(format!(
            "- {} omitted from this note.",
            format_count(hidden_count, "additional row", "additional rows")
        ));
    }
    Some(lines.join("\n"))
}

fn format_invalid_gameday_row_note(row: &InvalidMemberRow) -> String {
    let problem_label = if row.reasons.len() == 1 {
        "Problem"
    } else {
        "Problems"
    };
    [
        format!("- Row {}", row.row_number),
        format!("  {problem_label}: {}", row.reasons.join("; ")),
        format_gameday_member_context(&row.member),
    ]
    .join("\n")
}

fn format_gameday_member_context(member: &GamedayExportMember) -> String {
    [
        format_context_value("Team", &member.team_name),
        format_context_value("First", &member.first_name),
        format_context_value("Last", &member.last_name),
        format_context_value("Email", &member.email),
    ]
    .join("\n")
}

fn format_context_value(label: &str, value: &str) -> String {
    let trimmed = crate::js::trim(value);
    if trimmed.is_empty() {
        format!("  {label}: <blank>")
    } else {
        format!("  {label}: \"{trimmed}\"")
    }
}

fn format_unrecognised_genders_note(unrecognised: &BTreeSet<String>) -> Option<String> {
    if unrecognised.is_empty() {
        return None;
    }
    // BTreeSet iterates in code unit order, like `[...set].sort()` for BMP text
    let mut lines = vec![format!(
        "Imported {} as {} gender matching:",
        format_count(
            unrecognised.len(),
            "unrecognised GameDay gender value",
            "unrecognised GameDay gender values"
        ),
        FALLBACK_USER_GENDER_MATCHING.as_str()
    )];
    lines.extend(unrecognised.iter().map(|value| format!("- \"{value}\"")));
    let note = lines.join("\n");
    log::warn(note.clone());
    Some(note)
}

fn format_count(count: usize, singular: &str, plural: &str) -> String {
    format!("{count} {}", if count == 1 { singular } else { plural })
}

/// GameDay records gender, which is mapped onto a male or female gender matching.
fn normalize_gameday_gender_matching(
    value: &str,
    unrecognised: &mut BTreeSet<String>,
) -> GenderMatching {
    let trimmed = crate::js::trim(value);
    if trimmed.is_empty() {
        return FALLBACK_USER_GENDER_MATCHING;
    }
    if let Some(gender_matching) = normalize_user_gender_matching(trimmed) {
        return gender_matching;
    }
    unrecognised.insert(trimmed.to_string());
    FALLBACK_USER_GENDER_MATCHING
}

#[cfg(test)]
#[path = "import_members_tests.rs"]
mod tests;
