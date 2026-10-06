//! Port of `shared/src/torva/index.test.ts`.

use super::*;
use serde_json::json;

fn ok(value: Value) -> Result<Option<Value>, String> {
    Ok(Some(value))
}

fn fail(error: &str) -> Result<Option<Value>, String> {
    Err(error.to_string())
}

fn v(schema: &Io, value: Value) -> Result<Option<Value>, String> {
    schema.validate_opt(Some(&value))
}

fn undefined(schema: &Io) -> Result<Option<Value>, String> {
    schema.validate_opt(None)
}

mod ensure {
    use super::*;

    #[test]
    fn detects_valid_dates_only() {
        // JSON has no Date values; dates are validated as strings by io.date()
        assert!(js::date::parse("2024-01-01").is_some());
        assert!(js::date::parse("nope").is_none());
    }

    #[test]
    fn detects_plain_objects_excluding_arrays_and_null() {
        assert!(ensure_object(Some(&json!({}))));
        assert!(!ensure_object(Some(&json!([]))));
        assert!(!ensure_object(Some(&Value::Null)));
        assert!(ensure_array(Some(&json!([]))));
        assert!(!ensure_array(Some(&json!({}))));
    }
}

mod io_any {
    use super::*;

    #[test]
    fn accepts_anything() {
        assert_eq!(undefined(&io::any()), Ok(None));
        assert_eq!(v(&io::any(), json!({"a": 1})), ok(json!({"a": 1})));
    }
}

mod io_boolean {
    use super::*;

    #[test]
    fn accepts_booleans_only() {
        assert_eq!(v(&io::boolean(), json!(false)), ok(json!(false)));
        assert_eq!(v(&io::boolean(), json!("true")), fail("Value is not a boolean."));
    }
}

mod io_string {
    use super::*;

    #[test]
    fn rejects_non_strings_and_empty_strings_by_default() {
        assert_eq!(v(&io::string(), json!(1)), fail("String value is not a string."));
        assert_eq!(v(&io::string(), json!("")), fail("Value can not be empty."));
    }

    #[test]
    fn does_not_trim_by_default_whitespace_only_is_non_empty() {
        assert_eq!(v(&io::string(), json!("  a  ")), ok(json!("  a  ")));
        assert_eq!(v(&io::string(), json!("   ")), ok(json!("   ")));
    }

    #[test]
    fn trim_trims_and_then_rejects_empty_results() {
        assert_eq!(v(&io::string().trim(), json!("  a  ")), ok(json!("a")));
        assert_eq!(v(&io::string().trim(), json!("   ")), fail("Value can not be empty."));
    }

    #[test]
    fn emptyok_allows_empty_values_and_short_circuits_other_checks() {
        assert_eq!(v(&io::string().emptyok(), json!("")), ok(json!("")));
        assert_eq!(v(&io::string().trim().emptyok(), json!("   ")), ok(json!("")));
        assert_eq!(v(&io::string().email().emptyok(), json!("")), ok(json!("")));
        let pattern = Regex::new("^x$").unwrap();
        assert_eq!(v(&io::string().regex(pattern).emptyok(), json!("")), ok(json!("")));
    }

    #[test]
    fn nowhitespace_strips_all_whitespace() {
        assert_eq!(v(&io::string().nowhitespace(), json!(" a b\tc\n")), ok(json!("abc")));
        assert_eq!(v(&io::string().nowhitespace(), json!(" \t ")), fail("Value can not be empty."));
    }

    #[test]
    fn email_validates_email_addresses() {
        assert_eq!(v(&io::string().email(), json!("jack@example.com")), ok(json!("jack@example.com")));
        assert_eq!(v(&io::string().email(), json!("not-an-email")), fail("Value is not a valid email."));
        assert_eq!(v(&io::string().email(), json!(" jack@example.com ")), fail("Value is not a valid email."));
        assert_eq!(v(&io::string().trim().email(), json!(" jack@example.com ")), ok(json!("jack@example.com")));
    }

    #[test]
    fn regex_validates_against_the_pattern_and_resets_last_index_for_global_regexes() {
        let schema = io::string().regex(Regex::new(r"^[0-9]+$").unwrap());
        assert_eq!(v(&schema, json!("123")), ok(json!("123")));
        assert_eq!(v(&schema, json!("123")), ok(json!("123")));
        assert_eq!(v(&schema, json!("12a")), fail("Value does not match regular expression."));
    }

    #[test]
    fn regex_is_checked_before_email() {
        let schema = io::string().email().regex(Regex::new("^a").unwrap());
        assert_eq!(v(&schema, json!("b@example.com")), fail("Value does not match regular expression."));
    }

    #[test]
    fn builders_return_new_schemas_without_mutating_the_original() {
        let base = io::string();
        let _ = base.trim();
        assert_eq!(v(&base, json!(" a ")), ok(json!(" a ")));
    }
}

mod io_number {
    use super::*;

    #[test]
    fn accepts_finite_numbers_only() {
        assert_eq!(v(&io::number(), json!(1.5)), ok(json!(1.5)));
        assert_eq!(v(&io::number(), json!(-3)), ok(json!(-3)));
        assert_eq!(v(&io::number(), json!("1")), fail("Value is not a number."));
        // NaN and Infinity cannot be written in JSON; the coerce path covers them
        assert_eq!(v(&io::number().coerce(), json!("NaN")), fail("Value must be a finite number."));
        assert_eq!(v(&io::number().coerce(), json!("Infinity")), fail("Value must be a finite number."));
    }

    #[test]
    fn coerce_parses_trimmed_numeric_strings() {
        assert_eq!(v(&io::number().coerce(), json!(" 42 ")), ok(json!(42)));
        assert_eq!(v(&io::number().coerce(), json!("1e2")), ok(json!(100)));
        assert_eq!(v(&io::number().coerce(), json!(7)), ok(json!(7)));
        assert_eq!(v(&io::number().coerce(), json!("   ")), fail("Value can not be empty."));
        assert_eq!(v(&io::number().coerce(), json!("abc")), fail("Value must be a finite number."));
        assert_eq!(v(&io::number().coerce(), json!(true)), fail("Value is not a number."));
    }

    #[test]
    fn integer_rejects_fractions() {
        assert_eq!(v(&io::number().integer(), json!(3)), ok(json!(3)));
        assert_eq!(v(&io::number().integer(), json!(3.1)), fail("Value must be an integer."));
    }

    #[test]
    fn min_and_max_are_inclusive() {
        let schema = io::number().min(1.0).max(10.0);
        assert_eq!(v(&schema, json!(1)), ok(json!(1)));
        assert_eq!(v(&schema, json!(10)), ok(json!(10)));
        assert_eq!(v(&schema, json!(0)), fail("Value must be greater than or equal to 1."));
        assert_eq!(v(&schema, json!(11)), fail("Value must be less than or equal to 10."));
    }

    #[test]
    fn positive_sets_min_to_at_least_1() {
        assert_eq!(v(&io::number().positive(), json!(1)), ok(json!(1)));
        assert_eq!(v(&io::number().positive(), json!(0.5)), fail("Value must be greater than or equal to 1."));
        assert_eq!(v(&io::number().min(5.0).positive(), json!(4)), fail("Value must be greater than or equal to 5."));
        assert_eq!(v(&io::number().min(-5.0).positive(), json!(0)), fail("Value must be greater than or equal to 1."));
    }

    #[test]
    fn combines_coerce_with_integer_and_bounds() {
        let schema = io::number().coerce().integer().min(0.0);
        assert_eq!(v(&schema, json!("5")), ok(json!(5)));
        assert_eq!(v(&schema, json!("5.5")), fail("Value must be an integer."));
        assert_eq!(v(&schema, json!("-1")), fail("Value must be greater than or equal to 0."));
    }
}

mod io_id {
    use super::*;

    #[test]
    fn trims_and_rejects_empty_or_whitespace_containing_ids() {
        assert_eq!(v(&io::id(), json!(" abc ")), ok(json!("abc")));
        assert_eq!(v(&io::id(), json!(1)), fail("ID value is not a string."));
        assert_eq!(v(&io::id(), json!("   ")), fail("ID can not be empty."));
        assert_eq!(v(&io::id(), json!("a b")), fail("ID can not contain whitespace."));
    }
}

mod io_date {
    use super::*;

    #[test]
    fn normalises_parseable_strings_to_iso() {
        assert_eq!(v(&io::date(), json!("2024-03-05T10:20:30.000Z")), ok(json!("2024-03-05T10:20:30.000Z")));
        assert_eq!(v(&io::date(), json!("2024-03-05")), ok(json!("2024-03-05T00:00:00.000Z")));
        assert_eq!(v(&io::date(), json!("2024-03-05T10:20:30+10:00")), ok(json!("2024-03-05T00:20:30.000Z")));
    }

    #[test]
    fn rejects_non_strings_and_invalid_dates() {
        assert_eq!(v(&io::date(), json!(1_700_000_000_000_i64)), fail("Date value is not a string."));
        assert_eq!(v(&io::date(), json!({})), fail("Date value is not a string."));
        assert_eq!(v(&io::date(), json!("not a date")), fail("Value is not a valid date string."));
    }
}

mod io_enum {
    use super::*;

    #[test]
    fn accepts_listed_options_only() {
        let schema = io::enumeration(&["a", "b"]);
        assert_eq!(v(&schema, json!("a")), ok(json!("a")));
        assert_eq!(v(&schema, json!("c")), fail("Value is not a valid enum option."));
        assert_eq!(v(&schema, json!(1)), fail("Enum value is not a string."));
    }

    #[test]
    fn is_case_sensitive() {
        let schema = io::enumeration(&["a", "b"]);
        assert_eq!(v(&schema, json!("A")), fail("Value is not a valid enum option."));
    }
}

mod io_color {
    use super::*;

    fn c(value: Value) -> Result<Option<Value>, String> {
        v(&io::color(), value)
    }

    #[test]
    fn accepts_and_trims_valid_hsla_strings() {
        assert_eq!(c(json!("hsla(120, 50%, 40%, 1)")), ok(json!("hsla(120, 50%, 40%, 1)")));
        assert_eq!(c(json!("  hsla(-30,0%,100%,0.5)  ")), ok(json!("hsla(-30,0%,100%,0.5)")));
        assert_eq!(c(json!("hsla(400.5, 10.5%, 20%, .25)")), ok(json!("hsla(400.5, 10.5%, 20%, .25)")));
    }

    #[test]
    fn rejects_other_colour_formats() {
        assert_eq!(c(json!(1)), fail("Color value is not a string."));
        assert_eq!(c(json!("#ff0000")), fail("Value is not a valid hsla string."));
        assert_eq!(c(json!("hsl(120, 50%, 40%)")), fail("Value is not a valid hsla string."));
        assert_eq!(c(json!("rgba(0,0,0,1)")), fail("Value is not a valid hsla string."));
        assert_eq!(c(json!("HSLA(120, 50%, 40%, 1)")), fail("Value is not a valid hsla string."));
    }

    #[test]
    fn validates_channel_ranges() {
        assert_eq!(c(json!("hsla(0, 101%, 50%, 1)")), fail("Saturation must be between 0 and 100."));
        assert_eq!(c(json!("hsla(0, 50%, 100.1%, 1)")), fail("Lightness must be between 0 and 100."));
        assert_eq!(c(json!("hsla(0, 50%, 50%, 2)")), fail("Alpha must be between 0 and 1."));
    }

    #[test]
    fn rejects_empty_or_malformed_numeric_channels() {
        for value in [
            "hsla(0, 50%, 50%, )",
            "hsla(0, 1.2.3%, 50%, 1)",
            "hsla(0, 50%, .%, 1)",
            "hsla(1., 50%, 50%, 1)",
            "hsla(0, -5%, 50%, 1)",
        ] {
            assert_eq!(c(json!(value)), fail("Value is not a valid hsla string."), "{value}");
        }
    }
}

mod io_timestamp {
    use super::*;

    #[test]
    fn accepts_non_negative_integers() {
        assert_eq!(v(&io::timestamp(), json!(0)), ok(json!(0)));
        assert_eq!(v(&io::timestamp(), json!(1_700_000_000_000_i64)), ok(json!(1_700_000_000_000_i64)));
    }

    #[test]
    fn rejects_other_values() {
        assert_eq!(v(&io::timestamp(), json!("1")), fail("Timestamp value is not a number."));
        // Infinity cannot be written in JSON; out-of-range floats are the closest case
        assert_eq!(v(&io::timestamp(), json!(1.5)), fail("Timestamp must be an integer."));
        assert_eq!(v(&io::timestamp(), json!(-1)), fail("Timestamp must be zero or greater."));
    }
}

mod io_custom_and_io_lazy {
    use super::*;

    #[test]
    fn delegates_to_the_custom_validator() {
        let schema = io::custom(|value| {
            let n = value.and_then(Value::as_f64).unwrap_or(0.0);
            if n > 0.0 {
                Ok(Some(js::number(n * 2.0)))
            } else {
                Err(IoError::message("neg"))
            }
        });
        assert_eq!(v(&schema, json!(2)), ok(json!(4)));
        assert_eq!(v(&schema, json!(-1)), fail("neg"));
    }

    #[test]
    fn lazily_resolves_its_schema() {
        let schema = io::lazy(io::number);
        assert_eq!(schema.get_type().map(|io| io.type_name()), Some("number"));
        assert_eq!(v(&schema, json!(3)), ok(json!(3)));
        assert_eq!(v(&schema, json!("3")), fail("Value is not a number."));
    }
}

mod io_optional_and_io_null {
    use super::*;

    #[test]
    fn optional_accepts_undefined_but_not_null() {
        let schema = io::optional(io::string());
        assert_eq!(undefined(&schema), Ok(None));
        assert_eq!(v(&schema, json!("a")), ok(json!("a")));
        assert_eq!(v(&schema, Value::Null), fail("String value is not a string."));
    }

    #[test]
    fn null_accepts_null_but_not_undefined() {
        let schema = io::null(io::string());
        assert_eq!(v(&schema, Value::Null), ok(Value::Null));
        assert_eq!(v(&schema, json!("a")), ok(json!("a")));
        assert_eq!(undefined(&schema), fail("String value is not a string."));
    }

    #[test]
    fn passes_through_normalised_values_of_the_inner_schema() {
        assert_eq!(v(&io::optional(io::string().trim()), json!(" a ")), ok(json!("a")));
        assert_eq!(v(&io::null(io::id()), json!(" a ")), ok(json!("a")));
    }
}

mod io_array {
    use super::*;

    #[test]
    fn validates_every_item() {
        let schema = io::array(io::number());
        assert_eq!(v(&schema, json!([1, 2, 3])), ok(json!([1, 2, 3])));
        assert_eq!(v(&schema, json!([])), ok(json!([])));
    }

    #[test]
    fn reports_the_failing_index() {
        let schema = io::array(io::number());
        assert_eq!(v(&schema, json!([1, "x"])), fail("[1]: Value is not a number."));
    }

    #[test]
    fn reports_typeof_for_non_arrays_null_reports_as_object() {
        let schema = io::array(io::number());
        assert_eq!(v(&schema, json!("x")), fail("Expect type \"array\" but got \"string\"."));
        assert_eq!(v(&schema, Value::Null), fail("Expect type \"array\" but got \"object\"."));
    }

    #[test]
    fn normalises_items() {
        assert_eq!(v(&io::array(io::string().trim()), json!([" a ", "b "])), ok(json!(["a", "b"])));
    }
}

mod io_object {
    use super::*;

    fn schema() -> Io {
        io::object([
            ("name", io::string().trim()),
            ("age", io::optional(io::number())),
            ("tags", io::array(io::string())),
        ])
    }

    #[test]
    fn validates_and_normalises_fields() {
        assert_eq!(
            v(&schema(), json!({"name": " Jack ", "age": 30, "tags": ["a"]})),
            ok(json!({"name": "Jack", "age": 30, "tags": ["a"]}))
        );
    }

    #[test]
    fn drops_undefined_optional_keys_and_unknown_keys() {
        let result = v(&schema(), json!({"name": "Jack", "tags": [], "extra": 1}));
        assert_eq!(result, ok(json!({"name": "Jack", "tags": []})));
        let value = result.unwrap().unwrap();
        let keys: Vec<&String> = value.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["name", "tags"]);
    }

    #[test]
    fn reports_the_failing_key() {
        assert_eq!(v(&schema(), json!({"name": "", "tags": []})), fail("[name]: Value can not be empty."));
    }

    #[test]
    fn nests_error_paths() {
        let nested = io::object([("list", io::array(io::object([("id", io::id())])))]);
        assert_eq!(
            v(&nested, json!({"list": [{"id": "a"}, {"id": ""}]})),
            fail("[list]: [1]: [id]: ID can not be empty.")
        );
    }

    #[test]
    fn reports_the_received_type_for_non_objects() {
        assert_eq!(v(&schema(), Value::Null), fail("Expect type \"object\" but got \"null\"."));
        assert_eq!(v(&schema(), json!([])), fail("Expect type \"object\" but got \"array\"."));
        assert_eq!(v(&schema(), json!("x")), fail("Expect type \"object\" but got \"string\"."));
    }

    #[test]
    fn returns_a_generic_error_when_a_nested_validator_throws_a_non_string() {
        let throwing = io::object([("a", io::custom(|_| Err(IoError::Thrown)))]);
        assert_eq!(v(&throwing, json!({"a": 1})), fail("An error occurred."));
    }

    #[test]
    fn extend_adds_and_overrides_fields() {
        let extended = schema().extend([("name", io::number()), ("active", io::boolean())]);
        let keys: Vec<&String> = extended.shape().unwrap().keys().collect();
        assert_eq!(keys, ["name", "age", "tags", "active"]);
        assert_eq!(
            v(&extended, json!({"name": 1, "tags": [], "active": true})),
            ok(json!({"name": 1, "tags": [], "active": true}))
        );
        assert_eq!(
            v(&extended, json!({"name": "x", "tags": [], "active": true})),
            fail("[name]: Value is not a number.")
        );
    }

    #[test]
    fn pick_keeps_only_listed_fields() {
        let picked = schema().pick(&["name"]);
        let keys: Vec<&String> = picked.shape().unwrap().keys().collect();
        assert_eq!(keys, ["name"]);
        assert_eq!(v(&picked, json!({"name": "a", "tags": 1})), ok(json!({"name": "a"})));
    }

    #[test]
    fn omit_removes_listed_fields() {
        let omitted = schema().omit(&["tags", "age"]);
        let keys: Vec<&String> = omitted.shape().unwrap().keys().collect();
        assert_eq!(keys, ["name"]);
        assert_eq!(v(&omitted, json!({"name": "a"})), ok(json!({"name": "a"})));
    }
}
