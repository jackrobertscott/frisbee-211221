//! Port of `server/src/services/userEmail.ts`: email address management and
//! security codes (sent by SES in production, logged in development).

use crate::app::{AppState, SentCode};
use crate::auth::{attempt_limit, hash};
use crate::db::{Db, Patch};
use crate::js;
use crate::log;
use crate::shared::errors::{bad_request_error, conflict_error, not_found_error, AppResult, ErrorOptions};
use crate::shared::schemas::{AttemptKind, User, UserEmail};
use crate::shared::utils::regex as shared_regex;
use crate::tables::USER;
use crate::utils::html;
use crate::utils::mail::MailMessage;
use crate::utils::random::random_string;
use serde_json::{Map, Value};

const CODE_EXPIRED_MESSAGE: &str = "Your code has expired. A new code has been sent to your email.";
const CODE_TTL_MS: i64 = 10 * 60 * 1000;

/// Removes dashes and spaces, trims and upper-cases a code.
pub fn normalize_code(value: &str) -> String {
    let joined: String = value.split('-').collect::<Vec<_>>().join("").split(' ').collect::<Vec<_>>().join("");
    js::trim(&joined).to_uppercase()
}

fn is_hashed_code(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

/// The index of `email` on `user`, or `user.email_not_found` (404).
pub fn require_email_index(user: &User, email: &str) -> AppResult<usize> {
    user.emails
        .iter()
        .position(|item| shared_regex::equals_ci(email, &item.value))
        .ok_or_else(|| not_found_error("Email does not exist on user.", ErrorOptions::code("user.email_not_found")))
}

/// `userEmail.isValueValid(email)`.
pub fn is_value_valid(email: &str) -> bool {
    shared_regex::email().is_match(js::trim(email))
}

/// `userEmail.sanitizeValue(email)`: the trimmed email when valid.
pub fn sanitize_value(email: &str) -> Option<String> {
    let value = js::trim(email);
    (!value.is_empty() && is_value_valid(value)).then(|| value.to_string())
}

/// `userEmail.assertValueValid(email)`.
pub fn assert_value_valid(email: &str) -> AppResult<String> {
    sanitize_value(email).ok_or_else(|| {
        bad_request_error("Email must be a valid email address.", ErrorOptions::code("user.email_invalid"))
    })
}

/// `userEmail.sanitize(emails)`: drops invalid entries, trims values and makes
/// the first email primary when none is.
pub fn sanitize(emails: Option<&Value>) -> Vec<Value> {
    let Some(Value::Array(items)) = emails else {
        return Vec::new();
    };
    let mut sanitized: Vec<Map<String, Value>> = Vec::new();
    for item in items {
        let Value::Object(email) = item else { continue };
        let value = email.get("value").and_then(Value::as_str).map(js::trim).unwrap_or("");
        if value.is_empty() || !is_value_valid(value) {
            continue;
        }
        let mut entry = email.clone();
        entry.insert("value".into(), Value::String(value.to_string()));
        sanitized.push(entry);
    }
    let has_primary = sanitized.iter().any(|e| e.get("primary").is_some_and(|p| p.as_bool() == Some(true)));
    if !has_primary {
        if let Some(first) = sanitized.first_mut() {
            first.insert("primary".into(), Value::Bool(true));
        }
    }
    sanitized.into_iter().map(Value::Object).collect()
}

/// `userEmail.maybeUser(email)`: the user with this email (case-insensitive).
pub async fn maybe_user(db: &Db, email: &str) -> AppResult<Option<User>> {
    let value = js::trim(email).to_string();
    USER.maybe_one(db, User::EMAILS.any(UserEmail::VALUE.eq_ci(value))).await
}

/// `userEmail.create(email, primary, code)`: a new unverified email whose
/// code (random unless given) is stored as an HMAC digest.
pub fn create(secret: &str, email: &str, primary: bool, code: Option<&str>) -> AppResult<UserEmail> {
    let value = assert_value_valid(email)?;
    let raw_code = normalize_code(&code.map(str::to_string).unwrap_or_else(|| random_string(8)));
    Ok(UserEmail { value, verified: false, code: hash::digest(secret, &raw_code), created_on: js::date::now_iso(), primary })
}

/// `userEmail.primary(user)`: the primary email, or the first one.
pub fn primary(user: &User) -> Option<&UserEmail> {
    user.emails.iter().find(|email| email.primary).or_else(|| user.emails.first())
}

/// `userEmail.get(user, email)`.
pub fn get<'a>(user: &'a User, email: &str) -> Option<&'a UserEmail> {
    user.emails.iter().find(|item| shared_regex::equals_ci(email, &item.value))
}

async fn save_emails(db: &Db, user: &User, emails: Vec<UserEmail>) -> AppResult<User> {
    USER.update_one(db, User::ID.eq(&user.id), Patch::new().set_list(&User::EMAILS, &emails)).await
}

/// `userEmail.add(user, email)`: adds an unverified email and sends its code.
pub async fn add(state: &AppState, user: &User, email: &str) -> AppResult<User> {
    let value = assert_value_valid(email)?;
    if get(user, &value).is_some() {
        return Err(conflict_error("Email already exists on this user.", ErrorOptions::code("user.email_exists")));
    }
    if maybe_user(&state.db, &value).await?.is_some() {
        return Err(conflict_error("Another account already has this email.", ErrorOptions::code("user.email_exists")));
    }
    let mut item = create(&state.config.jwt_secret, &value, false, None)?;
    let raw_code = code_send(state, &item.value, &user.first_name, "Verify Email").await?;
    item.code = hash::digest(&state.config.jwt_secret, &normalize_code(&raw_code));
    let mut emails = user.emails.clone();
    emails.push(item);
    save_emails(&state.db, user, emails).await
}

/// `userEmail.remove(user, email)`: keeps at least one email and moves
/// primary to the next one when the primary is removed.
pub async fn remove(db: &Db, user: &User, email: &str) -> AppResult<User> {
    let mut emails = user.emails.clone();
    let index = require_email_index(user, email)?;
    if emails.len() <= 1 {
        return Err(bad_request_error("User must retain at least one email.", ErrorOptions::code("user.email_required")));
    }
    let was_primary = emails[index].primary;
    emails.remove(index);
    if was_primary && !emails.is_empty() && !emails.iter().any(|e| e.primary) {
        emails[0].primary = true;
    }
    save_emails(db, user, emails).await
}

/// `userEmail.verify(user, email)`: marks it verified and replaces the used
/// code so it cannot be replayed within its expiry window.
pub async fn verify(state: &AppState, user: &User, email: &str) -> AppResult<User> {
    let mut emails = user.emails.clone();
    let index = require_email_index(user, email)?;
    emails[index].verified = true;
    emails[index].code = hash::digest(&state.config.jwt_secret, &random_string(32));
    save_emails(&state.db, user, emails).await
}

/// `userEmail.verifiedSet(user, email, verified)`.
pub async fn verified_set(db: &Db, user: &User, email: &str, verified: bool) -> AppResult<User> {
    let mut emails = user.emails.clone();
    let index = require_email_index(user, email)?;
    emails[index].verified = verified;
    save_emails(db, user, emails).await
}

/// `userEmail.primarySet(user, email)`.
pub async fn primary_set(db: &Db, user: &User, email: &str) -> AppResult<User> {
    let index = require_email_index(user, email)?;
    let mut emails: Vec<UserEmail> = user.emails.iter().cloned().map(|e| UserEmail { primary: false, ..e }).collect();
    emails[index].primary = true;
    save_emails(db, user, emails).await
}

/// `userEmail.codeSendSave(user, email, subject)`.
pub async fn code_send_save(state: &AppState, user: &User, email: &str, subject: &str) -> AppResult<User> {
    let code = code_send(state, email, &user.first_name, subject).await?;
    code_save(state, user, email, &code).await
}

/// The HTML body of a security code email.
pub fn code_email_html(first_name: &str, code_sliced: &str) -> String {
    let template = format!(
        "\n        Hey {},<br/><br/>\n        Your code is:<br/><br/>\n        <strong>{code_sliced}</strong><br/><br/>\n        The code will expire in 10 minutes.<br/><br/>\n        Have a nice day.\n      ",
        html::escape(first_name)
    );
    let lines: Vec<&str> = template.split('\n').map(js::trim).collect();
    js::trim(&lines.join("\n")).to_string()
}

/// `userEmail.codeSend(email, firstName, subject)`: a new code, emailed in
/// production and logged (and recorded for tests) in development.
pub async fn code_send(state: &AppState, email: &str, first_name: &str, subject: &str) -> AppResult<String> {
    let code = normalize_code(&random_string(8));
    let code_sliced = format!("{}-{}", &code[..4], &code[4..8]);
    if !state.config.is_production {
        log::log(format!("[security-code] {subject} {email} {code_sliced} (email delivery skipped in development)"));
        state.security_codes.record(SentCode { subject: subject.into(), email: email.into(), code: code_sliced });
        return Ok(code);
    }
    state
        .mailer
        .send(MailMessage {
            to: vec![email.to_string()],
            subject: subject.to_string(),
            html: Some(code_email_html(first_name, &code_sliced)),
            ..Default::default()
        })
        .await?;
    Ok(code)
}

/// `userEmail.codeSave(user, email, code)`.
pub async fn code_save(state: &AppState, user: &User, email: &str, code: &str) -> AppResult<User> {
    let mut emails = user.emails.clone();
    let index = require_email_index(user, email)?;
    emails[index].code = hash::digest(&state.config.jwt_secret, &normalize_code(code));
    emails[index].created_on = js::date::now_iso();
    save_emails(&state.db, user, emails).await
}

/// `userEmail.isCodeEqual(user, email, code)`: hashed codes compare by
/// digest; legacy plain-text codes directly.
pub fn is_code_equal(secret: &str, user: &User, email: &str, code: &str) -> AppResult<bool> {
    let data = &user.emails[require_email_index(user, email)?];
    let normalized = normalize_code(code);
    Ok(if is_hashed_code(&data.code) { hash::equals(secret, &normalized, &data.code) } else { data.code == normalized })
}

/// `userEmail.isCodeExpired(user, email)`: older than 10 minutes.
pub fn is_code_expired(user: &User, email: &str) -> AppResult<bool> {
    let data = &user.emails[require_email_index(user, email)?];
    Ok(js::date::parse(&data.created_on).is_some_and(|created| js::date::now_ms() > created + CODE_TTL_MS))
}

/// `userEmail.assertCodeValid(...)`: checks a submitted code. An expired code
/// costs a delivery attempt and is replaced by a fresh one sent with
/// `expired_subject`.
pub async fn assert_code_valid(
    state: &AppState,
    user: &User,
    email: &str,
    code: &str,
    ip: &str,
    expired_subject: &str,
) -> AppResult<()> {
    if !is_code_equal(&state.config.jwt_secret, user, email, code)? {
        return Err(bad_request_error("Code is incorrect.", ErrorOptions::code("user.code_invalid")));
    }
    if is_code_expired(user, email)? {
        attempt_limit::consume(&state.db, AttemptKind::Delivery, email, ip).await?;
        code_send_save(state, user, email, expired_subject).await?;
        return Err(bad_request_error(CODE_EXPIRED_MESSAGE, ErrorOptions::code("user.code_expired")));
    }
    Ok(())
}

#[cfg(test)]
#[path = "user_email_tests.rs"]
mod tests;
