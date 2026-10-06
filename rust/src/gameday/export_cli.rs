//! Port of `server/src/gameday/exportCli.ts`: the logic of the
//! `gameday-export` binary (see `src/bin/gameday-export.rs` for the protocol).

use std::future::Future;

use tokio::io::{AsyncRead, AsyncReadExt};

use super::exporter::GamedayResult;
use super::types::{GamedayExportInput, GamedayExportOutput, parse_gameday_export_input};

/// What a CLI run produced.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliOutcome {
    /// Written to stdout as-is (no trailing newline): the export as JSON.
    pub stdout: Option<String>,
    /// Written to stderr as one line: `GameDay export failed: <message>`.
    pub error: Option<String>,
    /// The process exit code.
    pub exit_code: i32,
}

/// `readStdin()`: the whole of stdin as UTF-8 (invalid bytes become U+FFFD,
/// as Node's `setEncoding('utf8')` does).
pub async fn read_stdin(mut reader: impl AsyncRead + Unpin) -> std::io::Result<String> {
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// `main()`: parse the input, export, and report the result or the failure.
pub async fn run<F, Fut>(text: &str, export: F) -> CliOutcome
where
    F: FnOnce(GamedayExportInput) -> Fut,
    Fut: Future<Output = GamedayResult<GamedayExportOutput>>,
{
    let result = async {
        let parsed: serde_json::Value =
            serde_json::from_str(text).map_err(|error| error.to_string())?;
        let input = parse_gameday_export_input(&parsed)?;
        let output = export(input).await.map_err(|error| error.0)?;
        serde_json::to_string(&output).map_err(|error| error.to_string())
    }
    .await;
    match result {
        Ok(json) => CliOutcome {
            stdout: Some(json),
            error: None,
            exit_code: 0,
        },
        Err(message) => CliOutcome {
            stdout: None,
            error: Some(format!("GameDay export failed: {message}")),
            exit_code: 1,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gameday::exporter::GamedayError;
    use crate::gameday::types::GamedayExportMember;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    fn output() -> GamedayExportOutput {
        GamedayExportOutput {
            members: vec![GamedayExportMember {
                team_name: "Team".into(),
                first_name: "First".into(),
                last_name: "Last".into(),
                email: "first@example.com".into(),
                gender: "Male".into(),
            }],
        }
    }

    /// Runs the CLI against `stdin` chunks with an exporter that records its
    /// input and returns `result`.
    async fn run_cli(
        stdin: &[&str],
        result: GamedayResult<GamedayExportOutput>,
    ) -> (CliOutcome, Option<GamedayExportInput>) {
        let mut reader: Box<dyn AsyncRead + Unpin> = Box::new(tokio::io::empty());
        for chunk in stdin {
            reader = Box::new(reader.chain(std::io::Cursor::new(chunk.as_bytes().to_vec())));
        }
        let text = read_stdin(reader).await.unwrap();
        let called = Arc::new(Mutex::new(None));
        let recorder = called.clone();
        let outcome = run(&text, |input| async move {
            *recorder.lock().unwrap() = Some(input);
            result
        })
        .await;
        let input = called.lock().unwrap().take();
        (outcome, input)
    }

    mod export_cli {
        use super::*;

        #[tokio::test]
        async fn reads_the_input_from_stdin_and_writes_the_export_as_json() {
            let text = json!({
                "startingUrl": " https://example.com/ ",
                "username": "user",
                "password": " pass ",
                "association": "Assoc",
                "competition": "Comp",
                "headless": false,
            })
            .to_string();

            let (outcome, input) = run_cli(&[&text[..7], &text[7..]], Ok(output())).await;

            let input = input.expect("the exporter was called");
            assert_eq!(input.starting_url, "https://example.com/");
            assert_eq!(input.password, " pass ");
            assert_eq!(input.headless, Some(false));
            assert_eq!(
                outcome.stdout.as_deref(),
                Some(serde_json::to_string(&output()).unwrap().as_str())
            );
            assert_eq!(
                outcome.stdout.as_deref(),
                Some(
                    r#"{"members":[{"teamName":"Team","firstName":"First","lastName":"Last","email":"first@example.com","gender":"Male"}]}"#
                )
            );
            assert_eq!(outcome.error, None);
            assert_eq!(outcome.exit_code, 0);
        }

        #[tokio::test]
        async fn fails_with_exit_code_1_for_input_that_is_not_json() {
            let (outcome, input) = run_cli(&["not json"], Ok(output())).await;
            assert_eq!(outcome.stdout, None);
            assert!(
                outcome
                    .error
                    .as_deref()
                    .unwrap()
                    .starts_with("GameDay export failed: ")
            );
            assert_eq!(outcome.exit_code, 1);
            assert!(input.is_none());
        }

        #[tokio::test]
        async fn fails_with_the_validation_message_for_invalid_input() {
            let (outcome, _) = run_cli(
                &[&json!({"startingUrl": "x", "username": " "}).to_string()],
                Ok(output()),
            )
            .await;
            assert_eq!(
                outcome.error.as_deref(),
                Some("GameDay export failed: username is required.")
            );
            assert_eq!(outcome.exit_code, 1);
        }

        #[tokio::test]
        async fn reports_non_error_failures_from_the_exporter() {
            let (outcome, _) = run_cli(
                &[&json!({
                    "startingUrl": "x",
                    "username": "u",
                    "password": "p",
                    "association": "a",
                    "competition": "c",
                })
                .to_string()],
                Err(GamedayError("browser crashed".into())),
            )
            .await;
            assert_eq!(
                outcome.error.as_deref(),
                Some("GameDay export failed: browser crashed")
            );
            assert_eq!(outcome.stdout, None);
            assert_eq!(outcome.exit_code, 1);
        }
    }
}
