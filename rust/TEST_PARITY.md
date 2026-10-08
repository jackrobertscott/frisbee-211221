# Test parity: TypeScript → Rust

Every `describe`/`it`/`test` in the TypeScript suites (`server/src/**/*.test.ts`,
`server/test/integration/*.test.ts`, `shared/src/**/*.test.ts`), with
`it.each` rows and loop-generated tests listed one per row, mapped to the Rust
test(s) asserting the same behaviour. Assertions were compared one by one, not
just test names.

Status:

- **equivalent**: the same cases and assertions.
- **adapted**: the same behaviour checked through a Rust-shaped seam (an injected
  clock, environment, transport or child process instead of a Vitest mock; SQL
  instead of a Mongo pipeline document; a value that JSON cannot carry replaced by
  the nearest one). The note says what changed. Nothing the TS test asserts about
  the server's observable behaviour is dropped.
- **n/a**: tests of Node or MongoDB runtime machinery that the Rust server does
  not have; each is justified.

Rust paths: `src::…` are unit tests in the `frisbee` library
(`cargo test --lib`), `tests/integration/x.rs::…` are integration tests (one binary, `cargo test --test integration`).

## Summary

| Status | TS tests |
| --- | ---: |
| equivalent | 570 |
| adapted | 134 |
| n/a | 16 |
| **total** | **720** |

The Rust suite has 801 tests; 100 of them have no TS
counterpart (listed at the end: Rust-only seams such as SQLite migrations,
the Mongo import, the CDP browser layer, JavaScript-semantics helpers, and
extra pipeline checks).

## `shared/src/auth/authAccess.test.ts`

8 tests: 7 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| authRuleByPoint > defines a rule for every auth point | `src::shared::auth_access::tests::auth_rule_by_point::defines_a_rule_for_every_auth_point` | adapted | `AuthPoint` is an enum whose `rule()` match is exhaustive; the test checks the 12 points are distinct and each has a non-empty rule. |
| readAuthDeny > denies everything requiring access to anonymous users with sign_in | `src::shared::auth_access::tests::read_auth_deny_tests::denies_everything_requiring_access_to_anonymous_users_with_sign_in` | equivalent |  |
| readAuthDeny > lets admins through every point | `src::shared::auth_access::tests::read_auth_deny_tests::lets_admins_through_every_point` | equivalent |  |
| readAuthDeny > handles signed-in rules | `src::shared::auth_access::tests::read_auth_deny_tests::handles_signed_in_rules` | equivalent |  |
| readAuthDeny > requires a team for team rules unless admin | `src::shared::auth_access::tests::read_auth_deny_tests::requires_a_team_for_team_rules_unless_admin` | equivalent |  |
| readAuthDeny > requires admin for admin rules | `src::shared::auth_access::tests::read_auth_deny_tests::requires_admin_for_admin_rules` | equivalent |  |
| readAuthDeny > trusts the state flags as given, even if inconsistent | `src::shared::auth_access::tests::read_auth_deny_tests::trusts_the_state_flags_as_given_even_if_inconsistent` | equivalent |  |
| canAccessAuthPoint > mirrors readAuthDeny | `src::shared::auth_access::tests::can_access_auth_point_tests::mirrors_read_auth_deny` | equivalent |  |

## `shared/src/endpoints/endpointDefs.test.ts`

21 tests: 16 equivalent, 5 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| endpoint definitions > are discovered from every module | `src::shared::contract::tests::endpoint_definitions::are_discovered_from_every_module` | equivalent |  |
| endpoint definitions > $name path matches its export name | `src::shared::contract::tests::endpoint_definitions::path_matches_its_export_name`<br>`src::shared::contract::tests::endpoint_definitions::match_the_ts_definitions_one_to_one` | adapted | `it.each(defs)` (67 rows) becomes one test looping over `all_defs()`; `match_the_ts_definitions_one_to_one` additionally pins every path, access point, payload/result presence and multipart flag to the TS list. |
| endpoint definitions > $name path belongs to its module namespace | `src::shared::contract::tests::endpoint_definitions::path_belongs_to_its_module_namespace` | adapted | `it.each(defs)` (67 rows) becomes one test looping over `all_defs()`. |
| endpoint definitions > have unique paths | `src::shared::contract::tests::endpoint_definitions::have_unique_paths` | equivalent |  |
| endpoint definitions > $name uses a known access point | `src::shared::contract::tests::endpoint_definitions::uses_a_known_access_point`<br>`src::shared::contract::tests::endpoint_definitions::match_the_ts_definitions_one_to_one` | adapted | `it.each(defs)` (67 rows) becomes one test looping over `all_defs()`; access points are an enum, so the exact list is also pinned by `match_the_ts_definitions_one_to_one`. |
| endpoint definitions > $name payload and result are schemas | `src::shared::contract::tests::endpoint_definitions::payload_and_result_are_schemas` | adapted | `it.each(defs)` (67 rows) becomes one loop; payload/result are typed `fn() -> Io`, so the test builds each schema. |
| endpoint definitions > multipart endpoints do not declare a JSON payload | `src::shared::contract::tests::endpoint_definitions::multipart_endpoints_do_not_declare_a_json_payload` | equivalent |  |
| endpoint definitions > only admin access points guard admin namespaces | `src::shared::contract::tests::endpoint_definitions::only_admin_access_points_guard_admin_namespaces` | equivalent |  |
| list sort keys > %s sort keys use domain fields, not ids | `src::shared::contract::tests::list_sort_keys::sort_keys_use_domain_fields_not_ids` | adapted | `it.each` over the team, user and spirit key lists becomes one test looping over the three lists. |
| list sort keys > paginated list payloads bound the page size | `src::shared::contract::tests::list_sort_keys::paginated_list_payloads_bound_the_page_size` | equivalent |  |
| list sort keys > rejects unknown sort keys | `src::shared::contract::tests::list_sort_keys::rejects_unknown_sort_keys` | equivalent |  |
| payload validation > login requires a valid email and trims it | `src::shared::contract::tests::payload_validation::login_requires_a_valid_email_and_trims_it` | equivalent |  |
| payload validation > sign up only accepts male or female gender matching | `src::shared::contract::tests::payload_validation::sign_up_only_accepts_male_or_female_gender_matching` | equivalent |  |
| payload validation > self update cannot set admin or other protected fields | `src::shared::contract::tests::payload_validation::self_update_cannot_set_admin_or_other_protected_fields` | equivalent |  |
| payload validation > report create drops the submitter id so it cannot be spoofed | `src::shared::contract::tests::payload_validation::report_create_drops_the_submitter_id_so_it_cannot_be_spoofed` | equivalent |  |
| payload validation > report update distinguishes cleared MVPs from omitted ones | `src::shared::contract::tests::payload_validation::report_update_distinguishes_cleared_mvps_from_omitted_ones` | equivalent |  |
| payload validation > team colours must be hsla strings | `src::shared::contract::tests::payload_validation::team_colours_must_be_hsla_strings` | equivalent |  |
| payload validation > season gender division is restricted to known divisions | `src::shared::contract::tests::payload_validation::season_gender_division_is_restricted_to_known_divisions` | equivalent |  |
| payload validation > bounds generated and adjusted fixture counts | `src::shared::contract::tests::payload_validation::bounds_generated_and_adjusted_fixture_counts` | equivalent |  |
| payload validation > bounds mock data generation | `src::shared::contract::tests::payload_validation::bounds_mock_data_generation` | equivalent |  |
| auth payload result > strips passwords and email codes from the user | `src::shared::contract::tests::auth_payload_result::strips_passwords_and_email_codes_from_the_user` | equivalent |  |

## `shared/src/errors.test.ts`

47 tests: 40 equivalent, 7 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| AppError > defaults to an unexposed internal error | `src::shared::errors::tests::app_error::defaults_to_an_unexposed_internal_error` | adapted | `toBeInstanceOf(Error/AppError)` and `name` are guaranteed by the type; `to_string()` checks the `AppError: boom` name prefix. |
| AppError > derives error code and exposure from status code | `src::shared::errors::tests::app_error::derives_error_code_and_exposure_from_status_code` | equivalent |  |
| AppError > uses explicit user messages, collapsing whitespace | `src::shared::errors::tests::app_error::uses_explicit_user_messages_collapsing_whitespace` | equivalent |  |
| AppError > ignores a whitespace-only user message | `src::shared::errors::tests::app_error::ignores_a_whitespace_only_user_message` | equivalent |  |
| AppError > maps known error codes to user messages | `src::shared::errors::tests::app_error::maps_known_error_codes_to_user_messages` | equivalent |  |
| AppError > uses a cleaned exposed message for unknown codes below 500 | `src::shared::errors::tests::app_error::uses_a_cleaned_exposed_message_for_unknown_codes_below_500` | equivalent |  |
| AppError > falls back to the status message for unexposed or empty messages | `src::shared::errors::tests::app_error::falls_back_to_the_status_message_for_unexposed_or_empty_messages` | equivalent |  |
| AppError > never uses the raw message for 5xx errors, even when exposed | `src::shared::errors::tests::app_error::never_uses_the_raw_message_for_5xx_errors_even_when_exposed` | equivalent |  |
| AppError > keeps optional fields | `src::shared::errors::tests::app_error::keeps_optional_fields` | adapted | `cause` is kept as a string (Rust errors are values), so identity (`toBe(cause)`) becomes string equality. |
| error factories > create errors with fixed status and code | `src::shared::errors::tests::error_factories::create_errors_with_fixed_status_and_code` | adapted | `toBeInstanceOf(AppError)` is guaranteed by the return type; every other assertion is identical. |
| error factories > accept an overriding error code | `src::shared::errors::tests::error_factories::accept_an_overriding_error_code` | equivalent |  |
| error factories > internalError defaults its message and is never exposed | `src::shared::errors::tests::error_factories::internal_error_defaults_its_message_and_is_never_exposed` | equivalent |  |
| error factories > internalError accepts a custom error code | `src::shared::errors::tests::error_factories::internal_error_accepts_a_custom_error_code` | equivalent |  |
| error factories > createError merges overrides over base options | `src::shared::errors::tests::error_factories::create_error_merges_overrides_over_base_options` | equivalent |  |
| validation user messages > humanises the field named in validation details | `src::shared::errors::tests::validation_user_messages::humanises_the_field_named_in_validation_details` | equivalent |  |
| validation user messages > falls back to the generic message without a field | `src::shared::errors::tests::validation_user_messages::falls_back_to_the_generic_message_without_a_field` | equivalent |  |
| validation user messages > is used for validation_error AppErrors | `src::shared::errors::tests::validation_user_messages::is_used_for_validation_error_app_errors` | equivalent |  |
| isAppError / isSerializedAppError > detects AppError instances | `src::shared::errors::tests::is_app_error_is_serialized_app_error::detects_app_error_instances` | adapted | Rust distinguishes `ErrorInput::App` from plain errors and serialised values by type; the test checks the variants. |
| isAppError / isSerializedAppError > detects serialized errors | `src::shared::errors::tests::is_app_error_is_serialized_app_error::detects_serialized_errors` | equivalent |  |
| toAppError > returns AppErrors unchanged | `src::shared::errors::tests::to_app_error_tests::returns_app_errors_unchanged` | adapted | Identity (`toBe`) becomes value equality. |
| toAppError > wraps strings as internal errors | `src::shared::errors::tests::to_app_error_tests::wraps_strings_as_internal_errors` | equivalent |  |
| toAppError > applies fallback options to strings | `src::shared::errors::tests::to_app_error_tests::applies_fallback_options_to_strings` | equivalent |  |
| toAppError > wraps plain Errors as internal errors | `src::shared::errors::tests::to_app_error_tests::wraps_plain_errors_as_internal_errors` | equivalent |  |
| toAppError > reads status codes from statusCode or numeric code | `src::shared::errors::tests::to_app_error_tests::reads_status_codes_from_status_code_or_numeric_code` | equivalent |  |
| toAppError > uses a string code as the error code | `src::shared::errors::tests::to_app_error_tests::uses_a_string_code_as_the_error_code` | equivalent |  |
| toAppError > prefers errorCode over code | `src::shared::errors::tests::to_app_error_tests::prefers_error_code_over_code` | equivalent |  |
| toAppError > maps ValidationError to 422 | `src::shared::errors::tests::to_app_error_tests::maps_validation_error_to_422` | equivalent |  |
| toAppError > maps JWT errors to 401 | `src::shared::errors::tests::to_app_error_tests::maps_jwt_errors_to_401` | equivalent |  |
| toAppError > copies known properties from Error-like objects | `src::shared::errors::tests::to_app_error_tests::copies_known_properties_from_error_like_objects` | adapted | `cause` is kept as a string, so identity becomes string equality. |
| toAppError > uses fallback options for Errors where not specified | `src::shared::errors::tests::to_app_error_tests::uses_fallback_options_for_errors_where_not_specified` | equivalent |  |
| toAppError > keeps the Error own properties over fallback options | `src::shared::errors::tests::to_app_error_tests::keeps_the_error_own_properties_over_fallback_options` | equivalent |  |
| toAppError > prefers the error status code over the fallback | `src::shared::errors::tests::to_app_error_tests::prefers_the_error_status_code_over_the_fallback` | equivalent |  |
| toAppError > fills in an empty Error message | `src::shared::errors::tests::to_app_error_tests::fills_in_an_empty_error_message` | equivalent |  |
| toAppError > handles unknown values | `src::shared::errors::tests::to_app_error_tests::handles_unknown_values` | equivalent |  |
| toAppError > round-trips serialized errors | `src::shared::errors::tests::to_app_error_tests::round_trips_serialized_errors` | adapted | `toBeInstanceOf(AppError)` is guaranteed by the return type; every other assertion is identical. |
| toAppError > reads `code` when restoring a serialized error that lacks statusCode | `src::shared::errors::tests::to_app_error_tests::reads_code_when_restoring_a_serialized_error_that_lacks_status_code` | equivalent |  |
| serializeError > serializes the public shape | `src::shared::errors::tests::serialize_error_tests::serializes_the_public_shape` | equivalent |  |
| serializeError > redacts unexposed 5xx messages only when asked | `src::shared::errors::tests::serialize_error_tests::redacts_unexposed_5xx_messages_only_when_asked` | equivalent |  |
| serializeError > includes details, meta and stack lines only when asked | `src::shared::errors::tests::serialize_error_tests::includes_details_meta_and_stack_lines_only_when_asked` | equivalent |  |
| serializeError > uses the internal status text for unknown status codes | `src::shared::errors::tests::serialize_error_tests::uses_the_internal_status_text_for_unknown_status_codes` | equivalent |  |
| serializeError > serializes non-AppErrors via toAppError | `src::shared::errors::tests::serialize_error_tests::serializes_non_app_errors_via_to_app_error` | equivalent |  |
| getUserErrorMessage > returns the AppError user message | `src::shared::errors::tests::get_user_error_message_tests::returns_the_app_error_user_message` | equivalent |  |
| getUserErrorMessage > returns the user message of serialized errors | `src::shared::errors::tests::get_user_error_message_tests::returns_the_user_message_of_serialized_errors` | equivalent |  |
| getUserErrorMessage > returns the fallback for strings and plain Errors | `src::shared::errors::tests::get_user_error_message_tests::returns_the_fallback_for_strings_and_plain_errors` | equivalent |  |
| getUserErrorMessage > ignores the status code of plain Errors in favour of the fallback | `src::shared::errors::tests::get_user_error_message_tests::ignores_the_status_code_of_plain_errors_in_favour_of_the_fallback` | equivalent |  |
| getErrorStatusCode / hasStatusCode > reads status codes with a fallback | `src::shared::errors::tests::get_error_status_code_has_status_code::reads_status_codes_with_a_fallback` | equivalent |  |
| getErrorStatusCode / hasStatusCode > compares against a single status or a list | `src::shared::errors::tests::get_error_status_code_has_status_code::compares_against_a_single_status_or_a_list` | equivalent |  |

## `shared/src/schemas/ioUserGenderMatching.test.ts`

8 tests: 8 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| normalizeUserGenderMatching > maps exact aliases regardless of case, spacing and punctuation | `src::shared::schemas::user_gender_matching::tests::normalize_user_gender_matching_tests::maps_exact_aliases_regardless_of_case_spacing_and_punctuation` | equivalent |  |
| normalizeUserGenderMatching > returns undefined for empty or punctuation-only values | `src::shared::schemas::user_gender_matching::tests::normalize_user_gender_matching_tests::returns_undefined_for_empty_or_punctuation_only_values` | equivalent |  |
| normalizeUserGenderMatching > infers a single matching from words in longer values | `src::shared::schemas::user_gender_matching::tests::normalize_user_gender_matching_tests::infers_a_single_matching_from_words_in_longer_values` | equivalent |  |
| normalizeUserGenderMatching > does not match non-binary, other or opt-out values | `src::shared::schemas::user_gender_matching::tests::normalize_user_gender_matching_tests::does_not_match_non_binary_other_or_opt_out_values` | equivalent |  |
| normalizeUserGenderMatching > does not match ambiguous or unrecognised values | `src::shared::schemas::user_gender_matching::tests::normalize_user_gender_matching_tests::does_not_match_ambiguous_or_unrecognised_values` | equivalent |  |
| isUserGenderMatching > accepts only male and female | `src::shared::schemas::user_gender_matching::tests::is_user_gender_matching_tests::accepts_only_male_and_female` | equivalent |  |
| ioUserGenderMatching > normalises valid values | `src::shared::schemas::user_gender_matching::tests::io_user_gender_matching_tests::normalises_valid_values` | equivalent |  |
| ioUserGenderMatching > rejects non-strings and unrecognised values | `src::shared::schemas::user_gender_matching::tests::io_user_gender_matching_tests::rejects_non_strings_and_unrecognised_values` | equivalent |  |

## `shared/src/torva/index.test.ts`

50 tests: 45 equivalent, 5 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| ensure > detects valid dates only | `src::shared::torva::tests::ensure::detects_valid_dates_only` | adapted | JSON has no `Date` values; checks `js::date::parse` on a valid and an invalid string instead. |
| ensure > detects plain objects, excluding arrays and null | `src::shared::torva::tests::ensure::detects_plain_objects_excluding_arrays_and_null` | equivalent |  |
| regex helpers > escapes special characters | `src::shared::utils::regex::tests::escapes_special_characters` | equivalent |  |
| regex helpers > builds anchored, case-insensitive matchers from trimmed input | `src::shared::utils::regex::tests::builds_anchored_case_insensitive_matchers_from_trimmed_input` | equivalent |  |
| io.any > accepts anything | `src::shared::torva::tests::io_any::accepts_anything` | equivalent |  |
| io.boolean > accepts booleans only | `src::shared::torva::tests::io_boolean::accepts_booleans_only` | equivalent |  |
| io.string > rejects non-strings and empty strings by default | `src::shared::torva::tests::io_string::rejects_non_strings_and_empty_strings_by_default` | equivalent |  |
| io.string > does not trim by default; whitespace-only is non-empty | `src::shared::torva::tests::io_string::does_not_trim_by_default_whitespace_only_is_non_empty` | equivalent |  |
| io.string > trim() trims and then rejects empty results | `src::shared::torva::tests::io_string::trim_trims_and_then_rejects_empty_results` | equivalent |  |
| io.string > emptyok() allows empty values and short-circuits other checks | `src::shared::torva::tests::io_string::emptyok_allows_empty_values_and_short_circuits_other_checks` | equivalent |  |
| io.string > nowhitespace() strips all whitespace | `src::shared::torva::tests::io_string::nowhitespace_strips_all_whitespace` | equivalent |  |
| io.string > email() validates email addresses | `src::shared::torva::tests::io_string::email_validates_email_addresses` | equivalent |  |
| io.string > regex() validates against the pattern and resets lastIndex for global regexes | `src::shared::torva::tests::io_string::regex_validates_against_the_pattern_and_resets_last_index_for_global_regexes` | equivalent |  |
| io.string > regex is checked before email | `src::shared::torva::tests::io_string::regex_is_checked_before_email` | equivalent |  |
| io.string > builders return new schemas without mutating the original | `src::shared::torva::tests::io_string::builders_return_new_schemas_without_mutating_the_original` | equivalent |  |
| io.number > accepts finite numbers only | `src::shared::torva::tests::io_number::accepts_finite_numbers_only` | adapted | `NaN`/`Infinity` cannot be sent as JSON; they are checked through `coerce()` strings. |
| io.number > coerce() parses trimmed numeric strings | `src::shared::torva::tests::io_number::coerce_parses_trimmed_numeric_strings` | equivalent |  |
| io.number > integer() rejects fractions | `src::shared::torva::tests::io_number::integer_rejects_fractions` | equivalent |  |
| io.number > min() and max() are inclusive | `src::shared::torva::tests::io_number::min_and_max_are_inclusive` | equivalent |  |
| io.number > positive() sets min to at least 1 | `src::shared::torva::tests::io_number::positive_sets_min_to_at_least_1` | equivalent |  |
| io.number > combines coerce with integer and bounds | `src::shared::torva::tests::io_number::combines_coerce_with_integer_and_bounds` | equivalent |  |
| io.id > trims and rejects empty or whitespace-containing ids | `src::shared::torva::tests::io_id::trims_and_rejects_empty_or_whitespace_containing_ids` | equivalent |  |
| io.date > normalises parseable strings to ISO | `src::shared::torva::tests::io_date::normalises_parseable_strings_to_iso` | equivalent |  |
| io.date > rejects non-strings and invalid dates | `src::shared::torva::tests::io_date::rejects_non_strings_and_invalid_dates` | adapted | A `Date` object is passed as the JSON object it serialises to (`{}`). |
| io.enum > accepts listed options only | `src::shared::torva::tests::io_enum::accepts_listed_options_only` | equivalent |  |
| io.enum > is case sensitive | `src::shared::torva::tests::io_enum::is_case_sensitive` | equivalent |  |
| io.color > accepts and trims valid hsla strings | `src::shared::torva::tests::io_color::accepts_and_trims_valid_hsla_strings` | equivalent |  |
| io.color > rejects other colour formats | `src::shared::torva::tests::io_color::rejects_other_colour_formats` | equivalent |  |
| io.color > validates channel ranges | `src::shared::torva::tests::io_color::validates_channel_ranges` | equivalent |  |
| io.color > rejects empty or malformed numeric channels | `src::shared::torva::tests::io_color::rejects_empty_or_malformed_numeric_channels` | equivalent |  |
| io.timestamp > accepts non-negative integers | `src::shared::torva::tests::io_timestamp::accepts_non_negative_integers` | equivalent |  |
| io.timestamp > rejects other values | `src::shared::torva::tests::io_timestamp::rejects_other_values` | adapted | `Infinity` cannot be represented in a JSON value, so that case can never reach the validator; the other three assertions are identical. |
| io.custom and io.lazy > delegates to the custom validator | `src::shared::torva::tests::io_custom_and_io_lazy::delegates_to_the_custom_validator` | equivalent |  |
| io.custom and io.lazy > lazily resolves its schema | `src::shared::torva::tests::io_custom_and_io_lazy::lazily_resolves_its_schema` | equivalent |  |
| io.optional and io.null > optional accepts undefined but not null | `src::shared::torva::tests::io_optional_and_io_null::optional_accepts_undefined_but_not_null` | equivalent |  |
| io.optional and io.null > null accepts null but not undefined | `src::shared::torva::tests::io_optional_and_io_null::null_accepts_null_but_not_undefined` | equivalent |  |
| io.optional and io.null > passes through normalised values of the inner schema | `src::shared::torva::tests::io_optional_and_io_null::passes_through_normalised_values_of_the_inner_schema` | equivalent |  |
| io.array > validates every item | `src::shared::torva::tests::io_array::validates_every_item` | equivalent |  |
| io.array > reports the failing index | `src::shared::torva::tests::io_array::reports_the_failing_index` | equivalent |  |
| io.array > reports typeof for non-arrays (null reports as object) | `src::shared::torva::tests::io_array::reports_typeof_for_non_arrays_null_reports_as_object` | equivalent |  |
| io.array > normalises items | `src::shared::torva::tests::io_array::normalises_items` | equivalent |  |
| io.object > validates and normalises fields | `src::shared::torva::tests::io_object::validates_and_normalises_fields` | equivalent |  |
| io.object > drops undefined optional keys and unknown keys | `src::shared::torva::tests::io_object::drops_undefined_optional_keys_and_unknown_keys` | adapted | JSON cannot carry `age: undefined`; the key is absent instead. Unknown keys and key order are checked. |
| io.object > reports the failing key | `src::shared::torva::tests::io_object::reports_the_failing_key` | equivalent |  |
| io.object > nests error paths | `src::shared::torva::tests::io_object::nests_error_paths` | equivalent |  |
| io.object > reports the received type for non-objects | `src::shared::torva::tests::io_object::reports_the_received_type_for_non_objects` | equivalent |  |
| io.object > returns a generic error when a nested validator throws a non-string | `src::shared::torva::tests::io_object::returns_a_generic_error_when_a_nested_validator_throws_a_non_string` | equivalent |  |
| io.object > extend() adds and overrides fields | `src::shared::torva::tests::io_object::extend_adds_and_overrides_fields` | equivalent |  |
| io.object > pick() keeps only listed fields | `src::shared::torva::tests::io_object::pick_keeps_only_listed_fields` | equivalent |  |
| io.object > omit() removes listed fields | `src::shared::torva::tests::io_object::omit_removes_listed_fields` | equivalent |  |

## `shared/src/utils/endpointDef.test.ts`

8 tests: 6 equivalent, 1 adapted, 1 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| ioListLimit > is optional | `src::shared::utils::endpoint_def::tests::io_list_limit_tests::is_optional` | equivalent |  |
| ioListLimit > accepts whole page sizes from 1 to the maximum | `src::shared::utils::endpoint_def::tests::io_list_limit_tests::accepts_whole_page_sizes_from_1_to_the_maximum` | equivalent |  |
| ioListLimit > rejects page sizes that could load a whole collection | `src::shared::utils::endpoint_def::tests::io_list_limit_tests::rejects_page_sizes_that_could_load_a_whole_collection` | adapted | `Infinity` cannot be sent as JSON; `1e300` stands in for it. |
| ioListSkip > accepts zero and positive whole offsets | `src::shared::utils::endpoint_def::tests::io_list_skip_tests::accepts_zero_and_positive_whole_offsets` | equivalent |  |
| ioListSkip > rejects negative and fractional offsets | `src::shared::utils::endpoint_def::tests::io_list_skip_tests::rejects_negative_and_fractional_offsets` | equivalent |  |
| ioSortDirection > accepts asc, desc or nothing | `src::shared::utils::endpoint_def::tests::io_sort_direction_tests::accepts_asc_desc_or_nothing` | equivalent |  |
| ioSortDirection > rejects other spellings | `src::shared::utils::endpoint_def::tests::io_sort_direction_tests::rejects_other_spellings` | equivalent |  |
| exactShape > returns the value unchanged at runtime | — | n/a | `exactShape` is a TypeScript-only type helper (an identity function at runtime); there is nothing to port. |

## `shared/src/utils/reportValidation.test.ts`

7 tests: 7 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getOfficialSpiritScoreTotal > sums all five scores | `src::shared::utils::report_validation::tests::get_official_spirit_score_total_tests::sums_all_five_scores` | equivalent |  |
| getOfficialSpiritScoreTotal > returns undefined when any score is missing | `src::shared::utils::report_validation::tests::get_official_spirit_score_total_tests::returns_undefined_when_any_score_is_missing` | equivalent |  |
| officialSpiritCommentRequired > requires a comment outside 9..11 inclusive | `src::shared::utils::report_validation::tests::official_spirit_comment_required_tests::requires_a_comment_outside_9_11_inclusive` | equivalent |  |
| officialSpiritCommentRequired > does not require a comment for incomplete scores | `src::shared::utils::report_validation::tests::official_spirit_comment_required_tests::does_not_require_a_comment_for_incomplete_scores` | equivalent |  |
| hasSpiritComment > requires non-whitespace content | `src::shared::utils::report_validation::tests::has_spirit_comment_tests::requires_non_whitespace_content` | equivalent |  |
| validateOfficialSpiritComment > returns an error when a required comment is missing | `src::shared::utils::report_validation::tests::validate_official_spirit_comment_tests::returns_an_error_when_a_required_comment_is_missing` | equivalent |  |
| validateOfficialSpiritComment > passes with a comment or an in-range total | `src::shared::utils::report_validation::tests::validate_official_spirit_comment_tests::passes_with_a_comment_or_an_in_range_total` | equivalent |  |

## `shared/src/utils/seasonGenderDivision.test.ts`

7 tests: 7 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getSeasonGenderDivision > defaults to mixed | `src::shared::utils::season_gender_division::tests::get_season_gender_division_tests::defaults_to_mixed` | equivalent |  |
| MVP slots > enables slots by division | `src::shared::utils::season_gender_division::tests::mvp_slots::enables_slots_by_division` | equivalent |  |
| MVP slots > only lets users fill the slot of their gender matching | `src::shared::utils::season_gender_division::tests::mvp_slots::only_lets_users_fill_the_slot_of_their_gender_matching` | equivalent |  |
| sanitizeSeasonMvpFields > clears fields for disabled slots | `src::shared::utils::season_gender_division::tests::sanitize_season_mvp_fields_tests::clears_fields_for_disabled_slots` | equivalent |  |
| isReportMvpCompleteForSeason > requires primary MVPs for enabled slots | `src::shared::utils::season_gender_division::tests::is_report_mvp_complete_for_season_tests::requires_primary_mvps_for_enabled_slots` | equivalent |  |
| isReportMvpCompleteForSeason > requires secondary MVPs only with official scoring | `src::shared::utils::season_gender_division::tests::is_report_mvp_complete_for_season_tests::requires_secondary_mvps_only_with_official_scoring` | equivalent |  |
| isReportMvpCompleteForSeason > treats secondary-only reports as empty | `src::shared::utils::season_gender_division::tests::is_report_mvp_complete_for_season_tests::treats_secondary_only_reports_as_empty` | equivalent |  |

## `shared/src/utils/seasonName.test.ts`

5 tests: 5 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| compareSeasonNames > orders numbers numerically | `src::shared::utils::season_name::tests::compare_season_names_tests::orders_numbers_numerically` | equivalent |  |
| compareSeasonNames > ignores case and accents | `src::shared::utils::season_name::tests::compare_season_names_tests::ignores_case_and_accents` | equivalent |  |
| compareSeasonNames > orders alphabetically | `src::shared::utils::season_name::tests::compare_season_names_tests::orders_alphabetically` | equivalent |  |
| compareSeasonNames > treats null and undefined as empty strings and stringifies others | `src::shared::utils::season_name::tests::compare_season_names_tests::treats_null_and_undefined_as_empty_strings_and_stringifies_others` | equivalent |  |
| compareSeasonNames > exposes matching mongo collation options | `src::shared::utils::season_name::tests::compare_season_names_tests::exposes_matching_mongo_collation_options` | equivalent |  |

## `server/src/cluster.test.ts`

13 tests: 0 equivalent, 1 adapted, 12 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| startPrimaryCluster > starts one worker with round-robin scheduling | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > scales up one worker per cooldown while load stays high, up to the CPU cap | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > scales up on %s [active requests] | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > scales up on %s [CPU] | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > scales up on %s [event loop] | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > does not scale up when memory is nearly exhausted | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > ignores stale metrics and other messages | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > drains the least busy worker when load drops and replaces only lost capacity | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > reports signals and restores the minimum when no worker is serving | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| startPrimaryCluster > never drains the last worker | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| attachWorkerClusterLifecycle > does nothing outside a worker | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| attachWorkerClusterLifecycle > reports request metrics to the primary | — | n/a | Node `cluster` primary/worker scaling. The Rust server is one process on a multi-threaded tokio runtime: there are no workers to start, scale, drain or replace, and no worker metrics. |
| attachWorkerClusterLifecycle > drains on a shutdown message and exits once closed or after a timeout | `src::server::tests::drains_in_flight_requests_before_exiting`<br>`src::server::tests::exits_after_the_drain_timeout_when_requests_hang`<br>`src::server::tests::stops_accepting_new_connections_after_shutdown` | adapted | The shutdown signal replaces the primary's message: in-flight requests finish, the server exits after the drain timeout when they hang, and new connections are refused. |

## `server/src/db/mongo.test.ts`

4 tests: 1 equivalent, 1 adapted, 2 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| mongo > retries the connection after a failed first connect | — | n/a | Mongo driver connection caching; SQLite opens a local file pool with no network connect to retry. |
| mongo > retries transaction detection after a failure and then caches it | — | n/a | Mongo replica-set transaction detection; SQLite always supports transactions. |
| mongo > runs work in a session and commits it | `src::db::tests::runs_work_in_a_transaction_and_commits_it` | adapted | A SQLite transaction replaces the Mongo session: reads inside see the uncommitted write and the write is committed. Session-option bookkeeping (`mongo.options()`) has no counterpart. |
| mongo > rolls back every write when the work fails | `src::db::tests::rolls_back_every_write_when_the_work_fails` | equivalent |  |

## `server/src/db/schemaAudit.test.ts`

1 tests: 0 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| runStartupSchemaAudit > reports invalid stored documents per table and property | `src::db::audit::tests::reports_invalid_stored_documents_per_table_and_property` | adapted | Raw rows are written through the table layer's `insert_raw` instead of `mongo.collection`; log lines say "SQLite" instead of "Mongo". |

## `server/src/db/syncIndexes.test.ts`

6 tests: 0 equivalent, 6 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| runStartupIndexSync > creates every declared index on an empty database | `src::db::migrations::tests::run_startup_index_sync::creates_every_declared_index_on_an_empty_database` | adapted | Reads SQLite index SQL; the email collation is checked as `COLLATE ci` instead of Mongo `{locale: en, strength: 2}`; log lines say "SQLite". |
| runStartupIndexSync > changes nothing when the indexes already match | `src::db::migrations::tests::run_startup_index_sync::changes_nothing_when_the_indexes_already_match` | adapted | Log lines say "SQLite" instead of "Mongo". |
| runStartupIndexSync > drops unknown indexes and recreates changed ones | `src::db::migrations::tests::run_startup_index_sync::drops_unknown_indexes_and_recreates_changed_ones` | adapted | The stray and changed indexes are created with SQL instead of `collection.createIndex`. |
| runStartupIndexSync > rethrows errors other than a missing collection | `src::db::migrations::tests::run_startup_index_sync::rethrows_errors_instead_of_swallowing_them` | adapted | No `listIndexes` to mock: syncing against a database without the schema must fail rather than be swallowed. |
| runStartupIndexSync > treats a missing namespace (%s) as having no indexes [code 26] | `src::db::migrations::tests::run_startup_index_sync::treats_a_table_without_indexes_as_having_none` | adapted | Mongo "namespace not found" errors (code 26 or message) do not exist; a table without indexes gets all declared ones created, in declaration order. |
| runStartupIndexSync > treats a missing namespace (%s) as having no indexes [the message] | `src::db::migrations::tests::run_startup_index_sync::treats_a_table_without_indexes_as_having_none` | adapted | Mongo "namespace not found" errors (code 26 or message) do not exist; a table without indexes gets all declared ones created, in declaration order. |

## `server/src/db/table.test.ts`

10 tests: 5 equivalent, 5 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| db.table > names indexes from their keys unless named explicitly | `src::db::table::tests::db_table::names_indexes_from_their_keys_unless_named_explicitly` | adapted | `validator()` identity becomes a check of the schema type. |
| db.table > rejects duplicate index names and empty index keys | `src::db::table::tests::db_table::rejects_duplicate_index_names_and_empty_index_keys` | adapted | The empty-key message is "Index requires at least one field." (no "Mongo"). |
| db.table > validates and normalises values on create | `src::db::table::tests::db_table::validates_and_normalises_values_on_create` | equivalent |  |
| db.table > pages, sorts and collates many | `src::db::table::tests::db_table::pages_sorts_and_collates_many` | adapted | The `{locale: en, strength: 2}` collation is `Collation::CaseInsensitive`. |
| db.table > only writes the fields an update changes | `src::db::table::tests::db_table::only_writes_the_fields_an_update_changes` | adapted | The concurrent write is raw SQL; `undefined` in an update is `Patch::unset`. |
| db.table > rejects updates to missing or into invalid documents | `src::db::table::tests::db_table::rejects_updates_to_missing_or_into_invalid_documents` | equivalent |  |
| db.table > updates many with sets and unsets, skipping ids | `src::db::table::tests::db_table::updates_many_with_sets_and_unsets_skipping_ids` | equivalent |  |
| db.table > applies bulk updates after validating every task | `src::db::table::tests::db_table::applies_bulk_updates_after_validating_every_task` | equivalent |  |
| db.table > updates atomically with upserts and either document version | `src::db::table::tests::db_table::updates_atomically_with_upserts_and_either_document_version` | equivalent |  |
| db.table > aggregates, scans and deletes | `src::db::table::tests::db_table::aggregates_scans_and_deletes` | adapted | The `$group/$sum` pipeline is the typed `sum` helper; scanned rows must not expose `_seq`/`_id`. |

## `server/src/gameday/credentials.test.ts`

8 tests: 8 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| GameDay password encryption > round-trips passwords | `src::gameday::credentials::tests::gameday_password_encryption::round_trips_passwords` | equivalent |  |
| GameDay password encryption > uses a versioned, base64url, colon-separated format | `src::gameday::credentials::tests::gameday_password_encryption::uses_a_versioned_base64url_colon_separated_format` | equivalent |  |
| GameDay password encryption > uses a random IV per encryption | `src::gameday::credentials::tests::gameday_password_encryption::uses_a_random_iv_per_encryption` | equivalent |  |
| GameDay password encryption > detects tampering with the ciphertext or tag | `src::gameday::credentials::tests::gameday_password_encryption::detects_tampering_with_the_ciphertext_or_tag` | equivalent |  |
| GameDay password encryption > rejects unsupported formats | `src::gameday::credentials::tests::gameday_password_encryption::rejects_unsupported_formats` | equivalent |  |
| GameDay password encryption > round-trips an empty password | `src::gameday::credentials::tests::gameday_password_encryption::round_trips_an_empty_password` | equivalent |  |
| toSafeGamedayImportConfig > omits secrets and reports whether a password is stored | `src::gameday::credentials::tests::to_safe_gameday_import_config_tests::omits_secrets_and_reports_whether_a_password_is_stored` | equivalent |  |
| toSafeGamedayImportConfig > reports no password for an empty encrypted password | `src::gameday::credentials::tests::to_safe_gameday_import_config_tests::reports_no_password_for_an_empty_encrypted_password` | equivalent |  |

## `server/src/gameday/exportCli.test.ts`

4 tests: 0 equivalent, 4 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| exportCli > reads the input from stdin and writes the export as JSON | `src::gameday::export_cli::tests::export_cli::reads_the_input_from_stdin_and_writes_the_export_as_json` | adapted | The module re-import with a mocked exporter becomes `export_cli::run` with an injected exporter and chunked stdin; the real binary is exercised in `tests/integration/gameday_export_cli.rs`. |
| exportCli > fails with exit code 1 for input that is not JSON | `src::gameday::export_cli::tests::export_cli::fails_with_exit_code_1_for_input_that_is_not_json`<br>`tests/integration/gameday_export_cli.rs::fails_with_exit_code_1_for_input_that_is_not_json` | adapted | In-process and against the real binary (exit code, empty stdout, stderr prefix). |
| exportCli > fails with the validation message for invalid input | `src::gameday::export_cli::tests::export_cli::fails_with_the_validation_message_for_invalid_input`<br>`tests/integration/gameday_export_cli.rs::fails_with_the_validation_message_for_invalid_input` | adapted | In-process and against the real binary. |
| exportCli > reports non-Error failures from the exporter | `src::gameday::export_cli::tests::export_cli::reports_non_error_failures_from_the_exporter`<br>`tests/integration/gameday_export_cli.rs::reports_exporter_failures_before_a_browser_starts` | adapted | The exporter returns `GamedayError("browser crashed")` (a thrown string); `tests/integration/gameday_export_cli.rs::reports_exporter_failures_before_a_browser_starts` checks a real failure through the binary. |

## `server/src/gameday/exporter.test.ts`

49 tests: 22 equivalent, 27 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| resolveOptions > uses defaults when neither input nor environment set a value | `src::gameday::exporter::tests::resolve_options::uses_defaults_when_neither_input_nor_environment_set_a_value` | adapted | `vi.stubEnv` becomes the env lookup passed to `resolve_options_with` (tests run in parallel). |
| resolveOptions > reads settings from the environment, preferring GAMEDAY_ names | `src::gameday::exporter::tests::resolve_options::reads_settings_from_the_environment_preferring_gameday_names` | adapted | Env lookup injected instead of `vi.stubEnv`. |
| resolveOptions > lets input win over the environment | `src::gameday::exporter::tests::resolve_options::lets_input_win_over_the_environment` | adapted | Env lookup injected instead of `vi.stubEnv`. |
| resolveOptions > falls back from empty input lists to the environment | `src::gameday::exporter::tests::resolve_options::falls_back_from_empty_input_lists_to_the_environment` | adapted | Env lookup injected instead of `vi.stubEnv`. |
| resolveOptions > defaults the debug directory to the working directory | `src::gameday::exporter::tests::resolve_options::defaults_the_debug_directory_to_the_working_directory` | adapted | Checked with an injected working directory and with the real one. |
| resolveOptions > ignores an invalid timeout of %j ["abc"] | `src::gameday::exporter::tests::resolve_options::ignores_an_invalid_timeout` | adapted | `it.each` rows become a loop in one test; env lookup injected. |
| resolveOptions > ignores an invalid timeout of %j ["-5"] | `src::gameday::exporter::tests::resolve_options::ignores_an_invalid_timeout` | adapted | `it.each` rows become a loop in one test; env lookup injected. |
| resolveOptions > ignores an invalid timeout of %j ["0"] | `src::gameday::exporter::tests::resolve_options::ignores_an_invalid_timeout` | adapted | `it.each` rows become a loop in one test; env lookup injected. |
| resolveOptions > ignores an invalid timeout of %j ["  "] | `src::gameday::exporter::tests::resolve_options::ignores_an_invalid_timeout` | adapted | `it.each` rows become a loop in one test; env lookup injected. |
| resolveOptions > keeps the default for unrecognised booleans | `src::gameday::exporter::tests::resolve_options::keeps_the_default_for_unrecognised_booleans` | adapted | Env lookup injected instead of `vi.stubEnv`. |
| launchBrowser > launches an explicit executable without a channel | `src::gameday::exporter::tests::launch_browser_tests::launches_an_explicit_executable_without_a_channel` | adapted | `chromium.launch` is a fake `BrowserLauncher`; `process.execPath` is `current_exe()`. |
| launchBrowser > rejects an explicit executable that does not exist | `src::gameday::exporter::tests::launch_browser_tests::rejects_an_explicit_executable_that_does_not_exist` | adapted | Fake `BrowserLauncher`. |
| launchBrowser > uses a common install path when one exists | `src::gameday::exporter::tests::launch_browser_tests::uses_a_common_install_path_when_one_exists` | adapted | The `fs.access` spy is a `file_exists` closure. |
| launchBrowser > falls back to bundled Chromium when the channel cannot launch | `src::gameday::exporter::tests::launch_browser_tests::falls_back_to_bundled_chromium_when_the_channel_cannot_launch` | adapted | Fake `BrowserLauncher` and `file_exists`. |
| launchBrowser > does not retry the bundled browser when it fails | `src::gameday::exporter::tests::launch_browser_tests::does_not_retry_the_bundled_browser_when_it_fails` | adapted | Fake `BrowserLauncher` and `file_exists`. |
| readCompetitionGridDataItems > reads competitions from the griddata assignment | `src::gameday::exporter::tests::read_competition_grid_data_items_tests::reads_competitions_from_the_griddata_assignment` | equivalent |  |
| readCompetitionGridDataItems > handles escaped quotes and brackets inside strings | `src::gameday::exporter::tests::read_competition_grid_data_items_tests::handles_escaped_quotes_and_brackets_inside_strings` | equivalent |  |
| readCompetitionGridDataItems > returns nothing for %s [no griddata assignment] | `src::gameday::exporter::tests::read_competition_grid_data_items_tests::returns_nothing_for_unreadable_griddata` | adapted | `it.each` rows become a labelled loop in one test. |
| readCompetitionGridDataItems > returns nothing for %s [a non-array assignment] | `src::gameday::exporter::tests::read_competition_grid_data_items_tests::returns_nothing_for_unreadable_griddata` | adapted | `it.each` rows become a labelled loop in one test. |
| readCompetitionGridDataItems > returns nothing for %s [an unterminated array] | `src::gameday::exporter::tests::read_competition_grid_data_items_tests::returns_nothing_for_unreadable_griddata` | adapted | `it.each` rows become a labelled loop in one test. |
| readCompetitionGridDataItems > returns nothing for %s [invalid JSON] | `src::gameday::exporter::tests::read_competition_grid_data_items_tests::returns_nothing_for_unreadable_griddata` | adapted | `it.each` rows become a labelled loop in one test. |
| competition list helpers > dedupes by title and link only | `src::gameday::exporter::tests::competition_list_helpers::dedupes_by_title_and_link_only` | equivalent |  |
| competition list helpers > prefers an exact title or abbreviation match over a partial one | `src::gameday::exporter::tests::competition_list_helpers::prefers_an_exact_title_or_abbreviation_match_over_a_partial_one` | equivalent |  |
| competition list helpers > formats at most twenty competitions for errors | `src::gameday::exporter::tests::competition_list_helpers::formats_at_most_twenty_competitions_for_errors` | equivalent |  |
| competition list helpers > decodes the HTML entities GameDay uses | `src::gameday::exporter::tests::competition_list_helpers::decodes_the_html_entities_gameday_uses` | equivalent |  |
| competition list helpers > decodes entities in a single pass | `src::gameday::exporter::tests::competition_list_helpers::decodes_entities_in_a_single_pass` | equivalent |  |
| resolveFields > resolves the default fields by their preferred ids | `src::gameday::exporter::tests::resolve_fields_tests::resolves_the_default_fields_by_their_preferred_ids` | equivalent |  |
| resolveFields > falls back to matching labels and skips parent or guardian genders | `src::gameday::exporter::tests::resolve_fields_tests::falls_back_to_matching_labels_and_skips_parent_or_guardian_genders` | equivalent |  |
| resolveFields > prefers a configured gender field id | `src::gameday::exporter::tests::resolve_fields_tests::prefers_a_configured_gender_field_id` | equivalent |  |
| resolveFields > lists gender candidates when gender cannot be resolved | `src::gameday::exporter::tests::resolve_fields_tests::lists_gender_candidates_when_gender_cannot_be_resolved` | equivalent |  |
| resolveFields > does not list gender candidates for other missing fields | `src::gameday::exporter::tests::resolve_fields_tests::does_not_list_gender_candidates_for_other_missing_fields` | equivalent |  |
| resolveFields > renames default fields with configured headers of the same count | `src::gameday::exporter::tests::resolve_fields_tests::renames_default_fields_with_configured_headers_of_the_same_count` | equivalent |  |
| resolveFields > uses configured field ids with their labels as headers | `src::gameday::exporter::tests::resolve_fields_tests::uses_configured_field_ids_with_their_labels_as_headers` | equivalent |  |
| resolveFields > rejects unknown configured field ids and mismatched headers | `src::gameday::exporter::tests::resolve_fields_tests::rejects_unknown_configured_field_ids_and_mismatched_headers` | equivalent |  |
| parseMemberRows > maps alternative header names and trims values | `src::gameday::exporter::tests::parse_member_rows_tests::maps_alternative_header_names_and_trims_values` | equivalent |  |
| parseMemberRows > only drops a summary row at the end | `src::gameday::exporter::tests::parse_member_rows_tests::only_drops_a_summary_row_at_the_end` | equivalent |  |
| parseMemberRows > keeps a final row with more than one value | `src::gameday::exporter::tests::parse_member_rows_tests::keeps_a_final_row_with_more_than_one_value` | equivalent |  |
| parseMemberRows > drops rows whose member fields are all blank | `src::gameday::exporter::tests::parse_member_rows_tests::drops_rows_whose_member_fields_are_all_blank` | equivalent |  |
| parseMemberRows > returns nothing for an empty export | `src::gameday::exporter::tests::parse_member_rows_tests::returns_nothing_for_an_empty_export` | equivalent |  |
| parseMemberRows > falls back to column order when headers are unrecognised | `src::gameday::exporter::tests::parse_member_rows_tests::falls_back_to_column_order_when_headers_are_unrecognised` | equivalent |  |
| parseMemberRows > fails when a column is missing and there are too few columns | `src::gameday::exporter::tests::parse_member_rows_tests::fails_when_a_column_is_missing_and_there_are_too_few_columns` | equivalent |  |
| runReportAndDownload > posts the report, polls until complete and downloads the CSV | `src::gameday::exporter::tests::run_report_and_download_tests::posts_the_report_polls_until_complete_and_downloads_the_csv` | adapted | Fake timers become tokio's paused clock; `context.request` is a fake `ReportRequestContext`. |
| runReportAndDownload > reports a failed report request once the job completes | `src::gameday::exporter::tests::run_report_and_download_tests::reports_a_failed_report_request_once_the_job_completes` | adapted | Paused clock and fake request context. |
| runReportAndDownload > fails when GameDay reports the job failed | `src::gameday::exporter::tests::run_report_and_download_tests::fails_when_gameday_reports_the_job_failed` | adapted | Paused clock and fake request context. |
| runReportAndDownload > fails on a non-JSON status response | `src::gameday::exporter::tests::run_report_and_download_tests::fails_on_a_non_json_status_response` | adapted | Paused clock and fake request context. |
| runReportAndDownload > times out when the status never completes | `src::gameday::exporter::tests::run_report_and_download_tests::times_out_when_the_status_never_completes` | adapted | Paused clock and fake request context. |
| runReportAndDownload > fails when the download is not successful | `src::gameday::exporter::tests::run_report_and_download_tests::fails_when_the_download_is_not_successful` | adapted | Paused clock and fake request context. |
| runReportAndDownload > rejects an HTML page instead of a CSV | `src::gameday::exporter::tests::run_report_and_download_tests::rejects_an_html_page_instead_of_a_csv` | adapted | Paused clock and fake request context. |
| runReportAndDownload > accepts CSV content even when labelled as HTML | `src::gameday::exporter::tests::run_report_and_download_tests::accepts_csv_content_even_when_labelled_as_html` | adapted | Paused clock and fake request context. |

## `server/src/gameday/importMembers.test.ts`

7 tests: 0 equivalent, 7 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| runGamedayImportWithHistory > exports with the decrypted password, imports members and records the run | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::exports_with_the_decrypted_password_imports_members_and_records_the_run` | adapted | The mocked `runGamedayExportProcess` is a `MockExporter` swapped into the app state. |
| runGamedayImportWithHistory > skips invalid rows and notes them with unrecognised genders | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::skips_invalid_rows_and_notes_them_with_unrecognised_genders` | adapted | `MockExporter`; the single `console.warn` is checked on a log capture filtered to this test's values. |
| runGamedayImportWithHistory > limits the invalid row details in the note | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::limits_the_invalid_row_details_in_the_note` | adapted | `MockExporter` instead of `vi.mock`. |
| runGamedayImportWithHistory > uses singular wording for one invalid row, one omitted row and one gender | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::uses_singular_wording_for_one_invalid_row_one_omitted_row_and_one_gender` | adapted | `MockExporter` instead of `vi.mock`. |
| runGamedayImportWithHistory > records a failed run and rethrows the export error | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::records_a_failed_run_and_rethrows_the_export_error` | adapted | `MockExporter`; identity (`toBe(error)`) becomes equality. |
| runGamedayImportWithHistory > records non-Error failures as text | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::records_non_error_failures_as_text` | adapted | The rejected string is the `AppError` a thrown string becomes (`to_app_error("plain failure")`). |
| runGamedayImportWithHistory > fails the run when the stored password cannot be decrypted | `src::gameday::import_members::tests::run_gameday_import_with_history_tests::fails_the_run_when_the_stored_password_cannot_be_decrypted` | adapted | `MockExporter` instead of `vi.mock`. |

## `server/src/gameday/runExportProcess.test.ts`

13 tests: 0 equivalent, 13 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| runGamedayExportProcess > runs the CLI with tsx, sends the input and parses the output | `src::gameday::run_export_process::tests::run_gameday_export_process::runs_the_cli_sends_the_input_and_parses_the_output`<br>`src::gameday::run_export_process::tests::run_gameday_export_process::resolves_the_exporter_next_to_the_server_or_from_the_override` | adapted | A fake exporter shell script replaces the mocked `spawn` (real pipes, chunked stdout, stderr). "with tsx" becomes resolving the `gameday-export` binary next to the server (or `GAMEDAY_EXPORT_BIN`). |
| runGamedayExportProcess > does not pass server secrets to the child process | `src::gameday::run_export_process::tests::run_gameday_export_process::does_not_pass_server_secrets_to_the_child_process` | adapted | The child dumps its real environment; the variables are injected rather than stubbed globally. |
| runGamedayExportProcess > reports the last lines of stderr when the process fails | `src::gameday::run_export_process::tests::run_gameday_export_process::reports_the_last_lines_of_stderr_when_the_process_fails` | adapted | Fake exporter script. |
| runGamedayExportProcess > uses a plain message when a failed process wrote nothing | `src::gameday::run_export_process::tests::run_gameday_export_process::uses_a_plain_message_when_a_failed_process_wrote_nothing` | adapted | The script kills itself with SIGKILL (no exit code, like `close` with `null`). |
| runGamedayExportProcess > rejects %s on stdout [invalid JSON] | `src::gameday::run_export_process::tests::run_gameday_export_process::rejects_invalid_json_on_stdout` | adapted | One test per `it.each` row, with a fake exporter script. |
| runGamedayExportProcess > rejects %s on stdout [an unexpected shape] | `src::gameday::run_export_process::tests::run_gameday_export_process::rejects_an_unexpected_shape_on_stdout` | adapted | One test per `it.each` row, with a fake exporter script. |
| runGamedayExportProcess > reports a process that cannot start and ignores the later close | `src::gameday::run_export_process::tests::run_gameday_export_process::reports_a_process_that_cannot_start` | adapted | A missing executable fails to spawn; there is no separate `close` event to ignore. |
| runGamedayExportProcess > kills the process when it runs past the timeout | `src::gameday::run_export_process::tests::run_gameday_export_process::kills_the_process_when_it_runs_past_the_timeout` | adapted | A real 300 ms timeout instead of fake timers; the child records the SIGTERM it receives. |
| runGamedayExportProcess > falls back to the default timeout for %j [""] | `src::gameday::run_export_process::tests::run_gameday_export_process::falls_back_to_the_default_timeout` | adapted | Checked on `read_process_timeout_ms` rather than by advancing fake timers ten minutes. |
| runGamedayExportProcess > falls back to the default timeout for %j ["nope"] | `src::gameday::run_export_process::tests::run_gameday_export_process::falls_back_to_the_default_timeout` | adapted | Checked on `read_process_timeout_ms` rather than by advancing fake timers ten minutes. |
| runGamedayExportProcess > falls back to the default timeout for %j ["-1"] | `src::gameday::run_export_process::tests::run_gameday_export_process::falls_back_to_the_default_timeout` | adapted | Checked on `read_process_timeout_ms` rather than by advancing fake timers ten minutes. |
| runGamedayExportProcess > uses the scraper timeout when no process timeout is set | `src::gameday::run_export_process::tests::run_gameday_export_process::uses_the_scraper_timeout_when_no_process_timeout_is_set` | adapted | Checked on `read_process_timeout_ms`. |
| runGamedayExportProcess > kills the process when stdout grows too large | `src::gameday::run_export_process::tests::run_gameday_export_process::kills_the_process_when_stdout_grows_too_large` | adapted | A fake exporter streams more than the limit; the child records the SIGTERM. |

## `server/src/gameday/scheduler.test.ts`

8 tests: 7 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| isGamedayImportDue > is due during the first minute after each daily run time | `src::gameday::scheduler::tests::is_gameday_import_due_tests::is_due_during_the_first_minute_after_each_daily_run_time` | equivalent |  |
| isGamedayImportDue > is not due outside the one-minute window | `src::gameday::scheduler::tests::is_gameday_import_due_tests::is_not_due_outside_the_one_minute_window` | equivalent |  |
| isGamedayImportDue > is bounded by the start and the end of the end day | `src::gameday::scheduler::tests::is_gameday_import_due_tests::is_bounded_by_the_start_and_the_end_of_the_end_day` | equivalent |  |
| isGamedayImportDue > is not due when the run key for this day has already run | `src::gameday::scheduler::tests::is_gameday_import_due_tests::is_not_due_when_the_run_key_for_this_day_has_already_run` | equivalent |  |
| isGamedayImportDue > is not due without a valid schedule window | `src::gameday::scheduler::tests::is_gameday_import_due_tests::is_not_due_without_a_valid_schedule_window` | equivalent |  |
| isGamedayImportDue > does not check scheduleEnabled (the scheduler query filters on it) | `src::gameday::scheduler::tests::is_gameday_import_due_tests::does_not_check_schedule_enabled_the_scheduler_query_filters_on_it` | equivalent |  |
| isGamedayImportDue > follows the time of day of scheduleStartOn | `src::gameday::scheduler::tests::is_gameday_import_due_tests::follows_the_time_of_day_of_schedule_start_on` | equivalent |  |
| startGamedayImportScheduler > runs due imports under a lock, at most three per check | `src::gameday::scheduler::tests::start_gameday_import_scheduler_tests::runs_due_imports_under_a_lock_at_most_three_per_check` | adapted | The import runner is injected instead of mocked; the `setInterval` spy becomes the scheduler's own interval and `nextCheck()` is `check_due_gameday_imports()`. The disabled flag is checked through `is_truthy_flag(" Yes ")` and `start_gameday_import_scheduler` with the test config. |

## `server/src/gameday/types.test.ts`

10 tests: 9 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| parseGamedayExportInput > trims required strings except the password | `src::gameday::types::tests::parse_gameday_export_input_tests::trims_required_strings_except_the_password` | equivalent |  |
| parseGamedayExportInput > parses optional fields | `src::gameday::types::tests::parse_gameday_export_input_tests::parses_optional_fields` | equivalent |  |
| parseGamedayExportInput > ignores unknown keys | `src::gameday::types::tests::parse_gameday_export_input_tests::ignores_unknown_keys` | equivalent |  |
| parseGamedayExportInput > rejects non-objects | `src::gameday::types::tests::parse_gameday_export_input_tests::rejects_non_objects` | equivalent |  |
| parseGamedayExportInput > accepts arrays as the input object (missing required fields then fail) | `src::gameday::types::tests::parse_gameday_export_input_tests::accepts_arrays_as_the_input_object_missing_required_fields_then_fail` | equivalent |  |
| parseGamedayExportInput > rejects missing or blank required strings | `src::gameday::types::tests::parse_gameday_export_input_tests::rejects_missing_or_blank_required_strings` | equivalent |  |
| parseGamedayExportInput > accepts a whitespace-only password | `src::gameday::types::tests::parse_gameday_export_input_tests::accepts_a_whitespace_only_password` | equivalent |  |
| parseGamedayExportInput > rejects wrongly typed optional fields | `src::gameday::types::tests::parse_gameday_export_input_tests::rejects_wrongly_typed_optional_fields` | adapted | `timeoutMs: NaN` cannot be sent as JSON; `null` is the closest non-number. |
| isGamedayExportOutput > accepts valid outputs | `src::gameday::types::tests::is_gameday_export_output_tests::accepts_valid_outputs` | equivalent |  |
| isGamedayExportOutput > rejects invalid outputs | `src::gameday::types::tests::is_gameday_export_output_tests::rejects_invalid_outputs` | equivalent |  |

## `server/src/http/capture.test.ts`

10 tests: 4 equivalent, 6 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| capture.handle > passes through object and array results | `src::http::capture::tests::capture_handle::passes_through_object_and_array_results` | adapted | The handler is served by an axum test server; "no console.error" is checked on lines for this test's paths (tests run in parallel). |
| capture.handle > rejects handler results that are not objects | `src::http::capture::tests::capture_handle::rejects_handler_results_that_are_not_objects` | adapted | Log lines are filtered by this test's path. |
| capture.handle > returns serialised errors with debug details outside production | `src::http::capture::tests::capture_handle::returns_serialised_errors_with_debug_details_outside_production` | equivalent |  |
| capture.handle > does not log not found errors | `src::http::capture::tests::capture_handle::does_not_log_not_found_errors` | adapted | Log lines are filtered by this test's path. |
| capture.handle > redacts internal messages and details in production | `src::http::capture::tests::capture_handle::redacts_internal_messages_and_details_in_production` | adapted | `config.IS_PRODUCTION` is passed in; log lines are filtered by this test's path. |
| capture.handle > answers errors that carry a tarpit plan through the tarpit | `src::http::capture::tests::capture_handle::answers_errors_that_carry_a_tarpit_plan_through_the_tarpit` | equivalent |  |
| capture.handle > does not log tarpitted not found errors | `src::http::capture::tests::capture_handle::does_not_log_tarpitted_not_found_errors` | adapted | Log lines are filtered by this test's path. |
| capture.handle > ignores an incomplete tarpit plan | `src::http::capture::tests::capture_handle::ignores_an_incomplete_tarpit_plan` | equivalent |  |
| capture.formatLogLine > falls back to placeholders without a request | `src::http::capture::tests::capture_format_log_line::falls_back_to_placeholders_without_a_request` | equivalent |  |
| capture.formatLogLine > uses the request method and url when the error has no url | `src::http::capture::tests::capture_format_log_line::uses_the_request_method_and_url_when_the_error_has_no_url` | adapted | A `RequestInfo` replaces the `IncomingMessage`. |

## `server/src/http/intrusion.test.ts`

19 tests: 16 equivalent, 3 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getPathname > extracts the pathname | `src::http::intrusion::tests::get_pathname_tests::extracts_the_pathname` | equivalent |  |
| getPathname > resolves absolute and protocol-relative urls | `src::http::intrusion::tests::get_pathname_tests::resolves_absolute_and_protocol_relative_urls` | equivalent |  |
| getPathname > falls back to splitting on ? for unparseable urls | `src::http::intrusion::tests::get_pathname_tests::falls_back_to_splitting_on_question_mark_for_unparseable_urls` | equivalent |  |
| getClientIp > uses the socket address when not behind a trusted proxy | `src::http::intrusion::tests::get_client_ip_tests::uses_the_socket_address_when_not_behind_a_trusted_proxy` | equivalent |  |
| getClientIp > walks forwarded hops from the right past trusted proxies | `src::http::intrusion::tests::get_client_ip_tests::walks_forwarded_hops_from_the_right_past_trusted_proxies` | equivalent |  |
| getClientIp > returns the leftmost hop when every hop is trusted | `src::http::intrusion::tests::get_client_ip_tests::returns_the_leftmost_hop_when_every_hop_is_trusted` | equivalent |  |
| getClientIp > falls back to the proxy address without a forwarded header | `src::http::intrusion::tests::get_client_ip_tests::falls_back_to_the_proxy_address_without_a_forwarded_header` | equivalent |  |
| getClientIp > only uses the first forwarded header value | `src::http::intrusion::tests::get_client_ip_tests::only_uses_the_first_forwarded_header_value` | equivalent |  |
| getClientIp > recognises private, loopback, shared and ULA ranges as trusted | `src::http::intrusion::tests::get_client_ip_tests::recognises_private_loopback_shared_and_ula_ranges_as_trusted` | equivalent |  |
| inspect > allows clean requests without tracking | `src::http::intrusion::tests::inspect::allows_clean_requests_without_tracking` | adapted | "No warnings" is checked on lines for this test's IP. |
| inspect > allows unknown routes from an allowed origin | `src::http::intrusion::tests::inspect::allows_unknown_routes_from_an_allowed_origin` | equivalent |  |
| inspect > flags exploit probe paths | `src::http::intrusion::tests::inspect::flags_exploit_probe_paths` | equivalent |  |
| inspect > does not flag lookalike paths | `src::http::intrusion::tests::inspect::does_not_flag_lookalike_paths` | equivalent |  |
| inspect > blocks an IP immediately after an exploit probe | `src::http::intrusion::tests::inspect::blocks_an_ip_immediately_after_an_exploit_probe` | equivalent |  |
| inspect > flags unknown routes from forbidden origins as suspicious and blocks | `src::http::intrusion::tests::inspect::flags_unknown_routes_from_forbidden_origins_as_suspicious_and_blocks` | equivalent |  |
| inspect > forbids known routes from forbidden origins and blocks on the third strike | `src::http::intrusion::tests::inspect::forbids_known_routes_from_forbidden_origins_and_blocks_on_the_third_strike` | equivalent |  |
| inspect > tracks blocks per client IP behind a trusted proxy | `src::http::intrusion::tests::inspect::tracks_blocks_per_client_ip_behind_a_trusted_proxy` | equivalent |  |
| inspect > expires blocks and escalates the duration of repeat blocks | `src::http::intrusion::tests::inspect::expires_blocks_and_escalates_the_duration_of_repeat_blocks` | adapted | `vi.setSystemTime` becomes `inspect_at` with an explicit time. |
| inspect > logs strikes and blocks | `src::http::intrusion::tests::inspect::logs_strikes_and_blocks` | adapted | Lines filtered by this test's IP. |

## `server/src/http/tarpit.test.ts`

4 tests: 2 equivalent, 1 adapted, 1 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| tarpit.respond > drips spaces until the hold time ends, then sends the body | `src::http::tarpit::tests::tarpit_respond::drips_spaces_until_the_hold_time_ends_then_sends_the_body` | equivalent |  |
| tarpit.respond > sends only the body when the hold is shorter than a drip | `src::http::tarpit::tests::tarpit_respond::sends_only_the_body_when_the_hold_is_shorter_than_a_drip` | equivalent |  |
| tarpit.respond > does nothing for a response that has already ended | — | n/a | Node-specific: `tarpit.respond(res)` writes to an existing `ServerResponse` that a handler may already have ended. `Tarpit::respond` builds and returns the response, so there is no ended response to receive. |
| tarpit.respond > answers immediately once too many tarpits are open, and recovers | `src::http::tarpit::tests::tarpit_respond::answers_immediately_once_too_many_tarpits_are_open_and_recovers` | adapted | Held requests are dropped (closing their connections) instead of `destroy()`ed. |

## `server/src/http/uploads.test.ts`

9 tests: 3 equivalent, 6 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| blob.digestRequest > stores the file in the temp directory and collects fields | `src::http::uploads::tests::blob_digest_request::stores_the_file_in_the_temp_directory_and_collects_fields` | adapted | Requests go straight to `digest_request` with a per-test temp directory (tests run in parallel); the default directory is checked to be the OS temp dir. |
| blob.digestRequest > uses a .bin extension for files without one | `src::http::uploads::tests::blob_digest_request::uses_a_bin_extension_for_files_without_one` | equivalent |  |
| blob.digestRequest > skips file parts without a filename | `src::http::uploads::tests::blob_digest_request::skips_file_parts_without_a_filename` | equivalent |  |
| blob.digestRequest > rejects more than one file | `src::http::uploads::tests::blob_digest_request::rejects_more_than_one_file` | adapted | Cleanup is checked by listing the per-test temp directory instead of spying on `fs.remove`. |
| blob.digestRequest > removes the temp file of an upload rejected for too many files | `src::http::uploads::tests::blob_digest_request::removes_the_temp_file_of_an_upload_rejected_for_too_many_files` | adapted | No write-stream mock is needed: the directory must be empty after the rejection. |
| blob.digestRequest > rejects too many fields | `src::http::uploads::tests::blob_digest_request::rejects_too_many_fields` | equivalent |  |
| blob.digestRequest > rejects files over 5MB and removes the partial file | `src::http::uploads::tests::blob_digest_request::rejects_files_over_5mb_and_removes_the_partial_file` | adapted | Cleanup checked by listing the temp directory; there are no unhandled rejections to watch for in Rust. |
| blob.digestRequest > rejects a request that is not multipart as a bad request | `src::http::uploads::tests::blob_digest_request::rejects_a_request_that_is_not_multipart_as_a_bad_request` | adapted | Also checks a request without a content type. |
| blob.digestRequest > rejects a request that is aborted mid-upload | `src::http::uploads::tests::blob_digest_request::rejects_a_request_that_is_aborted_mid_upload` | adapted | The body stream fails after 300 bytes instead of a destroyed socket. |

## `server/src/queries/mvpLeaderboard.test.ts`

6 tests: 3 equivalent, 3 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getMvpLeaderboardPipeline > weights second picks only under official scoring | `src::queries::mvp_leaderboard::tests::get_mvp_leaderboard_pipeline::weights_second_picks_only_under_official_scoring` | adapted | Checks the vote slots the SQL is built from instead of a `$filter` stage. |
| getMvpLeaderboardPipeline > only counts slots the season uses | `src::queries::mvp_leaderboard::tests::get_mvp_leaderboard_pipeline::only_counts_slots_the_season_uses` | adapted | Checks the vote slots. |
| getMvpLeaderboardPipeline > sorts by votes, division and player name, never id | `src::queries::mvp_leaderboard::tests::get_mvp_leaderboard_pipeline::sorts_by_votes_division_and_player_name_never_id` | adapted | Asserts the SQL `ORDER BY` and runs it against a database. |
| toMvpRows > names players, attaches teams and keeps aggregate order | `src::queries::mvp_leaderboard::tests::to_mvp_rows_tests::names_players_attaches_teams_and_keeps_aggregate_order` | equivalent |  |
| toMvpRows > uses the profile gender matching over the slot votes | `src::queries::mvp_leaderboard::tests::to_mvp_rows_tests::uses_the_profile_gender_matching_over_the_slot_votes` | equivalent |  |
| toMvpRows > falls back to the slot with more votes and drops unused slots | `src::queries::mvp_leaderboard::tests::to_mvp_rows_tests::falls_back_to_the_slot_with_more_votes_and_drops_unused_slots` | equivalent |  |

## `server/src/queries/reportSearch.test.ts`

3 tests: 0 equivalent, 3 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getReportSearchPipeline > pages newest first before joining when not searching | `src::queries::report_search::tests::get_report_search_pipeline::pages_newest_first_before_joining_when_not_searching` | adapted | Runs the query against a database (newest first, skip/limit, joined names). |
| getReportSearchPipeline > joins and filters before paging when searching | `src::queries::report_search::tests::get_report_search_pipeline::joins_and_filters_before_paging_when_searching` | adapted | Runs the query: the trimmed search matches the joined team name literally and the count is taken before paging. |
| getReportSearchPipeline > hides MVP fields for slots the season does not use | `src::queries::report_search::tests::get_report_search_pipeline::hides_mvp_fields_for_slots_the_season_does_not_use` | adapted | Runs the query for a women's season. |

## `server/src/queries/teamList.test.ts`

5 tests: 0 equivalent, 5 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getTeamListPipeline > sorts before skipping and limiting | `src::queries::team_list::tests::get_team_list_pipeline::sorts_before_skipping_and_limiting` | adapted | Asserts the SQL. |
| getTeamListPipeline > keeps teams without a division last and tie-breaks by name | `src::queries::team_list::tests::get_team_list_pipeline::keeps_teams_without_a_division_last_and_tie_breaks_by_name` | adapted | Asserts the SQL and runs it against a database. |
| getTeamListPipeline > uses domain fields with a name tie-breaker, never id | `src::queries::team_list::tests::get_team_list_pipeline::uses_domain_fields_with_a_name_tie_breaker_never_id` | adapted | Asserts the SQL `ORDER BY`. |
| getTeamListPipeline > omits paging stages when not requested | `src::queries::team_list::tests::get_team_list_pipeline::omits_paging_stages_when_not_requested` | adapted | Asserts the SQL paging tail. |
| getSeasonTeamsPipeline > lists the whole season by division | `src::queries::team_list::tests::get_season_teams_pipeline::lists_the_whole_season_by_division` | adapted | Runs `season_teams` against a database instead of comparing pipelines. |

## `server/src/queries/userList.test.ts`

6 tests: 0 equivalent, 6 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getUserListQuery > matches the search case-insensitively on names and emails | `src::queries::user_list::tests::get_user_list_query::matches_the_search_case_insensitively_on_names_and_emails` | adapted | Checks the `Filter::Or` of three conditions, then runs it against a database (literal dot, secondary emails). |
| getUserListQuery > matches everything for an empty search | `src::queries::user_list::tests::get_user_list_query::matches_everything_for_an_empty_search` | adapted | Runs the query against a database. |
| getUserListPipeline > sorts before skipping and limiting | `src::queries::user_list::tests::get_user_list_pipeline::sorts_before_skipping_and_limiting` | adapted | Asserts the SQL (`ORDER BY` then `LIMIT/OFFSET`) instead of Mongo stages. |
| getUserListPipeline > omits a zero skip and a missing limit | `src::queries::user_list::tests::get_user_list_pipeline::omits_a_zero_skip_and_a_missing_limit` | adapted | Asserts the SQL. |
| getUserListPipeline > breaks name ties on the other name | `src::queries::user_list::tests::get_user_list_pipeline::breaks_name_ties_on_the_other_name` | adapted | Asserts the SQL `ORDER BY`. |
| getUserListPipeline > adds and then removes the primary email sort field | `src::queries::user_list::tests::get_user_list_pipeline::adds_the_primary_email_sort_key_and_returns_plain_users` | adapted | The computed primary-email key stays inside SQL (nothing to project away); the SQL shape is asserted and the sort is run against a database. |

## `server/src/services/csvImport.test.ts`

4 tests: 4 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| assertMemberImportHeadings > accepts the required headings with optional extras | `src::services::csv_import::tests::assert_member_import_headings_tests::accepts_the_required_headings_with_optional_extras` | equivalent |  |
| assertMemberImportHeadings > lists every missing required heading | `src::services::csv_import::tests::assert_member_import_headings_tests::lists_every_missing_required_heading` | equivalent |  |
| assertMemberImportHeadings > treats an empty file as missing every heading | `src::services::csv_import::tests::assert_member_import_headings_tests::treats_an_empty_file_as_missing_every_heading` | equivalent |  |
| assertMemberImportHeadings > rejects unexpected headings after checking required ones | `src::services::csv_import::tests::assert_member_import_headings_tests::rejects_unexpected_headings_after_checking_required_ones` | equivalent |  |

## `server/src/services/exportArchive.test.ts`

9 tests: 8 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| createExportArchive > names the archive after the file type and time | `src::services::export_archive::tests::create_export_archive_tests::names_the_archive_after_the_file_type_and_time` | adapted | The TS `beforeAll` seed runs per test (fresh database each). |
| createExportArchive > lists fixture games by season, date and team, with fallbacks for missing records | `src::services::export_archive::tests::create_export_archive_tests::lists_fixture_games_by_season_date_and_team_with_fallbacks_for_missing_records` | equivalent |  |
| createExportArchive > orders final results by numeric season name and position, missing positions last | `src::services::export_archive::tests::create_export_archive_tests::orders_final_results_by_numeric_season_name_and_position_missing_positions_last` | equivalent |  |
| createExportArchive > describes seasons | `src::services::export_archive::tests::create_export_archive_tests::describes_seasons` | equivalent |  |
| createExportArchive > only exports MVPs eligible for slots the season uses | `src::services::export_archive::tests::create_export_archive_tests::only_exports_mvps_eligible_for_slots_the_season_uses` | equivalent |  |
| createExportArchive > lists memberships, falling back to the team season | `src::services::export_archive::tests::create_export_archive_tests::lists_memberships_falling_back_to_the_team_season` | equivalent |  |
| createExportArchive > orders teams by season, division and name | `src::services::export_archive::tests::create_export_archive_tests::orders_teams_by_season_division_and_name` | equivalent |  |
| createExportArchive > lists every user email with the primary email first per user | `src::services::export_archive::tests::create_export_archive_tests::lists_every_user_email_with_the_primary_email_first_per_user` | equivalent |  |
| createExportArchive > writes CSV with escaped formulas, blank missing values and numbers as text | `src::services::export_archive::tests::create_export_archive_tests::writes_csv_with_escaped_formulas_blank_missing_values_and_numbers_as_text` | equivalent |  |

## `server/src/services/fixtureSchedule.test.ts`

18 tests: 17 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| shiftFixtureDate > moves forward and backward by days | `src::services::fixture_schedule::tests::shift_fixture_date_tests::moves_forward_and_backward_by_days` | equivalent |  |
| shiftFixtureDate > moves by weeks of seven days | `src::services::fixture_schedule::tests::shift_fixture_date_tests::moves_by_weeks_of_seven_days` | equivalent |  |
| shiftFixtureDate > moves by calendar months, clamping to the end of shorter months | `src::services::fixture_schedule::tests::shift_fixture_date_tests::moves_by_calendar_months_clamping_to_the_end_of_shorter_months` | equivalent |  |
| shiftFixtureDate > leaves the date unchanged for a zero amount | `src::services::fixture_schedule::tests::shift_fixture_date_tests::leaves_the_date_unchanged_for_a_zero_amount` | equivalent |  |
| assertTeamsCanBeScheduled > requires every team to have a division | `src::services::fixture_schedule::tests::assert_teams_can_be_scheduled_tests::requires_every_team_to_have_a_division` | equivalent |  |
| assertTeamsCanBeScheduled > checks divisions before slots | `src::services::fixture_schedule::tests::assert_teams_can_be_scheduled_tests::checks_divisions_before_slots` | equivalent |  |
| assertTeamsCanBeScheduled > requires at least (teams - 1) / 2 slots | `src::services::fixture_schedule::tests::assert_teams_can_be_scheduled_tests::requires_at_least_teams_minus_1_over_2_slots` | equivalent |  |
| groupTeamIdsByDivision > groups team ids by division in team order | `src::services::fixture_schedule::tests::group_team_ids_by_division_tests::groups_team_ids_by_division_in_team_order` | equivalent |  |
| getHighestRoundNumber > returns the largest round number among titles | `src::services::fixture_schedule::tests::get_highest_round_number_tests::returns_the_largest_round_number_among_titles` | equivalent |  |
| getHighestRoundNumber > returns undefined when no title has a round number | `src::services::fixture_schedule::tests::get_highest_round_number_tests::returns_undefined_when_no_title_has_a_round_number` | equivalent |  |
| resolveDivisionTeamOrders > shuffles a copy of each division when there are no rounds yet | `src::services::fixture_schedule::tests::resolve_division_team_orders_tests::shuffles_a_copy_of_each_division_when_there_are_no_rounds_yet` | equivalent |  |
| resolveDivisionTeamOrders > continues the existing rotation for divisions with round games | `src::services::fixture_schedule::tests::resolve_division_team_orders_tests::continues_the_existing_rotation_for_divisions_with_round_games` | equivalent |  |
| planFixtureRounds > builds weekly rounds from the round-robin pairings | `src::services::fixture_schedule::tests::plan_fixture_rounds_tests::builds_weekly_rounds_from_the_round_robin_pairings` | equivalent |  |
| planFixtureRounds > cycles slots across games from every division | `src::services::fixture_schedule::tests::plan_fixture_rounds_tests::cycles_slots_across_games_from_every_division` | equivalent |  |
| planFixtureRounds > continues numbering and rotation after existing rounds | `src::services::fixture_schedule::tests::plan_fixture_rounds_tests::continues_numbering_and_rotation_after_existing_rounds` | equivalent |  |
| planFixtureRounds > rejects divisions with an odd number of teams | `src::services::fixture_schedule::tests::plan_fixture_rounds_tests::rejects_divisions_with_an_odd_number_of_teams` | equivalent |  |
| planFixtureRounds > uses a random shuffle and random game ids by default | `src::services::fixture_schedule::tests::plan_fixture_rounds_tests::uses_a_random_shuffle_and_random_game_ids_by_default` | equivalent |  |
| shuffleInPlace > returns the same array holding the same items | `src::services::fixture_schedule::tests::shuffle_in_place_tests::returns_the_same_array_holding_the_same_items` | adapted | Same buffer (`as_ptr`) after shuffling in place. |

## `server/src/services/gamedayImportConfig.test.ts`

8 tests: 8 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| readNewGamedayPassword > keeps the existing password when none or a blank one is given | `src::services::gameday_import_config::tests::read_new_gameday_password_tests::keeps_the_existing_password_when_none_or_a_blank_one_is_given` | equivalent |  |
| readNewGamedayPassword > returns the password untrimmed | `src::services::gameday_import_config::tests::read_new_gameday_password_tests::returns_the_password_untrimmed` | equivalent |  |
| readGamedayScheduleFields > clears the date range when the schedule is disabled | `src::services::gameday_import_config::tests::read_gameday_schedule_fields_tests::clears_the_date_range_when_the_schedule_is_disabled` | equivalent |  |
| readGamedayScheduleFields > keeps a valid date range | `src::services::gameday_import_config::tests::read_gameday_schedule_fields_tests::keeps_a_valid_date_range` | equivalent |  |
| readGamedayScheduleFields > requires both dates when enabled | `src::services::gameday_import_config::tests::read_gameday_schedule_fields_tests::requires_both_dates_when_enabled` | equivalent |  |
| readGamedayScheduleFields > rejects a start date after the end date | `src::services::gameday_import_config::tests::read_gameday_schedule_fields_tests::rejects_a_start_date_after_the_end_date` | equivalent |  |
| hasGamedayScheduleChanged > is false for the same schedule | `src::services::gameday_import_config::tests::has_gameday_schedule_changed_tests::is_false_for_the_same_schedule` | equivalent |  |
| hasGamedayScheduleChanged > is true when any schedule field differs | `src::services::gameday_import_config::tests::has_gameday_schedule_changed_tests::is_true_when_any_schedule_field_differs` | equivalent |  |

## `server/src/services/missingReports.test.ts`

6 tests: 6 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| listMissingReports > lists both sides of a game until each has reported | `src::services::missing_reports::tests::lists_both_sides_of_a_game_until_each_has_reported` | equivalent |  |
| listMissingReports > only counts a report against the same opponent and fixture | `src::services::missing_reports::tests::only_counts_a_report_against_the_same_opponent_and_fixture` | equivalent |  |
| listMissingReports > drops rounds where everyone has reported | `src::services::missing_reports::tests::drops_rounds_where_everyone_has_reported` | equivalent |  |
| listMissingReports > skips unknown teams but still names a known opponent | `src::services::missing_reports::tests::skips_unknown_teams_but_still_names_a_known_opponent` | equivalent |  |
| listMissingReports > lists fixtures that share a title separately | `src::services::missing_reports::tests::lists_fixtures_that_share_a_title_separately` | equivalent |  |
| listMissingReports > orders rounds by date | `src::services::missing_reports::tests::orders_rounds_by_date` | equivalent |  |

## `server/src/services/mockData.test.ts`

4 tests: 4 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| generateMockTeamNames > returns the requested number of distinct names | `src::services::mock_data::tests::generate_mock_team_names_tests::returns_the_requested_number_of_distinct_names` | equivalent |  |
| generateMockTeamNames > suffixes a cycle number once the pool runs out | `src::services::mock_data::tests::generate_mock_team_names_tests::suffixes_a_cycle_number_once_the_pool_runs_out` | equivalent |  |
| generateMockSeasonData > creates mock teams, users and memberships for the season | `src::services::mock_data::tests::generate_mock_season_data_tests::creates_mock_teams_users_and_memberships_for_the_season` | equivalent |  |
| generateMockSeasonData > creates nothing for zero teams | `src::services::mock_data::tests::generate_mock_season_data_tests::creates_nothing_for_zero_teams` | equivalent |  |

## `server/src/services/reportMvps.test.ts`

3 tests: 3 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| collectMvpUserIds > returns the non-empty picks | `src::services::report_mvps::tests::collect_mvp_user_ids_tests::returns_the_non_empty_picks` | equivalent |  |
| dropIneligibleMvps > keeps eligible picks and picks for unknown users | `src::services::report_mvps::tests::drop_ineligible_mvps_tests::keeps_eligible_picks_and_picks_for_unknown_users` | equivalent |  |
| dropIneligibleMvps > clears picks in the wrong gender matching slot and empty picks | `src::services::report_mvps::tests::drop_ineligible_mvps_tests::clears_picks_in_the_wrong_gender_matching_slot_and_empty_picks` | equivalent |  |

## `server/src/services/roundRobin.test.ts`

49 tests: 49 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| extractRoundNumber > reads the number after "Round", case-insensitively | `src::services::round_robin::tests::extract_round_number_tests::reads_the_number_after_round_case_insensitively` | equivalent |  |
| extractRoundNumber > returns null for titles without a round number | `src::services::round_robin::tests::extract_round_number_tests::returns_null_for_titles_without_a_round_number` | equivalent |  |
| getRoundRobinPairings > pairs a fixed first team against a rotating circle | `src::services::round_robin::tests::get_round_robin_pairings_tests::pairs_a_fixed_first_team_against_a_rotating_circle` | equivalent |  |
| getRoundRobinPairings > swaps home and away on alternate cycles | `src::services::round_robin::tests::get_round_robin_pairings_tests::swaps_home_and_away_on_alternate_cycles` | equivalent |  |
| getRoundRobinPairings > does not mutate the input | `src::services::round_robin::tests::get_round_robin_pairings_tests::does_not_mutate_the_input` | equivalent |  |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [2 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_2_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [3 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_3_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [4 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_4_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [5 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_5_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [6 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_6_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [7 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_7_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [8 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_8_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > `covers every pairing exactly once per cycle for ${count} teams` [10 teams] | `src::services::round_robin::tests::get_round_robin_pairings_tests::covers_every_pairing_exactly_once_per_cycle_for_10_teams` | equivalent | The `for` loop generates one test per team count; so does a macro in Rust. |
| getRoundRobinPairings > gives each team in an odd division one bye per cycle | `src::services::round_robin::tests::get_round_robin_pairings_tests::gives_each_team_in_an_odd_division_one_bye_per_cycle` | equivalent |  |
| getRoundRobinPairings > returns no games for a single team | `src::services::round_robin::tests::get_round_robin_pairings_tests::returns_no_games_for_a_single_team` | equivalent |  |
| getRoundRobinPairings > returns no games for no teams | `src::services::round_robin::tests::get_round_robin_pairings_tests::returns_no_games_for_no_teams` | equivalent |  |
| getDivisionRoundGames > groups division-only games by round number | `src::services::round_robin::tests::get_division_round_games_tests::groups_division_only_games_by_round_number` | equivalent |  |
| getDivisionRoundGames > ignores fixtures without a round number or division games | `src::services::round_robin::tests::get_division_round_games_tests::ignores_fixtures_without_a_round_number_or_division_games` | equivalent |  |
| getDivisionRoundGames > merges fixtures sharing a round number | `src::services::round_robin::tests::get_division_round_games_tests::merges_fixtures_sharing_a_round_number` | equivalent |  |
| getDivisionRoundGames > reads the first round number in the title | `src::services::round_robin::tests::get_division_round_games_tests::reads_the_first_round_number_in_the_title` | equivalent |  |
| reconstructDivisionTeamOrder > reconstructs a two-team order from round one | `src::services::round_robin::tests::reconstruct_division_team_order_tests::reconstructs_a_two_team_order_from_round_one` | equivalent |  |
| reconstructDivisionTeamOrder > builds a canonical order from a single observed round | `src::services::round_robin::tests::reconstruct_division_team_order_tests::builds_a_canonical_order_from_a_single_observed_round` | equivalent |  |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [2 observed rounds for 4 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_2_observed_rounds_for_4_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [3 observed rounds for 4 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_3_observed_rounds_for_4_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [3 observed rounds for 4 teams (duplicate)] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_3_observed_rounds_for_4_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [5 observed rounds for 4 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_5_observed_rounds_for_4_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [2 observed rounds for 6 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_2_observed_rounds_for_6_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [3 observed rounds for 6 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_3_observed_rounds_for_6_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [5 observed rounds for 6 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_5_observed_rounds_for_6_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [7 observed rounds for 6 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_7_observed_rounds_for_6_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [2 observed rounds for 8 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_2_observed_rounds_for_8_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [3 observed rounds for 8 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_3_observed_rounds_for_8_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [7 observed rounds for 8 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_7_observed_rounds_for_8_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [9 observed rounds for 8 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_9_observed_rounds_for_8_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [2 observed rounds for 10 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_2_observed_rounds_for_10_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [3 observed rounds for 10 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_3_observed_rounds_for_10_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [9 observed rounds for 10 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_9_observed_rounds_for_10_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > `recovers an order reproducing ${roundCount} observed rounds for ${count} teams` [11 observed rounds for 10 teams] | `src::services::round_robin::tests::reconstruct_division_team_order_tests::recovers_an_order_reproducing_11_observed_rounds_for_10_teams` | equivalent | The nested loops generate rounds 2, 3, count-1, count+1 per team count; for 4 teams `count - 1 == 3` repeats, so the TS suite defines that test twice and Rust once. |
| reconstructDivisionTeamOrder > picks a deterministic order when observed rounds are ambiguous | `src::services::round_robin::tests::reconstruct_division_team_order_tests::picks_a_deterministic_order_when_observed_rounds_are_ambiguous` | equivalent |  |
| reconstructDivisionTeamOrder > is independent of the division team order and home/away sides | `src::services::round_robin::tests::reconstruct_division_team_order_tests::is_independent_of_the_division_team_order_and_home_away_sides` | equivalent |  |
| reconstructDivisionTeamOrder > rejects odd divisions | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_odd_divisions` | equivalent |  |
| reconstructDivisionTeamOrder > rejects rounds that do not start at Round 1 | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_rounds_that_do_not_start_at_round_1` | equivalent |  |
| reconstructDivisionTeamOrder > rejects gaps between rounds | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_gaps_between_rounds` | equivalent |  |
| reconstructDivisionTeamOrder > rejects rounds with the wrong number of games | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_rounds_with_the_wrong_number_of_games` | equivalent |  |
| reconstructDivisionTeamOrder > rejects teams outside the division | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_teams_outside_the_division` | equivalent |  |
| reconstructDivisionTeamOrder > rejects teams playing themselves | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_teams_playing_themselves` | equivalent |  |
| reconstructDivisionTeamOrder > rejects teams scheduled twice in a round | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_teams_scheduled_twice_in_a_round` | equivalent |  |
| reconstructDivisionTeamOrder > rejects rounds that do not follow the round-robin pattern | `src::services::round_robin::tests::reconstruct_division_team_order_tests::rejects_rounds_that_do_not_follow_the_round_robin_pattern` | equivalent |  |
| reconstructDivisionTeamOrder > accepts later rounds for a two-team division | `src::services::round_robin::tests::reconstruct_division_team_order_tests::accepts_later_rounds_for_a_two_team_division` | equivalent |  |

## `server/src/services/spiritStats.test.ts`

8 tests: 8 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| getAdjustedSpiritAverages > leaves scores alone when every scorer matches the overall average | `src::services::spirit_stats::tests::get_adjusted_spirit_averages_tests::leaves_scores_alone_when_every_scorer_matches_the_overall_average` | equivalent |  |
| getAdjustedSpiritAverages > removes a shrunken share of each scorer bias | `src::services::spirit_stats::tests::get_adjusted_spirit_averages_tests::removes_a_shrunken_share_of_each_scorer_bias` | equivalent |  |
| getAdjustedSpiritAverages > handles no reports | `src::services::spirit_stats::tests::get_adjusted_spirit_averages_tests::handles_no_reports` | equivalent |  |
| buildSpiritRows > builds a row per team with zeros for teams without reports | `src::services::spirit_stats::tests::build_spirit_rows_tests::builds_a_row_per_team_with_zeros_for_teams_without_reports` | equivalent |  |
| buildSpiritRows > accepts a missing aggregate | `src::services::spirit_stats::tests::build_spirit_rows_tests::accepts_a_missing_aggregate` | equivalent |  |
| sortSpiritRows > sorts by team name | `src::services::spirit_stats::tests::sort_spirit_rows_tests::sorts_by_team_name` | equivalent |  |
| sortSpiritRows > keeps missing divisions last and names ascending within a division | `src::services::spirit_stats::tests::sort_spirit_rows_tests::keeps_missing_divisions_last_and_names_ascending_within_a_division` | equivalent |  |
| sortSpiritRows > sorts numeric columns without mutating the input | `src::services::spirit_stats::tests::sort_spirit_rows_tests::sorts_numeric_columns_without_mutating_the_input` | equivalent |  |

## `server/src/services/userEmail.test.ts`

12 tests: 9 equivalent, 3 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| userEmail.sanitize > returns no emails for anything but an array | `src::services::user_email::tests::user_email_sanitize::returns_no_emails_for_anything_but_an_array` | equivalent |  |
| userEmail.sanitize > drops invalid entries, trims values and keeps the existing primary | `src::services::user_email::tests::user_email_sanitize::drops_invalid_entries_trims_values_and_keeps_the_existing_primary` | equivalent |  |
| userEmail.sanitize > makes the first email primary when none is | `src::services::user_email::tests::user_email_sanitize::makes_the_first_email_primary_when_none_is` | equivalent |  |
| userEmail.sanitizeValue > trims valid emails and rejects invalid ones | `src::services::user_email::tests::user_email_sanitize_value::trims_valid_emails_and_rejects_invalid_ones` | equivalent |  |
| userEmail.codeSend > emails a formatted code with the first name escaped in production | `src::services::user_email::tests::user_email_code_send::emails_a_formatted_code_with_the_first_name_escaped_in_production` | adapted | The `mail.send` spy is the test app's capturing mail transport. |
| userEmail.codeSend > logs the code instead of emailing outside production | `src::services::user_email::tests::user_email_code_send::logs_the_code_instead_of_emailing_outside_production` | adapted | `console.log` spy is a log capture filtered by the email. |
| userEmail.assertCodeValid > accepts a current code in any spacing or case | `src::services::user_email::tests::user_email_assert_code_valid::accepts_a_current_code_in_any_spacing_or_case` | equivalent |  |
| userEmail.assertCodeValid > rejects an incorrect code | `src::services::user_email::tests::user_email_assert_code_valid::rejects_an_incorrect_code` | equivalent |  |
| userEmail.assertCodeValid > compares legacy plain-text codes directly | `src::services::user_email::tests::user_email_assert_code_valid::compares_legacy_plain_text_codes_directly` | equivalent |  |
| userEmail.assertCodeValid > replaces an expired code with a new one and reports it expired | `src::services::user_email::tests::user_email_assert_code_valid::replaces_an_expired_code_with_a_new_one_and_reports_it_expired` | adapted | Log capture filtered by the email. |
| userEmail.assertCodeValid > stops re-sending expired codes once the delivery limit is reached | `src::services::user_email::tests::user_email_assert_code_valid::stops_re_sending_expired_codes_once_the_delivery_limit_is_reached` | equivalent |  |
| userEmail.remove > moves primary to the next email when the primary is removed | `src::services::user_email::tests::user_email_remove::moves_primary_to_the_next_email_when_the_primary_is_removed` | equivalent |  |

## `server/src/services/userMerge.test.ts`

12 tests: 12 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| planMemberMerge > moves memberships that do not overlap | `src::services::user_merge::tests::plan_member_merge::moves_memberships_that_do_not_overlap` | equivalent |  |
| planMemberMerge > replaces a pending user1 membership with a confirmed user2 one | `src::services::user_merge::tests::plan_member_merge::replaces_a_pending_user1_membership_with_a_confirmed_user2_one` | equivalent |  |
| planMemberMerge > otherwise drops the overlapping user2 membership | `src::services::user_merge::tests::plan_member_merge::otherwise_drops_the_overlapping_user2_membership` | equivalent |  |
| mergeUserMergedIds > combines merged ids with user2 and excludes user1 | `src::services::user_merge::tests::merge_user_merged_ids::combines_merged_ids_with_user2_and_excludes_user1` | equivalent |  |
| mergeUserEmails > deduplicates case-insensitively, preferring the verified copy | `src::services::user_merge::tests::merge_user_emails::deduplicates_case_insensitively_preferring_the_verified_copy` | equivalent |  |
| mergeUserEmails > keeps user1's primary email primary | `src::services::user_merge::tests::merge_user_emails::keeps_user1s_primary_email_primary` | equivalent |  |
| mergeUserEmails > falls back to the first email when there is no primary | `src::services::user_merge::tests::merge_user_emails::falls_back_to_the_first_email_when_there_is_no_primary` | equivalent |  |
| mergeUserEmails > returns nothing when neither user has an email | `src::services::user_merge::tests::merge_user_emails::returns_nothing_when_neither_user_has_an_email` | equivalent |  |
| mergeUserFields > prefers user1's values and fills gaps from user2 | `src::services::user_merge::tests::merge_user_fields::prefers_user1s_values_and_fills_gaps_from_user2` | equivalent |  |
| mergeReportUserReferences > replaces every reference to the source user | `src::services::user_merge::tests::merge_report_user_references::replaces_every_reference_to_the_source_user` | equivalent |  |
| mergeReportUserReferences > clears second MVP slots that now repeat the first | `src::services::user_merge::tests::merge_report_user_references::clears_second_mvp_slots_that_now_repeat_the_first` | equivalent |  |
| mergeReportUserReferences > clears the female MVP when it now repeats the male MVP | `src::services::user_merge::tests::merge_report_user_references::clears_the_female_mvp_when_it_now_repeats_the_male_mvp` | equivalent |  |

## `server/src/startup.test.ts`

4 tests: 0 equivalent, 4 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| runStartupTasks > runs every task in order | `src::startup::tests::run_startup_tasks_tests::runs_every_task_in_order` | adapted | Tasks are injected instead of `vi.mock`ed. |
| runStartupTasks > fails immediately outside production | `src::startup::tests::run_startup_tasks_tests::fails_immediately_outside_production` | adapted | Injected tasks; identity becomes equality. |
| runStartupTasks > retries with backoff in production until a task succeeds | `src::startup::tests::run_startup_tasks_tests::retries_with_backoff_in_production_until_a_task_succeeds` | adapted | Paused tokio clock instead of fake timers; task names are unique to the test so the log capture can filter. |
| runStartupTasks > caps the delay and gives up after the retry budget | `src::startup::tests::run_startup_tasks_tests::caps_the_delay_and_gives_up_after_the_retry_budget` | adapted | Paused tokio clock instead of fake timers. |

## `server/src/utils/csv.test.ts`

23 tests: 22 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| parseCSVRows > splits rows and columns | `src::utils::csv::tests::parse_csv_rows_tests::splits_rows_and_columns` | equivalent |  |
| parseCSVRows > returns no rows for an empty string | `src::utils::csv::tests::parse_csv_rows_tests::returns_no_rows_for_an_empty_string` | equivalent |  |
| parseCSVRows > does not emit an empty row for a trailing newline | `src::utils::csv::tests::parse_csv_rows_tests::does_not_emit_an_empty_row_for_a_trailing_newline` | equivalent |  |
| parseCSVRows > keeps blank lines as single empty-token rows | `src::utils::csv::tests::parse_csv_rows_tests::keeps_blank_lines_as_single_empty_token_rows` | equivalent |  |
| parseCSVRows > handles CRLF and lone CR line endings | `src::utils::csv::tests::parse_csv_rows_tests::handles_crlf_and_lone_cr_line_endings` | equivalent |  |
| parseCSVRows > handles quoted commas, newlines and escaped quotes | `src::utils::csv::tests::parse_csv_rows_tests::handles_quoted_commas_newlines_and_escaped_quotes` | equivalent |  |
| parseCSVRows > treats quotes mid-token as toggles and drops them | `src::utils::csv::tests::parse_csv_rows_tests::treats_quotes_mid_token_as_toggles_and_drops_them` | equivalent |  |
| parseCSVRows > keeps a trailing empty column after a trailing comma | `src::utils::csv::tests::parse_csv_rows_tests::keeps_a_trailing_empty_column_after_a_trailing_comma` | equivalent |  |
| parseCSVRows > does not trim tokens | `src::utils::csv::tests::parse_csv_rows_tests::does_not_trim_tokens` | equivalent |  |
| parseCSVString > maps rows to header keys, trimming keys and values | `src::utils::csv::tests::parse_csv_string_tests::maps_rows_to_header_keys_trimming_keys_and_values` | equivalent |  |
| parseCSVString > strips a BOM from the header | `src::utils::csv::tests::parse_csv_string_tests::strips_a_bom_from_the_header` | equivalent |  |
| parseCSVString > skips blank and whitespace-only rows, including leading ones | `src::utils::csv::tests::parse_csv_string_tests::skips_blank_and_whitespace_only_rows_including_leading_ones` | equivalent |  |
| parseCSVString > fills missing columns with empty strings and drops extras | `src::utils::csv::tests::parse_csv_string_tests::fills_missing_columns_with_empty_strings_and_drops_extras` | equivalent |  |
| parseCSVString > lets later duplicate headers win | `src::utils::csv::tests::parse_csv_string_tests::lets_later_duplicate_headers_win` | equivalent |  |
| parseCSVString > returns an empty list without a header | `src::utils::csv::tests::parse_csv_string_tests::returns_an_empty_list_without_a_header` | equivalent |  |
| csvEscape > quotes only when needed | `src::utils::csv::tests::csv_escape_tests::quotes_only_when_needed` | equivalent |  |
| csvEscape > stringifies non-string values | `src::utils::csv::tests::csv_escape_tests::stringifies_non_string_values` | adapted | `null`/`undefined`/numbers/booleans are JSON values passed to `csv_escape_value`. |
| csvEscape > round-trips through parseCSVRows | `src::utils::csv::tests::csv_escape_tests::round_trips_through_parse_csv_rows` | equivalent |  |
| replaceCSVHeader > replaces the first record and escapes new headers | `src::utils::csv::tests::replace_csv_header_tests::replaces_the_first_record_and_escapes_new_headers` | equivalent |  |
| replaceCSVHeader > preserves a BOM | `src::utils::csv::tests::replace_csv_header_tests::preserves_a_bom` | equivalent |  |
| replaceCSVHeader > skips newlines inside a quoted header | `src::utils::csv::tests::replace_csv_header_tests::skips_newlines_inside_a_quoted_header` | equivalent |  |
| replaceCSVHeader > replaces the whole text when there is no newline | `src::utils::csv::tests::replace_csv_header_tests::replaces_the_whole_text_when_there_is_no_newline` | equivalent |  |
| replaceCSVHeader > drops the CR of a CRLF header line ending | `src::utils::csv::tests::replace_csv_header_tests::drops_the_cr_of_a_crlf_header_line_ending` | equivalent |  |

## `server/src/utils/mail.test.ts`

4 tests: 1 equivalent, 3 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| mail.send > sends an HTML email from the app address | `src::utils::mail::tests::mail_send::sends_an_html_email_from_the_app_address` | adapted | A capturing transport records the SES v2 `SendEmail` request body instead of spying on `SESv2Client.send`. |
| mail.send > sends a plain text email with a custom sender and reply address | `src::utils::mail::tests::mail_send::sends_a_plain_text_email_with_a_custom_sender_and_reply_address` | adapted | Capturing transport. |
| mail.send > passes delivery failures to the caller | `src::utils::mail::tests::mail_send::passes_delivery_failures_to_the_caller` | adapted | The transport fails with `MessageRejected`; identity becomes the error message. |
| html.escape > escapes every HTML special character, ampersands first | `src::utils::html::tests::escapes_every_html_special_character_ampersands_first` | equivalent |  |

## `server/test/integration/dashboards.test.ts`

16 tests: 16 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| FeatureDashboardReportsLoad > pages reports newest first with joined names and the season context | `tests/integration/dashboards.rs::feature_dashboard_reports_load::pages_reports_newest_first_with_joined_names_and_the_season_context` | equivalent |  |
| FeatureDashboardReportsLoad > searches fixture titles, team names, submitters and comments | `tests/integration/dashboards.rs::feature_dashboard_reports_load::searches_fixture_titles_team_names_submitters_and_comments` | equivalent |  |
| FeatureDashboardReportsLoad > returns an empty result for a season without reports | `tests/integration/dashboards.rs::feature_dashboard_reports_load::returns_an_empty_result_for_a_season_without_reports` | equivalent |  |
| FeatureDashboardSpiritLoad > `sums, averages and adjusts spirit (${useOfficialScoring ? 'official' : 'simple'} scoring)` [simple scoring] | `tests/integration/dashboards.rs::feature_dashboard_spirit_load::sums_averages_and_adjusts_spirit_simple_scoring` | equivalent | The `for` loop generates one test per scoring system. |
| FeatureDashboardSpiritLoad > `sums, averages and adjusts spirit (${useOfficialScoring ? 'official' : 'simple'} scoring)` [official scoring] | `tests/integration/dashboards.rs::feature_dashboard_spirit_load::sums_averages_and_adjusts_spirit_official_scoring` | equivalent | The `for` loop generates one test per scoring system. |
| FeatureDashboardSpiritLoad > sorts by every key in both directions | `tests/integration/dashboards.rs::feature_dashboard_spirit_load::sorts_by_every_key_in_both_directions` | equivalent |  |
| FeatureDashboardSpiritLoad > is admin only | `tests/integration/dashboards.rs::feature_dashboard_spirit_load::is_admin_only` | equivalent |  |
| FeatureDashboardMvpLoad > awards 5/3 points under official scoring ordered by votes, division and name | `tests/integration/dashboards.rs::feature_dashboard_mvp_load::awards_5_3_points_under_official_scoring_ordered_by_votes_division_and_name` | equivalent |  |
| FeatureDashboardMvpLoad > awards 1 point for primary picks only under simple scoring | `tests/integration/dashboards.rs::feature_dashboard_mvp_load::awards_1_point_for_primary_picks_only_under_simple_scoring` | equivalent |  |
| FeatureDashboardMvpLoad > counts only the slots the season gender division uses | `tests/integration/dashboards.rs::feature_dashboard_mvp_load::counts_only_the_slots_the_season_gender_division_uses` | equivalent |  |
| fixture and report editor loaders > loads the competition with teams by division and fixtures by date | `tests/integration/dashboards.rs::fixture_and_report_editor_loaders::loads_the_competition_with_teams_by_division_and_fixtures_by_date` | equivalent |  |
| fixture and report editor loaders > loads a public fixture view | `tests/integration/dashboards.rs::fixture_and_report_editor_loaders::loads_a_public_fixture_view` | equivalent |  |
| fixture and report editor loaders > loads a fixture tally with its reports newest first (admin only) | `tests/integration/dashboards.rs::fixture_and_report_editor_loaders::loads_a_fixture_tally_with_its_reports_newest_first_admin_only` | equivalent |  |
| fixture and report editor loaders > loads report editor options with the opposition players | `tests/integration/dashboards.rs::fixture_and_report_editor_loaders::loads_report_editor_options_with_the_opposition_players` | equivalent |  |
| fixture and report editor loaders > validates report editor team and fixture access | `tests/integration/dashboards.rs::fixture_and_report_editor_loaders::validates_report_editor_team_and_fixture_access` | equivalent |  |
| FeatureDashboardUserMembershipsLoad > returns a user memberships with their seasons and teams | `tests/integration/dashboards.rs::feature_dashboard_user_memberships_load::returns_a_user_memberships_with_their_seasons_and_teams` | equivalent |  |

## `server/test/integration/fixtures.test.ts`

19 tests: 19 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| fixture management > creates, updates and deletes fixtures as an admin | `tests/integration/fixtures.rs::fixture_management::creates_updates_and_deletes_fixtures_as_an_admin` | equivalent |  |
| fixture management > rejects fixture writes from non-admins and unknown seasons | `tests/integration/fixtures.rs::fixture_management::rejects_fixture_writes_from_non_admins_and_unknown_seasons` | equivalent |  |
| FixtureAdjustMultiple > `moves fixtures on/after the reference by ${amount} ${unit} ${direction}` [3 day forward] | `tests/integration/fixtures.rs::fixture_adjust_multiple::moves_fixtures_on_after_the_reference_by_3_day_forward` | equivalent | The `for` loop generates one test per case. |
| FixtureAdjustMultiple > `moves fixtures on/after the reference by ${amount} ${unit} ${direction}` [2 day backward] | `tests/integration/fixtures.rs::fixture_adjust_multiple::moves_fixtures_on_after_the_reference_by_2_day_backward` | equivalent | The `for` loop generates one test per case. |
| FixtureAdjustMultiple > `moves fixtures on/after the reference by ${amount} ${unit} ${direction}` [1 week forward] | `tests/integration/fixtures.rs::fixture_adjust_multiple::moves_fixtures_on_after_the_reference_by_1_week_forward` | equivalent | The `for` loop generates one test per case. |
| FixtureAdjustMultiple > `moves fixtures on/after the reference by ${amount} ${unit} ${direction}` [2 week backward] | `tests/integration/fixtures.rs::fixture_adjust_multiple::moves_fixtures_on_after_the_reference_by_2_week_backward` | equivalent | The `for` loop generates one test per case. |
| FixtureAdjustMultiple > `moves fixtures on/after the reference by ${amount} ${unit} ${direction}` [1 month forward] | `tests/integration/fixtures.rs::fixture_adjust_multiple::moves_fixtures_on_after_the_reference_by_1_month_forward` | equivalent | The `for` loop generates one test per case. |
| FixtureAdjustMultiple > `moves fixtures on/after the reference by ${amount} ${unit} ${direction}` [1 month backward] | `tests/integration/fixtures.rs::fixture_adjust_multiple::moves_fixtures_on_after_the_reference_by_1_month_backward` | equivalent | The `for` loop generates one test per case. |
| FixtureAdjustMultiple > counts only the reference when it is the last fixture and allows zero amounts | `tests/integration/fixtures.rs::fixture_adjust_multiple::counts_only_the_reference_when_it_is_the_last_fixture_and_allows_zero_amounts` | equivalent |  |
| FixtureAdjustMultiple > returns 404 for an unknown reference fixture | `tests/integration/fixtures.rs::fixture_adjust_multiple::returns_404_for_an_unknown_reference_fixture` | equivalent |  |
| FixtureGenerate > requires every team to have a division | `tests/integration/fixtures.rs::fixture_generate::requires_every_team_to_have_a_division` | equivalent |  |
| FixtureGenerate > requires enough slots for the teams | `tests/integration/fixtures.rs::fixture_generate::requires_enough_slots_for_the_teams` | equivalent |  |
| FixtureGenerate > rejects divisions with an odd number of teams | `tests/integration/fixtures.rs::fixture_generate::rejects_divisions_with_an_odd_number_of_teams` | equivalent |  |
| FixtureGenerate > generates weekly round-robin rounds within each division | `tests/integration/fixtures.rs::fixture_generate::generates_weekly_round_robin_rounds_within_each_division` | equivalent |  |
| FixtureGenerate > reuses slots when there are more games than slots | `tests/integration/fixtures.rs::fixture_generate::reuses_slots_when_there_are_more_games_than_slots` | equivalent |  |
| FixtureGenerate > continues the round robin after a single existing round | `tests/integration/fixtures.rs::fixture_generate::continues_the_round_robin_after_a_single_existing_round` | equivalent |  |
| FixtureGenerate > continues the round robin after two existing rounds and into the next cycle | `tests/integration/fixtures.rs::fixture_generate::continues_the_round_robin_after_two_existing_rounds_and_into_the_next_cycle` | equivalent |  |
| FixtureGenerate > rejects continuing when existing rounds break the round-robin pattern | `tests/integration/fixtures.rs::fixture_generate::rejects_continuing_when_existing_rounds_break_the_round_robin_pattern` | equivalent |  |
| FixtureGenerate > ignores existing fixtures without a round title | `tests/integration/fixtures.rs::fixture_generate::ignores_existing_fixtures_without_a_round_title` | equivalent |  |

## `server/test/integration/gamedayImport.test.ts`

4 tests: 4 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| PortGamedayImport > requires admin, a known season and saved credentials | `tests/integration/gameday_import.rs::port_gameday_import::requires_admin_a_known_season_and_saved_credentials` | equivalent |  |
| PortGamedayImport > imports members, records the run and releases the lock | `tests/integration/gameday_import.rs::port_gameday_import::imports_members_records_the_run_and_releases_the_lock` | equivalent |  |
| PortGamedayImport > refuses to start while another import holds the lock | `tests/integration/gameday_import.rs::port_gameday_import::refuses_to_start_while_another_import_holds_the_lock` | equivalent |  |
| PortGamedayImport > takes over an expired lock and releases it after a failed export | `tests/integration/gameday_import.rs::port_gameday_import::takes_over_an_expired_lock_and_releases_it_after_a_failed_export` | equivalent |  |

## `server/test/integration/http.test.ts`

8 tests: 8 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| request pipeline > answers the root and health checks | `tests/integration/http.rs::request_pipeline::answers_the_root_and_health_checks` | equivalent |  |
| request pipeline > answers CORS preflight requests for the client origin | `tests/integration/http.rs::request_pipeline::answers_cors_preflight_requests_for_the_client_origin` | equivalent |  |
| request pipeline > rejects non-POST requests to known routes | `tests/integration/http.rs::request_pipeline::rejects_non_post_requests_to_known_routes` | equivalent |  |
| request pipeline > returns 404 for unknown routes from the client origin | `tests/integration/http.rs::request_pipeline::returns_404_for_unknown_routes_from_the_client_origin` | equivalent |  |
| request pipeline > forbids known routes from other origins | `tests/integration/http.rs::request_pipeline::forbids_known_routes_from_other_origins` | equivalent |  |
| request pipeline > reports invalid payloads as validation errors with a friendly message | `tests/integration/http.rs::request_pipeline::reports_invalid_payloads_as_validation_errors_with_a_friendly_message` | equivalent |  |
| request pipeline > requires the payload wrapper | `tests/integration/http.rs::request_pipeline::requires_the_payload_wrapper` | equivalent |  |
| request pipeline > reports a missing season before any season exists | `tests/integration/http.rs::request_pipeline::reports_a_missing_season_before_any_season_exists` | equivalent |  |

## `server/test/integration/members.test.ts`

24 tests: 24 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| MemberListOfTeam > enforces sign in, team membership and team access | `tests/integration/members.rs::member_list_of_team::enforces_sign_in_team_membership_and_team_access` | equivalent |  |
| MemberListOfTeam > lists confirmed and pending members with public user fields | `tests/integration/members.rs::member_list_of_team::lists_confirmed_and_pending_members_with_public_user_fields` | equivalent |  |
| MemberListOfTeam > lets admins list any team without being a member | `tests/integration/members.rs::member_list_of_team::lets_admins_list_any_team_without_being_a_member` | equivalent |  |
| MemberLookupByEmail > is available to captains and admins only | `tests/integration/members.rs::member_lookup_by_email::is_available_to_captains_and_admins_only` | equivalent |  |
| MemberCreate > creates a new user when the email is unknown | `tests/integration/members.rs::member_create::creates_a_new_user_when_the_email_is_unknown` | equivalent |  |
| MemberCreate > requires user details for a new email | `tests/integration/members.rs::member_create::requires_user_details_for_a_new_email` | equivalent |  |
| MemberCreate > adds an existing user without needing details | `tests/integration/members.rs::member_create::adds_an_existing_user_without_needing_details` | equivalent |  |
| MemberCreate > confirms a pending request and is idempotent for existing members | `tests/integration/members.rs::member_create::confirms_a_pending_request_and_is_idempotent_for_existing_members` | equivalent |  |
| MemberCreate > rejects users already on another team in the season | `tests/integration/members.rs::member_create::rejects_users_already_on_another_team_in_the_season` | equivalent |  |
| MemberCreate > is limited to captains and admins | `tests/integration/members.rs::member_create::is_limited_to_captains_and_admins` | equivalent |  |
| MemberRequestCreate > creates a pending membership and rejects duplicates | `tests/integration/members.rs::member_request_create::creates_a_pending_membership_and_rejects_duplicates` | equivalent |  |
| MemberRequestCreate > does not require season sign up to be open | `tests/integration/members.rs::member_request_create::does_not_require_season_sign_up_to_be_open` | equivalent |  |
| MemberAcceptOrDecline > lets the captain accept a request | `tests/integration/members.rs::member_accept_or_decline::lets_the_captain_accept_a_request` | equivalent |  |
| MemberAcceptOrDecline > lets the captain decline a request by deleting it | `tests/integration/members.rs::member_accept_or_decline::lets_the_captain_decline_a_request_by_deleting_it` | equivalent |  |
| MemberAcceptOrDecline > forbids non-captains and handles missing members | `tests/integration/members.rs::member_accept_or_decline::forbids_non_captains_and_handles_missing_members` | equivalent |  |
| MemberSetCaptain > moves the captaincy to another member | `tests/integration/members.rs::member_set_captain::moves_the_captaincy_to_another_member` | equivalent |  |
| MemberSetCaptain > confirms a pending member made captain | `tests/integration/members.rs::member_set_captain::confirms_a_pending_member_made_captain` | equivalent |  |
| MemberSetCaptain > rejects the current captain and non-captain callers | `tests/integration/members.rs::member_set_captain::rejects_the_current_captain_and_non_captain_callers` | equivalent |  |
| MemberSetCaptain > lets admins set a captain on a team without one | `tests/integration/members.rs::member_set_captain::lets_admins_set_a_captain_on_a_team_without_one` | equivalent |  |
| MemberRemove > passes the captaincy to the oldest confirmed member | `tests/integration/members.rs::member_remove::passes_the_captaincy_to_the_oldest_confirmed_member` | equivalent |  |
| MemberRemove > leaves no captain when no confirmed member remains | `tests/integration/members.rs::member_remove::leaves_no_captain_when_no_confirmed_member_remains` | equivalent |  |
| MemberRemove > lets non-captains remove only themselves | `tests/integration/members.rs::member_remove::lets_non_captains_remove_only_themselves` | equivalent |  |
| MemberRemove > lets captains and admins remove members | `tests/integration/members.rs::member_remove::lets_captains_and_admins_remove_members` | equivalent |  |
| MemberRemove > ignores missing members and blocks other teams and pending requesters | `tests/integration/members.rs::member_remove::ignores_missing_members_and_blocks_other_teams_and_pending_requesters` | equivalent |  |

## `server/test/integration/migrations.test.ts`

1 tests: 1 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| runUserGenderMatchingMigration > backfills gender matching from gender, then MVP picks, then the fallback | `tests/integration/migrations.rs::run_user_gender_matching_migration_tests::backfills_gender_matching_from_gender_then_mvp_picks_then_the_fallback` | equivalent |  |

## `server/test/integration/port.test.ts`

20 tests: 20 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| PortExport > requires admin | `tests/integration/port.rs::port_export::requires_admin` | equivalent |  |
| PortExport > returns a zip of csv files with upper snake headings and escaped formulas | `tests/integration/port.rs::port_export::returns_a_zip_of_csv_files_with_upper_snake_headings_and_escaped_formulas` | equivalent |  |
| PortExport > returns a zip of json files with nulls for missing values and no escaping | `tests/integration/port.rs::port_export::returns_a_zip_of_json_files_with_nulls_for_missing_values_and_no_escaping` | equivalent |  |
| PortImport > requires admin | `tests/integration/port.rs::port_import::requires_admin` | equivalent |  |
| PortImport > requires a season id, an existing season and a csv file | `tests/integration/port.rs::port_import::requires_a_season_id_an_existing_season_and_a_csv_file` | equivalent |  |
| PortImport > rejects a request that is not a multipart upload as a bad request | `tests/integration/port.rs::port_import::rejects_a_request_that_is_not_a_multipart_upload_as_a_bad_request` | equivalent |  |
| PortImport > rejects missing and unexpected headings | `tests/integration/port.rs::port_import::rejects_missing_and_unexpected_headings` | equivalent |  |
| PortImport > creates teams, users and members, and is idempotent | `tests/integration/port.rs::port_import::creates_teams_users_and_members_and_is_idempotent` | equivalent |  |
| PortImport > does not add a second membership for a user already in the season | `tests/integration/port.rs::port_import::does_not_add_a_second_membership_for_a_user_already_in_the_season` | equivalent |  |
| PortImport > rejects an invalid gender matching (%s) with the row number [banana] | `tests/integration/port.rs::port_import::rejects_an_invalid_gender_matching_banana_with_the_row_number` | equivalent | One test per `it.each` row. |
| PortImport > rejects an invalid gender matching (%s) with the row number [non-binary] | `tests/integration/port.rs::port_import::rejects_an_invalid_gender_matching_non_binary_with_the_row_number` | equivalent | One test per `it.each` row. |
| PortImport > rejects an invalid gender matching (%s) with the row number [other] | `tests/integration/port.rs::port_import::rejects_an_invalid_gender_matching_other_with_the_row_number` | equivalent | One test per `it.each` row. |
| PortImport > accepts the older gender heading for gender matching | `tests/integration/port.rs::port_import::accepts_the_older_gender_heading_for_gender_matching` | equivalent |  |
| mock data > generates mock teams, users and members and deletes them again | `tests/integration/port.rs::mock_data::generates_mock_teams_users_and_members_and_deletes_them_again` | equivalent |  |
| mock data > validates the generate payload and season | `tests/integration/port.rs::mock_data::validates_the_generate_payload_and_season` | equivalent |  |
| mock data > requires admin | `tests/integration/port.rs::mock_data::requires_admin` | equivalent |  |
| GameDay import config > requires a password when creating | `tests/integration/port.rs::gameday_import_config::requires_a_password_when_creating` | equivalent |  |
| GameDay import config > validates schedule dates | `tests/integration/port.rs::gameday_import_config::validates_schedule_dates` | equivalent |  |
| GameDay import config > saves and loads a safe config without exposing the password | `tests/integration/port.rs::gameday_import_config::saves_and_loads_a_safe_config_without_exposing_the_password` | equivalent |  |
| GameDay import config > returns not found for unknown seasons and requires admin | `tests/integration/port.rs::gameday_import_config::returns_not_found_for_unknown_seasons_and_requires_admin` | equivalent |  |

## `server/test/integration/reports.test.ts`

16 tests: 16 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| ReportCreate > lets a team member submit a report for their own matchup | `tests/integration/reports.rs::report_create::lets_a_team_member_submit_a_report_for_their_own_matchup` | equivalent |  |
| ReportCreate > lets an admin submit on behalf of any team | `tests/integration/reports.rs::report_create::lets_an_admin_submit_on_behalf_of_any_team` | equivalent |  |
| ReportCreate > rejects users without a team or for another team | `tests/integration/reports.rs::report_create::rejects_users_without_a_team_or_for_another_team` | equivalent |  |
| ReportCreate > rejects matchups that are not in the fixture | `tests/integration/reports.rs::report_create::rejects_matchups_that_are_not_in_the_fixture` | equivalent |  |
| ReportCreate > rejects a duplicate report for the same fixture and matchup | `tests/integration/reports.rs::report_create::rejects_a_duplicate_report_for_the_same_fixture_and_matchup` | equivalent |  |
| ReportCreate > validates teams and fixtures against the fixture season | `tests/integration/reports.rs::report_create::validates_teams_and_fixtures_against_the_fixture_season` | equivalent |  |
| ReportCreate > requires a comment for official spirit totals outside 9-11 | `tests/integration/reports.rs::report_create::requires_a_comment_for_official_spirit_totals_outside_9_11` | equivalent |  |
| ReportCreate > does not require a comment when spirit parts are incomplete or scoring is simple | `tests/integration/reports.rs::report_create::does_not_require_a_comment_when_spirit_parts_are_incomplete_or_scoring_is_simple` | equivalent |  |
| ReportCreate > checks the spirit comment before duplicates and matchups | `tests/integration/reports.rs::report_create::checks_the_spirit_comment_before_duplicates_and_matchups` | equivalent |  |
| ReportCreate > drops MVP slots the season gender division does not use | `tests/integration/reports.rs::report_create::drops_mvp_slots_the_season_gender_division_does_not_use` | equivalent |  |
| ReportCreate > drops MVP picks whose gender matching is ineligible for the slot | `tests/integration/reports.rs::report_create::drops_mvp_picks_whose_gender_matching_is_ineligible_for_the_slot` | equivalent |  |
| ReportUpdate and ReportDelete > lets an admin update a report and sanitises it like create | `tests/integration/reports.rs::report_update_and_report_delete::lets_an_admin_update_a_report_and_sanitises_it_like_create` | equivalent |  |
| ReportUpdate and ReportDelete > checks the spirit comment against the stored spirit parts | `tests/integration/reports.rs::report_update_and_report_delete::checks_the_spirit_comment_against_the_stored_spirit_parts` | equivalent |  |
| ReportUpdate and ReportDelete > lets only an admin delete a report | `tests/integration/reports.rs::report_update_and_report_delete::lets_only_an_admin_delete_a_report` | equivalent |  |
| ReportMissingList > groups missing reports by fixture in date order | `tests/integration/reports.rs::report_missing_list::groups_missing_reports_by_fixture_in_date_order` | equivalent |  |
| ReportMissingList > returns an empty list for a season with nothing missing | `tests/integration/reports.rs::report_missing_list::returns_an_empty_list_for_a_season_with_nothing_missing` | equivalent |  |

## `server/test/integration/seasons.test.ts`

16 tests: 15 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| season access control > rejects anonymous and non-admin season management | `tests/integration/seasons.rs::season_access_control::rejects_anonymous_and_non_admin_season_management` | equivalent |  |
| SeasonList > is public and orders names descending with numeric collation | `tests/integration/seasons.rs::season_list::is_public_and_orders_names_descending_with_numeric_collation` | equivalent |  |
| SeasonList > searches case-insensitively and treats regex characters literally | `tests/integration/seasons.rs::season_list::searches_case_insensitively_and_treats_regex_characters_literally` | equivalent |  |
| SeasonList > returns all seasons without a search | `tests/integration/seasons.rs::season_list::returns_all_seasons_without_a_search` | adapted | The TS suite shares one database and counts whatever exists; the Rust test creates two seasons in its fresh database first, then compares with the stored count. |
| SeasonCreate and SeasonUpdate > creates a season with the given fields | `tests/integration/seasons.rs::season_create_and_season_update::creates_a_season_with_the_given_fields` | equivalent |  |
| SeasonCreate and SeasonUpdate > rejects an invalid payload | `tests/integration/seasons.rs::season_create_and_season_update::rejects_an_invalid_payload` | equivalent |  |
| SeasonCreate and SeasonUpdate > updates a season and its updatedOn | `tests/integration/seasons.rs::season_create_and_season_update::updates_a_season_and_its_updated_on` | equivalent |  |
| SeasonCreate and SeasonUpdate > returns 404 when updating a missing season | `tests/integration/seasons.rs::season_create_and_season_update::returns_404_when_updating_a_missing_season` | equivalent |  |
| SeasonDeleteStatus > reports whether a season has score reports | `tests/integration/seasons.rs::season_delete_status::reports_whether_a_season_has_score_reports` | equivalent |  |
| SeasonDeleteStatus > detects reports linked by fixture or by opposing team | `tests/integration/seasons.rs::season_delete_status::detects_reports_linked_by_fixture_or_by_opposing_team` | equivalent |  |
| SeasonDeleteStatus > returns 404 for a missing season | `tests/integration/seasons.rs::season_delete_status::returns_404_for_a_missing_season` | equivalent |  |
| SeasonDelete > requires the admin to have a password | `tests/integration/seasons.rs::season_delete::requires_the_admin_to_have_a_password` | equivalent |  |
| SeasonDelete > rejects a wrong password | `tests/integration/seasons.rs::season_delete::rejects_a_wrong_password` | equivalent |  |
| SeasonDelete > returns 404 for a missing season | `tests/integration/seasons.rs::season_delete::returns_404_for_a_missing_season` | equivalent |  |
| SeasonDelete > is blocked when the season has score reports | `tests/integration/seasons.rs::season_delete::is_blocked_when_the_season_has_score_reports` | equivalent |  |
| SeasonDelete > cascades members, fixtures and teams and clears lastSeasonId | `tests/integration/seasons.rs::season_delete::cascades_members_fixtures_and_teams_and_clears_last_season_id` | equivalent |  |

## `server/test/integration/security.test.ts`

12 tests: 11 equivalent, 1 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| security endpoints > reports the status of unknown, passwordless and verified accounts | `tests/integration/security.rs::security_endpoints::reports_the_status_of_unknown_passwordless_and_verified_accounts` | equivalent |  |
| security endpoints > signs up a user without exposing secrets | `tests/integration/security.rs::security_endpoints::signs_up_a_user_without_exposing_secrets` | equivalent |  |
| security endpoints > rejects sign up without terms or with an existing email | `tests/integration/security.rs::security_endpoints::rejects_sign_up_without_terms_or_with_an_existing_email` | equivalent |  |
| security endpoints > logs in with a password and rejects wrong passwords | `tests/integration/security.rs::security_endpoints::logs_in_with_a_password_and_rejects_wrong_passwords` | equivalent |  |
| security endpoints > rate limits repeated failed logins from one client | `tests/integration/security.rs::security_endpoints::rate_limits_repeated_failed_logins_from_one_client` | equivalent |  |
| security endpoints > rejects incorrect verification codes | `tests/integration/security.rs::security_endpoints::rejects_incorrect_verification_codes` | equivalent |  |
| security endpoints > rejects short passwords on verify | `tests/integration/security.rs::security_endpoints::rejects_short_passwords_on_verify` | equivalent |  |
| security endpoints > verifies the email and ends other sessions when the password is reset | `tests/integration/security.rs::security_endpoints::verifies_the_email_and_ends_other_sessions_when_the_password_is_reset` | equivalent |  |
| security endpoints > sends a restore code for forgotten passwords without revealing accounts | `tests/integration/security.rs::security_endpoints::sends_a_restore_code_for_forgotten_passwords_without_revealing_accounts` | equivalent |  |
| security endpoints > returns the current season and auth, falling back to the newest season | `tests/integration/security.rs::security_endpoints::returns_the_current_season_and_auth_falling_back_to_the_newest_season` | adapted | Waits 5 ms between the two season creations so their `createdOn` differ (the Rust server can create both within one millisecond and ties are not broken by `id`). |
| security endpoints > ends the session on logout | `tests/integration/security.rs::security_endpoints::ends_the_session_on_logout` | equivalent |  |
| security endpoints > distinguishes missing and invalid tokens | `tests/integration/security.rs::security_endpoints::distinguishes_missing_and_invalid_tokens` | equivalent |  |

## `server/test/integration/teams.test.ts`

26 tests: 26 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| TeamCurrentCreate > requires a signed in user | `tests/integration/teams.rs::team_current_create::requires_a_signed_in_user` | equivalent |  |
| TeamCurrentCreate > makes the creator the confirmed captain and sets lastSeasonId | `tests/integration/teams.rs::team_current_create::makes_the_creator_the_confirmed_captain_and_sets_last_season_id` | equivalent |  |
| TeamCurrentCreate > rejects when season sign up is closed | `tests/integration/teams.rs::team_current_create::rejects_when_season_sign_up_is_closed` | equivalent |  |
| TeamCurrentCreate > returns 404 for a missing season | `tests/integration/teams.rs::team_current_create::returns_404_for_a_missing_season` | equivalent |  |
| TeamCurrentCreate > rejects users already on a team (including pending) in the season | `tests/integration/teams.rs::team_current_create::rejects_users_already_on_a_team_including_pending_in_the_season` | equivalent |  |
| TeamCurrentCreate > rejects colours that are not hsla strings | `tests/integration/teams.rs::team_current_create::rejects_colours_that_are_not_hsla_strings` | equivalent |  |
| TeamCurrentUpdate > requires the user to be on a team | `tests/integration/teams.rs::team_current_update::requires_the_user_to_be_on_a_team` | equivalent |  |
| TeamCurrentUpdate > lets the captain update team details | `tests/integration/teams.rs::team_current_update::lets_the_captain_update_team_details` | equivalent |  |
| TeamCurrentUpdate > forbids confirmed non-captains | `tests/integration/teams.rs::team_current_update::forbids_confirmed_non_captains` | equivalent |  |
| TeamCurrentUpdate > forbids pending members (via the team access check) | `tests/integration/teams.rs::team_current_update::forbids_pending_members_via_the_team_access_check` | equivalent |  |
| TeamCurrentUpdate > forbids members of other teams and admins who are not members | `tests/integration/teams.rs::team_current_update::forbids_members_of_other_teams_and_admins_who_are_not_members` | equivalent |  |
| TeamCreate, TeamUpdate and TeamDelete > are admin only | `tests/integration/teams.rs::team_create_team_update_and_team_delete::are_admin_only` | equivalent |  |
| TeamCreate, TeamUpdate and TeamDelete > creates a team for an existing season | `tests/integration/teams.rs::team_create_team_update_and_team_delete::creates_a_team_for_an_existing_season` | equivalent |  |
| TeamCreate, TeamUpdate and TeamDelete > updates a team including its division | `tests/integration/teams.rs::team_create_team_update_and_team_delete::updates_a_team_including_its_division` | equivalent |  |
| TeamCreate, TeamUpdate and TeamDelete > deletes a team and its members | `tests/integration/teams.rs::team_create_team_update_and_team_delete::deletes_a_team_and_its_members` | equivalent |  |
| FeatureDashboardTeamsLoad > is public and defaults to division ascending with missing divisions last | `tests/integration/teams.rs::feature_dashboard_teams_load::is_public_and_defaults_to_division_ascending_with_missing_divisions_last` | equivalent |  |
| FeatureDashboardTeamsLoad > sorts by every key and direction | `tests/integration/teams.rs::feature_dashboard_teams_load::sorts_by_every_key_and_direction` | equivalent |  |
| FeatureDashboardTeamsLoad > searches names case-insensitively and counts matches | `tests/integration/teams.rs::feature_dashboard_teams_load::searches_names_case_insensitively_and_counts_matches` | equivalent |  |
| FeatureDashboardTeamsLoad > pages with skip and limit after sorting while count stays total | `tests/integration/teams.rs::feature_dashboard_teams_load::pages_with_skip_and_limit_after_sorting_while_count_stays_total` | equivalent |  |
| FeatureDashboardTeamsLoad > only returns teams of the requested season | `tests/integration/teams.rs::feature_dashboard_teams_load::only_returns_teams_of_the_requested_season` | equivalent |  |
| FeatureDashboardTeamsLoad > validates paging and season | `tests/integration/teams.rs::feature_dashboard_teams_load::validates_paging_and_season` | equivalent |  |
| FeatureTeamSetupLoad > requires a signed in user | `tests/integration/teams.rs::feature_team_setup_load::requires_a_signed_in_user` | equivalent |  |
| FeatureTeamSetupLoad > lists teams by name and returns the pending team | `tests/integration/teams.rs::feature_team_setup_load::lists_teams_by_name_and_returns_the_pending_team` | equivalent |  |
| FeatureTeamSetupLoad > also returns the team of a confirmed membership | `tests/integration/teams.rs::feature_team_setup_load::also_returns_the_team_of_a_confirmed_membership` | equivalent |  |
| FeatureTeamSetupLoad > returns 404 for a missing season | `tests/integration/teams.rs::feature_team_setup_load::returns_404_for_a_missing_season` | equivalent |  |
| FeatureCompetitionLoad > is public and returns teams by division and fixtures by date | `tests/integration/teams.rs::feature_competition_load::is_public_and_returns_teams_by_division_and_fixtures_by_date` | equivalent |  |

## `server/test/integration/users.test.ts`

38 tests: 38 equivalent, 0 adapted, 0 n/a.

| TS test | Rust test | Status | Notes |
| --- | --- | --- | --- |
| UserList > is admin only | `tests/integration/users.rs::user_list::is_admin_only` | equivalent |  |
| UserList > searches first name, last name and any email case-insensitively | `tests/integration/users.rs::user_list::searches_first_name_last_name_and_any_email_case_insensitively` | equivalent |  |
| UserList > returns safe user fields | `tests/integration/users.rs::user_list::returns_safe_user_fields` | equivalent |  |
| UserList > defaults to createdOn descending | `tests/integration/users.rs::user_list::defaults_to_created_on_descending` | equivalent |  |
| UserList > sorts by %s %s [firstName asc] | `tests/integration/users.rs::user_list::sorts_by_first_name_asc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [firstName desc] | `tests/integration/users.rs::user_list::sorts_by_first_name_desc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [lastName asc] | `tests/integration/users.rs::user_list::sorts_by_last_name_asc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [lastName desc] | `tests/integration/users.rs::user_list::sorts_by_last_name_desc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [email asc] | `tests/integration/users.rs::user_list::sorts_by_email_asc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [email desc] | `tests/integration/users.rs::user_list::sorts_by_email_desc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [genderMatching asc] | `tests/integration/users.rs::user_list::sorts_by_gender_matching_asc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [genderMatching desc] | `tests/integration/users.rs::user_list::sorts_by_gender_matching_desc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [createdOn asc] | `tests/integration/users.rs::user_list::sorts_by_created_on_asc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > sorts by %s %s [createdOn desc] | `tests/integration/users.rs::user_list::sorts_by_created_on_desc` | equivalent | One test per `it.each` row; the TS `beforeAll` fixture is rebuilt per test. |
| UserList > uses name tie-breakers in ascending order regardless of direction | `tests/integration/users.rs::user_list::uses_name_tie_breakers_in_ascending_order_regardless_of_direction` | equivalent |  |
| UserList > applies skip and limit after sorting while counting all matches | `tests/integration/users.rs::user_list::applies_skip_and_limit_after_sorting_while_counting_all_matches` | equivalent |  |
| UserCreate / UserUpdate / UserToggleAdmin > creates a user with one unverified primary email | `tests/integration/users.rs::user_create_update_toggle_admin::creates_a_user_with_one_unverified_primary_email` | equivalent |  |
| UserCreate / UserUpdate / UserToggleAdmin > rejects a duplicate email case-insensitively | `tests/integration/users.rs::user_create_update_toggle_admin::rejects_a_duplicate_email_case_insensitively` | equivalent |  |
| UserCreate / UserUpdate / UserToggleAdmin > requires admin to create | `tests/integration/users.rs::user_create_update_toggle_admin::requires_admin_to_create` | equivalent |  |
| UserCreate / UserUpdate / UserToggleAdmin > updates a user | `tests/integration/users.rs::user_create_update_toggle_admin::updates_a_user` | equivalent |  |
| UserCreate / UserUpdate / UserToggleAdmin > toggles admin on and off | `tests/integration/users.rs::user_create_update_toggle_admin::toggles_admin_on_and_off` | equivalent |  |
| admin email management > adds, sets primary, sets verified and removes emails | `tests/integration/users.rs::admin_email_management::adds_sets_primary_sets_verified_and_removes_emails` | equivalent |  |
| admin email management > reports unknown emails as not found | `tests/integration/users.rs::admin_email_management::reports_unknown_emails_as_not_found` | equivalent |  |
| admin email management > rejects invalid email values | `tests/integration/users.rs::admin_email_management::rejects_invalid_email_values` | equivalent |  |
| admin email management > requires admin | `tests/integration/users.rs::admin_email_management::requires_admin` | equivalent |  |
| current user > updates the current user | `tests/integration/users.rs::current_user::updates_the_current_user` | equivalent |  |
| current user > adds, verifies, resends, sets primary and removes own emails | `tests/integration/users.rs::current_user::adds_verifies_resends_sets_primary_and_removes_own_emails` | equivalent |  |
| current user > reports unknown emails on verify and resend as not found | `tests/integration/users.rs::current_user::reports_unknown_emails_on_verify_and_resend_as_not_found` | equivalent |  |
| current user > rate limits code resends per email | `tests/integration/users.rs::current_user::rate_limits_code_resends_per_email` | equivalent |  |
| current user > requires sign in | `tests/integration/users.rs::current_user::requires_sign_in` | equivalent |  |
| password changes > requires a password and the correct old password | `tests/integration/users.rs::password_changes::requires_a_password_and_the_correct_old_password` | equivalent |  |
| password changes > ends other sessions but keeps the current one | `tests/integration/users.rs::password_changes::ends_other_sessions_but_keeps_the_current_one` | equivalent |  |
| password changes > lets an admin set a password and ends all of that user’s sessions | `tests/integration/users.rs::password_changes::lets_an_admin_set_a_password_and_ends_all_of_that_users_sessions` | equivalent |  |
| UserMerge > cannot merge a user into itself | `tests/integration/users.rs::user_merge::cannot_merge_a_user_into_itself` | equivalent |  |
| UserMerge > requires admin | `tests/integration/users.rs::user_merge::requires_admin` | equivalent |  |
| UserMerge > moves members, reports, sessions and emails onto the first user | `tests/integration/users.rs::user_merge::moves_members_reports_sessions_and_emails_onto_the_first_user` | equivalent |  |
| UserMerge > clears a male MVP repeated in the female slot | `tests/integration/users.rs::user_merge::clears_a_male_mvp_repeated_in_the_female_slot` | equivalent |  |
| UserMerge > returns not found for an unknown user | `tests/integration/users.rs::user_merge::returns_not_found_for_an_unknown_user` | equivalent |  |

## Audit notes

- Every TS test above was read side by side with its Rust test(s). Where a
  Rust test checked less than the TS one, it was tightened:
  - `export_archive`: the fixture-games date is compared with an independent
    `en-AU` (`dd/mm/yyyy`, local time) formatting instead of the function
    under test.
  - `db::audit`: the test runs `run_startup_schema_audit` and checks both
    logged lines ("Running SQLite schema audit..." and the results block), as
    the TS test does, instead of only the report lines.
  - `gameday::scheduler`: the `GAMEDAY_IMPORT_SCHEDULER_DISABLED` parsing
    (` Yes `, empty, unset) and `start_gameday_import_scheduler` staying off
    when disabled are now asserted, as the TS test does through the env var.
  - `http::uploads`: the default upload directory is asserted to be the OS
    temp directory (`os.tmpdir()`).
  - `shared::contract`: `match_the_ts_definitions_one_to_one` pins all 67
    endpoint definitions (module, path, access point, payload/result presence,
    multipart) to the TS exports, so a missing or mis-guarded definition fails.
- No TS test was missing a Rust counterpart, and none of the tightened tests
  exposed a behaviour difference from the TS server.
- `browser/` tests do not depend on server internals: they import only
  `@shared` (unchanged by the port), their own fixtures and `src/test/server.ts`,
  which replaces `fetch` with an in-memory mock keyed by endpoint path.

## Rust-only tests

Tests with no TS counterpart (new seams, stricter checks, or Rust-specific code).

- `src::auth::attempt_limit::tests::blocks_after_the_scope_limit_and_resets`
- `src::auth::attempt_limit::tests::delivery_limits_the_account_to_three_codes`
- `src::auth::attempt_limit::tests::resets_an_expired_window_unless_blocked`
- `src::auth::hash::tests::digests_like_node_crypto`
- `src::auth::hash::tests::hashes_with_cost_11_and_rejects_overlong_passwords`
- `src::auth::hash::tests::validates_new_password_length`
- `src::auth::hash::tests::verifies_bcryptjs_hashes`
- `src::auth::jwt::tests::rejects_expired_and_tampered_tokens`
- `src::auth::jwt::tests::signs_byte_identical_tokens_to_jsonwebtoken`
- `src::auth::jwt::tests::verifies_tokens_signed_by_the_ts_server`
- `src::auth::sessions::tests::digests_valid_tokens_only`
- `src::auth::sessions::tests::reads_bearer_and_bare_tokens`
- `src::auth::sessions::tests::validates_sessions_against_their_claims`
- `src::config::tests::reads_production_mode_and_flags`
- `src::config::tests::reports_the_first_invalid_variable`
- `src::config::tests::validates_and_normalises_the_environment`
- `src::db::migrations::tests::schema_migrations::applies_each_migration_once`
- `src::db::migrations::tests::schema_migrations::creates_a_column_for_every_declared_field`
- `src::db::migrations::tests::schema_migrations::deleting_a_user_deletes_its_email_rows`
- `src::db::table::tests::db_table::refuses_to_sort_by_id`
- `src::db::table::tests::db_table::selects_with_a_custom_sql_tail`
- `src::db::tests::registers_collations_and_functions`
- `src::db::tests::savepoints_nest_inside_transactions`
- `src::endpoints::port::tests::encodes_like_encode_uri_component`
- `src::endpoints::tests::registers_each_path_once_and_only_contract_paths`
- `src::gameday::browser::tests::prefers_an_explicit_executable`
- `src::gameday::browser::tests::resolves_channels_to_install_paths`
- `src::gameday::browser::tests::sets_params_like_url_search_params`
- `src::gameday::credentials::tests::gameday_password_encryption::decrypts_passwords_encrypted_by_the_ts_server`
- `src::gameday::credentials::tests::gameday_password_encryption::depends_on_the_secret`
- `src::gameday::exporter::tests::helpers::escapes_regex_metacharacters_like_the_ts_helper`
- `src::gameday::exporter::tests::helpers::generates_v4_uuids`
- `src::gameday::exporter::tests::helpers::resolves_relative_links_against_the_page`
- `src::http::cors::tests::echoes_an_allowed_origin_and_falls_back_to_the_client_url`
- `src::http::endpoint::tests::prettifies_validation_errors`
- `src::http::endpoint::tests::requires_the_payload_wrapper`
- `src::http::origin::tests::normalises_and_compares_origins`
- `src::http::uploads::tests::helpers::computes_extensions_like_node`
- `src::http::uploads::tests::helpers::parses_dispositions_like_busboy`
- `src::js::date::tests::parses_common_legacy_formats`
- `src::js::date::tests::parses_iso_strings_like_date_parse`
- `src::js::date::tests::prints_iso_strings_like_to_iso_string`
- `src::js::locale_compare::tests::is_equal_only_for_identical_text`
- `src::js::locale_compare::tests::orders_letters_alphabetically_ignoring_case_first`
- `src::js::locale_compare::tests::orders_punctuation_before_digits_before_letters`
- `src::js::locale_compare::tests::sorts_like_node`
- `src::js::locale_compare::tests::treats_accents_as_secondary`
- `src::js::tests::formats_numbers_like_javascript`
- `src::js::tests::parses_numbers_like_javascript`
- `src::js::tests::stringifies_like_json_stringify`
- `src::js::tests::trims_javascript_whitespace_only`
- `src::migrate::convert::tests::converts_dates_to_iso_strings`
- `src::migrate::convert::tests::converts_decimals_to_numbers`
- `src::migrate::convert::tests::converts_every_number_type_like_javascript`
- `src::migrate::convert::tests::converts_nested_documents_and_arrays_with_paths`
- `src::migrate::convert::tests::converts_object_ids_to_hex_with_a_note`
- `src::migrate::convert::tests::keeps_exotic_types_as_extended_json`
- `src::migrate::convert::tests::keeps_strings_booleans_and_null`
- `src::migrate::convert::tests::treats_undefined_as_missing`
- `src::migrate::dump::tests::parses_archives_with_empty_and_interleaved_collections`
- `src::migrate::dump::tests::reads_concatenated_bson`
- `src::migrate::dump::tests::reads_directories_plain_and_gzipped_and_selects_the_database`
- `src::migrate::dump::tests::rejects_files_that_are_not_archives`
- `src::migrate::import::tests::diff_reports_dropped_and_changed_values`
- `src::migrate::import::tests::invalid_and_missing_fields_are_kept_and_reported`
- `src::migrate::import::tests::legacy_users_keep_gender_for_the_backfill`
- `src::migrate::import::tests::missing_ids_fall_back_to_the_object_id`
- `src::migrate::import::tests::top_level_nulls_become_missing_with_a_note`
- `src::migrate::import::tests::valid_documents_are_stored_like_create_one`
- `src::migrate::tests::an_empty_server_database_is_not_refused`
- `src::migrate::tests::duplicate_ids_are_fatal_and_roll_back`
- `src::migrate::tests::import_tables_cover_every_table`
- `src::migrate::tests::imports_a_dump_the_way_the_server_stores_records`
- `src::migrate::tests::reads_gzipped_archives`
- `src::migrate::tests::refuses_a_database_with_data_unless_forced`
- `src::migrate::tests::reports_invalid_documents_and_imports_them_as_stored`
- `src::services::export_archive::tests::create_export_archive_tests::converts_headings_to_upper_snake_case`
- `src::services::export_archive::tests::create_export_archive_tests::formats_dates_like_en_au_and_keeps_other_text`
- `src::services::member_import::tests::normalizes_identity_values`
- `src::services::member_import::tests::parses_integers_like_javascript`
- `src::services::user_email::tests::user_email_remove::finds_users_by_email_ignoring_case`
- `src::services::user_fields::tests::strips_passwords_and_codes`
- `src::shared::utils::regex::tests::plain_helpers_match_the_regex_helpers`
- `src::utils::is_record::tests::matches_javascript_object_checks`
- `src::utils::mail::tests::signs_requests_like_the_aws_signature_v4_reference`
- `src::utils::random::tests::generates_alphanumeric_ids`
- `tests/integration/gameday_export_smoke.rs::exports_members_through_a_real_browser`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::answers_null_results_with_an_empty_204`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::derives_the_client_ip_from_the_socket`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::forbids_known_routes_from_other_origins`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::rejects_handler_results_that_are_not_objects`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::rejects_non_post_requests_to_known_routes`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::reports_invalid_payloads_as_validation_errors_with_a_friendly_message`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::requires_the_payload_wrapper_and_valid_json`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::sends_json_like_json_stringify`
- `tests/integration/http.rs::pipeline_with_stub_endpoints::tarpits_exploit_probes_and_then_blocks_the_ip`
- `tests/integration/migrate_mongo.rs::imports_a_real_mongodump_archive`
- `tests/integration/users.rs::src/db/table.rs - db::table (line 13)`
- `tests/integration/users.rs::src/db/table.rs - db::table (line 6)`
- `tests/integration/users.rs::src/http/endpoint.rs - http::endpoint (line 5)`
