//! Port of `server/src/gameday/credentials.ts`: GameDay passwords are stored
//! with AES-256-GCM under a key derived from `JWT_SECRET`, in the format
//! `v1:<iv>:<tag>:<ciphertext>` (base64url, no padding). The format and key
//! derivation match the TS server, so stored passwords decrypt with either.

use crate::shared::errors::{AppError, AppResult};
use crate::shared::schemas::{GamedayImportConfig, GamedayImportConfigSafe};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use base64::alphabet::URL_SAFE;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use sha2::{Digest, Sha256};

const CREDENTIAL_VERSION: &str = "v1";
const IV_LENGTH_BYTES: usize = 12;
const TAG_LENGTH_BYTES: usize = 16;
const UNSUPPORTED_FORMAT: &str = "Stored GameDay password is not in a supported format.";
/// Node's message when GCM authentication fails.
const AUTH_FAILED: &str = "Unsupported state or unable to authenticate data";

/// Node's `base64url`: written without padding, read with or without it.
const BASE64URL: GeneralPurpose = GeneralPurpose::new(
    &URL_SAFE,
    GeneralPurposeConfig::new()
        .with_encode_padding(false)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

fn credential_key(secret: &str) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(secret.as_bytes());
    hash.update(b"\0gameday-import-credentials");
    hash.finalize().into()
}

fn cipher(secret: &str) -> Aes256Gcm {
    Aes256Gcm::new(&credential_key(secret).into())
}

/// `encryptGamedayPassword(password)`, keyed by `secret` (`JWT_SECRET`).
pub fn encrypt_gameday_password(secret: &str, password: &str) -> AppResult<String> {
    let iv: [u8; IV_LENGTH_BYTES] = rand::random();
    let mut sealed = cipher(secret)
        .encrypt(&Nonce::from(iv), password.as_bytes())
        .map_err(|_| AppError::internal_from("Failed to encrypt the GameDay password."))?;
    let tag = sealed.split_off(sealed.len() - TAG_LENGTH_BYTES);
    Ok([
        CREDENTIAL_VERSION.to_string(),
        BASE64URL.encode(iv),
        BASE64URL.encode(tag),
        BASE64URL.encode(sealed),
    ]
    .join(":"))
}

/// `decryptGamedayPassword(encryptedPassword)`, keyed by `secret`.
pub fn decrypt_gameday_password(secret: &str, encrypted_password: &str) -> AppResult<String> {
    let parts: Vec<&str> = encrypted_password.split(':').collect();
    // the ciphertext segment is empty for an empty password
    let [version, iv_text, tag_text, encrypted_text] = parts[..] else {
        return Err(AppError::internal_from(UNSUPPORTED_FORMAT));
    };
    if version != CREDENTIAL_VERSION || iv_text.is_empty() || tag_text.is_empty() {
        return Err(AppError::internal_from(UNSUPPORTED_FORMAT));
    }
    let auth_failed = || AppError::internal_from(AUTH_FAILED);
    let decode = |text: &str| BASE64URL.decode(text).map_err(|_| auth_failed());
    let iv: [u8; IV_LENGTH_BYTES] = decode(iv_text)?.try_into().map_err(|_| auth_failed())?;
    let tag = decode(tag_text)?;
    if tag.len() != TAG_LENGTH_BYTES {
        return Err(auth_failed());
    }
    let mut sealed = decode(encrypted_text)?;
    sealed.extend_from_slice(&tag);
    let plain = cipher(secret)
        .decrypt(&Nonce::from(iv), sealed.as_slice())
        .map_err(|_| auth_failed())?;
    Ok(String::from_utf8_lossy(&plain).into_owned())
}

/// `toSafeGamedayImportConfig(value)`.
pub fn to_safe_gameday_import_config(value: &GamedayImportConfig) -> GamedayImportConfigSafe {
    GamedayImportConfigSafe {
        id: value.id.clone(),
        created_on: value.created_on.clone(),
        updated_on: value.updated_on.clone(),
        season_id: value.season_id.clone(),
        username: value.username.clone(),
        association: value.association.clone(),
        competition: value.competition.clone(),
        schedule_enabled: value.schedule_enabled,
        schedule_start_on: value.schedule_start_on.clone(),
        schedule_end_on: value.schedule_end_on.clone(),
        last_scheduled_run_key: value.last_scheduled_run_key.clone(),
        schedule_locked_until: value.schedule_locked_until.clone(),
        has_password: !value.password_encrypted.is_empty(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SECRET: &str = "test-secret";

    fn encrypt(password: &str) -> String {
        encrypt_gameday_password(SECRET, password).unwrap()
    }

    fn decrypt(encrypted: &str) -> AppResult<String> {
        decrypt_gameday_password(SECRET, encrypted)
    }

    mod gameday_password_encryption {
        use super::*;

        #[test]
        fn round_trips_passwords() {
            for password in ["secret", "p@ss:word with spaces", "üñíçødé 🔑"] {
                assert_eq!(decrypt(&encrypt(password)).unwrap(), password);
            }
        }

        #[test]
        fn uses_a_versioned_base64url_colon_separated_format() {
            let encrypted = encrypt("secret");
            let parts: Vec<&str> = encrypted.split(':').collect();
            assert_eq!(parts.len(), 4);
            assert_eq!(parts[0], "v1");
            for part in &parts[1..] {
                assert!(
                    part.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                );
                assert!(!part.is_empty());
            }
            assert_eq!(BASE64URL.decode(parts[1]).unwrap().len(), 12);
            assert_eq!(BASE64URL.decode(parts[2]).unwrap().len(), 16);
        }

        #[test]
        fn uses_a_random_iv_per_encryption() {
            assert_ne!(encrypt("secret"), encrypt("secret"));
        }

        #[test]
        fn detects_tampering_with_the_ciphertext_or_tag() {
            let encrypted = encrypt("secret");
            let [version, iv, tag, data] = encrypted.split(':').collect::<Vec<_>>()[..] else {
                panic!("unexpected format");
            };
            let flip = |value: &str| {
                let mut bytes = BASE64URL.decode(value).unwrap();
                bytes[0] ^= 1;
                BASE64URL.encode(bytes)
            };
            assert!(decrypt(&[version, iv, tag, &flip(data)].join(":")).is_err());
            assert!(decrypt(&[version, iv, &flip(tag), data].join(":")).is_err());
            assert!(decrypt(&[version, &flip(iv), tag, data].join(":")).is_err());
        }

        #[test]
        fn rejects_unsupported_formats() {
            let encrypted = encrypt("secret");
            let [_, iv, tag, data] = encrypted.split(':').collect::<Vec<_>>()[..] else {
                panic!("unexpected format");
            };
            let message = |value: &str| decrypt(value).unwrap_err().message.clone();
            assert_eq!(message(""), UNSUPPORTED_FORMAT);
            assert_eq!(message("plain-text"), UNSUPPORTED_FORMAT);
            assert_eq!(
                message(&["v2", iv, tag, data].join(":")),
                UNSUPPORTED_FORMAT
            );
            assert_eq!(message(&["v1", iv, tag].join(":")), UNSUPPORTED_FORMAT);
            assert_eq!(
                message(&["v1", iv, tag, data, data].join(":")),
                UNSUPPORTED_FORMAT
            );
        }

        #[test]
        fn round_trips_an_empty_password() {
            let encrypted = encrypt("");
            assert!(encrypted.ends_with(':'));
            assert_eq!(decrypt(&encrypted).unwrap(), "");
        }

        /// Produced by the TS server with `JWT_SECRET=test-secret`:
        /// `encryptGamedayPassword('gd-pass')`.
        #[test]
        fn decrypts_passwords_encrypted_by_the_ts_server() {
            assert_eq!(
                decrypt("v1:AAECAwQFBgcICQoL:l_w34Ka1vTWe0kjsKtYeag:o2DuJzIOGA").unwrap(),
                "gd-pass"
            );
        }

        #[test]
        fn depends_on_the_secret() {
            let encrypted = encrypt("secret");
            assert!(decrypt_gameday_password("other-secret", &encrypted).is_err());
        }
    }

    mod to_safe_gameday_import_config_tests {
        use super::*;

        fn config() -> GamedayImportConfig {
            GamedayImportConfig {
                id: "c1".into(),
                created_on: "2024-01-01T00:00:00.000Z".into(),
                updated_on: "2024-01-02T00:00:00.000Z".into(),
                season_id: "s1".into(),
                username: "user".into(),
                password_encrypted: "v1:a:b:c".into(),
                association: "assoc".into(),
                competition: "comp".into(),
                schedule_enabled: true,
                schedule_start_on: Some("2024-02-01T00:00:00.000Z".into()),
                schedule_end_on: Some("2024-03-01T00:00:00.000Z".into()),
                last_scheduled_run_key: Some("key".into()),
                schedule_locked_until: Some("2024-02-01T02:00:00.000Z".into()),
                schedule_lock_token: Some("token".into()),
            }
        }

        #[test]
        fn omits_secrets_and_reports_whether_a_password_is_stored() {
            assert_eq!(
                serde_json::to_value(to_safe_gameday_import_config(&config())).unwrap(),
                json!({
                    "id": "c1",
                    "createdOn": "2024-01-01T00:00:00.000Z",
                    "updatedOn": "2024-01-02T00:00:00.000Z",
                    "seasonId": "s1",
                    "username": "user",
                    "association": "assoc",
                    "competition": "comp",
                    "scheduleEnabled": true,
                    "scheduleStartOn": "2024-02-01T00:00:00.000Z",
                    "scheduleEndOn": "2024-03-01T00:00:00.000Z",
                    "lastScheduledRunKey": "key",
                    "scheduleLockedUntil": "2024-02-01T02:00:00.000Z",
                    "hasPassword": true,
                })
            );
        }

        #[test]
        fn reports_no_password_for_an_empty_encrypted_password() {
            let safe = to_safe_gameday_import_config(&GamedayImportConfig {
                password_encrypted: String::new(),
                ..config()
            });
            assert!(!safe.has_password);
            let value = serde_json::to_value(safe).unwrap();
            assert!(value.get("passwordEncrypted").is_none());
            assert!(value.get("scheduleLockToken").is_none());
        }
    }
}
