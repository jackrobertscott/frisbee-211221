//! Port of `server/src/auth/hash.ts`: bcrypt password hashes (cost 11,
//! compatible with `bcryptjs` `$2a$`/`$2b$` hashes) and HMAC digests of
//! security codes.

use crate::shared::errors::{bad_request_error, AppResult, ErrorOptions};
use crate::utils::random::random_string;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::sync::OnceLock;
use subtle::ConstantTimeEq;

pub const PASSWORD_MIN_LENGTH: usize = 5;
/// bcrypt ignores input past 72 bytes; cap length so huge inputs stay cheap.
pub const PASSWORD_MAX_LENGTH: usize = 200;
pub const BCRYPT_COST: u32 = 11;

/// `password.length` in JavaScript (UTF-16 code units).
fn js_length(value: &str) -> usize {
    value.encode_utf16().count()
}

/// `hash.assertNewPasswordValid(password)`.
pub fn assert_new_password_valid(password: &str) -> AppResult<()> {
    if js_length(password) < PASSWORD_MIN_LENGTH {
        return Err(bad_request_error(
            format!("Password must be at least {PASSWORD_MIN_LENGTH} characters long."),
            ErrorOptions::code("user.password_too_short"),
        ));
    }
    if js_length(password) > PASSWORD_MAX_LENGTH {
        return Err(bad_request_error(
            format!("Password must be at most {PASSWORD_MAX_LENGTH} characters long."),
            ErrorOptions::code("user.password_too_long"),
        ));
    }
    Ok(())
}

/// `hash.encrypt(password)` (blocking; call from `spawn_blocking` or a DB closure).
pub fn encrypt(password: &str) -> AppResult<String> {
    bcrypt::hash(password, BCRYPT_COST).map_err(crate::shared::errors::AppError::internal_from)
}

/// `hash.compare(password, hash)` (blocking). Malformed hashes compare false.
pub fn compare(password: &str, hash: &str) -> bool {
    if js_length(password) > PASSWORD_MAX_LENGTH {
        return false;
    }
    bcrypt::verify(password, hash).unwrap_or(false)
}

/// `hash.compareDummy(password)`: spends the same time as a real compare so
/// missing accounts are not revealed. Always false.
pub fn compare_dummy(password: &str) -> bool {
    static DUMMY: OnceLock<String> = OnceLock::new();
    let dummy = DUMMY.get_or_init(|| bcrypt::hash(random_string(24), BCRYPT_COST).unwrap_or_default());
    let truncated: String = {
        let units: Vec<u16> = password.encode_utf16().take(PASSWORD_MAX_LENGTH).collect();
        String::from_utf16_lossy(&units)
    };
    let _ = bcrypt::verify(truncated, dummy);
    false
}

/// Async wrappers that keep bcrypt's CPU work off the async runtime.
pub async fn encrypt_async(password: String) -> AppResult<String> {
    tokio::task::spawn_blocking(move || encrypt(&password))
        .await
        .map_err(crate::shared::errors::AppError::internal_from)?
}

pub async fn compare_async(password: String, hash: String) -> bool {
    tokio::task::spawn_blocking(move || compare(&password, &hash)).await.unwrap_or(false)
}

pub async fn compare_dummy_async(password: String) -> bool {
    tokio::task::spawn_blocking(move || compare_dummy(&password)).await.unwrap_or(false)
}

/// `hash.digest(value)`: HMAC-SHA256 keyed by `JWT_SECRET`, hex encoded.
pub fn digest(secret: &str, value: &str) -> String {
    let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(secret.as_bytes()).unwrap_or_else(|_| unreachable!());
    mac.update(value.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// `hash.equals(value, expected)`: timing-safe comparison of `digest(value)`.
pub fn equals(secret: &str, value: &str, expected: &str) -> bool {
    let left = digest(secret, value);
    left.len() == expected.len() && bool::from(left.as_bytes().ct_eq(expected.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_bcryptjs_hashes() {
        assert!(compare("hunter22", "$2b$04$ixDxg985t97Gc4f4jikvCejip9nyEltERaJ3G9CLQCuQ/w1fooaC2"));
        assert!(compare("hunter22", "$2a$04$IioJ9l7oYbY/MYzYRRgZSO2JmUgk4v.DBLkFjlZNAm3vi6AfWVySq"));
        assert!(!compare("hunter23", "$2b$04$ixDxg985t97Gc4f4jikvCejip9nyEltERaJ3G9CLQCuQ/w1fooaC2"));
        // bcrypt ignores bytes past 72, as bcryptjs does
        assert!(compare(&"x".repeat(80), "$2b$04$ki4P54/c.Ca.pfSL9YptfupoC/DAQxqLLvMaut3yPWgql3vh4v19S"));
        assert!(compare(&"x".repeat(75), "$2b$04$ki4P54/c.Ca.pfSL9YptfupoC/DAQxqLLvMaut3yPWgql3vh4v19S"));
        assert!(compare("pässwörd✓", "$2b$04$DjMPkOuwzqmycsIHXLKHEe5Fe8eWfaAjl90OqLKWD3kGmaEN4LtIG"));
        assert!(!compare("x", "not a hash"));
    }

    #[test]
    fn hashes_with_cost_11_and_rejects_overlong_passwords() {
        let hashed = encrypt("secret").unwrap();
        assert!(hashed.starts_with("$2b$11$"));
        assert!(compare("secret", &hashed));
        assert!(!compare(&"a".repeat(201), &hashed));
        assert!(!compare_dummy("anything"));
    }

    #[test]
    fn validates_new_password_length() {
        assert_eq!(assert_new_password_valid("abcd").unwrap_err().error_code, "user.password_too_short");
        assert!(assert_new_password_valid("abcde").is_ok());
        assert_eq!(assert_new_password_valid(&"a".repeat(201)).unwrap_err().error_code, "user.password_too_long");
    }

    #[test]
    fn digests_like_node_crypto() {
        assert_eq!(digest("test-secret", "ABCD1234"), "248d878deaf82853b2dd265fe5674cbc9635d68586cd177df197f0290f2c2f84");
        assert!(equals("test-secret", "ABCD1234", "248d878deaf82853b2dd265fe5674cbc9635d68586cd177df197f0290f2c2f84"));
        assert!(!equals("test-secret", "ABCD1235", "248d878deaf82853b2dd265fe5674cbc9635d68586cd177df197f0290f2c2f84"));
    }
}
