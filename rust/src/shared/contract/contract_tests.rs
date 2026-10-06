//! Port of `shared/src/endpoints/endpointDefs.test.ts`.

use super::*;
use crate::shared::auth_access::AuthPoint;
use crate::shared::torva::Io;
use crate::shared::utils::endpoint_def::LIST_LIMIT_MAX;
use serde_json::{Value, json};
use std::collections::HashSet;

const ID: &str = "0123456789abcdef01234567";
const ID2: &str = "0123456789abcdef01234568";

/// Payloads arrive as untyped JSON, so validate with an arbitrary value.
fn check(schema: fn() -> Io, value: Value) -> Result<Value, String> {
    schema().validate(&value)
}

fn with(base: &Value, extra: Value) -> Value {
    let mut merged = base.as_object().cloned().unwrap_or_default();
    if let Value::Object(extra) = extra {
        merged.extend(extra);
    }
    Value::Object(merged)
}

mod endpoint_definitions {
    use super::*;

    #[test]
    fn are_discovered_from_every_module() {
        let defs = all_defs();
        assert!(defs.len() > 50);
        for module in [
            "FeatureDef",
            "FixtureDef",
            "MemberDef",
            "PortDef",
            "ReportDef",
            "SeasonDef",
            "SecurityDef",
            "TeamDef",
            "UserDef",
        ] {
            assert!(defs.iter().any(|(m, _)| *m == module), "{module}");
        }
    }

    #[test]
    fn path_matches_its_export_name() {
        for (_, def) in all_defs() {
            assert_eq!(def.path, format!("/{}", def.name));
        }
    }

    #[test]
    fn path_belongs_to_its_module_namespace() {
        for (module, def) in all_defs() {
            assert!(
                def.name.starts_with(module.trim_end_matches("Def")),
                "{}",
                def.name
            );
        }
    }

    #[test]
    fn have_unique_paths() {
        let defs = all_defs();
        let paths: HashSet<&str> = defs.iter().map(|(_, def)| def.path).collect();
        assert_eq!(paths.len(), defs.len());
    }

    #[test]
    fn uses_a_known_access_point() {
        for (_, def) in all_defs() {
            if let Some(access) = def.access {
                assert!(AuthPoint::ALL.contains(&access));
            }
        }
    }

    #[test]
    fn payload_and_result_are_schemas() {
        // payload/result are `fn() -> Io`, so building them must not panic
        for (_, def) in all_defs() {
            if let Some(payload) = def.payload {
                let _ = payload().type_name();
            }
            if let Some(result) = def.result {
                let _ = result().type_name();
            }
        }
    }

    #[test]
    fn multipart_endpoints_do_not_declare_a_json_payload() {
        let multipart: Vec<_> = all_defs()
            .into_iter()
            .filter(|(_, def)| def.multipart)
            .collect();
        assert!(!multipart.is_empty());
        for (_, def) in multipart {
            assert!(def.payload.is_none());
        }
    }

    #[test]
    fn only_admin_access_points_guard_admin_namespaces() {
        let admin_only = [
            AuthPoint::UserManage,
            AuthPoint::SeasonManage,
            AuthPoint::PortManage,
            AuthPoint::FixtureManage,
        ];
        for (module, def) in all_defs() {
            if module == "PortDef" {
                assert_eq!(def.access, Some(AuthPoint::PortManage));
            }
            if module == "SeasonDef" && def.path != season::SEASON_LIST.path {
                assert_eq!(def.access, Some(AuthPoint::SeasonManage));
            }
            if module == "FixtureDef" {
                assert_eq!(def.access, Some(AuthPoint::FixtureManage));
            }
            if def.path.starts_with("/User") && !def.path.starts_with("/UserCurrent") {
                assert!(
                    def.access.is_some_and(|a| admin_only.contains(&a)),
                    "{}",
                    def.path
                );
            }
            if def.path.starts_with("/UserCurrent") {
                assert_eq!(def.access, Some(AuthPoint::UserSelf));
            }
        }
    }
}

mod list_sort_keys {
    use super::*;

    #[test]
    fn sort_keys_use_domain_fields_not_ids() {
        for keys in [
            &team::TEAM_LIST_SORT_KEYS[..],
            &user::USER_LIST_SORT_KEYS[..],
            &feature::FEATURE_SPIRIT_SORT_KEYS[..],
        ] {
            assert!(!keys.contains(&"id"));
            assert!(!keys.iter().any(|key| key.ends_with("Id")));
            let unique: HashSet<&&str> = keys.iter().collect();
            assert_eq!(unique.len(), keys.len());
        }
    }

    #[test]
    fn paginated_list_payloads_bound_the_page_size() {
        for schema in [
            user::user_list_payload as fn() -> Io,
            feature::feature_dashboard_teams_load_payload,
        ] {
            let base = json!({"seasonId": ID});
            assert!(check(schema, with(&base, json!({"limit": LIST_LIMIT_MAX}))).is_ok());
            assert!(check(schema, with(&base, json!({"limit": LIST_LIMIT_MAX + 1.0}))).is_err());
            assert!(check(schema, with(&base, json!({"skip": -1}))).is_err());
        }
    }

    #[test]
    fn rejects_unknown_sort_keys() {
        assert!(check(user::user_list_payload, json!({"sortBy": "password"})).is_err());
        assert!(check(user::user_list_payload, json!({"sortBy": "id"})).is_err());
        assert!(check(user::user_list_payload, json!({"sortBy": "lastName"})).is_ok());
    }
}

mod payload_validation {
    use super::*;

    #[test]
    fn login_requires_a_valid_email_and_trims_it() {
        assert!(
            check(
                security::security_login_payload,
                json!({"email": "nope", "password": "x"})
            )
            .is_err()
        );
        assert_eq!(
            check(
                security::security_login_payload,
                json!({"email": " a@b.co ", "password": "x"})
            ),
            Ok(json!({"email": "a@b.co", "password": "x"}))
        );
    }

    #[test]
    fn sign_up_only_accepts_male_or_female_gender_matching() {
        let base =
            json!({"email": "a@b.co", "firstName": "A", "lastName": "B", "termsAccepted": true});
        assert!(
            check(
                security::security_sign_up_payload,
                with(&base, json!({"genderMatching": "female"}))
            )
            .is_ok()
        );
        assert!(
            check(
                security::security_sign_up_payload,
                with(&base, json!({"genderMatching": "other"}))
            )
            .is_err()
        );
        assert!(check(security::security_sign_up_payload, base).is_err());
    }

    #[test]
    fn self_update_cannot_set_admin_or_other_protected_fields() {
        let result = check(
            user::user_profile_update_payload,
            json!({"firstName": "Sam", "admin": true, "password": "secret", "emails": []}),
        );
        assert_eq!(result, Ok(json!({"firstName": "Sam"})));
    }

    #[test]
    fn report_create_drops_the_submitter_id_so_it_cannot_be_spoofed() {
        let result = check(
            report::report_create_payload,
            json!({
                "teamId": ID, "teamAgainstId": ID2, "fixtureId": ID, "scoreFor": 3, "scoreAgainst": 2,
                "spiritComment": "", "userId": ID2, "id": ID2
            }),
        )
        .unwrap();
        assert!(result.get("userId").is_none());
        assert!(result.get("id").is_none());
    }

    #[test]
    fn report_update_distinguishes_cleared_mvps_from_omitted_ones() {
        let base = json!({"reportId": ID, "scoreFor": 1, "scoreAgainst": 1, "spiritComment": ""});
        let result = check(
            report::report_update_payload,
            with(&base, json!({"mvpMale": null})),
        )
        .unwrap();
        assert_eq!(result.get("mvpMale"), Some(&Value::Null));
        assert!(result.get("mvpFemale").is_none());
        assert!(
            check(
                report::report_update_payload,
                with(&base, json!({"mvpMale": ""}))
            )
            .is_err()
        );
    }

    #[test]
    fn team_colours_must_be_hsla_strings() {
        let base = json!({"seasonId": ID, "name": "Team"});
        assert!(
            check(
                team::team_current_create_payload,
                with(&base, json!({"color": "hsla(10, 50%, 50%, 1)"}))
            )
            .is_ok()
        );
        assert!(
            check(
                team::team_current_create_payload,
                with(&base, json!({"color": "#ff0000"}))
            )
            .is_err()
        );
    }

    #[test]
    fn season_gender_division_is_restricted_to_known_divisions() {
        assert!(
            check(
                season::season_create_payload,
                json!({"name": "S", "genderDivision": "women"})
            )
            .is_ok()
        );
        assert!(
            check(
                season::season_create_payload,
                json!({"name": "S", "genderDivision": "open"})
            )
            .is_err()
        );
    }

    #[test]
    fn bounds_generated_and_adjusted_fixture_counts() {
        let generate = json!({"seasonId": ID, "startingDate": "2026-01-01", "slots": []});
        assert!(
            check(
                fixture::fixture_generate_payload,
                with(&generate, json!({"roundCount": 100}))
            )
            .is_ok()
        );
        assert!(
            check(
                fixture::fixture_generate_payload,
                with(&generate, json!({"roundCount": 101}))
            )
            .is_err()
        );
        assert!(
            check(
                fixture::fixture_generate_payload,
                with(&generate, json!({"roundCount": 0}))
            )
            .is_err()
        );
        let adjust = json!({"seasonId": ID, "referenceFixtureId": ID2, "unit": "week", "direction": "forward"});
        assert!(
            check(
                fixture::fixture_adjust_multiple_payload,
                with(&adjust, json!({"amount": 0}))
            )
            .is_ok()
        );
        assert!(
            check(
                fixture::fixture_adjust_multiple_payload,
                with(&adjust, json!({"amount": -1}))
            )
            .is_err()
        );
        assert!(
            check(
                fixture::fixture_adjust_multiple_payload,
                with(&adjust, json!({"unit": "year", "amount": 1}))
            )
            .is_err()
        );
    }

    #[test]
    fn bounds_mock_data_generation() {
        let base = json!({"seasonId": ID});
        assert!(
            check(
                port::port_mock_generate_payload,
                with(&base, json!({"teams": 500, "usersPerTeam": 100}))
            )
            .is_ok()
        );
        assert!(
            check(
                port::port_mock_generate_payload,
                with(&base, json!({"teams": 501, "usersPerTeam": 1}))
            )
            .is_err()
        );
        assert!(
            check(
                port::port_mock_generate_payload,
                with(&base, json!({"teams": 1, "usersPerTeam": 101}))
            )
            .is_err()
        );
    }
}

mod auth_payload_result {
    use super::*;

    #[test]
    fn strips_passwords_and_email_codes_from_the_user() {
        let now = "2026-01-01T00:00:00.000Z";
        let result = check(
            security::io_auth_payload,
            json!({
                "user": {
                    "id": ID, "createdOn": now, "updatedOn": now, "firstName": "A", "lastName": "B",
                    "genderMatching": "male", "termsAccepted": true, "password": "hash",
                    "emails": [{"value": "a@b.co", "verified": true, "code": "secret-code", "createdOn": now, "primary": true}]
                },
                "session": {"id": ID2, "createdOn": now, "updatedOn": now, "expiresOn": now, "token": "token", "userId": ID}
            }),
        )
        .unwrap();
        assert!(result["user"].get("password").is_none());
        assert!(result["user"]["emails"][0].get("code").is_none());
        assert_eq!(result["user"]["emails"][0]["value"], json!("a@b.co"));
    }
}
