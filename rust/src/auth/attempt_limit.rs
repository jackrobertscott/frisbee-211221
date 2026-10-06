//! Port of `server/src/auth/attemptLimit.ts`: rate limits for logins,
//! security code checks and code deliveries, per account and per client.
//!
//! Each attempt is counted in one `BEGIN IMMEDIATE` transaction (the Mongo
//! version used one atomic aggregation-pipeline upsert), so concurrent
//! requests cannot lose increments.

use crate::db::{Db, Patch};
use crate::js;
use crate::shared::errors::{too_many_requests_error, AppError, AppResult, ErrorOptions};
use crate::shared::schemas::{AttemptKind, AttemptScope, AuthAttemptLimit};
use crate::tables::AUTH_ATTEMPT_LIMIT;
use serde_json::{json, Map, Value};
use std::sync::atomic::{AtomicI64, Ordering};

const WINDOW_MS: i64 = 15 * 60 * 1000;
const BLOCK_MS: i64 = 15 * 60 * 1000;
const STATE_RETENTION_MS: i64 = WINDOW_MS + BLOCK_MS;

struct Limit {
    message: &'static str,
    error_code: &'static str,
    account: i64,
    client: i64,
}

fn limit(kind: AttemptKind) -> Limit {
    match kind {
        AttemptKind::Login => Limit {
            message: "Too many failed login attempts. Please try again in 15 minutes.",
            error_code: "auth.login_rate_limited",
            account: 10,
            client: 5,
        },
        AttemptKind::Verify => Limit {
            message: "Too many failed security code attempts. Please try again in 15 minutes.",
            error_code: "user.code_rate_limited",
            account: 10,
            client: 5,
        },
        AttemptKind::Delivery => Limit {
            message: "Too many security code requests. Please try again in 15 minutes.",
            error_code: "user.code_delivery_rate_limited",
            account: 3,
            client: 6,
        },
    }
}

#[derive(Clone, Debug)]
struct State {
    id: String,
    kind: AttemptKind,
    scope: AttemptScope,
    email: String,
    ip: Option<String>,
}

fn normalize(value: &str) -> String {
    js::trim(value).to_lowercase()
}

fn get_states(kind: AttemptKind, email: &str, ip: &str) -> [State; 2] {
    let email = normalize(email);
    let ip = normalize(if ip.is_empty() { "unknown" } else { ip });
    [
        State {
            id: format!("{}:account:{email}", kind.as_str()),
            kind,
            scope: AttemptScope::Account,
            email: email.clone(),
            ip: None,
        },
        State {
            id: format!("{}:client:{ip}:{email}", kind.as_str()),
            kind,
            scope: AttemptScope::Client,
            email,
            ip: Some(ip),
        },
    ]
}

/// The attempt pipeline: reset an expired window, add the attempt unless
/// already blocked, then start a block once the scope's limit is reached.
fn next_record(state: &State, before: Option<&Map<String, Value>>, max_attempts: i64, now: i64) -> Map<String, Value> {
    let number = |key: &str| before.and_then(|b| b.get(key)).and_then(Value::as_f64).map(|v| v as i64);
    let now_iso = js::date::to_iso_string(now);
    let mut attempts = number("attempts").unwrap_or(0);
    let mut blocked_until = number("blockedUntil").unwrap_or(0);
    let mut window_started_at = number("windowStartedAt").unwrap_or(now);
    let window_expired = blocked_until <= now && now - window_started_at >= WINDOW_MS;
    if window_expired {
        attempts = 0;
        window_started_at = now;
    }
    if blocked_until <= now {
        attempts += 1;
    }
    if attempts >= max_attempts {
        attempts = 0;
        blocked_until = now + BLOCK_MS;
    }
    let mut record = before.cloned().unwrap_or_default();
    record.insert("id".into(), json!(state.id));
    record.insert("kind".into(), json!(state.kind.as_str()));
    record.insert("scope".into(), json!(state.scope.as_str()));
    record.insert("email".into(), json!(state.email));
    if let Some(ip) = &state.ip {
        record.insert("ip".into(), json!(ip));
    }
    if !record.contains_key("createdOn") {
        record.insert("createdOn".into(), json!(now_iso));
    }
    record.insert("updatedOn".into(), json!(now_iso));
    record.insert("lastSeenAt".into(), json!(now));
    record.insert("attempts".into(), json!(attempts));
    record.insert("blockedUntil".into(), json!(blocked_until));
    record.insert("windowStartedAt".into(), json!(window_started_at));
    record
}

/// Records an attempt and reports whether any scope was already blocked.
async fn record_attempt(db: &Db, kind: AttemptKind, email: &str, ip: &str, now: i64) -> AppResult<bool> {
    let config = limit(kind);
    let mut blocked = false;
    for state in get_states(kind, email, ip) {
        let max_attempts = match state.scope {
            AttemptScope::Account => config.account,
            AttemptScope::Client => config.client,
        };
        let before = db
            .transaction(move |c| {
                let table = AUTH_ATTEMPT_LIMIT.tx(c);
                let filter = AuthAttemptLimit::ID.eq(&state.id);
                let before = table.scan_stored(&filter)?.into_iter().next();
                let record = next_record(&state, before.as_ref(), max_attempts, now);
                match &before {
                    Some(_) => {
                        table.update_many(&filter, &Patch::from_object(record))?;
                    }
                    None => table.insert_raw(&record)?,
                }
                Ok(before)
            })
            .await?;
        let before_blocked = before
            .as_ref()
            .and_then(|b| b.get("blockedUntil"))
            .and_then(Value::as_f64)
            .is_some_and(|blocked_until| blocked_until as i64 > now);
        if before_blocked {
            blocked = true;
        }
    }
    Ok(blocked)
}

async fn prune(db: &Db, now: i64) -> AppResult<()> {
    let cutoff = now - STATE_RETENTION_MS;
    AUTH_ATTEMPT_LIMIT
        .delete_many(
            db,
            AuthAttemptLimit::BLOCKED_UNTIL.lte(now).and_also(AuthAttemptLimit::LAST_SEEN_AT.lt(cutoff)),
        )
        .await?;
    Ok(())
}

static LAST_PRUNED_AT: AtomicI64 = AtomicI64::new(0);

async fn prune_maybe(db: &Db, now: i64) -> AppResult<()> {
    let last = LAST_PRUNED_AT.load(Ordering::SeqCst);
    if now - last < STATE_RETENTION_MS {
        return Ok(());
    }
    if LAST_PRUNED_AT.compare_exchange(last, now, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Ok(());
    }
    prune(db, now).await
}

fn limited(kind: AttemptKind) -> AppError {
    let config = limit(kind);
    too_many_requests_error(config.message, ErrorOptions::code(config.error_code))
}

/// `authAttemptLimit.consume(kind, email, ip)`: counts an attempt before the
/// work it guards and fails when the sender is already rate limited. Counting
/// first means a parallel burst cannot slip extra guesses past the limit; call
/// [`reset`] after a successful attempt.
pub async fn consume(db: &Db, kind: AttemptKind, email: &str, ip: &str) -> AppResult<()> {
    let now = js::date::now_ms();
    prune_maybe(db, now).await?;
    if record_attempt(db, kind, email, ip, now).await? {
        return Err(limited(kind));
    }
    Ok(())
}

/// `authAttemptLimit.reset(kind, email, ip)` (login and verify only).
pub async fn reset(db: &Db, kind: AttemptKind, email: &str, ip: &str) -> AppResult<()> {
    let ids: Vec<String> = get_states(kind, email, ip).iter().map(|state| state.id.clone()).collect();
    AUTH_ATTEMPT_LIMIT.delete_many(db, AuthAttemptLimit::ID.is_in(ids)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_startup_schema;

    fn db() -> (tempfile::TempDir, Db) {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("test.sqlite")).unwrap();
        db.call_blocking(run_startup_schema).unwrap();
        (dir, db)
    }

    #[tokio::test]
    async fn blocks_after_the_scope_limit_and_resets() {
        let (_dir, db) = db();
        // the client scope allows 5 failed logins; the 6th attempt is refused
        for _ in 0..5 {
            consume(&db, AttemptKind::Login, "a@example.com", "1.1.1.1").await.unwrap();
        }
        let error = consume(&db, AttemptKind::Login, " A@example.com ", "1.1.1.1").await.unwrap_err();
        assert_eq!((error.status_code, error.error_code.as_str()), (429, "auth.login_rate_limited"));
        // another client still has its own allowance, but the account counts every attempt
        consume(&db, AttemptKind::Login, "a@example.com", "2.2.2.2").await.unwrap();
        reset(&db, AttemptKind::Login, "a@example.com", "1.1.1.1").await.unwrap();
        consume(&db, AttemptKind::Login, "a@example.com", "1.1.1.1").await.unwrap();
        let stored = AUTH_ATTEMPT_LIMIT.get_many(&db, crate::db::Filter::all(), crate::db::Query::new()).await.unwrap();
        assert!(stored.iter().any(|s| s.id == "login:client:2.2.2.2:a@example.com" && s.ip.as_deref() == Some("2.2.2.2")));
        assert!(stored.iter().all(|s| s.email == "a@example.com"));
    }

    #[tokio::test]
    async fn delivery_limits_the_account_to_three_codes() {
        let (_dir, db) = db();
        for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3"] {
            consume(&db, AttemptKind::Delivery, "d@example.com", ip).await.unwrap();
        }
        let error = consume(&db, AttemptKind::Delivery, "d@example.com", "4.4.4.4").await.unwrap_err();
        assert_eq!(error.error_code, "user.code_delivery_rate_limited");
    }

    #[test]
    fn resets_an_expired_window_unless_blocked() {
        let state = get_states(AttemptKind::Verify, "x@example.com", "")[1].clone();
        assert_eq!(state.id, "verify:client:unknown:x@example.com");
        let first = next_record(&state, None, 5, 1_000);
        assert_eq!((first["attempts"].clone(), first["windowStartedAt"].clone()), (json!(1), json!(1_000)));
        let later = next_record(&state, Some(&first), 5, 1_000 + WINDOW_MS);
        assert_eq!((later["attempts"].clone(), later["windowStartedAt"].clone()), (json!(1), json!(1_000 + WINDOW_MS)));
        let mut blocked = first.clone();
        blocked.insert("blockedUntil".into(), json!(5_000));
        let during = next_record(&state, Some(&blocked), 5, 2_000);
        assert_eq!(during["attempts"], json!(1));
    }
}
