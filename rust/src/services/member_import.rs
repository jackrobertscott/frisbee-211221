//! Port of `server/src/services/memberImport.ts`: creates the teams, users
//! and memberships described by member import rows (CSV or GameDay).
//!
//! Member imports are intentionally additive. Imported field values are only
//! used when a team, user, or membership does not already exist; this path
//! never updates names, gender matchings, emails, teams, or captain flags on
//! existing records.

use crate::db::{Db, Query};
use crate::services::user_email;
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error};
use crate::shared::schemas::{
    GenderMatching, Member, Team, User, UserEmail, normalize_user_gender_matching,
};
use crate::tables::{MEMBER, TEAM, USER};
use crate::utils::random::generate_id;
use indexmap::IndexMap;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// One parsed import row (`Record<string, string>`).
pub type ImportObject = IndexMap<String, String>;

/// `TMemberImportSummary`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberImportSummary {
    pub rows_imported: usize,
    pub teams_created: usize,
    pub users_created: usize,
    pub members_created: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserCreate {
    id: String,
    first_name: String,
    last_name: String,
    gender_matching: GenderMatching,
    terms_accepted: bool,
    emails: Vec<UserEmail>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamCreate {
    season_id: String,
    name: String,
    division: i64,
    color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberCreate {
    season_id: String,
    team_id: String,
    user_id: String,
    captain: bool,
    pending: bool,
}

struct PreparedRow {
    team_name: String,
    captain: bool,
    email_key: Option<String>,
    no_email_identity_key: String,
    no_email_season_identity_key: String,
    user_id: String,
    user: UserCreate,
}

const IMPORT_IDENTITY_SEPARATOR: &str = "\u{0000}";

fn field<'a>(object: &'a ImportObject, key: &str) -> Option<&'a str> {
    object.get(key).map(String::as_str)
}

/// `importMemberObjects(objects, seasonId)`. `secret` (`JWT_SECRET`) hashes
/// the new users' email codes.
pub async fn import_member_objects(
    db: &Db,
    secret: &str,
    objects: Vec<ImportObject>,
    season_id: &str,
) -> AppResult<MemberImportSummary> {
    // prepare (and validate) every row before writing anything
    let prepared = objects
        .iter()
        .enumerate()
        .map(|(index, object)| prepare_import_row(secret, object, index))
        .collect::<AppResult<Vec<_>>>()?;
    let rows = dedupe_prepared_import_rows(prepared);
    let season_id = season_id.to_string();
    let rows_imported = objects.len();
    db.transaction(move |c| {
        let teams_created = create_teams_from_objects(c, &objects, &season_id)?;
        let (users_created, members_created) = create_users_from_rows(c, rows, &season_id)?;
        Ok(MemberImportSummary {
            rows_imported,
            teams_created,
            users_created,
            members_created,
        })
    })
    .await
}

/// JavaScript `parseInt(value)` (base 10, or 16 with a `0x` prefix); `None`
/// for `NaN`.
fn js_parse_int(value: &str) -> Option<i64> {
    let text = crate::js::trim(value);
    let (negative, text) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
    };
    let (radix, text) = match text.get(..2) {
        Some("0x" | "0X") => (16, &text[2..]),
        _ => (10, text),
    };
    let digits: String = text.chars().take_while(|c| c.is_digit(radix)).collect();
    if digits.is_empty() {
        return None;
    }
    let parsed = digits.chars().fold(0f64, |acc, c| {
        acc * f64::from(radix) + f64::from(c.to_digit(radix).unwrap_or(0))
    });
    let parsed = if negative { -parsed } else { parsed };
    Some(parsed as i64)
}

fn create_teams_from_objects(
    c: &Connection,
    objects: &[ImportObject],
    season_id: &str,
) -> AppResult<usize> {
    let mut team_csv_map: IndexMap<String, TeamCreate> = IndexMap::new();
    for object in objects {
        let team_name = crate::js::trim(field(object, "team_name").unwrap_or_default());
        if team_name.is_empty() {
            continue;
        }
        let team_key = normalize_import_identity_value(team_name);
        if team_csv_map.contains_key(&team_key) {
            continue;
        }
        let division = field(object, "team_division")
            .filter(|value| !value.is_empty())
            .and_then(js_parse_int)
            .filter(|div| *div != 0)
            .unwrap_or(1);
        team_csv_map.insert(
            team_key,
            TeamCreate {
                season_id: season_id.to_string(),
                name: team_name.to_string(),
                division,
                color: "hsla(0, 0%, 100%, 1)".into(),
            },
        );
    }
    if team_csv_map.is_empty() {
        return Ok(0);
    }
    let team_db_names: HashSet<String> = TEAM
        .tx(c)
        .get_many(&Team::SEASON_ID.eq(season_id), &Query::new())?
        .iter()
        .map(|team| normalize_import_identity_value(&team.name))
        .collect();
    let new_teams: Vec<TeamCreate> = team_csv_map
        .into_values()
        .filter(|team| !team_db_names.contains(&normalize_import_identity_value(&team.name)))
        .collect();
    if !new_teams.is_empty() {
        TEAM.tx(c).create_many(&new_teams)?;
    }
    Ok(new_teams.len())
}

fn create_users_from_rows(
    c: &Connection,
    rows: Vec<PreparedRow>,
    season_id: &str,
) -> AppResult<(usize, usize)> {
    let csv_emails: Vec<String> = rows
        .iter()
        .flat_map(|row| row.user.emails.first().map(|email| email.value.clone()))
        .collect();
    let user_db_list = if csv_emails.is_empty() {
        Vec::new()
    } else {
        USER.tx(c).get_many(
            &User::EMAILS.any(UserEmail::VALUE.in_ci(csv_emails)),
            &Query::new(),
        )?
    };
    let mut user_id_by_email: HashMap<String, String> = HashMap::new();
    for user in &user_db_list {
        for email in &user.emails {
            user_id_by_email.insert(
                crate::js::trim(&crate::js::to_lower(&email.value)).to_string(),
                user.id.clone(),
            );
        }
    }

    let team_db_list = TEAM
        .tx(c)
        .get_many(&Team::SEASON_ID.eq(season_id), &Query::new())?;
    let user_id_by_no_email_identity =
        get_existing_no_email_user_ids(c, &rows, &team_db_list, season_id)?;

    let existing_user_id = |row: &PreparedRow| -> Option<String> {
        match &row.email_key {
            Some(key) => user_id_by_email.get(key).cloned(),
            None => user_id_by_no_email_identity
                .get(&row.no_email_identity_key)
                .cloned(),
        }
    };

    let new_users: Vec<&UserCreate> = rows
        .iter()
        .filter(|row| existing_user_id(row).is_none())
        .map(|row| &row.user)
        .collect();
    if !new_users.is_empty() {
        USER.tx(c).create_many(&new_users)?;
    }

    let mut imported_user_ids: Vec<String> = Vec::new();
    for row in &rows {
        let user_id = existing_user_id(row).unwrap_or_else(|| row.user_id.clone());
        if !imported_user_ids.contains(&user_id) {
            imported_user_ids.push(user_id);
        }
    }
    let member_csv_list: Vec<MemberCreate> = rows
        .iter()
        .filter_map(|row| {
            let user_id = existing_user_id(row).unwrap_or_else(|| row.user_id.clone());
            let team_name = normalize_import_identity_value(&row.team_name);
            let team = team_db_list
                .iter()
                .find(|team| normalize_import_identity_value(&team.name) == team_name)?;
            Some(MemberCreate {
                season_id: team.season_id.clone(),
                team_id: team.id.clone(),
                user_id,
                captain: row.captain,
                pending: false,
            })
        })
        .collect();

    let member_db_user_ids: HashSet<String> = if imported_user_ids.is_empty() {
        HashSet::new()
    } else {
        MEMBER
            .tx(c)
            .get_many(
                &Member::SEASON_ID
                    .eq(season_id)
                    .and_also(Member::USER_ID.is_in(imported_user_ids)),
                &Query::new(),
            )?
            .into_iter()
            .map(|member| member.user_id)
            .collect()
    };
    let new_members: Vec<MemberCreate> = member_csv_list
        .into_iter()
        .filter(|member| !member_db_user_ids.contains(&member.user_id))
        .collect();
    if !new_members.is_empty() {
        MEMBER.tx(c).create_many(&new_members)?;
    }
    Ok((new_users.len(), new_members.len()))
}

fn prepare_import_row(secret: &str, object: &ImportObject, index: usize) -> AppResult<PreparedRow> {
    // `gender` is the heading older spreadsheets used for the same value
    let gender_matching_value = field(object, "gender_matching")
        .or_else(|| field(object, "gender"))
        .unwrap_or_default();
    let Some(gender_matching) = normalize_user_gender_matching(gender_matching_value) else {
        return Err(bad_request_error(
            format!(
                "Failed: row {} has invalid gender matching \"{gender_matching_value}\". Use male or female.",
                index + 2
            ),
            ErrorOptions::code("upload.invalid_gender_matching"),
        ));
    };

    let email = user_email::sanitize_value(field(object, "email_address").unwrap_or_default());
    let user_id = generate_id();
    let team_name = field(object, "team_name").unwrap_or_default().to_string();
    let first_name = field(object, "first_name").unwrap_or_default().to_string();
    let last_name = field(object, "last_name").unwrap_or_default().to_string();
    let emails = match &email {
        Some(email) => vec![user_email::create(secret, email, true, None)?],
        None => Vec::new(),
    };

    Ok(PreparedRow {
        captain: field(object, "type") == Some("team"),
        email_key: email.as_deref().map(crate::js::to_lower),
        no_email_identity_key: read_import_identity_key(&[&team_name, &first_name, &last_name]),
        no_email_season_identity_key: read_import_identity_key(&[&first_name, &last_name]),
        user_id: user_id.clone(),
        user: UserCreate {
            id: user_id,
            first_name,
            last_name,
            gender_matching,
            terms_accepted: false,
            emails,
        },
        team_name,
    })
}

fn dedupe_prepared_import_rows(rows: Vec<PreparedRow>) -> Vec<PreparedRow> {
    let mut seen_keys = HashSet::new();
    rows.into_iter()
        .filter(|row| {
            let key = match &row.email_key {
                Some(email) => format!("email:{email}"),
                None => format!("name:{}", row.no_email_identity_key),
            };
            seen_keys.insert(key)
        })
        .collect()
}

fn get_existing_no_email_user_ids(
    c: &Connection,
    rows: &[PreparedRow],
    team_db_list: &[Team],
    season_id: &str,
) -> AppResult<HashMap<String, String>> {
    let mut result = HashMap::new();
    let rows_without_email: Vec<&PreparedRow> =
        rows.iter().filter(|row| row.email_key.is_none()).collect();
    if rows_without_email.is_empty() {
        return Ok(result);
    }
    let member_db_list = MEMBER
        .tx(c)
        .get_many(&Member::SEASON_ID.eq(season_id), &Query::new())?;
    if member_db_list.is_empty() {
        return Ok(result);
    }

    let mut user_ids: Vec<String> = Vec::new();
    for member in &member_db_list {
        if !user_ids.contains(&member.user_id) {
            user_ids.push(member.user_id.clone());
        }
    }
    let user_db_list = USER
        .tx(c)
        .get_many(&User::ID.is_in(user_ids), &Query::new())?;
    let user_by_id: HashMap<&str, &User> =
        user_db_list.iter().map(|u| (u.id.as_str(), u)).collect();
    let team_by_id: HashMap<&str, &Team> =
        team_db_list.iter().map(|t| (t.id.as_str(), t)).collect();
    let mut by_team_identity: HashMap<String, HashSet<String>> = HashMap::new();
    let mut by_season_identity: HashMap<String, HashSet<String>> = HashMap::new();

    for member in &member_db_list {
        let Some(user) = user_by_id.get(member.user_id.as_str()) else {
            continue;
        };
        by_season_identity
            .entry(read_import_identity_key(&[
                &user.first_name,
                &user.last_name,
            ]))
            .or_default()
            .insert(user.id.clone());
        let Some(team) = team_by_id.get(member.team_id.as_str()) else {
            continue;
        };
        by_team_identity
            .entry(read_import_identity_key(&[
                &team.name,
                &user.first_name,
                &user.last_name,
            ]))
            .or_default()
            .insert(user.id.clone());
    }

    let single = |values: Option<&HashSet<String>>| -> Option<String> {
        values
            .filter(|set| set.len() == 1)
            .and_then(|set| set.iter().next().cloned())
    };
    for row in rows_without_email {
        let user_id = single(by_team_identity.get(&row.no_email_identity_key))
            .or_else(|| single(by_season_identity.get(&row.no_email_season_identity_key)));
        if let Some(user_id) = user_id {
            result.insert(row.no_email_identity_key.clone(), user_id);
        }
    }
    Ok(result)
}

fn read_import_identity_key(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| normalize_import_identity_value(value))
        .collect::<Vec<_>>()
        .join(IMPORT_IDENTITY_SEPARATOR)
}

fn normalize_import_identity_value(value: &str) -> String {
    crate::js::replace_whitespace_runs(&crate::js::to_lower(crate::js::trim(value)), " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_integers_like_javascript() {
        assert_eq!(js_parse_int("2"), Some(2));
        assert_eq!(js_parse_int(" 12abc"), Some(12));
        assert_eq!(js_parse_int("2.9"), Some(2));
        assert_eq!(js_parse_int("-3"), Some(-3));
        assert_eq!(js_parse_int("0x1A"), Some(26));
        assert_eq!(js_parse_int("abc"), None);
        assert_eq!(js_parse_int(""), None);
    }

    #[test]
    fn normalizes_identity_values() {
        assert_eq!(
            normalize_import_identity_value("  Alpha \t Team "),
            "alpha team"
        );
        assert_eq!(read_import_identity_key(&["A", "B"]), "a\u{0}b");
    }
}
