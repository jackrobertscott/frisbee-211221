//! Application state shared by every request: config, database, mailer,
//! request screening state and the endpoint registry.

use crate::config::Config;
use crate::db::Db;
use crate::http::endpoint::Endpoint;
use crate::http::intrusion::Intrusion;
use crate::http::origin::Origin;
use crate::http::tarpit::Tarpit;
use crate::utils::mail::Mailer;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// A security code that was logged instead of emailed (development only).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SentCode {
    pub subject: String,
    pub email: String,
    /// As logged, e.g. `ABCD-1234`.
    pub code: String,
}

/// Security codes "sent" while email delivery is skipped. Tests read the
/// latest code for an email from here (the TS harness spied on console.log).
#[derive(Default)]
pub struct SecurityCodeLog {
    codes: Mutex<Vec<SentCode>>,
}

impl SecurityCodeLog {
    pub fn record(&self, code: SentCode) {
        self.codes.lock().unwrap_or_else(|e| e.into_inner()).push(code);
    }

    /// The latest code sent to `email`.
    pub fn latest(&self, email: &str) -> Option<String> {
        self.codes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .rev()
            .find(|code| code.email == email)
            .map(|code| code.code.clone())
    }

    pub fn all(&self) -> Vec<SentCode> {
        self.codes.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

pub struct AppInner {
    pub config: Arc<Config>,
    pub db: Db,
    pub origin: Origin,
    pub mailer: Mailer,
    pub security_codes: SecurityCodeLog,
    pub intrusion: Intrusion,
    pub tarpit: Tarpit,
    pub endpoints: HashMap<&'static str, Endpoint>,
}

/// Cheap to clone; handed to every handler through [`crate::http::endpoint::Ctx`].
#[derive(Clone)]
pub struct AppState(Arc<AppInner>);

impl std::ops::Deref for AppState {
    type Target = AppInner;
    fn deref(&self) -> &AppInner {
        &self.0
    }
}

impl AppState {
    /// State serving `endpoints` (usually [`crate::endpoints::all`]).
    pub fn new(config: Arc<Config>, db: Db, mailer: Mailer, endpoints: Vec<Endpoint>) -> AppState {
        let origin = Origin::new(&config.url_client);
        let endpoints = endpoints.into_iter().map(|endpoint| (endpoint.def.path, endpoint)).collect();
        AppState(Arc::new(AppInner {
            config,
            db,
            origin,
            mailer,
            security_codes: SecurityCodeLog::default(),
            intrusion: Intrusion::new(),
            tarpit: Tarpit::new(),
            endpoints,
        }))
    }

    pub fn has_endpoint(&self, path: &str) -> bool {
        self.endpoints.contains_key(path)
    }
}
