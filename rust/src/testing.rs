//! Helpers for tests (unit tests here and integration tests in `tests/`):
//! a throwaway database directory and a ready-to-use [`AppState`].

use crate::app::AppState;
use crate::config::Config;
use crate::db::Db;
use crate::http::endpoint::Endpoint;
use crate::utils::mail::{CapturingTransport, Mailer};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// A temporary directory removed on drop.
pub struct TestDir(PathBuf);

impl TestDir {
    pub fn new() -> TestDir {
        let path = std::env::temp_dir().join(format!("frisbee-test-{}", crate::utils::random::generate_id()));
        let _ = std::fs::create_dir_all(&path);
        TestDir(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Default for TestDir {
    fn default() -> Self {
        TestDir::new()
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// An app state on a fresh, migrated database, with captured email.
pub struct TestApp {
    pub state: AppState,
    pub transport: Arc<CapturingTransport>,
    pub dir: TestDir,
}

impl TestApp {
    /// A development-mode app serving `endpoints`.
    pub fn new(endpoints: Vec<Endpoint>) -> TestApp {
        TestApp::with_config(endpoints, |_| {})
    }

    /// Like [`TestApp::new`], adjusting the test config first.
    pub fn with_config(endpoints: Vec<Endpoint>, adjust: impl FnOnce(&mut Config)) -> TestApp {
        let dir = TestDir::new();
        let mut config = Config::for_tests(dir.path().join("test.sqlite"));
        adjust(&mut config);
        let config = Arc::new(config);
        let db = Db::open(&config.sqlite_path).unwrap_or_else(|error| panic!("open test database: {error}"));
        db.call_blocking(crate::db::migrations::run_startup_schema_quiet)
            .unwrap_or_else(|error| panic!("migrate test database: {error}"));
        let transport = Arc::new(CapturingTransport::default());
        let mailer = Mailer::new(config.clone(), transport.clone());
        let state = AppState::new(config, db, mailer, endpoints);
        TestApp { state, transport, dir }
    }

    pub fn db(&self) -> &Db {
        &self.state.db
    }
}
