//! Port of `server/src/auth/jwt.ts`: HS256 JSON web tokens, interchangeable
//! with the `jsonwebtoken` package for the same `JWT_SECRET`.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde_json::{Map, Value, json};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Why a token was rejected (the `jsonwebtoken` error names).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JwtError {
    /// `JsonWebTokenError`: malformed, wrong algorithm or bad signature.
    Invalid(String),
    /// `TokenExpiredError`.
    Expired,
    /// `NotBeforeError`.
    NotBefore,
}

fn sign(secret: &str, signing_input: &str) -> Vec<u8> {
    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(secret.as_bytes())
        .unwrap_or_else(|_| unreachable!());
    mac.update(signing_input.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// `jwt.encode(data, {expiresIn})`: adds `iat` (and `exp` when given), like
/// `jwt.sign(data, secret, {algorithm: 'HS256', expiresIn})`.
pub fn encode(
    secret: &str,
    claims: &Map<String, Value>,
    expires_in_seconds: Option<i64>,
    now_ms: i64,
) -> String {
    let header = json!({"alg": "HS256", "typ": "JWT"});
    let mut payload = claims.clone();
    let iat = now_ms.div_euclid(1000);
    payload.insert("iat".into(), json!(iat));
    if let Some(seconds) = expires_in_seconds {
        payload.insert("exp".into(), json!(iat + seconds));
    }
    let encoded_header = URL_SAFE_NO_PAD.encode(crate::js::stringify(&header));
    let encoded_payload = URL_SAFE_NO_PAD.encode(crate::js::stringify(&Value::Object(payload)));
    let signing_input = format!("{encoded_header}.{encoded_payload}");
    let signature = URL_SAFE_NO_PAD.encode(sign(secret, &signing_input));
    format!("{signing_input}.{signature}")
}

/// `jwt.decode(token)` = `jwt.verify(token, secret, {algorithms: ['HS256']})`:
/// the verified payload (a string payload when it is not JSON).
pub fn decode(secret: &str, token: &str, now_ms: i64) -> Result<Value, JwtError> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(JwtError::Invalid("jwt malformed".into()));
    }
    let header: Value = URL_SAFE_NO_PAD
        .decode(parts[0])
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .ok_or_else(|| JwtError::Invalid("invalid token".into()))?;
    if header.get("alg").and_then(Value::as_str) != Some("HS256") {
        return Err(JwtError::Invalid("invalid algorithm".into()));
    }
    if parts[2].is_empty() {
        return Err(JwtError::Invalid("jwt signature is required".into()));
    }
    let signature = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| JwtError::Invalid("invalid signature".into()))?;
    let mut mac = <HmacSha256 as KeyInit>::new_from_slice(secret.as_bytes())
        .unwrap_or_else(|_| unreachable!());
    mac.update(format!("{}.{}", parts[0], parts[1]).as_bytes());
    if mac.verify_slice(&signature).is_err() {
        return Err(JwtError::Invalid("invalid signature".into()));
    }
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| JwtError::Invalid("invalid token".into()))?;
    let payload: Value = match serde_json::from_slice(&payload_bytes) {
        Ok(value) => value,
        Err(_) => {
            return Ok(Value::String(
                String::from_utf8_lossy(&payload_bytes).into_owned(),
            ));
        }
    };
    let now = now_ms.div_euclid(1000) as f64;
    if let Some(nbf) = payload.get("nbf") {
        let nbf = nbf
            .as_f64()
            .ok_or_else(|| JwtError::Invalid("invalid nbf value".into()))?;
        if now < nbf {
            return Err(JwtError::NotBefore);
        }
    }
    if let Some(exp) = payload.get("exp") {
        let exp = exp
            .as_f64()
            .ok_or_else(|| JwtError::Invalid("invalid exp value".into()))?;
        if now >= exp {
            return Err(JwtError::Expired);
        }
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NODE_TOKEN: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzMSIsInVzZXJJZCI6InUxIiwiY3JlYXRlZE9uIjoiMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaIiwiaWF0IjoxNzkxMjg5NzIzLCJleHAiOjIxMDY2NDk3MjN9.uauOleKCUYI19riA6zFPElPa9ZUpoOf1_TPFUEYCy3Q";

    fn claims() -> Map<String, Value> {
        json!({"sessionId": "s1", "userId": "u1", "createdOn": "2026-01-01T00:00:00.000Z"})
            .as_object()
            .cloned()
            .unwrap()
    }

    #[test]
    fn verifies_tokens_signed_by_the_ts_server() {
        let payload = decode("test-secret", NODE_TOKEN, 1_791_289_723_000).unwrap();
        assert_eq!(payload["sessionId"], "s1");
        assert_eq!(payload["exp"], 2_106_649_723_i64);
        assert!(matches!(
            decode("other-secret", NODE_TOKEN, 1_791_289_723_000),
            Err(JwtError::Invalid(_))
        ));
    }

    #[test]
    fn signs_byte_identical_tokens_to_jsonwebtoken() {
        let token = encode(
            "test-secret",
            &claims(),
            Some(2_106_649_723 - 1_791_289_723),
            1_791_289_723_000,
        );
        assert_eq!(token, NODE_TOKEN);
    }

    #[test]
    fn rejects_expired_and_tampered_tokens() {
        let token = encode("secret", &claims(), Some(10), 1_000_000);
        assert!(decode("secret", &token, 1_009_999).is_ok());
        assert_eq!(decode("secret", &token, 1_011_000), Err(JwtError::Expired));
        let tampered = format!("{}x", token);
        assert!(decode("secret", &tampered, 1_000_000).is_err());
        assert!(decode("secret", "a.b", 0).is_err());
    }
}
