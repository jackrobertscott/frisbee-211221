//! `gameday-export`: the GameDay member exporter as a standalone process
//! (port of `server/src/gameday/exportCli.ts`). The server spawns it so a
//! headless browser never runs inside the server process.
//!
//! # Protocol
//!
//! - **stdin**: one JSON object, `TGamedayExportInput`
//!   ([`frisbee::gameday::types::GamedayExportInput`]), read to EOF:
//!   `{"startingUrl", "username", "password", "association", "competition"}`
//!   (required strings) plus optional `headless` (bool), `browserChannel`,
//!   `browserExecutablePath`, `reportId` (strings), `timeoutMs` (number),
//!   `debug` (bool), `fields`, `headers` (string arrays). It is validated by
//!   `parse_gameday_export_input` (the TS `parseGamedayExportInput`).
//! - **stdout**: on success only, the export as compact JSON with no trailing
//!   newline: `{"members":[{"teamName","firstName","lastName","email","gender"}]}`
//!   (`TGamedayExportOutput`). Nothing else is ever written to stdout.
//! - **stderr**: progress lines (`Opening GameDay...`, `Report status: ...`,
//!   `Exported N GameDay member row(s).`) and, on failure, a final line
//!   `GameDay export failed: <message>` — invalid JSON, a validation message
//!   such as `username is required.`, or the exporter's error.
//! - **exit code**: `0` on success, `1` on any failure. On `SIGTERM`, `SIGINT`
//!   or `SIGHUP` the browser is killed and the process exits with
//!   `128 + signal` (143, 130, 129), like Playwright's signal handlers.
//!
//! Settings not in the input come from the environment (`GAMEDAY_HEADLESS`,
//! `GAMEDAY_BROWSER_EXECUTABLE_PATH`, `GAMEDAY_TIMEOUT_MS`, ...; see
//! `frisbee::gameday::exporter::resolve_options`).

use std::io::Write;
use std::process::ExitCode;

use frisbee::gameday::export_cli::{CliOutcome, read_stdin, run};
use frisbee::gameday::exporter::export_gameday_members;

#[tokio::main]
async fn main() -> ExitCode {
    let work = async {
        match read_stdin(tokio::io::stdin()).await {
            Ok(text) => run(&text, export_gameday_members).await,
            Err(error) => CliOutcome {
                stdout: None,
                error: Some(format!("GameDay export failed: {error}")),
                exit_code: 1,
            },
        }
    };

    let outcome = tokio::select! {
        outcome = work => outcome,
        code = termination_signal() => {
            // dropping the export kills the browser (kill-on-drop) and
            // removes its temporary profile
            return ExitCode::from(code);
        }
    };

    if let Some(stdout) = &outcome.stdout {
        let mut out = std::io::stdout().lock();
        let _ = out.write_all(stdout.as_bytes());
        let _ = out.flush();
    }
    if let Some(error) = &outcome.error {
        frisbee::log::error(error.clone());
    }
    ExitCode::from(u8::try_from(outcome.exit_code).unwrap_or(1))
}

/// Resolves with the exit code for the first termination signal.
#[cfg(unix)]
async fn termination_signal() -> u8 {
    use tokio::signal::unix::{SignalKind, signal};
    let (Ok(mut term), Ok(mut int), Ok(mut hup)) = (
        signal(SignalKind::terminate()),
        signal(SignalKind::interrupt()),
        signal(SignalKind::hangup()),
    ) else {
        return std::future::pending().await;
    };
    tokio::select! {
        _ = term.recv() => 143,
        _ = int.recv() => 130,
        _ = hup.recv() => 129,
    }
}

#[cfg(not(unix))]
async fn termination_signal() -> u8 {
    let _ = tokio::signal::ctrl_c().await;
    130
}
