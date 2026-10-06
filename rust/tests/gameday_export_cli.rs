//! The `gameday-export` binary's process protocol: JSON in on stdin, JSON out
//! on stdout, `GameDay export failed: <message>` on stderr with exit code 1.
//! (The in-process behaviour is covered by `gameday::export_cli`'s tests.)

use std::io::Write;
use std::process::{Command, Stdio};

struct Run {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

fn run(stdin: &str) -> Run {
    let mut child = Command::new(env!("CARGO_BIN_EXE_gameday-export"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn gameday-export");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    Run {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    }
}

#[test]
fn fails_with_exit_code_1_for_input_that_is_not_json() {
    let result = run("not json");
    assert_eq!(result.code, Some(1));
    assert_eq!(result.stdout, "");
    assert!(
        result.stderr.starts_with("GameDay export failed: "),
        "{}",
        result.stderr
    );
}

#[test]
fn fails_with_the_validation_message_for_invalid_input() {
    let result = run(r#"{"startingUrl": "x", "username": " "}"#);
    assert_eq!(result.code, Some(1));
    assert_eq!(result.stdout, "");
    assert_eq!(
        result.stderr,
        "GameDay export failed: username is required.\n"
    );
}

#[test]
fn reports_exporter_failures_before_a_browser_starts() {
    let result = run(
        r#"{"startingUrl": "https://example.com/", "username": "u", "password": "p",
            "association": "a", "competition": "c", "browserExecutablePath": "/no/such/browser"}"#,
    );
    assert_eq!(result.code, Some(1));
    assert_eq!(result.stdout, "");
    assert_eq!(
        result.stderr.lines().last(),
        Some(
            "GameDay export failed: Configured browser executable was not found: /no/such/browser"
        )
    );
}
