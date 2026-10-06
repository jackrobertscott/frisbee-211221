//! Port of `server/src/gameday/runExportProcess.ts`: runs the GameDay
//! exporter (the `gameday-export` binary, `exportCli.ts` in TS) as a child
//! process, sends it the input as JSON on stdin and reads the members it
//! prints as JSON on stdout. A non-zero exit fails with the tail of stderr.
//!
//! The binary is found next to the running executable (or in its parent,
//! for test binaries in `target/<profile>/deps`); `GAMEDAY_EXPORT_BIN`
//! overrides the path.

use super::types::{GamedayExportInput, GamedayExportOutput, is_gameday_export_output};
use crate::shared::errors::{
    AppError, AppResult, ErrorOptions, bad_request_error, internal_error, service_unavailable_error,
};
use serde_json::Value;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, Command};

pub const DEFAULT_PROCESS_TIMEOUT_MS: u64 = 10 * 60 * 1000;
pub const MAX_OUTPUT_LENGTH: usize = 50 * 1024 * 1024;
/// The exporter binary's file name.
pub const EXPORT_BIN_NAME: &str = "gameday-export";

/// The server secrets the scraper never needs.
pub const CHILD_ENV_EXCLUDED_KEYS: [&str; 4] = [
    "JWT_SECRET",
    "MONGODB_URI",
    "SES_ACCESS_KEY_ID",
    "SES_SECRET_ACCESS_KEY",
];

pub type ExportFuture = Pin<Box<dyn Future<Output = AppResult<GamedayExportOutput>> + Send>>;

/// Runs a GameDay export. The server uses [`ProcessExporter`]; tests swap in
/// their own (the TS tests mocked `runGamedayExportProcess`).
pub trait GamedayExporter: Send + Sync {
    fn export(&self, input: GamedayExportInput) -> ExportFuture;
}

/// `runGamedayExportProcess` with the command resolved from the environment.
#[derive(Clone, Copy, Debug, Default)]
pub struct ProcessExporter;

impl GamedayExporter for ProcessExporter {
    fn export(&self, input: GamedayExportInput) -> ExportFuture {
        Box::pin(run_gameday_export_process(input))
    }
}

/// How to start the exporter (`TCliCommand`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliCommand {
    pub command: PathBuf,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
    /// The complete child environment.
    pub env: Vec<(String, String)>,
    pub timeout_ms: u64,
}

impl CliCommand {
    /// The exporter as the server runs it: resolved binary, the process
    /// environment without secrets, and the configured timeout.
    pub fn from_env() -> CliCommand {
        let vars: Vec<(String, String)> = std::env::vars().collect();
        let read = |key: &str| {
            vars.iter()
                .find(|(k, _)| k == key)
                .map(|(_, value)| value.clone())
        };
        let current_exe =
            std::env::current_exe().unwrap_or_else(|_| PathBuf::from(EXPORT_BIN_NAME));
        CliCommand {
            command: resolve_cli_command(read("GAMEDAY_EXPORT_BIN").as_deref(), &current_exe),
            args: Vec::new(),
            cwd: None,
            env: read_child_env(vars.iter().cloned()),
            timeout_ms: read_process_timeout_ms(
                read("GAMEDAY_PROCESS_TIMEOUT_MS").as_deref(),
                read("GAMEDAY_TIMEOUT_MS").as_deref(),
            ),
        }
    }
}

/// `runGamedayExportProcess(input)`.
pub async fn run_gameday_export_process(
    input: GamedayExportInput,
) -> AppResult<GamedayExportOutput> {
    run_gameday_export_command(&CliCommand::from_env(), &input).await
}

/// Where the exporter binary is: `GAMEDAY_EXPORT_BIN` when set, otherwise
/// next to `current_exe` (or one directory up from a `deps` directory, where
/// cargo puts test binaries).
pub fn resolve_cli_command(override_path: Option<&str>, current_exe: &Path) -> PathBuf {
    if let Some(path) = override_path.map(crate::js::trim).filter(|p| !p.is_empty()) {
        return PathBuf::from(path);
    }
    let file_name = format!("{EXPORT_BIN_NAME}{}", std::env::consts::EXE_SUFFIX);
    let dir = current_exe.parent().unwrap_or_else(|| Path::new("."));
    let beside = dir.join(&file_name);
    if !beside.exists()
        && dir.file_name().is_some_and(|name| name == "deps")
        && let Some(parent) = dir.parent()
    {
        return parent.join(&file_name);
    }
    beside
}

/// `readChildEnv()`: the environment without server secrets.
pub fn read_child_env(vars: impl IntoIterator<Item = (String, String)>) -> Vec<(String, String)> {
    vars.into_iter()
        .filter(|(key, _)| !CHILD_ENV_EXCLUDED_KEYS.contains(&key.as_str()))
        .collect()
}

/// `readProcessTimeoutMs()`: `GAMEDAY_PROCESS_TIMEOUT_MS`, else the
/// scraper's `GAMEDAY_TIMEOUT_MS`, when a positive finite number.
pub fn read_process_timeout_ms(
    process_timeout: Option<&str>,
    scraper_timeout: Option<&str>,
) -> u64 {
    let Some(value) = process_timeout.or(scraper_timeout) else {
        return DEFAULT_PROCESS_TIMEOUT_MS;
    };
    if crate::js::trim(value).is_empty() {
        return DEFAULT_PROCESS_TIMEOUT_MS;
    }
    let parsed = crate::js::string_to_number(value);
    if parsed.is_finite() && parsed > 0.0 {
        // setTimeout truncates fractional delays
        (parsed as u64).max(1)
    } else {
        DEFAULT_PROCESS_TIMEOUT_MS
    }
}

fn read_output_tail(value: &str) -> String {
    let lines: Vec<&str> = value
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .map(crate::js::trim)
        .filter(|line| !line.is_empty())
        .collect();
    lines[lines.len().saturating_sub(12)..].join("\n")
}

fn read_failure_message(stderr: &str) -> String {
    let tail = read_output_tail(stderr);
    if tail.is_empty() {
        "GameDay export failed.".into()
    } else {
        format!("GameDay export failed. {tail}")
    }
}

/// Asks the child to stop (SIGTERM, like `child.kill('SIGTERM')`).
fn terminate(child: &mut Child) {
    #[cfg(unix)]
    {
        use nix::sys::signal::{Signal, kill};
        use nix::unistd::Pid;
        if let Some(pid) = child.id().and_then(|id| i32::try_from(id).ok())
            && kill(Pid::from_raw(pid), Signal::SIGTERM).is_ok()
        {
            return;
        }
    }
    let _ = child.start_kill();
}

enum Outcome {
    Exited(Option<i32>, Vec<u8>),
    TooLarge,
}

/// Runs `cli` with `input` and reads its output (the body of
/// `runGamedayExportProcess`).
pub async fn run_gameday_export_command(
    cli: &CliCommand,
    input: &GamedayExportInput,
) -> AppResult<GamedayExportOutput> {
    let mut command = Command::new(&cli.command);
    command
        .args(&cli.args)
        .env_clear()
        .envs(cli.env.iter().cloned())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = &cli.cwd {
        command.current_dir(cwd);
    }
    let mut child = command.spawn().map_err(|error| {
        internal_error(
            Some("Failed to start the GameDay export process."),
            ErrorOptions::code("gameday.process_start_failed").with_cause(error.to_string()),
        )
    })?;

    let input_json = serde_json::to_string(input).map_err(AppError::internal_from)?;
    if let Some(mut stdin) = child.stdin.take() {
        // a child that exits without reading its input is not an error here
        tokio::spawn(async move {
            let _ = stdin.write_all(input_json.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }
    let stderr_task = child.stderr.take().map(|mut stderr| {
        tokio::spawn(async move {
            let mut collected = Vec::new();
            let mut chunk = vec![0u8; 64 * 1024];
            while let Ok(read) = stderr.read(&mut chunk).await {
                if read == 0 {
                    break;
                }
                collected.extend_from_slice(&chunk[..read]);
                if collected.len() > MAX_OUTPUT_LENGTH {
                    collected.drain(..collected.len() - MAX_OUTPUT_LENGTH);
                }
            }
            collected
        })
    });
    let mut stdout = child.stdout.take();

    let run = async {
        let mut collected = Vec::new();
        if let Some(stdout) = stdout.as_mut() {
            let mut chunk = vec![0u8; 64 * 1024];
            while let Ok(read) = stdout.read(&mut chunk).await {
                if read == 0 {
                    break;
                }
                collected.extend_from_slice(&chunk[..read]);
                if collected.len() > MAX_OUTPUT_LENGTH {
                    return Outcome::TooLarge;
                }
            }
        }
        let code = child.wait().await.ok().and_then(|status| status.code());
        Outcome::Exited(code, collected)
    };
    let outcome = tokio::time::timeout(Duration::from_millis(cli.timeout_ms), run).await;

    let (code, stdout) = match outcome {
        Err(_) => {
            terminate(&mut child);
            return Err(service_unavailable_error(
                "GameDay export timed out.",
                ErrorOptions::code("gameday.export_timeout").with_user_message(
                    "GameDay took too long to finish the export. Please try again later.",
                ),
            ));
        }
        Ok(Outcome::TooLarge) => {
            terminate(&mut child);
            return Err(internal_error(
                Some("GameDay export output was too large."),
                ErrorOptions::code("gameday.output_too_large"),
            ));
        }
        Ok(Outcome::Exited(code, stdout)) => (code, stdout),
    };

    let stderr = match stderr_task {
        Some(task) => task.await.unwrap_or_default(),
        None => Vec::new(),
    };
    let stderr = String::from_utf8_lossy(&stderr);
    let stdout = String::from_utf8_lossy(&stdout);

    if code != Some(0) {
        return Err(bad_request_error(
            read_failure_message(&stderr),
            ErrorOptions::code("gameday.export_failed")
                .with_user_message(
                    "GameDay export failed. Please check the GameDay details and try again.",
                )
                .with_details(Value::String(read_output_tail(&stderr))),
        ));
    }

    let response_invalid = |cause: String| {
        internal_error(
            Some("Failed to read the GameDay export response."),
            ErrorOptions::code("gameday.response_invalid")
                .with_cause(cause)
                .with_details(Value::String(read_output_tail(&stdout))),
        )
    };
    let parsed: Value =
        serde_json::from_str(&stdout).map_err(|error| response_invalid(error.to_string()))?;
    if !is_gameday_export_output(&parsed) {
        return Err(response_invalid(
            "GameDay process returned an invalid response.".into(),
        ));
    }
    serde_json::from_value(parsed).map_err(|error| response_invalid(error.to_string()))
}

#[cfg(test)]
#[path = "run_export_process_tests.rs"]
mod tests;
