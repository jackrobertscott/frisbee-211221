//! Port of `server/src/services/csvImport.ts`.

use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error};
use indexmap::IndexMap;

pub const MEMBER_IMPORT_REQUIRED_HEADINGS: [&str; 4] =
    ["team_name", "email_address", "first_name", "last_name"];

pub const MEMBER_IMPORT_ALLOWED_HEADINGS: [&str; 8] = [
    "team_name",
    "team_division",
    "type",
    "email_address",
    "first_name",
    "last_name",
    "gender_matching",
    // older spreadsheets name the gender matching column `gender`
    "gender",
];

/// `assertMemberImportHeadings(objects)`: rejects a parsed member import CSV
/// whose first row is missing a required heading or has a heading the import
/// does not understand.
pub fn assert_member_import_headings(objects: &[IndexMap<String, String>]) -> AppResult<()> {
    let provided: Vec<&str> = objects
        .first()
        .map(|row| row.keys().map(String::as_str).collect())
        .unwrap_or_default();
    let missing: Vec<&str> = MEMBER_IMPORT_REQUIRED_HEADINGS
        .iter()
        .copied()
        .filter(|h| !provided.contains(h))
        .collect();
    if !missing.is_empty() {
        return Err(bad_request_error(
            format!("Missing required headings: {}", missing.join(", ")),
            ErrorOptions::default(),
        ));
    }
    let unexpected: Vec<&str> = provided
        .into_iter()
        .filter(|h| !MEMBER_IMPORT_ALLOWED_HEADINGS.contains(h))
        .collect();
    if !unexpected.is_empty() {
        return Err(bad_request_error(
            format!("Unexpected headings found: {}", unexpected.join(", ")),
            ErrorOptions::default(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(headings: &[&str]) -> IndexMap<String, String> {
        headings
            .iter()
            .map(|h| (h.to_string(), String::new()))
            .collect()
    }

    fn message(objects: &[IndexMap<String, String>]) -> String {
        assert_member_import_headings(objects)
            .unwrap_err()
            .message
            .clone()
    }

    mod assert_member_import_headings_tests {
        use super::*;

        #[test]
        fn accepts_the_required_headings_with_optional_extras() {
            assert!(
                assert_member_import_headings(&[row(&[
                    "team_name",
                    "team_division",
                    "type",
                    "email_address",
                    "first_name",
                    "last_name",
                    "gender_matching",
                ])])
                .is_ok()
            );
        }

        #[test]
        fn lists_every_missing_required_heading() {
            assert_eq!(
                message(&[row(&["team_name", "first_name"])]),
                "Missing required headings: email_address, last_name"
            );
        }

        #[test]
        fn treats_an_empty_file_as_missing_every_heading() {
            assert_eq!(
                message(&[]),
                "Missing required headings: team_name, email_address, first_name, last_name"
            );
        }

        #[test]
        fn rejects_unexpected_headings_after_checking_required_ones() {
            assert_eq!(
                message(&[row(&[
                    "team_name",
                    "email_address",
                    "first_name",
                    "last_name",
                    "age"
                ])]),
                "Unexpected headings found: age"
            );
        }
    }
}
