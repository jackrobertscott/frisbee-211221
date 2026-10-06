//! Console-style logging (`console.log` / `console.warn` / `console.error`).
//!
//! Lines go to stdout (log) or stderr (warn, error) exactly as the TS server
//! prints them. Tests can observe lines with [`capture`]; because tests run in
//! parallel, a capture sees every line logged while it is alive, so tests
//! should filter on something unique to them (an email, IP or path).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Log,
    Warn,
    Error,
}

type Sink = Arc<Mutex<Vec<(Level, String)>>>;

fn sinks() -> &'static Mutex<Vec<Sink>> {
    static SINKS: OnceLock<Mutex<Vec<Sink>>> = OnceLock::new();
    SINKS.get_or_init(|| Mutex::new(Vec::new()))
}

fn emit(level: Level, line: String) {
    {
        let guard = sinks().lock().unwrap_or_else(|e| e.into_inner());
        for sink in guard.iter() {
            sink.lock()
                .unwrap_or_else(|e| e.into_inner())
                .push((level, line.clone()));
        }
    }
    if quiet() {
        return;
    }
    match level {
        Level::Log => println!("{line}"),
        Level::Warn | Level::Error => eprintln!("{line}"),
    }
}

static QUIET: AtomicBool = AtomicBool::new(false);

/// Stops printing lines (captures still record them). Test harnesses call
/// this so parallel tests do not flood the output; set `FRISBEE_LOG_VERBOSE`
/// to print anyway.
pub fn set_quiet(quiet: bool) {
    QUIET.store(quiet, Ordering::Relaxed);
}

fn quiet() -> bool {
    static VERBOSE: OnceLock<bool> = OnceLock::new();
    let verbose = *VERBOSE.get_or_init(|| std::env::var("FRISBEE_LOG_VERBOSE").is_ok());
    !verbose && (cfg!(test) || QUIET.load(Ordering::Relaxed))
}

/// `console.log(line)`.
pub fn log(line: impl Into<String>) {
    emit(Level::Log, line.into());
}

/// `console.warn(line)`.
pub fn warn(line: impl Into<String>) {
    emit(Level::Warn, line.into());
}

/// `console.error(line)`.
pub fn error(line: impl Into<String>) {
    emit(Level::Error, line.into());
}

/// Records every line logged while the returned guard is alive.
pub fn capture() -> Capture {
    let sink: Sink = Arc::new(Mutex::new(Vec::new()));
    sinks()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .push(sink.clone());
    Capture { sink }
}

pub struct Capture {
    sink: Sink,
}

impl Capture {
    /// All captured lines at `level`.
    pub fn lines(&self, level: Level) -> Vec<String> {
        self.sink
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .filter(|(l, _)| *l == level)
            .map(|(_, line)| line.clone())
            .collect()
    }

    /// Captured lines at `level` that contain `needle`.
    pub fn matching(&self, level: Level, needle: &str) -> Vec<String> {
        self.lines(level)
            .into_iter()
            .filter(|line| line.contains(needle))
            .collect()
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        let mut guard = sinks().lock().unwrap_or_else(|e| e.into_inner());
        guard.retain(|sink| !Arc::ptr_eq(sink, &self.sink));
    }
}
