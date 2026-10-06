//! Port of `shared/src/errors.ts`: the application error model, its factories,
//! user messages and the serialised JSON shape the browser receives.
//!
//! Domain code raises errors with the factories, e.g.
//! `bad_request_error("Email must be valid.", ErrorOptions::code("user.email_invalid"))`.
//! The user message is derived once, at construction, exactly like the TS
//! `AppError` constructor.

use crate::js;
use serde::Serialize;
use serde_json::{Map, Value};
use std::fmt;

pub mod http_status {
    pub const BAD_REQUEST: u16 = 400;
    pub const UNAUTHORIZED: u16 = 401;
    pub const FORBIDDEN: u16 = 403;
    pub const NOT_FOUND: u16 = 404;
    pub const METHOD_NOT_ALLOWED: u16 = 405;
    pub const CONFLICT: u16 = 409;
    pub const PAYLOAD_TOO_LARGE: u16 = 413;
    pub const UNPROCESSABLE_ENTITY: u16 = 422;
    pub const TOO_MANY_REQUESTS: u16 = 429;
    pub const INTERNAL_SERVER_ERROR: u16 = 500;
    pub const SERVICE_UNAVAILABLE: u16 = 503;
}

use http_status::*;

const JWT_ERROR_NAMES: [&str; 3] = ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"];

pub const INTERNAL_USER_MESSAGE: &str =
    "Something went wrong while completing your request. Please try again in a moment.";

fn status_text(status_code: u16) -> Option<&'static str> {
    Some(match status_code {
        BAD_REQUEST => "Bad Request",
        UNAUTHORIZED => "Unauthorized",
        FORBIDDEN => "Forbidden",
        NOT_FOUND => "Not Found",
        METHOD_NOT_ALLOWED => "Method Not Allowed",
        CONFLICT => "Conflict",
        PAYLOAD_TOO_LARGE => "Payload Too Large",
        UNPROCESSABLE_ENTITY => "Unprocessable Entity",
        TOO_MANY_REQUESTS => "Too Many Requests",
        INTERNAL_SERVER_ERROR => "Internal Server Error",
        SERVICE_UNAVAILABLE => "Service Unavailable",
        _ => return None,
    })
}

/// `getStatusText`: the known reason phrase, or "Internal Server Error".
pub fn get_status_text(status_code: u16) -> &'static str {
    status_text(status_code).unwrap_or("Internal Server Error")
}

fn default_error_code(status_code: u16) -> &'static str {
    match status_code {
        BAD_REQUEST => "bad_request",
        UNAUTHORIZED => "unauthorized",
        FORBIDDEN => "forbidden",
        NOT_FOUND => "not_found",
        METHOD_NOT_ALLOWED => "method_not_allowed",
        CONFLICT => "conflict",
        PAYLOAD_TOO_LARGE => "payload_too_large",
        UNPROCESSABLE_ENTITY => "validation_error",
        TOO_MANY_REQUESTS => "too_many_requests",
        SERVICE_UNAVAILABLE => "service_unavailable",
        _ => "internal_error",
    }
}

fn status_user_message(status_code: u16) -> Option<&'static str> {
    Some(match status_code {
        BAD_REQUEST => "Please check the information you entered and try again.",
        UNAUTHORIZED => "Please sign in to continue.",
        FORBIDDEN => "You do not have permission to do that.",
        NOT_FOUND => "We could not find what you were looking for.",
        METHOD_NOT_ALLOWED => "This action is not available from here.",
        CONFLICT => {
            "That change could not be saved because it conflicts with existing information."
        }
        PAYLOAD_TOO_LARGE => "That upload is too large.",
        UNPROCESSABLE_ENTITY => "Please check the information you entered and try again.",
        TOO_MANY_REQUESTS => {
            "Too many attempts were made. Please wait a little while before trying again."
        }
        INTERNAL_SERVER_ERROR => INTERNAL_USER_MESSAGE,
        SERVICE_UNAVAILABLE => "This feature is temporarily unavailable. Please try again later.",
        _ => return None,
    })
}

/// `USER_MESSAGE_BY_ERROR_CODE`.
pub fn user_message_for_error_code(error_code: &str) -> Option<&'static str> {
    let status = |code| status_user_message(code);
    Some(match error_code {
        "bad_request" => status(BAD_REQUEST)?,
        "conflict" => status(CONFLICT)?,
        "forbidden" => status(FORBIDDEN)?,
        "internal_error" => INTERNAL_USER_MESSAGE,
        "method_not_allowed" => status(METHOD_NOT_ALLOWED)?,
        "not_found" => status(NOT_FOUND)?,
        "payload_too_large" => status(PAYLOAD_TOO_LARGE)?,
        "service_unavailable" => status(SERVICE_UNAVAILABLE)?,
        "too_many_requests" => status(TOO_MANY_REQUESTS)?,
        "unauthorized" => status(UNAUTHORIZED)?,
        "validation_error" => status(UNPROCESSABLE_ENTITY)?,

        "auth.admin_required" => "You need admin access to do that.",
        "auth.invalid_login" => "The email or password is not correct.",
        "auth.login_rate_limited" => {
            "Too many login attempts were made. Please wait before trying again."
        }
        "auth.sign_in_required" => "Please sign in to continue.",
        "auth.team_required" => "Please join a team before doing that.",
        "auth.team_season_mismatch" => INTERNAL_USER_MESSAGE,
        "auth.team_set_without_current" => INTERNAL_USER_MESSAGE,
        "auth.terms_required" => "Please accept the terms to create an account.",
        "auth.token_invalid" => "Please sign in again to continue.",
        "auth.token_missing" => "Please sign in to continue.",
        "auth.user_mismatch" => INTERNAL_USER_MESSAGE,
        "auth.user_set_without_current" => INTERNAL_USER_MESSAGE,

        "client.server_url_missing" => "The app is not set up correctly. Please contact support.",

        "db.record_not_found" => "We could not find the item you were trying to open.",

        "fixture.division_missing" => "Every team needs a division before fixtures can be created.",
        "fixture.round_robin_invalid" => {
            "The existing fixtures do not match the expected pattern. Please review the rounds and try again."
        }
        "fixture.slots_insufficient" => "There are not enough time slots for the number of teams.",
        "fixture.uneven_division" => {
            "Each division needs an even number of teams before fixtures can be created."
        }

        "intrusion.blocked" => "This page is not available.",
        "intrusion.exploit_probe" => "This page is not available.",
        "intrusion.origin_forbidden" => "This action is not available from here.",
        "intrusion.suspicious_request" => "This page is not available.",

        "member.already_captain" => "This member is already the captain.",
        "member.already_on_other_team" => "This person is already on another team for this season.",
        "member.captain_required" => "Only a team captain can do that.",
        "member.request_exists" => "A membership request has already been sent for this season.",
        "member.user_details_required" => {
            "Please enter the first name, last name, and gender matching for the new member."
        }

        "report.already_submitted" => "A score report has already been submitted for this game.",
        "report.fixture_invalid" => "That fixture does not belong to the selected season.",
        "report.matchup_invalid" => "That opposition team is not listed for your fixture.",
        "report.spirit_comment_required" => {
            "Please add a spirit comment before submitting the report."
        }

        "request.failed" => "We could not complete that action. Please try again in a moment.",
        "request.invalid_handler_response" => INTERNAL_USER_MESSAGE,
        "request.method_not_allowed" => "This action is not available from here.",
        "request.origin_invalid" => "This action is not available from here.",
        "request.payload_missing" => {
            "The page could not send the information needed. Please refresh and try again."
        }
        "request.route_not_found" => "This page is not available.",
        "request.url_missing" => INTERNAL_USER_MESSAGE,

        "router.context_missing" => INTERNAL_USER_MESSAGE,
        "router.routes_missing" => INTERNAL_USER_MESSAGE,

        "season.id_missing" => "Please choose a season and try again.",
        "season.delete_has_reports" => {
            "This season cannot be deleted because it has score reports."
        }
        "season.not_found" => "No season is available yet.",

        "team.access_forbidden" => "You do not have access to that team.",
        "team.captain_required" => "Only a team captain can do that.",
        "team.signup_closed" => "Team signup is closed for this season.",

        "upload.aborted" => "The upload was cancelled before it finished.",
        "upload.fields_limit" => "Too much information was included in the upload.",
        "upload.file_missing" => "Please choose a file to upload.",
        "upload.files_limit" => "Please upload fewer files.",
        "upload.invalid_file_type" => "Please upload a CSV file.",
        "upload.invalid_gender_matching" => {
            "One of the uploaded gender matching values was not recognised."
        }
        "upload.parts_limit" => "The upload was too large to process.",
        "upload.size_limit" => "The uploaded file is too large.",
        "upload.unsupported_content_type" => "The upload was not sent as a file. Please try again.",

        "user.code_delivery_rate_limited" => {
            "Too many codes were requested. Please wait before asking for another one."
        }
        "user.code_expired" => "That code has expired. A new code has been sent to your email.",
        "user.code_invalid" => "That code is not correct.",
        "user.code_rate_limited" => {
            "Too many code attempts were made. Please wait before trying again."
        }
        "user.email_exists" => "That email is already connected to an account.",
        "user.email_invalid" => "Please enter a valid email address.",
        "user.email_not_found" => "We could not find that email on this account.",
        "user.email_required" => "Your account needs at least one email address.",
        "user.merge_invalid" => "Please choose two different users to merge.",
        "user.old_password_invalid" => "The current password is not correct.",
        "user.password_missing" => "This account does not have a password yet.",
        "user.password_too_short" => "Please use a password with at least 5 characters.",
        _ => return None,
    })
}

fn validation_field_label(field: &str) -> Option<&'static str> {
    Some(match field {
        "code" => "code",
        "comment" => "comment",
        "direction" => "direction",
        "email" => "email address",
        "fileType" => "file type",
        "firstName" => "first name",
        "fixtureId" => "fixture",
        "genderMatching" => "gender matching",
        "lastName" => "last name",
        "memberId" => "member",
        "newPassword" => "new password",
        "password" => "password",
        "referenceFixtureId" => "reference fixture",
        "reportId" => "report",
        "roundCount" => "number of rounds",
        "seasonId" => "season",
        "startingDate" => "starting date",
        "teamAgainstId" => "opposition team",
        "teamId" => "team",
        "termsAccepted" => "terms",
        "title" => "title",
        "unit" => "unit",
        "userId" => "user",
        _ => return None,
    })
}

fn default_expose_for_status(status_code: u16) -> bool {
    status_code < INTERNAL_SERVER_ERROR
}

fn is_status_code(value: f64) -> bool {
    js::is_integer(value) && (400.0..=599.0).contains(&value)
}

/// `extractStatusCode`: a 4xx/5xx number, or a string of digits holding one.
fn extract_status_code(value: Option<&Value>) -> Option<u16> {
    match value? {
        Value::Number(n) => n.as_f64().filter(|v| is_status_code(*v)).map(|v| v as u16),
        Value::String(text) if !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()) => {
            let parsed = js::string_to_number(text);
            is_status_code(parsed).then_some(parsed as u16)
        }
        _ => None,
    }
}

/// `extractErrorCode`: a string that is not all digits.
fn extract_error_code(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) if !(!text.is_empty() && text.bytes().all(|b| b.is_ascii_digit())) => {
            Some(text.clone())
        }
        _ => None,
    }
}

/// `extractUserMessage`: whitespace collapsed, empty treated as missing.
fn extract_user_message(value: Option<&str>) -> Option<String> {
    let collapsed = js::replace_whitespace_runs(value?, " ");
    let trimmed = js::trim(&collapsed);
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn humanize_field_name(field: &str) -> String {
    let stripped = field.strip_prefix('[').unwrap_or(field);
    let stripped = stripped.strip_suffix(']').unwrap_or(stripped);
    let key = stripped.rsplit('.').next().unwrap_or(field);
    let index_pattern = regex_lite_remove_indexes(key);
    let cleaned = js::trim(&index_pattern).to_string();
    if let Some(label) = validation_field_label(&cleaned) {
        return label.to_string();
    }
    let without_id = cleaned.strip_suffix("Id").unwrap_or(&cleaned).to_string();
    // ([a-z])([A-Z]) -> "$1 $2"
    let mut spaced = String::new();
    let chars: Vec<char> = without_id.chars().collect();
    for (index, c) in chars.iter().enumerate() {
        spaced.push(*c);
        if c.is_ascii_lowercase() && chars.get(index + 1).is_some_and(|n| n.is_ascii_uppercase()) {
            spaced.push(' ');
        }
    }
    // [_-]+ -> " "
    let mut out = String::new();
    let mut in_run = false;
    for c in spaced.chars() {
        if c == '_' || c == '-' {
            if !in_run {
                out.push(' ');
                in_run = true;
            }
        } else {
            in_run = false;
            out.push(c);
        }
    }
    js::trim(&out).to_lowercase()
}

/// `key.replace(/\[\d+\]/g, '')`.
fn regex_lite_remove_indexes(key: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = key.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '[' {
            let mut end = index + 1;
            while end < chars.len() && chars[end].is_ascii_digit() {
                end += 1;
            }
            if end > index + 1 && end < chars.len() && chars[end] == ']' {
                index = end + 1;
                continue;
            }
        }
        out.push(chars[index]);
        index += 1;
    }
    out
}

fn validation_field(details: Option<&Value>) -> Option<String> {
    let Some(Value::String(details)) = details else {
        return None;
    };
    // /^\[([^\]]+)\]:/
    let rest = details.strip_prefix('[')?;
    let end = rest.find(']')?;
    if end == 0 || !rest[end + 1..].starts_with(':') {
        return None;
    }
    Some(humanize_field_name(&rest[..end]))
}

/// `getValidationUserMessage(details)`.
pub fn get_validation_user_message(details: Option<&Value>) -> String {
    match validation_field(details) {
        Some(field) if !field.is_empty() => format!("Please check {field} and try again."),
        _ => "Please check the information you entered and try again.".into(),
    }
}

fn clean_exposed_message(message: &str) -> Option<String> {
    let strip = |text: &str, prefix: &str| -> Option<String> {
        let head = text.get(..prefix.len())?;
        head.eq_ignore_ascii_case(prefix).then(|| {
            text[prefix.len()..]
                .trim_start_matches(js::is_whitespace)
                .to_string()
        })
    };
    let mut text = strip(message, "failed:").unwrap_or_else(|| message.to_string());
    if let Some(rest) = strip(&text, "an error occurred:") {
        text = rest;
    }
    let text = replace_can_not(&text);
    let collapsed = js::replace_whitespace_runs(&text, " ");
    let trimmed = js::trim(&collapsed);
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// `.replace(/\bcan not\b/gi, 'cannot')`.
fn replace_can_not(text: &str) -> String {
    static PATTERN: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let pattern = PATTERN.get_or_init(|| {
        regex::RegexBuilder::new(r"\bcan not\b")
            .case_insensitive(true)
            .unicode(false)
            .build()
            .unwrap_or_else(|error| panic!("invalid regex: {error}"))
    });
    pattern.replace_all(text, "cannot").into_owned()
}

fn get_status_user_message(status_code: u16) -> &'static str {
    status_user_message(status_code).unwrap_or(INTERNAL_USER_MESSAGE)
}

fn build_user_message(
    message: &str,
    user_message: Option<&str>,
    status_code: u16,
    error_code: &str,
    expose: bool,
    details: Option<&Value>,
) -> String {
    if let Some(explicit) = extract_user_message(user_message) {
        return explicit;
    }
    if error_code == "validation_error" {
        return get_validation_user_message(details);
    }
    if let Some(coded) = user_message_for_error_code(error_code) {
        return coded.to_string();
    }
    if status_code >= INTERNAL_SERVER_ERROR || !expose {
        return get_status_user_message(status_code).to_string();
    }
    clean_exposed_message(message)
        .unwrap_or_else(|| get_status_user_message(status_code).to_string())
}

/// `AppErrorOptions` minus `message`: everything optional, merged like the TS spreads.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ErrorOptions {
    pub message: Option<String>,
    pub user_message: Option<String>,
    pub status_code: Option<u16>,
    pub error_code: Option<String>,
    pub expose: Option<bool>,
    pub details: Option<Value>,
    pub retryable: Option<bool>,
    pub cause: Option<String>,
    pub meta: Option<Map<String, Value>>,
    pub tarpit: Option<Value>,
}

impl ErrorOptions {
    /// Options carrying just an error code, the most common case.
    pub fn code(error_code: impl Into<String>) -> Self {
        ErrorOptions {
            error_code: Some(error_code.into()),
            ..Default::default()
        }
    }
    pub fn with_user_message(mut self, user_message: impl Into<String>) -> Self {
        self.user_message = Some(user_message.into());
        self
    }
    pub fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }
    pub fn with_meta(mut self, meta: Map<String, Value>) -> Self {
        self.meta = Some(meta);
        self
    }
    pub fn with_tarpit(mut self, tarpit: Value) -> Self {
        self.tarpit = Some(tarpit);
        self
    }
    pub fn with_cause(mut self, cause: impl Into<String>) -> Self {
        self.cause = Some(cause.into());
        self
    }
    pub fn with_retryable(mut self, retryable: bool) -> Self {
        self.retryable = Some(retryable);
        self
    }
    pub fn with_expose(mut self, expose: bool) -> Self {
        self.expose = Some(expose);
        self
    }
    pub fn with_status_code(mut self, status_code: u16) -> Self {
        self.status_code = Some(status_code);
        self
    }
    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }
}

/// The fields of an [`AppError`].
#[derive(Clone, Debug, PartialEq)]
pub struct AppErrorData {
    pub message: String,
    pub status_code: u16,
    pub error_code: String,
    pub user_message: String,
    pub expose: bool,
    pub details: Option<Value>,
    pub retryable: bool,
    pub cause: Option<String>,
    pub meta: Option<Map<String, Value>>,
    pub tarpit: Option<Value>,
}

/// The application error. Every failure that reaches the HTTP layer is one
/// of these. Boxed so `Result<T, AppError>` stays small; fields are read
/// through `Deref` (`error.error_code`).
#[derive(Clone, Debug, PartialEq)]
pub struct AppError(Box<AppErrorData>);

impl std::ops::Deref for AppError {
    type Target = AppErrorData;
    fn deref(&self) -> &AppErrorData {
        &self.0
    }
}

impl std::ops::DerefMut for AppError {
    fn deref_mut(&mut self) -> &mut AppErrorData {
        &mut self.0
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    /// `new AppError(options)`.
    pub fn new(message: impl Into<String>, options: ErrorOptions) -> Self {
        let message = message.into();
        let status_code = options.status_code.unwrap_or(INTERNAL_SERVER_ERROR);
        let error_code = options
            .error_code
            .unwrap_or_else(|| default_error_code(status_code).to_string());
        let expose = options
            .expose
            .unwrap_or_else(|| default_expose_for_status(status_code));
        let user_message = build_user_message(
            &message,
            options.user_message.as_deref(),
            status_code,
            &error_code,
            expose,
            options.details.as_ref(),
        );
        AppError(Box::new(AppErrorData {
            message,
            status_code,
            error_code,
            user_message,
            expose,
            details: options.details,
            retryable: options.retryable.unwrap_or(false),
            cause: options.cause,
            meta: options.meta,
            tarpit: options.tarpit,
        }))
    }

    /// The constructor options that would rebuild this error.
    pub fn to_options(&self) -> ErrorOptions {
        ErrorOptions {
            message: Some(self.message.clone()),
            user_message: Some(self.user_message.clone()),
            status_code: Some(self.status_code),
            error_code: Some(self.error_code.clone()),
            expose: Some(self.expose),
            details: self.details.clone(),
            retryable: Some(self.retryable),
            cause: self.cause.clone(),
            meta: self.meta.clone(),
            tarpit: self.tarpit.clone(),
        }
    }

    /// Wraps any Rust error as an internal (500) error, like `toAppError(new Error(...))`.
    pub fn internal_from(error: impl fmt::Display) -> Self {
        to_app_error(
            ErrorInput::Error(ErrorLike::new("Error", error.to_string())),
            ErrorOptions::default(),
        )
    }

    /// The first stack line JavaScript would print.
    pub fn stack_lines(&self) -> Vec<String> {
        vec![format!("AppError: {}", self.message)]
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AppError: {}", self.message)
    }
}

impl std::error::Error for AppError {}

/// `createError(options, overrides)`.
pub fn create_error(
    message: impl Into<String>,
    base: ErrorOptions,
    overrides: ErrorOptions,
) -> AppError {
    let message = overrides.message.clone().unwrap_or_else(|| message.into());
    let status_code = overrides
        .status_code
        .or(base.status_code)
        .unwrap_or(INTERNAL_SERVER_ERROR);
    let error_code = overrides
        .error_code
        .clone()
        .or(base.error_code.clone())
        .unwrap_or_else(|| default_error_code(status_code).to_string());
    let expose = overrides
        .expose
        .or(base.expose)
        .unwrap_or_else(|| default_expose_for_status(status_code));
    AppError::new(
        message,
        ErrorOptions {
            message: None,
            user_message: overrides.user_message.or(base.user_message),
            status_code: Some(status_code),
            error_code: Some(error_code),
            expose: Some(expose),
            details: overrides.details.or(base.details),
            retryable: overrides.retryable.or(base.retryable),
            cause: overrides.cause.or(base.cause),
            meta: overrides.meta.or(base.meta),
            tarpit: overrides.tarpit.or(base.tarpit),
        },
    )
}

fn status_factory(
    status_code: u16,
    error_code: &str,
    message: String,
    options: ErrorOptions,
) -> AppError {
    let base = ErrorOptions {
        status_code: Some(status_code),
        error_code: Some(
            options
                .error_code
                .clone()
                .unwrap_or_else(|| error_code.to_string()),
        ),
        ..options
    };
    create_error(message, base, ErrorOptions::default())
}

pub fn bad_request_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(BAD_REQUEST, "bad_request", message.into(), options)
}
pub fn unauthorized_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(UNAUTHORIZED, "unauthorized", message.into(), options)
}
pub fn forbidden_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(FORBIDDEN, "forbidden", message.into(), options)
}
pub fn not_found_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(NOT_FOUND, "not_found", message.into(), options)
}
pub fn method_not_allowed_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(
        METHOD_NOT_ALLOWED,
        "method_not_allowed",
        message.into(),
        options,
    )
}
pub fn conflict_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(CONFLICT, "conflict", message.into(), options)
}
pub fn payload_too_large_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(
        PAYLOAD_TOO_LARGE,
        "payload_too_large",
        message.into(),
        options,
    )
}
pub fn validation_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(
        UNPROCESSABLE_ENTITY,
        "validation_error",
        message.into(),
        options,
    )
}
pub fn too_many_requests_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(
        TOO_MANY_REQUESTS,
        "too_many_requests",
        message.into(),
        options,
    )
}
pub fn service_unavailable_error(message: impl Into<String>, options: ErrorOptions) -> AppError {
    status_factory(
        SERVICE_UNAVAILABLE,
        "service_unavailable",
        message.into(),
        options,
    )
}

/// `internalError(message?, options)`: always 500 and never exposed.
pub fn internal_error(message: Option<&str>, options: ErrorOptions) -> AppError {
    let message = message
        .map(str::to_string)
        .unwrap_or_else(|| get_status_text(INTERNAL_SERVER_ERROR).into());
    let error_code = options
        .error_code
        .clone()
        .unwrap_or_else(|| "internal_error".into());
    let base = ErrorOptions {
        status_code: Some(INTERNAL_SERVER_ERROR),
        error_code: Some(error_code),
        expose: Some(false),
        ..options
    };
    create_error(
        message,
        ErrorOptions {
            status_code: Some(INTERNAL_SERVER_ERROR),
            expose: Some(false),
            ..base
        },
        ErrorOptions::default(),
    )
}

/// A JavaScript `Error` with arbitrary extra properties, as `toAppError` sees it.
#[derive(Clone, Debug, Default)]
pub struct ErrorLike {
    pub name: String,
    pub message: String,
    pub props: Map<String, Value>,
}

impl ErrorLike {
    pub fn new(name: impl Into<String>, message: impl Into<String>) -> Self {
        ErrorLike {
            name: name.into(),
            message: message.into(),
            props: Map::new(),
        }
    }
    pub fn with(mut self, key: &str, value: Value) -> Self {
        self.props.insert(key.into(), value);
        self
    }
}

/// What `toAppError` can be handed.
#[derive(Clone, Debug)]
pub enum ErrorInput {
    App(AppError),
    Error(ErrorLike),
    /// Any other thrown value (strings, serialised errors, records, `undefined` as `None`).
    Value(Option<Value>),
}

impl From<AppError> for ErrorInput {
    fn from(error: AppError) -> Self {
        ErrorInput::App(error)
    }
}

/// `isSerializedAppError(value)`.
pub fn is_serialized_app_error(value: &Value) -> bool {
    let Value::Object(map) = value else {
        return false;
    };
    let status = extract_status_code(
        map.get("statusCode")
            .filter(|v| !v.is_null())
            .or(map.get("code")),
    );
    (map.get("type") == Some(&Value::String("app_error".into()))
        || map.get("name") == Some(&Value::String("AppError".into())))
        && map.get("message").is_some_and(Value::is_string)
        && map.get("errorCode").is_some_and(Value::is_string)
        && map.get("expose").is_some_and(Value::is_boolean)
        && map.get("retryable").is_some_and(Value::is_boolean)
        && status.is_some()
}

/// `toAppError(error, fallback)`.
pub fn to_app_error(error: ErrorInput, fallback: ErrorOptions) -> AppError {
    match error {
        ErrorInput::App(error) => error,
        ErrorInput::Value(Some(value)) if is_serialized_app_error(&value) => {
            let map = value.as_object().cloned().unwrap_or_default();
            let text = |key: &str| map.get(key).and_then(Value::as_str).map(str::to_string);
            let status_code = extract_status_code(
                map.get("statusCode")
                    .filter(|v| !v.is_null())
                    .or(map.get("code")),
            );
            create_error(
                text("message").unwrap_or_default(),
                ErrorOptions {
                    user_message: text("userMessage"),
                    status_code,
                    error_code: text("errorCode"),
                    expose: map.get("expose").and_then(Value::as_bool),
                    retryable: map.get("retryable").and_then(Value::as_bool),
                    details: map.get("details").cloned(),
                    meta: map.get("meta").and_then(Value::as_object).cloned(),
                    ..Default::default()
                },
                ErrorOptions::default(),
            )
        }
        ErrorInput::Value(Some(Value::String(message))) => {
            // the string is the message; fallback options fill in everything else
            create_error(
                message,
                ErrorOptions {
                    message: None,
                    ..fallback
                },
                ErrorOptions::default(),
            )
        }
        ErrorInput::Error(error) => {
            let props = &error.props;
            let status_code = extract_status_code(props.get("statusCode"))
                .or_else(|| extract_status_code(props.get("code")))
                .unwrap_or_else(|| {
                    if error.name == "ValidationError" {
                        UNPROCESSABLE_ENTITY
                    } else if JWT_ERROR_NAMES.contains(&error.name.as_str())
                        || error.message == "jwt expired"
                    {
                        UNAUTHORIZED
                    } else {
                        fallback.status_code.unwrap_or(INTERNAL_SERVER_ERROR)
                    }
                });
            let message = if !error.message.is_empty() {
                error.message.clone()
            } else {
                fallback
                    .message
                    .clone()
                    .filter(|m| !m.is_empty())
                    .unwrap_or_else(|| get_status_text(status_code).to_string())
            };
            let user_message =
                extract_user_message(props.get("userMessage").and_then(Value::as_str))
                    .or(fallback.user_message);
            let error_code = extract_error_code(props.get("errorCode"))
                .or_else(|| extract_error_code(props.get("code")))
                .or(fallback.error_code);
            create_error(
                message,
                ErrorOptions {
                    user_message,
                    status_code: Some(status_code),
                    error_code,
                    expose: props
                        .get("expose")
                        .and_then(Value::as_bool)
                        .or(fallback.expose),
                    details: props
                        .get("details")
                        .filter(|v| !v.is_null())
                        .cloned()
                        .or(fallback.details),
                    retryable: props
                        .get("retryable")
                        .and_then(Value::as_bool)
                        .or(fallback.retryable),
                    cause: props
                        .get("cause")
                        .map(|v| {
                            v.as_str()
                                .map(str::to_string)
                                .unwrap_or_else(|| js::stringify(v))
                        })
                        .or(fallback.cause),
                    meta: props
                        .get("meta")
                        .and_then(Value::as_object)
                        .cloned()
                        .or(fallback.meta),
                    tarpit: props
                        .get("tarpit")
                        .filter(|v| !v.is_null())
                        .cloned()
                        .or(fallback.tarpit),
                    message: None,
                },
                // the Error's own properties win; fallback options only fill gaps
                ErrorOptions {
                    status_code: Some(status_code),
                    ..Default::default()
                },
            )
        }
        ErrorInput::Value(_) => {
            let status = fallback.status_code.unwrap_or(INTERNAL_SERVER_ERROR);
            let message = fallback
                .message
                .clone()
                .unwrap_or_else(|| get_status_text(status).to_string());
            create_error(
                message,
                ErrorOptions::default(),
                ErrorOptions {
                    message: None,
                    ..fallback
                },
            )
        }
    }
}

/// `deserializeError(error, fallback)`.
pub fn deserialize_error(error: ErrorInput, fallback: ErrorOptions) -> AppError {
    to_app_error(error, fallback)
}

/// The JSON error body (`SerializedAppError`).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerializedAppError {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub name: &'static str,
    pub message: String,
    pub user_message: String,
    pub status_code: u16,
    pub code: u16,
    pub status: String,
    pub error_code: String,
    pub expose: bool,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<Map<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines: Option<Vec<String>>,
}

impl SerializedAppError {
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SerializeOptions {
    pub redact_internal_message: bool,
    pub include_details: bool,
    pub include_meta: bool,
    pub include_stack_lines: bool,
}

/// `serializeError(error, options)`.
pub fn serialize_error(error: ErrorInput, options: SerializeOptions) -> SerializedAppError {
    let app_error = to_app_error(error, ErrorOptions::default());
    let status = get_status_text(app_error.status_code).to_string();
    let should_redact = options.redact_internal_message
        && app_error.status_code >= INTERNAL_SERVER_ERROR
        && !app_error.expose;
    SerializedAppError {
        kind: "app_error",
        name: "AppError",
        message: if should_redact || app_error.message.is_empty() {
            status.clone()
        } else {
            app_error.message.clone()
        },
        user_message: app_error.user_message.clone(),
        status_code: app_error.status_code,
        code: app_error.status_code,
        status,
        error_code: app_error.error_code.clone(),
        expose: app_error.expose,
        retryable: app_error.retryable,
        details: if options.include_details {
            app_error.details.clone()
        } else {
            None
        },
        meta: if options.include_meta {
            app_error.meta.clone()
        } else {
            None
        },
        lines: options.include_stack_lines.then(|| app_error.stack_lines()),
    }
}

/// `getUserErrorMessage(error, fallback)`.
pub fn get_user_error_message(error: ErrorInput, fallback: Option<&str>) -> String {
    let fallback = fallback.unwrap_or(INTERNAL_USER_MESSAGE);
    let message = to_app_error(
        error,
        ErrorOptions {
            message: Some(fallback.into()),
            user_message: Some(fallback.into()),
            ..Default::default()
        },
    )
    .user_message
    .clone();
    if message.is_empty() {
        fallback.to_string()
    } else {
        message
    }
}

/// `getErrorStatusCode(error, fallback)`.
pub fn get_error_status_code(error: ErrorInput, fallback: Option<u16>) -> u16 {
    to_app_error(
        error,
        ErrorOptions {
            status_code: Some(fallback.unwrap_or(INTERNAL_SERVER_ERROR)),
            ..Default::default()
        },
    )
    .status_code
}

/// `hasStatusCode(error, expected)`.
pub fn has_status_code(error: ErrorInput, expected: &[u16]) -> bool {
    let actual = to_app_error(error, ErrorOptions::default()).status_code;
    expected.contains(&actual)
}

/// Rust-side errors become internal errors, like an unexpected JS `Error`.
impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        AppError::internal_from(error)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::internal_from(error)
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        AppError::internal_from(error)
    }
}

#[cfg(test)]
#[path = "errors_tests.rs"]
mod tests;
