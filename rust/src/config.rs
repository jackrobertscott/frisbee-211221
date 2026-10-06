//! Port of `server/src/config.ts`: the environment, validated on load.
//!
//! The variables are the TS server's, except `MONGODB_URI`/`MONGODB_DB`, which
//! are replaced by `SQLITE_PATH`. `NODE_ENV=production` still selects
//! production mode (and `.env.production`), so deployments swap over without
//! changing their environment.

use crate::shared::torva::io;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// The validated server configuration.
#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    pub app_name: String,
    pub url_client: String,
    /// Path of the SQLite database file; parent directories are created.
    pub sqlite_path: PathBuf,
    pub jwt_secret: String,
    pub ses_access_key_id: String,
    pub ses_secret_access_key: String,
    pub ses_region: Option<String>,
    pub ses_from_email: String,
    pub is_production: bool,
    pub port: u16,
    pub session_ttl_days: i64,
    /// `GAMEDAY_IMPORT_SCHEDULER_DISABLED` (read by `gameday/scheduler.ts`).
    pub gameday_import_scheduler_disabled: bool,
}

/// Every environment variable the server reads (beyond the GameDay exporter's
/// own `GAMEDAY_*` options, which `gameday` reads directly).
pub const ENV_KEYS: [&str; 13] = [
    "APP_NAME",
    "URL_CLIENT",
    "SQLITE_PATH",
    "JWT_SECRET",
    "SES_ACCESS_KEY_ID",
    "SES_SECRET_ACCESS_KEY",
    "SES_REGION",
    "SES_FROM_EMAIL",
    "NODE_ENV",
    "PORT",
    "SESSION_TTL_DAYS",
    "GAMEDAY_IMPORT_SCHEDULER_DISABLED",
    "AWS_REGION",
];

impl Config {
    /// Loads `.env` (or `.env.production` when `NODE_ENV=production`) without
    /// overriding variables already set, then validates the process environment.
    pub fn load() -> Result<Config, String> {
        let file = if std::env::var("NODE_ENV").as_deref() == Ok("production") {
            ".env.production"
        } else {
            ".env"
        };
        for dir in env_dirs() {
            let path = dir.join(file);
            if path.is_file() {
                let _ = dotenvy::from_path(&path);
                break;
            }
        }
        let vars: HashMap<String, String> = ENV_KEYS
            .iter()
            .filter_map(|key| {
                std::env::var(key)
                    .ok()
                    .map(|value| (key.to_string(), value))
            })
            .collect();
        Config::from_vars(&vars)
    }

    /// Validates a set of raw variables exactly like the TS `envSchema`.
    pub fn from_vars(vars: &HashMap<String, String>) -> Result<Config, String> {
        let schema = io::object([
            ("APP_NAME", io::string().trim()),
            ("URL_CLIENT", io::string().trim()),
            ("SQLITE_PATH", io::string().trim()),
            ("JWT_SECRET", io::string().trim()),
            ("SES_ACCESS_KEY_ID", io::string().emptyok().trim()),
            ("SES_SECRET_ACCESS_KEY", io::string().emptyok().trim()),
            ("SES_REGION", io::optional(io::string().emptyok().trim())),
            ("SES_FROM_EMAIL", io::string().emptyok().trim()),
            ("IS_PRODUCTION", io::boolean()),
            ("PORT", io::number().coerce().integer().positive()),
            (
                "SESSION_TTL_DAYS",
                io::number().coerce().integer().positive(),
            ),
        ]);
        let mut raw = Map::new();
        for key in [
            "APP_NAME",
            "URL_CLIENT",
            "SQLITE_PATH",
            "JWT_SECRET",
            "SES_ACCESS_KEY_ID",
            "SES_SECRET_ACCESS_KEY",
            "SES_REGION",
            "SES_FROM_EMAIL",
            "PORT",
        ] {
            if let Some(value) = vars.get(key) {
                raw.insert(key.into(), Value::String(value.clone()));
            }
        }
        // Dockerfile injects NODE_ENV=production
        raw.insert(
            "IS_PRODUCTION".into(),
            Value::Bool(vars.get("NODE_ENV").map(String::as_str) == Some("production")),
        );
        raw.insert(
            "SESSION_TTL_DAYS".into(),
            vars.get("SESSION_TTL_DAYS")
                .map(|v| Value::String(v.clone()))
                .unwrap_or_else(|| Value::from(90)),
        );
        let value = schema
            .validate(&Value::Object(raw))
            .map_err(|error| format!("Invalid server environment: {error}"))?;
        let text = |key: &str| {
            value
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let number = |key: &str| value.get(key).and_then(Value::as_f64).unwrap_or(0.0);
        let port = number("PORT");
        if port > f64::from(u16::MAX) {
            return Err(format!(
                "Invalid server environment: [PORT]: Value must be less than or equal to {}.",
                u16::MAX
            ));
        }
        Ok(Config {
            app_name: text("APP_NAME"),
            url_client: text("URL_CLIENT"),
            sqlite_path: PathBuf::from(text("SQLITE_PATH")),
            jwt_secret: text("JWT_SECRET"),
            ses_access_key_id: text("SES_ACCESS_KEY_ID"),
            ses_secret_access_key: text("SES_SECRET_ACCESS_KEY"),
            ses_region: value
                .get("SES_REGION")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| vars.get("AWS_REGION").cloned()),
            ses_from_email: text("SES_FROM_EMAIL"),
            is_production: value
                .get("IS_PRODUCTION")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            port: port as u16,
            session_ttl_days: number("SESSION_TTL_DAYS") as i64,
            gameday_import_scheduler_disabled: is_truthy_flag(
                vars.get("GAMEDAY_IMPORT_SCHEDULER_DISABLED")
                    .map(String::as_str),
            ),
        })
    }

    /// A development configuration for tests: the TS test setup's values with
    /// the database at `sqlite_path`.
    pub fn for_tests(sqlite_path: impl Into<PathBuf>) -> Config {
        Config {
            app_name: "Frisbee Test".into(),
            url_client: "http://localhost:3000".into(),
            sqlite_path: sqlite_path.into(),
            jwt_secret: "test-secret".into(),
            ses_access_key_id: String::new(),
            ses_secret_access_key: String::new(),
            ses_region: None,
            ses_from_email: String::new(),
            is_production: false,
            port: 4999,
            session_ttl_days: 90,
            gameday_import_scheduler_disabled: true,
        }
    }
}

/// How `gameday/scheduler.ts` reads `GAMEDAY_IMPORT_SCHEDULER_DISABLED`:
/// `1`, `true`, `yes` or `on` (any case, trimmed) disable the scheduler.
pub fn is_truthy_flag(value: Option<&str>) -> bool {
    value.is_some_and(|v| {
        matches!(
            crate::js::trim(v).to_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

fn env_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(dir) = std::env::var("FRISBEE_ENV_DIR") {
        dirs.push(PathBuf::from(dir));
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd);
    }
    dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf());
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn base() -> Vec<(&'static str, &'static str)> {
        vec![
            ("APP_NAME", " Frisbee "),
            ("URL_CLIENT", "http://localhost:3000"),
            ("SQLITE_PATH", "data/frisbee.sqlite"),
            ("JWT_SECRET", "secret"),
            ("SES_ACCESS_KEY_ID", ""),
            ("SES_SECRET_ACCESS_KEY", ""),
            ("SES_FROM_EMAIL", ""),
            ("PORT", "4000"),
        ]
    }

    #[test]
    fn validates_and_normalises_the_environment() {
        let config = Config::from_vars(&vars(&base())).unwrap();
        assert_eq!(config.app_name, "Frisbee");
        assert_eq!(config.port, 4000);
        assert_eq!(config.session_ttl_days, 90);
        assert!(!config.is_production);
        assert!(!config.gameday_import_scheduler_disabled);
    }

    #[test]
    fn reports_the_first_invalid_variable() {
        let mut pairs = base();
        pairs.retain(|(k, _)| *k != "JWT_SECRET");
        assert_eq!(
            Config::from_vars(&vars(&pairs)).unwrap_err(),
            "Invalid server environment: [JWT_SECRET]: String value is not a string."
        );
        let mut pairs = base();
        pairs.push(("PORT", "0"));
        let pairs: Vec<_> = pairs
            .into_iter()
            .filter(|(k, v)| *k != "PORT" || *v == "0")
            .collect();
        assert_eq!(
            Config::from_vars(&vars(&pairs)).unwrap_err(),
            "Invalid server environment: [PORT]: Value must be greater than or equal to 1."
        );
    }

    #[test]
    fn reads_production_mode_and_flags() {
        let mut pairs = base();
        pairs.push(("NODE_ENV", "production"));
        pairs.push(("SESSION_TTL_DAYS", "7"));
        pairs.push(("GAMEDAY_IMPORT_SCHEDULER_DISABLED", " TRUE "));
        let config = Config::from_vars(&vars(&pairs)).unwrap();
        assert!(config.is_production);
        assert_eq!(config.session_ttl_days, 7);
        assert!(config.gameday_import_scheduler_disabled);
    }
}
