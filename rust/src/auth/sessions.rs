//! Port of `server/src/auth/sessions.ts` (the "gatekeeper"): session
//! creation and ending, and reading the auth token off a request.

use super::jwt;
use crate::config::Config;
use crate::db::{Db, Patch};
use crate::http::headers::header;
use crate::js;
use crate::shared::errors::AppResult;
use crate::shared::schemas::{Session, User};
use crate::shared::torva::io;
use crate::tables::SESSION;
use axum::http::HeaderMap;
use serde::Serialize;
use serde_json::{Value, json};
use subtle::ConstantTimeEq;

const MAX_TOKEN_LENGTH: usize = 4096;

/// The verified token claims plus the token itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthClaims {
    pub session_id: String,
    pub user_id: String,
    pub created_on: String,
    pub token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NewSession<'a> {
    id: &'a str,
    created_on: &'a str,
    expires_on: &'a str,
    user_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_agent: Option<&'a str>,
    token: &'a str,
}

/// `gatekeeper.createUserSession(user, userAgent)`.
pub async fn create_user_session(
    db: &Db,
    config: &Config,
    user: &User,
    user_agent: Option<&str>,
) -> AppResult<Session> {
    let now = js::date::now_ms();
    let created_on = js::date::to_iso_string(now);
    let expires_on = js::date::to_iso_string(now + config.session_ttl_days * 24 * 60 * 60 * 1000);
    let session_id = crate::utils::random::generate_id();
    let claims = json!({"sessionId": session_id, "userId": user.id, "createdOn": created_on});
    let token = jwt::encode(
        &config.jwt_secret,
        claims.as_object().unwrap_or(&Default::default()),
        Some(config.session_ttl_days * 24 * 60 * 60),
        now,
    );
    SESSION
        .create_one(
            db,
            NewSession {
                id: &session_id,
                created_on: &created_on,
                expires_on: &expires_on,
                user_id: &user.id,
                user_agent,
                token: &token,
            },
        )
        .await
}

/// `gatekeeper.endUserSessions(userId, exceptSessionId)`: ends every active
/// session of a user, optionally keeping one.
pub async fn end_user_sessions(
    db: &Db,
    user_id: &str,
    except_session_id: Option<&str>,
) -> AppResult<()> {
    let mut filter = Session::USER_ID
        .eq(user_id)
        .and_also(Session::ENDED.ne(true));
    if let Some(except) = except_session_id.filter(|id| !id.is_empty()) {
        filter = filter.and_also(Session::ID.ne(except));
    }
    SESSION
        .update_many(
            db,
            filter,
            Patch::new()
                .set(Session::ENDED, true)
                .set(Session::ENDED_ON, js::date::now_iso()),
        )
        .await?;
    Ok(())
}

fn normalize_token(value: Option<String>) -> Option<String> {
    let header = value?;
    if header.is_empty() || header == "undefined" {
        return None;
    }
    // /^Bearer\s+/i
    let token = match header.get(..6) {
        Some(prefix)
            if prefix.eq_ignore_ascii_case("bearer")
                && header[6..].starts_with(js::is_whitespace) =>
        {
            header[6..].trim_start_matches(js::is_whitespace)
        }
        _ => header.as_str(),
    };
    let token = js::trim(token);
    (!token.is_empty()).then(|| token.to_string())
}

/// `gatekeeper.tokenFromRequest(req)`.
pub fn token_from_request(headers: &HeaderMap) -> Option<String> {
    normalize_token(header(headers, "authorization"))
}

/// `gatekeeper.isTokenEqual(first, second)`: timing-safe.
pub fn is_token_equal(first: Option<&str>, second: Option<&str>) -> bool {
    match (
        first.filter(|t| !t.is_empty()),
        second.filter(|t| !t.is_empty()),
    ) {
        (Some(a), Some(b)) => a.len() == b.len() && bool::from(a.as_bytes().ct_eq(b.as_bytes())),
        _ => false,
    }
}

/// `gatekeeper.isSessionValid(auth, session)`.
pub fn is_session_valid(auth: Option<&AuthClaims>, session: Option<&Session>, now_ms: i64) -> bool {
    let (Some(auth), Some(session)) = (auth, session) else {
        return false;
    };
    let expires_on = js::date::parse(&session.expires_on).unwrap_or(0);
    session.ended != Some(true)
        && expires_on > now_ms
        && session.user_id == auth.user_id
        && is_token_equal(Some(&session.token), Some(&auth.token))
}

crate::io_schema! {
    fn io_jwt() {
        io::object([("sessionId", io::id()), ("userId", io::id()), ("createdOn", io::date())])
    }
}

/// `gatekeeper.digestRequest(req)`: the decoded claims, or `None` when the
/// request has no token or it is malformed, expired or signed with another key.
pub fn digest_request(headers: &HeaderMap, secret: &str) -> Option<AuthClaims> {
    let token = token_from_request(headers)?;
    if token.len() > MAX_TOKEN_LENGTH {
        return None;
    }
    let data = jwt::decode(secret, &token, js::date::now_ms()).ok()?;
    let claims = io_jwt().validate(&data).ok()?;
    let text = |key: &str| claims.get(key).and_then(Value::as_str).map(str::to_string);
    Some(AuthClaims {
        session_id: text("sessionId")?,
        user_id: text("userId")?,
        created_on: text("createdOn")?,
        token,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(authorization: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            HeaderValue::from_str(authorization).unwrap(),
        );
        headers
    }

    #[test]
    fn reads_bearer_and_bare_tokens() {
        assert_eq!(
            token_from_request(&headers("Bearer abc")),
            Some("abc".into())
        );
        assert_eq!(
            token_from_request(&headers("bearer   abc ")),
            Some("abc".into())
        );
        assert_eq!(token_from_request(&headers("abc")), Some("abc".into()));
        assert_eq!(token_from_request(&headers("undefined")), None);
        assert_eq!(token_from_request(&headers("Bearer ")), None);
        assert_eq!(token_from_request(&HeaderMap::new()), None);
    }

    #[test]
    fn validates_sessions_against_their_claims() {
        let auth = AuthClaims {
            session_id: "s".into(),
            user_id: "u".into(),
            created_on: String::new(),
            token: "t".into(),
        };
        let session = Session {
            id: "s".into(),
            created_on: String::new(),
            updated_on: String::new(),
            expires_on: "2100-01-01T00:00:00.000Z".into(),
            token: "t".into(),
            user_id: "u".into(),
            ended: None,
            ended_on: None,
            user_agent: None,
        };
        let now = js::date::now_ms();
        assert!(is_session_valid(Some(&auth), Some(&session), now));
        assert!(!is_session_valid(
            Some(&auth),
            Some(&Session {
                ended: Some(true),
                ..session.clone()
            }),
            now
        ));
        assert!(!is_session_valid(
            Some(&auth),
            Some(&Session {
                expires_on: "2000-01-01".into(),
                ..session.clone()
            }),
            now
        ));
        assert!(!is_session_valid(
            Some(&auth),
            Some(&Session {
                expires_on: "nope".into(),
                ..session.clone()
            }),
            now
        ));
        assert!(!is_session_valid(
            Some(&auth),
            Some(&Session {
                token: "x".into(),
                ..session.clone()
            }),
            now
        ));
        assert!(!is_session_valid(None, Some(&session), now));
    }

    #[test]
    fn digests_valid_tokens_only() {
        let claims = json!({"sessionId": " s1 ", "userId": "u1", "createdOn": "2026-01-01"});
        let token = jwt::encode(
            "secret",
            claims.as_object().unwrap(),
            Some(60),
            js::date::now_ms(),
        );
        let auth = digest_request(&headers(&format!("Bearer {token}")), "secret").unwrap();
        assert_eq!(auth.session_id, "s1");
        assert_eq!(auth.created_on, "2026-01-01T00:00:00.000Z");
        assert_eq!(auth.token, token);
        assert_eq!(digest_request(&headers(&token), "other"), None);
        assert_eq!(digest_request(&headers(&"a".repeat(4097)), "secret"), None);
    }
}
