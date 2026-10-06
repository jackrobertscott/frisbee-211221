//! Port of `server/src/gameday/runExportProcess.test.ts`. The TS tests
//! mocked `spawn` with a fake child; these run fake CLI scripts instead.

use super::*;
use crate::testing::TestDir;
use serde_json::json;

fn input() -> GamedayExportInput {
    GamedayExportInput {
        starting_url: "https://example.com/".into(),
        username: "user".into(),
        password: "secret".into(),
        association: "Assoc".into(),
        competition: "Comp".into(),
        ..Default::default()
    }
}

fn output() -> Value {
    json!({
        "members": [{
            "teamName": "Team",
            "firstName": "First",
            "lastName": "Last",
            "email": "first@example.com",
            "gender": "Female",
        }]
    })
}

/// A fake exporter: a shell script with `body`, run with `env`.
fn fake_cli(dir: &TestDir, body: &str, env: Vec<(String, String)>, timeout_ms: u64) -> CliCommand {
    let script = dir.path().join("fake-export.sh");
    std::fs::write(&script, format!("#!/bin/sh\n{body}\n")).unwrap();
    CliCommand {
        command: PathBuf::from("/bin/sh"),
        args: vec![script.to_string_lossy().into_owned()],
        cwd: Some(dir.path().to_path_buf()),
        env,
        timeout_ms,
    }
}

fn path_env() -> Vec<(String, String)> {
    vec![("PATH".into(), std::env::var("PATH").unwrap_or_default())]
}

fn cli(dir: &TestDir, body: &str) -> CliCommand {
    fake_cli(dir, body, path_env(), DEFAULT_PROCESS_TIMEOUT_MS)
}

async fn run(cli: &CliCommand) -> AppResult<GamedayExportOutput> {
    run_gameday_export_command(cli, &input()).await
}

fn quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

mod run_gameday_export_process {
    use super::*;

    #[tokio::test]
    async fn runs_the_cli_sends_the_input_and_parses_the_output() {
        let dir = TestDir::new();
        let text = output().to_string();
        let (first, rest) = text.split_at(10);
        let cli = cli(
            &dir,
            &format!(
                "cat > stdin.json\nprintf '%s' {}\necho 'Opening GameDay...' >&2\nprintf '%s' {}",
                quoted(first),
                quoted(rest)
            ),
        );
        let result = run(&cli).await.unwrap();
        assert_eq!(serde_json::to_value(result).unwrap(), output());
        let sent: Value =
            serde_json::from_str(&std::fs::read_to_string(dir.path().join("stdin.json")).unwrap())
                .unwrap();
        assert_eq!(sent, serde_json::to_value(input()).unwrap());
    }

    #[test]
    fn resolves_the_exporter_next_to_the_server_or_from_the_override() {
        let dir = TestDir::new();
        let bin = format!("{EXPORT_BIN_NAME}{}", std::env::consts::EXE_SUFFIX);
        let server = dir.path().join("frisbee-server");
        assert_eq!(resolve_cli_command(None, &server), dir.path().join(&bin));
        assert_eq!(
            resolve_cli_command(Some("  "), &server),
            dir.path().join(&bin)
        );
        assert_eq!(
            resolve_cli_command(Some("/opt/gameday-export"), &server),
            PathBuf::from("/opt/gameday-export")
        );
        // test binaries live in target/<profile>/deps
        let deps = dir.path().join("deps");
        std::fs::create_dir_all(&deps).unwrap();
        assert_eq!(
            resolve_cli_command(None, &deps.join("port-1234")),
            dir.path().join(&bin)
        );
        std::fs::write(deps.join(&bin), "").unwrap();
        assert_eq!(
            resolve_cli_command(None, &deps.join("port-1234")),
            deps.join(&bin)
        );
    }

    #[tokio::test]
    async fn does_not_pass_server_secrets_to_the_child_process() {
        let vars = [
            ("JWT_SECRET", "jwt"),
            ("MONGODB_URI", "mongodb://secret"),
            ("SES_ACCESS_KEY_ID", "key"),
            ("SES_SECRET_ACCESS_KEY", "secret"),
            ("GAMEDAY_HEADLESS", "false"),
            ("APP_NAME", "Frisbee Test"),
        ]
        .map(|(k, v)| (k.to_string(), v.to_string()));
        let mut env = read_child_env(vars);
        env.extend(path_env());
        let dir = TestDir::new();
        let cli = fake_cli(
            &dir,
            &format!(
                "env > env.txt\nprintf '%s' {}",
                quoted(&output().to_string())
            ),
            env,
            DEFAULT_PROCESS_TIMEOUT_MS,
        );
        run(&cli).await.unwrap();
        let seen = std::fs::read_to_string(dir.path().join("env.txt")).unwrap();
        let lines: Vec<&str> = seen.lines().collect();
        assert!(lines.contains(&"GAMEDAY_HEADLESS=false"));
        assert!(lines.contains(&"APP_NAME=Frisbee Test"));
        for key in CHILD_ENV_EXCLUDED_KEYS {
            assert!(
                !lines
                    .iter()
                    .any(|line| line.starts_with(&format!("{key}="))),
                "{key} was passed"
            );
        }
    }

    #[tokio::test]
    async fn reports_the_last_lines_of_stderr_when_the_process_fails() {
        let dir = TestDir::new();
        let lines: Vec<String> = (1..=15).map(|i| format!("line {i}")).collect();
        let cli = cli(
            &dir,
            &format!(
                "printf '%s\\n\\n   \\n' {} >&2\nexit 1",
                quoted(&lines.join("\r\n"))
            ),
        );
        let error = run(&cli).await.unwrap_err();
        let tail = lines[3..].join("\n");
        assert_eq!(error.message, format!("GameDay export failed. {tail}"));
        assert_eq!(error.error_code, "gameday.export_failed");
        assert_eq!(error.status_code, 400);
        assert_eq!(error.details, Some(Value::String(tail)));
    }

    #[tokio::test]
    async fn uses_a_plain_message_when_a_failed_process_wrote_nothing() {
        let dir = TestDir::new();
        // killed by a signal: no exit code, like `close` with `null`
        let error = run(&cli(&dir, "kill -9 $$")).await.unwrap_err();
        assert_eq!(error.message, "GameDay export failed.");
        assert_eq!(error.error_code, "gameday.export_failed");
    }

    async fn rejects_on_stdout(stdout: &str) {
        let dir = TestDir::new();
        let error = run(&cli(&dir, &format!("printf '%s' {}", quoted(stdout))))
            .await
            .unwrap_err();
        assert_eq!(error.error_code, "gameday.response_invalid");
        assert_eq!(error.status_code, 500);
        assert_eq!(error.details, Some(Value::String(stdout.to_string())));
    }

    #[tokio::test]
    async fn rejects_invalid_json_on_stdout() {
        rejects_on_stdout("not json").await;
    }

    #[tokio::test]
    async fn rejects_an_unexpected_shape_on_stdout() {
        rejects_on_stdout(&json!({"members": [{"teamName": "x"}]}).to_string()).await;
    }

    #[tokio::test]
    async fn reports_a_process_that_cannot_start() {
        let dir = TestDir::new();
        let cli = CliCommand {
            command: dir.path().join("missing-export"),
            ..cli(&dir, "")
        };
        let error = run(&cli).await.unwrap_err();
        assert_eq!(error.error_code, "gameday.process_start_failed");
        assert!(error.cause.is_some());
    }

    #[tokio::test]
    async fn kills_the_process_when_it_runs_past_the_timeout() {
        let dir = TestDir::new();
        let cli = fake_cli(
            &dir,
            "trap 'echo term > term.txt; exit 143' TERM\nsleep 5 &\nwait",
            path_env(),
            300,
        );
        let started = std::time::Instant::now();
        let error = run(&cli).await.unwrap_err();
        assert!(started.elapsed() >= Duration::from_millis(300));
        assert!(started.elapsed() < Duration::from_secs(4));
        assert_eq!(error.error_code, "gameday.export_timeout");
        assert_eq!(error.status_code, 503);
        // the child got SIGTERM
        let marker = dir.path().join("term.txt");
        for _ in 0..50 {
            if marker.exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(marker.exists());
    }

    #[test]
    fn falls_back_to_the_default_timeout() {
        for value in ["", "nope", "-1"] {
            assert_eq!(
                read_process_timeout_ms(Some(value), None),
                DEFAULT_PROCESS_TIMEOUT_MS,
                "{value:?}"
            );
        }
        assert_eq!(read_process_timeout_ms(None, None), 10 * 60 * 1000);
        assert_eq!(read_process_timeout_ms(Some("5000"), None), 5000);
    }

    #[test]
    fn uses_the_scraper_timeout_when_no_process_timeout_is_set() {
        assert_eq!(read_process_timeout_ms(None, Some("2000")), 2000);
        // a set (even invalid) process timeout wins, like `??`
        assert_eq!(
            read_process_timeout_ms(Some("nope"), Some("2000")),
            DEFAULT_PROCESS_TIMEOUT_MS
        );
    }

    #[tokio::test]
    async fn kills_the_process_when_stdout_grows_too_large() {
        let dir = TestDir::new();
        let cli = cli(
            &dir,
            &format!(
                "trap 'echo term > term.txt; exit 143' TERM\nhead -c {} /dev/zero | tr '\\0' x\nsleep 5 &\nwait",
                MAX_OUTPUT_LENGTH + 1
            ),
        );
        let error = run(&cli).await.unwrap_err();
        assert_eq!(error.error_code, "gameday.output_too_large");
        let marker = dir.path().join("term.txt");
        for _ in 0..100 {
            if marker.exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(marker.exists());
    }
}
