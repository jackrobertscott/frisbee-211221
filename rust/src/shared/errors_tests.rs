//! Port of `shared/src/errors.test.ts`.

use super::*;
use serde_json::json;

const INTERNAL: &str = INTERNAL_USER_MESSAGE;

fn error_with(message: &str, props: Value) -> ErrorInput {
    let mut error = ErrorLike::new("Error", message);
    if let Value::Object(map) = props {
        error.props = map;
    }
    ErrorInput::Error(error)
}

fn opts() -> ErrorOptions {
    ErrorOptions::default()
}

fn status(code: u16) -> ErrorOptions {
    ErrorOptions {
        status_code: Some(code),
        ..Default::default()
    }
}

fn meta(value: Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

mod app_error {
    use super::*;

    #[test]
    fn defaults_to_an_unexposed_internal_error() {
        let error = AppError::new("boom", opts());
        assert_eq!(error.message, "boom");
        assert_eq!(error.status_code, 500);
        assert_eq!(error.error_code, "internal_error");
        assert!(!error.expose);
        assert!(!error.retryable);
        assert_eq!(error.user_message, INTERNAL);
        assert_eq!(error.details, None);
        assert_eq!(error.meta, None);
        assert_eq!(error.to_string(), "AppError: boom");
    }

    #[test]
    fn derives_error_code_and_exposure_from_status_code() {
        let cases = [
            (400, "bad_request", true),
            (401, "unauthorized", true),
            (403, "forbidden", true),
            (404, "not_found", true),
            (405, "method_not_allowed", true),
            (409, "conflict", true),
            (413, "payload_too_large", true),
            (422, "validation_error", true),
            (429, "too_many_requests", true),
            (503, "service_unavailable", false),
            (418, "internal_error", true),
        ];
        for (status_code, error_code, expose) in cases {
            let error = AppError::new("x", status(status_code));
            assert_eq!(error.error_code, error_code);
            assert_eq!(error.expose, expose);
        }
    }

    #[test]
    fn uses_explicit_user_messages_collapsing_whitespace() {
        let error = AppError::new("x", opts().with_user_message("  Hello\n   there  "));
        assert_eq!(error.user_message, "Hello there");
    }

    #[test]
    fn ignores_a_whitespace_only_user_message() {
        let error = AppError::new("x", opts().with_user_message("   "));
        assert_eq!(error.user_message, INTERNAL);
    }

    #[test]
    fn maps_known_error_codes_to_user_messages() {
        assert_eq!(
            AppError::new(
                "x",
                ErrorOptions::code("auth.invalid_login").with_status_code(401)
            )
            .user_message,
            "The email or password is not correct."
        );
        assert_eq!(
            AppError::new(
                "x",
                ErrorOptions::code("user.code_invalid").with_status_code(400)
            )
            .user_message,
            "That code is not correct."
        );
    }

    #[test]
    fn uses_a_cleaned_exposed_message_for_unknown_codes_below_500() {
        let error = AppError::new(
            "Failed:   Team can not   be saved",
            ErrorOptions::code("custom.thing").with_status_code(400),
        );
        assert_eq!(error.user_message, "Team cannot be saved");
        assert_eq!(
            AppError::new(
                "An error occurred: oops",
                ErrorOptions::code("custom.thing").with_status_code(400)
            )
            .user_message,
            "oops"
        );
    }

    #[test]
    fn falls_back_to_the_status_message_for_unexposed_or_empty_messages() {
        assert_eq!(
            AppError::new(
                "secret",
                ErrorOptions::code("custom.thing")
                    .with_status_code(404)
                    .with_expose(false)
            )
            .user_message,
            "We could not find what you were looking for."
        );
        assert_eq!(
            AppError::new(
                "failed:",
                ErrorOptions::code("custom.thing").with_status_code(403)
            )
            .user_message,
            "You do not have permission to do that."
        );
        assert_eq!(
            AppError::new(
                "x",
                ErrorOptions::code("custom.thing")
                    .with_status_code(418)
                    .with_expose(false)
            )
            .user_message,
            INTERNAL
        );
    }

    #[test]
    fn never_uses_the_raw_message_for_5xx_errors_even_when_exposed() {
        assert_eq!(
            AppError::new(
                "db down",
                ErrorOptions::code("custom.thing")
                    .with_status_code(503)
                    .with_expose(true)
            )
            .user_message,
            "This feature is temporarily unavailable. Please try again later."
        );
    }

    #[test]
    fn keeps_optional_fields() {
        let error = AppError::new(
            "x",
            opts()
                .with_details(json!({"a": 1}))
                .with_retryable(true)
                .with_cause("root")
                .with_meta(meta(json!({"b": 2})))
                .with_tarpit(json!({"holdMs": 1})),
        );
        assert_eq!(error.details, Some(json!({"a": 1})));
        assert!(error.retryable);
        assert_eq!(error.cause.as_deref(), Some("root"));
        assert_eq!(error.meta, Some(meta(json!({"b": 2}))));
        assert_eq!(error.tarpit, Some(json!({"holdMs": 1})));
    }
}

mod error_factories {
    use super::*;

    #[test]
    fn create_errors_with_fixed_status_and_code() {
        let cases = [
            (
                bad_request_error("x", opts()),
                400,
                "bad_request",
                "Please check the information you entered and try again.",
            ),
            (
                unauthorized_error("x", opts()),
                401,
                "unauthorized",
                "Please sign in to continue.",
            ),
            (
                forbidden_error("x", opts()),
                403,
                "forbidden",
                "You do not have permission to do that.",
            ),
            (
                not_found_error("x", opts()),
                404,
                "not_found",
                "We could not find what you were looking for.",
            ),
            (
                method_not_allowed_error("x", opts()),
                405,
                "method_not_allowed",
                "This action is not available from here.",
            ),
            (
                conflict_error("x", opts()),
                409,
                "conflict",
                "That change could not be saved because it conflicts with existing information.",
            ),
            (
                payload_too_large_error("x", opts()),
                413,
                "payload_too_large",
                "That upload is too large.",
            ),
            (
                validation_error("x", opts()),
                422,
                "validation_error",
                "Please check the information you entered and try again.",
            ),
            (
                too_many_requests_error("x", opts()),
                429,
                "too_many_requests",
                "Too many attempts were made. Please wait a little while before trying again.",
            ),
            (
                service_unavailable_error("x", opts()),
                503,
                "service_unavailable",
                "This feature is temporarily unavailable. Please try again later.",
            ),
        ];
        for (error, status_code, error_code, user_message) in cases {
            assert_eq!(error.message, "x");
            assert_eq!(error.status_code, status_code);
            assert_eq!(error.error_code, error_code);
            assert_eq!(error.user_message, user_message);
            assert_eq!(error.expose, status_code < 500);
        }
    }

    #[test]
    fn accept_an_overriding_error_code() {
        let error = bad_request_error("Bad team", ErrorOptions::code("team.custom"));
        assert_eq!(error.error_code, "team.custom");
        assert_eq!(error.user_message, "Bad team");
        assert_eq!(
            forbidden_error("x", ErrorOptions::code("team.captain_required")).user_message,
            "Only a team captain can do that."
        );
    }

    #[test]
    fn internal_error_defaults_its_message_and_is_never_exposed() {
        let error = internal_error(None, opts());
        assert_eq!(error.message, "Internal Server Error");
        assert_eq!(error.status_code, 500);
        assert_eq!(error.error_code, "internal_error");
        assert!(!error.expose);
        assert_eq!(error.user_message, INTERNAL);
    }

    #[test]
    fn internal_error_accepts_a_custom_error_code() {
        let error = internal_error(Some("missing"), ErrorOptions::code("db.record_not_found"));
        assert_eq!(error.status_code, 500);
        assert_eq!(error.error_code, "db.record_not_found");
        assert_eq!(
            error.user_message,
            "We could not find the item you were trying to open."
        );
    }

    #[test]
    fn create_error_merges_overrides_over_base_options() {
        let error = create_error(
            "base",
            ErrorOptions::code("bad_request").with_status_code(400),
            ErrorOptions {
                message: Some("override".into()),
                status_code: Some(404),
                ..Default::default()
            },
        );
        assert_eq!(error.message, "override");
        assert_eq!(error.status_code, 404);
        assert_eq!(error.error_code, "bad_request");
        let from_string = create_error("plain", opts(), status(409));
        assert_eq!(from_string.message, "plain");
        assert_eq!(from_string.error_code, "conflict");
        assert!(from_string.expose);
    }
}

mod validation_user_messages {
    use super::*;

    #[test]
    fn humanises_the_field_named_in_validation_details() {
        let cases = [
            ("[email]: Value is not a valid email.", "email address"),
            ("[teamAgainstId]: ID can not be empty.", "opposition team"),
            ("[roundCount]: Value is not a number.", "number of rounds"),
            ("[homeTeamId]: x", "home team"),
            ("[some_field-name]: x", "some field name"),
            ("[user.firstName]: x", "first name"),
            ("[list]: [1]: [id]: x", "list"),
            ("[spiritP1]: x", "spirit p1"),
        ];
        for (details, field) in cases {
            assert_eq!(
                get_validation_user_message(Some(&json!(details))),
                format!("Please check {field} and try again.")
            );
        }
    }

    #[test]
    fn falls_back_to_the_generic_message_without_a_field() {
        let generic = "Please check the information you entered and try again.";
        assert_eq!(get_validation_user_message(None), generic);
        assert_eq!(
            get_validation_user_message(Some(&json!("no field here"))),
            generic
        );
        assert_eq!(
            get_validation_user_message(Some(&json!({"field": "email"}))),
            generic
        );
    }

    #[test]
    fn is_used_for_validation_error_app_errors() {
        let error = validation_error(
            "[firstName]: Value can not be empty.",
            opts().with_details(json!("[firstName]: Value can not be empty.")),
        );
        assert_eq!(error.user_message, "Please check first name and try again.");
        // the message itself is not inspected, only details
        assert_eq!(
            validation_error("[firstName]: x", opts()).user_message,
            "Please check the information you entered and try again."
        );
    }
}

mod is_app_error_is_serialized_app_error {
    use super::*;

    #[test]
    fn detects_app_error_instances() {
        // Rust's type system distinguishes AppError from other errors; the
        // serialised form is a plain value, not an AppError
        let serialized = serialize_error(
            not_found_error("x", opts()).into(),
            SerializeOptions::default(),
        )
        .to_value();
        assert!(matches!(
            ErrorInput::from(not_found_error("x", opts())),
            ErrorInput::App(_)
        ));
        assert!(!matches!(
            ErrorInput::Value(Some(serialized)),
            ErrorInput::App(_)
        ));
    }

    #[test]
    fn detects_serialized_errors() {
        let serialized = serialize_error(
            not_found_error("x", opts()).into(),
            SerializeOptions::default(),
        )
        .to_value();
        assert!(is_serialized_app_error(&serialized));
        assert!(is_serialized_app_error(&json!({
            "name": "AppError", "message": "x", "errorCode": "x", "expose": true, "retryable": false, "code": "404"
        })));
        assert!(!is_serialized_app_error(&json!({
            "type": "app_error", "message": "x", "errorCode": "x", "expose": true, "retryable": false, "statusCode": 200
        })));
        assert!(!is_serialized_app_error(&json!({
            "type": "app_error", "message": "x", "errorCode": "x", "expose": true, "statusCode": 404
        })));
        assert!(!is_serialized_app_error(&Value::Null));
        assert!(!is_serialized_app_error(&json!("x")));
    }
}

mod to_app_error_tests {
    use super::*;

    #[test]
    fn returns_app_errors_unchanged() {
        let error = not_found_error("x", opts());
        assert_eq!(to_app_error(error.clone().into(), opts()), error);
    }

    #[test]
    fn wraps_strings_as_internal_errors() {
        let error = to_app_error(ErrorInput::Value(Some(json!("oops"))), opts());
        assert_eq!(error.message, "oops");
        assert_eq!(error.status_code, 500);
        assert_eq!(error.error_code, "internal_error");
        assert!(!error.expose);
    }

    #[test]
    fn applies_fallback_options_to_strings() {
        let error = to_app_error(ErrorInput::Value(Some(json!("oops"))), status(400));
        assert_eq!(error.status_code, 400);
        assert_eq!(error.error_code, "bad_request");
        assert!(error.expose);
    }

    #[test]
    fn wraps_plain_errors_as_internal_errors() {
        let error = to_app_error(error_with("boom", json!({})), opts());
        assert_eq!(error.message, "boom");
        assert_eq!(error.status_code, 500);
        assert_eq!(error.error_code, "internal_error");
        assert!(!error.expose);
        assert_eq!(error.user_message, INTERNAL);
    }

    #[test]
    fn reads_status_codes_from_status_code_or_numeric_code() {
        assert_eq!(
            to_app_error(error_with("x", json!({"statusCode": 404})), opts()).status_code,
            404
        );
        assert_eq!(
            to_app_error(error_with("x", json!({"statusCode": "403"})), opts()).status_code,
            403
        );
        let from_code = to_app_error(error_with("x", json!({"code": "409"})), opts());
        assert_eq!(from_code.status_code, 409);
        assert_eq!(from_code.error_code, "conflict");
        assert_eq!(
            to_app_error(error_with("x", json!({"statusCode": 200})), opts()).status_code,
            500
        );
    }

    #[test]
    fn uses_a_string_code_as_the_error_code() {
        let error = to_app_error(
            error_with("connect failed", json!({"code": "ECONNREFUSED"})),
            opts(),
        );
        assert_eq!(error.status_code, 500);
        assert_eq!(error.error_code, "ECONNREFUSED");
        assert_eq!(error.user_message, INTERNAL);
    }

    #[test]
    fn prefers_error_code_over_code() {
        let error = to_app_error(
            error_with(
                "x",
                json!({"statusCode": 401, "errorCode": "auth.invalid_login", "code": "E"}),
            ),
            opts(),
        );
        assert_eq!(error.error_code, "auth.invalid_login");
        assert_eq!(error.user_message, "The email or password is not correct.");
    }

    #[test]
    fn maps_validation_error_to_422() {
        let app_error = to_app_error(
            ErrorInput::Error(ErrorLike::new("ValidationError", "bad")),
            opts(),
        );
        assert_eq!(app_error.status_code, 422);
        assert_eq!(app_error.error_code, "validation_error");
    }

    #[test]
    fn maps_jwt_errors_to_401() {
        for name in ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"] {
            let app_error = to_app_error(
                ErrorInput::Error(ErrorLike::new(name, "jwt problem")),
                opts(),
            );
            assert_eq!(app_error.status_code, 401);
            assert_eq!(app_error.error_code, "unauthorized");
            assert_eq!(app_error.user_message, "Please sign in to continue.");
        }
        assert_eq!(
            to_app_error(error_with("jwt expired", json!({})), opts()).status_code,
            401
        );
    }

    #[test]
    fn copies_known_properties_from_error_like_objects() {
        let error = to_app_error(
            error_with(
                "x",
                json!({
                    "statusCode": 400,
                    "userMessage": "Custom message",
                    "expose": false,
                    "details": {"a": 1},
                    "retryable": true,
                    "cause": "root",
                    "meta": {"b": 2},
                    "tarpit": {"holdMs": 5}
                }),
            ),
            opts(),
        );
        assert_eq!(error.user_message, "Custom message");
        assert!(!error.expose);
        assert_eq!(error.details, Some(json!({"a": 1})));
        assert!(error.retryable);
        assert_eq!(error.cause.as_deref(), Some("root"));
        assert_eq!(error.meta, Some(meta(json!({"b": 2}))));
        assert_eq!(error.tarpit, Some(json!({"holdMs": 5})));
    }

    #[test]
    fn uses_fallback_options_for_errors_where_not_specified() {
        let error = to_app_error(
            error_with("x", json!({"meta": "not a record"})),
            ErrorOptions {
                status_code: Some(503),
                meta: Some(meta(json!({"fallback": true}))),
                retryable: Some(true),
                ..Default::default()
            },
        );
        assert_eq!(error.status_code, 503);
        assert_eq!(error.error_code, "service_unavailable");
        assert_eq!(error.meta, Some(meta(json!({"fallback": true}))));
        assert!(error.retryable);
    }

    #[test]
    fn keeps_the_error_own_properties_over_fallback_options() {
        let error = to_app_error(
            error_with(
                "own message",
                json!({"statusCode": 400, "errorCode": "own.code", "userMessage": "Own"}),
            ),
            ErrorOptions {
                message: Some("fallback".into()),
                error_code: Some("fallback.code".into()),
                user_message: Some("Fallback".into()),
                ..Default::default()
            },
        );
        assert_eq!(error.message, "own message");
        assert_eq!(error.error_code, "own.code");
        assert_eq!(error.user_message, "Own");
        assert_eq!(error.status_code, 400);
    }

    #[test]
    fn prefers_the_error_status_code_over_the_fallback() {
        assert_eq!(
            to_app_error(error_with("x", json!({"statusCode": 404})), status(503)).status_code,
            404
        );
    }

    #[test]
    fn fills_in_an_empty_error_message() {
        assert_eq!(
            to_app_error(error_with("", json!({})), opts()).message,
            "Internal Server Error"
        );
        assert_eq!(
            to_app_error(
                error_with("", json!({})),
                ErrorOptions {
                    message: Some("fallback".into()),
                    ..Default::default()
                }
            )
            .message,
            "fallback"
        );
    }

    #[test]
    fn handles_unknown_values() {
        for value in [
            None,
            Some(Value::Null),
            Some(json!(42)),
            Some(json!({"foo": "bar"})),
        ] {
            let error = to_app_error(ErrorInput::Value(value), opts());
            assert_eq!(error.status_code, 500);
            assert_eq!(error.message, "Internal Server Error");
        }
        let with_fallback = to_app_error(ErrorInput::Value(None), status(404));
        assert_eq!(with_fallback.status_code, 404);
        assert_eq!(with_fallback.message, "Not Found");
        assert_eq!(
            to_app_error(
                ErrorInput::Value(None),
                ErrorOptions {
                    message: Some("custom".into()),
                    ..Default::default()
                }
            )
            .message,
            "custom"
        );
    }

    #[test]
    fn round_trips_serialized_errors() {
        let original = forbidden_error(
            "nope",
            ErrorOptions::code("team.access_forbidden")
                .with_details(json!({"x": 1}))
                .with_meta(meta(json!({"y": 2})))
                .with_retryable(true),
        );
        let serialized = serialize_error(
            original.into(),
            SerializeOptions {
                include_details: true,
                include_meta: true,
                ..Default::default()
            },
        );
        let restored = deserialize_error(ErrorInput::Value(Some(serialized.to_value())), opts());
        assert_eq!(restored.message, "nope");
        assert_eq!(restored.status_code, 403);
        assert_eq!(restored.error_code, "team.access_forbidden");
        assert_eq!(
            restored.user_message,
            "You do not have access to that team."
        );
        assert!(restored.retryable);
        assert_eq!(restored.details, Some(json!({"x": 1})));
        assert_eq!(restored.meta, Some(meta(json!({"y": 2}))));
    }

    #[test]
    fn reads_code_when_restoring_a_serialized_error_that_lacks_status_code() {
        let restored = to_app_error(
            ErrorInput::Value(Some(json!({
                "name": "AppError", "message": "gone", "errorCode": "not_found", "expose": true, "retryable": false, "code": 404
            }))),
            opts(),
        );
        assert_eq!(restored.status_code, 404);
        assert_eq!(restored.error_code, "not_found");
        assert_eq!(restored.message, "gone");
    }
}

mod serialize_error_tests {
    use super::*;

    #[test]
    fn serializes_the_public_shape() {
        let serialized = serialize_error(
            not_found_error("missing", opts()).into(),
            SerializeOptions::default(),
        );
        assert_eq!(
            serialized.to_value(),
            json!({
                "type": "app_error",
                "name": "AppError",
                "message": "missing",
                "userMessage": "We could not find what you were looking for.",
                "statusCode": 404,
                "code": 404,
                "status": "Not Found",
                "errorCode": "not_found",
                "expose": true,
                "retryable": false
            })
        );
    }

    #[test]
    fn redacts_unexposed_5xx_messages_only_when_asked() {
        let redact = SerializeOptions {
            redact_internal_message: true,
            ..Default::default()
        };
        let error = internal_error(Some("secret database detail"), opts());
        assert_eq!(
            serialize_error(error.clone().into(), SerializeOptions::default()).message,
            "secret database detail"
        );
        assert_eq!(
            serialize_error(error.into(), redact).message,
            "Internal Server Error"
        );
        assert_eq!(
            serialize_error(
                create_error(
                    "visible",
                    ErrorOptions {
                        status_code: Some(500),
                        expose: Some(true),
                        ..Default::default()
                    },
                    opts()
                )
                .into(),
                redact
            )
            .message,
            "visible"
        );
        assert_eq!(
            serialize_error(bad_request_error("visible", opts()).into(), redact).message,
            "visible"
        );
        assert_eq!(
            serialize_error(service_unavailable_error("down", opts()).into(), redact).message,
            "Service Unavailable"
        );
    }

    #[test]
    fn includes_details_meta_and_stack_lines_only_when_asked() {
        let error = bad_request_error(
            "x",
            opts()
                .with_details(json!({"a": 1}))
                .with_meta(meta(json!({"b": 2}))),
        );
        let plain = serialize_error(error.clone().into(), SerializeOptions::default());
        assert_eq!(plain.details, None);
        assert_eq!(plain.meta, None);
        assert_eq!(plain.lines, None);
        let full = serialize_error(
            error.into(),
            SerializeOptions {
                include_details: true,
                include_meta: true,
                include_stack_lines: true,
                ..Default::default()
            },
        );
        assert_eq!(full.details, Some(json!({"a": 1})));
        assert_eq!(full.meta, Some(meta(json!({"b": 2}))));
        assert_eq!(
            full.lines
                .as_ref()
                .and_then(|lines| lines.first())
                .map(String::as_str),
            Some("AppError: x")
        );
    }

    #[test]
    fn uses_the_internal_status_text_for_unknown_status_codes() {
        let serialized = serialize_error(
            AppError::new("x", status(418)).into(),
            SerializeOptions::default(),
        );
        assert_eq!(serialized.status, "Internal Server Error");
        assert_eq!(serialized.status_code, 418);
    }

    #[test]
    fn serializes_non_app_errors_via_to_app_error() {
        let serialized = serialize_error(
            ErrorInput::Value(Some(json!("plain string"))),
            SerializeOptions::default(),
        );
        assert_eq!(serialized.status_code, 500);
        assert_eq!(serialized.message, "plain string");
    }
}

mod get_user_error_message_tests {
    use super::*;

    #[test]
    fn returns_the_app_error_user_message() {
        assert_eq!(
            get_user_error_message(not_found_error("x", opts()).into(), None),
            "We could not find what you were looking for."
        );
        assert_eq!(
            get_user_error_message(
                validation_error(
                    "x",
                    opts().with_details(json!("[startingDate]: Value is not a valid date string."))
                )
                .into(),
                None
            ),
            "Please check starting date and try again."
        );
    }

    #[test]
    fn returns_the_user_message_of_serialized_errors() {
        let serialized = serialize_error(
            bad_request_error("x", opts().with_user_message("Fix it")).into(),
            SerializeOptions::default(),
        );
        assert_eq!(
            get_user_error_message(ErrorInput::Value(Some(serialized.to_value())), None),
            "Fix it"
        );
    }

    #[test]
    fn returns_the_fallback_for_strings_and_plain_errors() {
        assert_eq!(
            get_user_error_message(ErrorInput::Value(Some(json!("oops"))), None),
            INTERNAL
        );
        assert_eq!(
            get_user_error_message(error_with("boom", json!({})), None),
            INTERNAL
        );
        assert_eq!(
            get_user_error_message(error_with("boom", json!({})), Some("Custom")),
            "Custom"
        );
        assert_eq!(
            get_user_error_message(ErrorInput::Value(None), Some("Custom")),
            "Custom"
        );
    }

    #[test]
    fn ignores_the_status_code_of_plain_errors_in_favour_of_the_fallback() {
        assert_eq!(
            get_user_error_message(error_with("x", json!({"statusCode": 404})), None),
            INTERNAL
        );
        // an Error's own userMessage still beats the fallback
        assert_eq!(
            get_user_error_message(error_with("x", json!({"userMessage": "Own"})), None),
            "Own"
        );
    }
}

mod get_error_status_code_has_status_code {
    use super::*;

    #[test]
    fn reads_status_codes_with_a_fallback() {
        assert_eq!(
            get_error_status_code(not_found_error("x", opts()).into(), None),
            404
        );
        assert_eq!(get_error_status_code(error_with("x", json!({})), None), 500);
        assert_eq!(
            get_error_status_code(error_with("x", json!({})), Some(400)),
            400
        );
        assert_eq!(
            get_error_status_code(ErrorInput::Value(Some(json!("x"))), Some(400)),
            400
        );
    }

    #[test]
    fn compares_against_a_single_status_or_a_list() {
        assert!(has_status_code(
            not_found_error("x", opts()).into(),
            &[http_status::NOT_FOUND]
        ));
        assert!(!has_status_code(
            not_found_error("x", opts()).into(),
            &[400]
        ));
        assert!(has_status_code(
            not_found_error("x", opts()).into(),
            &[400, 404]
        ));
        assert!(has_status_code(error_with("x", json!({})), &[500]));
        assert!(has_status_code(
            error_with("x", json!({"statusCode": 401})),
            &[401]
        ));
    }
}
