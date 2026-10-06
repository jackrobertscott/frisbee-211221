//! Port of `server/src/gameday/exporter.test.ts`.

use super::*;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Mutex;

fn input() -> GamedayExportInput {
    GamedayExportInput {
        starting_url: "https://example.com/".into(),
        username: "user".into(),
        password: "pass".into(),
        association: "Assoc".into(),
        competition: "Comp".into(),
        ..Default::default()
    }
}

fn cwd() -> PathBuf {
    PathBuf::from("/work")
}

/// `resolveOptions` with `vi.stubEnv` values.
fn resolve_with_env(input: &GamedayExportInput, env: &[(&str, &str)]) -> ResolvedOptions {
    let env: HashMap<String, String> = env
        .iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect();
    resolve_options_with(input, &|key| env.get(key).cloned(), &cwd())
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

mod resolve_options {
    use super::*;

    #[test]
    fn uses_defaults_when_neither_input_nor_environment_set_a_value() {
        assert_eq!(
            resolve_with_env(&input(), &[]),
            ResolvedOptions {
                starting_url: "https://example.com/".into(),
                username: "user".into(),
                password: "pass".into(),
                association: "Assoc".into(),
                competition: "Comp".into(),
                headless: true,
                browser_channel: "chrome".into(),
                browser_executable_path: None,
                report_id: "3".into(),
                timeout_ms: 300_000.0,
                debug_dir: None,
                fields: vec![],
                headers: vec![],
                gender_field: None,
                record_filter: "DISTINCT".into(),
                normalize_headers: true,
            }
        );
    }

    #[test]
    fn reads_settings_from_the_environment_preferring_gameday_names() {
        let options = resolve_with_env(
            &input(),
            &[
                ("GAMEDAY_HEADLESS", "off"),
                ("HEADLESS", "true"),
                ("BROWSER_CHANNEL", "msedge"),
                ("CHROME_PATH", "/opt/chrome"),
                ("REPORT_ID", "7"),
                ("REPORT_TIMEOUT_MS", "1500"),
                ("FIELD_IDS", " a, ,b "),
                ("OUTPUT_HEADERS", "A,B"),
                ("GENDER_FIELD_ID", "intGenderX"),
                ("RECORD_FILTER", "ALL"),
                ("NORMALIZE_HEADERS", "N"),
                ("GAMEDAY_DEBUG", "yes"),
                ("GAMEDAY_DEBUG_DIR", "/tmp/gd"),
            ],
        );
        assert!(!options.headless);
        assert_eq!(options.browser_channel, "msedge");
        assert_eq!(
            options.browser_executable_path.as_deref(),
            Some("/opt/chrome")
        );
        assert_eq!(options.report_id, "7");
        assert_eq!(options.timeout_ms, 1500.0);
        assert_eq!(options.fields, strings(&["a", "b"]));
        assert_eq!(options.headers, strings(&["A", "B"]));
        assert_eq!(options.gender_field.as_deref(), Some("intGenderX"));
        assert_eq!(options.record_filter, "ALL");
        assert!(!options.normalize_headers);
        assert_eq!(options.debug_dir.as_deref(), Some("/tmp/gd"));
    }

    #[test]
    fn lets_input_win_over_the_environment() {
        let options = resolve_with_env(
            &GamedayExportInput {
                headless: Some(true),
                browser_channel: Some("bundled".into()),
                report_id: Some("9".into()),
                timeout_ms: Some(42.0),
                debug: Some(false),
                fields: Some(strings(&["inputField"])),
                headers: Some(strings(&["Input"])),
                ..input()
            },
            &[
                ("GAMEDAY_HEADLESS", "false"),
                ("GAMEDAY_TIMEOUT_MS", "1000"),
                ("GAMEDAY_FIELDS", "envField"),
                ("GAMEDAY_DEBUG", "true"),
            ],
        );
        assert!(options.headless);
        assert_eq!(options.browser_channel, "bundled");
        assert_eq!(options.report_id, "9");
        assert_eq!(options.timeout_ms, 42.0);
        assert_eq!(options.debug_dir, None);
        assert_eq!(options.fields, strings(&["inputField"]));
        assert_eq!(options.headers, strings(&["Input"]));
    }

    #[test]
    fn falls_back_from_empty_input_lists_to_the_environment() {
        let options = resolve_with_env(
            &GamedayExportInput {
                fields: Some(vec![]),
                headers: Some(vec![]),
                ..input()
            },
            &[("GAMEDAY_FIELDS", "x"), ("GAMEDAY_HEADERS", "X")],
        );
        assert_eq!(options.fields, strings(&["x"]));
        assert_eq!(options.headers, strings(&["X"]));
    }

    #[test]
    fn defaults_the_debug_directory_to_the_working_directory() {
        let options = resolve_with_env(
            &GamedayExportInput {
                debug: Some(true),
                ..input()
            },
            &[],
        );
        assert_eq!(
            options.debug_dir,
            Some(cwd().join("gameday-debug").to_string_lossy().into_owned())
        );
        // the real resolver uses the process working directory
        let real = resolve_options(&GamedayExportInput {
            debug: Some(true),
            ..input()
        });
        if std::env::var("GAMEDAY_DEBUG_DIR").is_err() {
            assert_eq!(
                real.debug_dir,
                Some(
                    std::env::current_dir()
                        .unwrap()
                        .join("gameday-debug")
                        .to_string_lossy()
                        .into_owned()
                )
            );
        }
    }

    #[test]
    fn ignores_an_invalid_timeout() {
        for value in ["abc", "-5", "0", "  "] {
            assert_eq!(
                resolve_with_env(&input(), &[("GAMEDAY_TIMEOUT_MS", value)]).timeout_ms,
                300_000.0,
                "{value:?}"
            );
        }
    }

    #[test]
    fn keeps_the_default_for_unrecognised_booleans() {
        let options = resolve_with_env(
            &input(),
            &[
                ("GAMEDAY_HEADLESS", "maybe"),
                ("GAMEDAY_NORMALIZE_HEADERS", ""),
            ],
        );
        assert!(options.headless);
        assert!(options.normalize_headers);
    }
}

/// `chromium.launch` mocked: records each call and returns scripted results.
struct FakeLauncher {
    results: Mutex<VecDeque<GamedayResult<&'static str>>>,
    fallback: GamedayResult<&'static str>,
    calls: Mutex<Vec<LaunchOptions>>,
}

impl FakeLauncher {
    fn new(
        results: Vec<GamedayResult<&'static str>>,
        fallback: GamedayResult<&'static str>,
    ) -> Self {
        FakeLauncher {
            results: Mutex::new(results.into()),
            fallback,
            calls: Mutex::new(Vec::new()),
        }
    }

    fn resolving() -> Self {
        Self::new(vec![], Ok("browser"))
    }

    fn calls(&self) -> Vec<LaunchOptions> {
        self.calls.lock().unwrap().clone()
    }
}

impl BrowserLauncher for FakeLauncher {
    type Browser = &'static str;

    fn launch(&self, options: LaunchOptions) -> BoxFuture<'_, GamedayResult<&'static str>> {
        self.calls.lock().unwrap().push(options);
        let result = self
            .results
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| self.fallback.clone());
        Box::pin(async move { result })
    }
}

mod launch_browser_tests {
    use super::*;

    #[tokio::test]
    async fn launches_an_explicit_executable_without_a_channel() {
        let launcher = FakeLauncher::resolving();
        let exe = std::env::current_exe()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let browser = launch_browser(
            &launcher,
            &file_exists,
            true,
            "chrome",
            Some(&format!("  {exe}  ")),
        )
        .await
        .unwrap();
        assert_eq!(browser, "browser");
        let calls = launcher.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].executable_path.as_deref(), Some(exe.as_str()));
        assert_eq!(calls[0].channel, None);
        assert!(calls[0].headless);
        assert!(
            calls[0]
                .args
                .contains(&"--disable-dev-shm-usage".to_string())
        );
    }

    #[tokio::test]
    async fn rejects_an_explicit_executable_that_does_not_exist() {
        let launcher = FakeLauncher::resolving();
        let error = launch_browser(
            &launcher,
            &file_exists,
            true,
            "chrome",
            Some("/no/such/browser"),
        )
        .await
        .unwrap_err();
        assert_eq!(
            error.0,
            "Configured browser executable was not found: /no/such/browser"
        );
        assert!(launcher.calls().is_empty());
    }

    #[tokio::test]
    async fn uses_a_common_install_path_when_one_exists() {
        let launcher = FakeLauncher::resolving();
        launch_browser(
            &launcher,
            &|path| path == "/usr/bin/google-chrome",
            false,
            "chrome",
            None,
        )
        .await
        .unwrap();
        let calls = launcher.calls();
        assert!(!calls[0].headless);
        assert_eq!(
            calls[0].executable_path.as_deref(),
            Some("/usr/bin/google-chrome")
        );
    }

    #[tokio::test]
    async fn falls_back_to_bundled_chromium_when_the_channel_cannot_launch() {
        let launcher = FakeLauncher::new(
            vec![Err("no chrome".into()), Ok("browser")],
            Err("unexpected".into()),
        );
        let browser = launch_browser(&launcher, &|_| false, true, "chrome", None)
            .await
            .unwrap();
        assert_eq!(browser, "browser");
        let calls = launcher.calls();
        assert_eq!(calls[0].channel.as_deref(), Some("chrome"));
        assert_eq!(calls[1].channel, None);
        assert_eq!(calls[1].executable_path, None);
    }

    #[tokio::test]
    async fn does_not_retry_the_bundled_browser_when_it_fails() {
        let launcher = FakeLauncher::new(vec![], Err("broken".into()));
        let error = launch_browser(&launcher, &|_| false, true, "bundled", None)
            .await
            .unwrap_err();
        assert_eq!(error.0, "broken");
        let calls = launcher.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].channel, None);
    }
}

mod read_competition_grid_data_items_tests {
    use super::*;
    use serde_json::json;

    fn page(griddata: &str) -> String {
        format!(
            "<script>var other = [1];\nvar griddata = {griddata};\nvar after = [\"x\"];</script>"
        )
    }

    #[test]
    fn reads_competitions_from_the_griddata_assignment() {
        let items = read_competition_grid_data_items(&page(
            &json!([
                {
                    "strTitle": " Mixed [A] &amp; \"B\" ",
                    "SelectLink": "main.cgi?a=C&amp;id=1&amp;amp;x=y",
                    "strSeasonName": "Summer",
                    "intFixtureType": 2,
                    "teams": 8,
                    "strAbbrev": "MXA",
                    "intRecStatus": 1,
                    "id": 55,
                },
                {"strTitle": "No link"},
                {"SelectLink": "no-title"},
                "not a record",
                {"strTitle": "Minimal", "SelectLink": "m", "strSeasonName": null},
            ])
            .to_string(),
        ));
        assert_eq!(
            items,
            vec![
                CompetitionListItem {
                    title: "Mixed [A] & \"B\"".into(),
                    // decoded exactly once
                    select_link: "main.cgi?a=C&id=1&amp;x=y".into(),
                    season_name: "Summer".into(),
                    fixture_type: "2".into(),
                    teams: "8".into(),
                    abbreviation: "MXA".into(),
                    status: "1".into(),
                    id: "55".into(),
                },
                CompetitionListItem {
                    title: "Minimal".into(),
                    select_link: "m".into(),
                    ..Default::default()
                },
            ]
        );
    }

    #[test]
    fn handles_escaped_quotes_and_brackets_inside_strings() {
        let items = read_competition_grid_data_items(&page(
            r#"[{"strTitle":"Quote \" ] [ end","SelectLink":"x\\"}]"#,
        ));
        let pairs: Vec<(String, String)> = items
            .into_iter()
            .map(|item| (item.title, item.select_link))
            .collect();
        assert_eq!(
            pairs,
            vec![("Quote \" ] [ end".to_string(), "x\\".to_string())]
        );
    }

    #[test]
    fn returns_nothing_for_unreadable_griddata() {
        for (label, content) in [
            ("no griddata assignment", "<html></html>"),
            ("a non-array assignment", r#"var griddata = {"a": 1};"#),
            (
                "an unterminated array",
                r#"var griddata = [{"strTitle": "x""#,
            ),
            ("invalid JSON", "var griddata = [{strTitle: 'x'}];"),
        ] {
            assert_eq!(read_competition_grid_data_items(content), vec![], "{label}");
        }
    }
}

fn competition(build: impl FnOnce(&mut CompetitionListItem)) -> CompetitionListItem {
    let mut item = CompetitionListItem::default();
    build(&mut item);
    item
}

mod competition_list_helpers {
    use super::*;

    #[test]
    fn dedupes_by_title_and_link_only() {
        let items = vec![
            competition(|c| {
                c.title = "A".into();
                c.select_link = "1".into();
                c.id = "first".into();
            }),
            competition(|c| {
                c.title = "A".into();
                c.select_link = "1".into();
                c.id = "second".into();
            }),
            competition(|c| {
                c.title = "A".into();
                c.select_link = "2".into();
            }),
            competition(|c| {
                c.title = "B".into();
                c.select_link = "1".into();
            }),
        ];
        let deduped: Vec<(String, String, String)> = dedupe_competition_list_items(items)
            .into_iter()
            .map(|i| (i.title, i.select_link, i.id))
            .collect();
        assert_eq!(
            deduped,
            vec![
                ("A".into(), "1".into(), "first".into()),
                ("A".into(), "2".into(), "".into()),
                ("B".into(), "1".into(), "".into()),
            ]
        );
    }

    #[test]
    fn prefers_an_exact_title_or_abbreviation_match_over_a_partial_one() {
        let items = vec![
            competition(|c| {
                c.title = "Mixed League Division 2".into();
                c.select_link = "partial".into();
            }),
            competition(|c| {
                c.title = "Mixed  League".into();
                c.select_link = "exact".into();
            }),
            competition(|c| {
                c.title = "Other".into();
                c.abbreviation = "ML".into();
                c.select_link = "abbrev".into();
            }),
        ];
        let link =
            |name: &str| find_competition_list_item(&items, name).map(|i| i.select_link.clone());
        assert_eq!(link(" mixed+league ").as_deref(), Some("exact"));
        assert_eq!(link("ml").as_deref(), Some("abbrev"));
        assert_eq!(link("division").as_deref(), Some("partial"));
        assert_eq!(link("missing"), None);
    }

    #[test]
    fn formats_at_most_twenty_competitions_for_errors() {
        assert_eq!(format_competition_list_for_error(&[]), "");
        assert_eq!(
            format_competition_list_for_error(&[
                competition(|c| {
                    c.title = "A".into();
                    c.season_name = "2024".into();
                }),
                competition(|c| c.title = "B".into()),
            ]),
            " Available competitions: A (2024); B."
        );
        let many: Vec<CompetitionListItem> = (0..23)
            .map(|index| competition(|c| c.title = format!("C{index}")))
            .collect();
        let message = format_competition_list_for_error(&many);
        assert!(message.contains("C19; and 3 more."));
        assert!(!message.contains("C20"));
    }

    #[test]
    fn decodes_the_html_entities_gameday_uses() {
        assert_eq!(
            decode_html_entities("&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; co"),
            "<a href=\"x\">Tom's & co"
        );
    }

    #[test]
    fn decodes_entities_in_a_single_pass() {
        assert_eq!(
            decode_html_entities("&amp;lt;b&amp;gt; &amp;amp; &amp;#39;"),
            "&lt;b&gt; &amp; &#39;"
        );
        assert_eq!(
            decode_html_entities("a &unknown; &amp b"),
            "a &unknown; &amp b"
        );
    }
}

fn field(id: &str, label: &str) -> AvailableField {
    AvailableField {
        id: id.into(),
        label: label.into(),
        selected: false,
    }
}

fn default_fields() -> Vec<AvailableField> {
    vec![
        field("strTeamName", "Team Name"),
        field("strFirstname", "First Name"),
        field("strSurname", "Family Name"),
        field("strEmail", "Email"),
        field("strGender", "Gender"),
    ]
}

fn field_options(overrides: impl FnOnce(&mut ResolvedOptions)) -> ResolvedOptions {
    let mut options = resolve_with_env(&input(), &[]);
    overrides(&mut options);
    options
}

fn resolved(id: &str, header: &str, source_label: &str) -> ResolvedField {
    ResolvedField {
        id: id.into(),
        header: header.into(),
        source_label: source_label.into(),
    }
}

mod resolve_fields_tests {
    use super::*;

    #[test]
    fn resolves_the_default_fields_by_their_preferred_ids() {
        assert_eq!(
            resolve_fields(&default_fields(), &field_options(|_| {})).unwrap(),
            vec![
                resolved("strTeamName", "Team Name", "Team Name"),
                resolved("strFirstname", "First Name", "First Name"),
                resolved("strSurname", "Family Name", "Family Name"),
                resolved("strEmail", "Email", "Email"),
                resolved("strGender", "Gender", "Gender"),
            ]
        );
    }

    #[test]
    fn falls_back_to_matching_labels_and_skips_parent_or_guardian_genders() {
        let fields = vec![
            field("t", "Team+Name"),
            field("f", " first   name "),
            field("l", "FAMILY NAME"),
            field("e", "Email"),
            field("pg", "Parent/Guardian 1 Gender"),
            field("g2", "Member Gender Identity"),
        ];
        let ids: Vec<String> = resolve_fields(&fields, &field_options(|_| {}))
            .unwrap()
            .into_iter()
            .map(|i| i.id)
            .collect();
        assert_eq!(ids, strings(&["t", "f", "l", "e", "g2"]));
    }

    #[test]
    fn prefers_a_configured_gender_field_id() {
        let mut fields = default_fields();
        fields.push(field("intGenderX", "Custom"));
        let resolved_fields = resolve_fields(
            &fields,
            &field_options(|o| o.gender_field = Some("intGenderX".into())),
        )
        .unwrap();
        assert_eq!(
            resolved_fields.last(),
            Some(&resolved("intGenderX", "Gender", "Custom"))
        );
    }

    #[test]
    fn lists_gender_candidates_when_gender_cannot_be_resolved() {
        let mut fields: Vec<AvailableField> = default_fields().into_iter().take(4).collect();
        fields.push(field("pg", "Parent Gender"));
        assert_eq!(
            resolve_fields(&fields, &field_options(|_| {}))
                .unwrap_err()
                .0,
            "Could not resolve GameDay field for \"Gender\". Gender candidates: pg (Parent Gender)."
        );
        let four: Vec<AvailableField> = default_fields().into_iter().take(4).collect();
        assert!(
            resolve_fields(&four, &field_options(|_| {}))
                .unwrap_err()
                .0
                .contains("Gender candidates: none.")
        );
    }

    #[test]
    fn does_not_list_gender_candidates_for_other_missing_fields() {
        let fields: Vec<AvailableField> = default_fields().into_iter().skip(1).collect();
        assert_eq!(
            resolve_fields(&fields, &field_options(|_| {}))
                .unwrap_err()
                .0,
            "Could not resolve GameDay field for \"Team Name\"."
        );
    }

    #[test]
    fn renames_default_fields_with_configured_headers_of_the_same_count() {
        let headers = strings(&["T", "F", "L", "E", "G"]);
        let renamed: Vec<String> = resolve_fields(
            &default_fields(),
            &field_options(|o| o.headers = headers.clone()),
        )
        .unwrap()
        .into_iter()
        .map(|i| i.header)
        .collect();
        assert_eq!(renamed, headers);
        assert_eq!(
            resolve_fields(
                &default_fields(),
                &field_options(|o| o.headers = strings(&["T"]))
            )
            .unwrap_err()
            .0,
            "The configured GameDay header count must match the default field count."
        );
    }

    #[test]
    fn uses_configured_field_ids_with_their_labels_as_headers() {
        assert_eq!(
            resolve_fields(
                &default_fields(),
                &field_options(|o| o.fields = strings(&["strEmail", "strTeamName"]))
            )
            .unwrap(),
            vec![
                resolved("strEmail", "Email", "Email"),
                resolved("strTeamName", "Team Name", "Team Name"),
            ]
        );
        assert_eq!(
            resolve_fields(
                &default_fields(),
                &field_options(|o| {
                    o.fields = strings(&["strEmail"]);
                    o.headers = strings(&["Mail"]);
                })
            )
            .unwrap(),
            vec![resolved("strEmail", "Mail", "Email")]
        );
    }

    #[test]
    fn rejects_unknown_configured_field_ids_and_mismatched_headers() {
        assert_eq!(
            resolve_fields(
                &default_fields(),
                &field_options(|o| o.fields = strings(&["strEmail", "x", "y"]))
            )
            .unwrap_err()
            .0,
            "Configured GameDay field id(s) were not found: x, y"
        );
        assert_eq!(
            resolve_fields(
                &default_fields(),
                &field_options(|o| {
                    o.fields = strings(&["strEmail"]);
                    o.headers = strings(&["A", "B"]);
                })
            )
            .unwrap_err()
            .0,
            "The configured GameDay header count must match the field count."
        );
    }
}

fn member(team: &str, first: &str, last: &str, email: &str, gender: &str) -> GamedayExportMember {
    GamedayExportMember {
        team_name: team.into(),
        first_name: first.into(),
        last_name: last.into(),
        email: email.into(),
        gender: gender.into(),
    }
}

mod parse_member_rows_tests {
    use super::*;

    fn parse(text: &str) -> GamedayResult<Vec<GamedayExportMember>> {
        parse_member_rows(text.as_bytes())
    }

    #[test]
    fn maps_alternative_header_names_and_trims_values() {
        let members = parse(concat!(
            "\u{FEFF}Team,Given Name,Surname,E-mail Address,Gender\n",
            " Alpha , Ann ,Lee, ann@example.com ,F\n",
            ",,,,\n",
            "\"Beta, Inc\",Bob,\"O\"\"Neil\",bob@example.com,M\r\n",
            "\"1,234 rows\",,,,\n",
        ))
        .unwrap();
        assert_eq!(
            members,
            vec![
                member("Alpha", "Ann", "Lee", "ann@example.com", "F"),
                member("Beta, Inc", "Bob", "O\"Neil", "bob@example.com", "M"),
            ]
        );
    }

    #[test]
    fn only_drops_a_summary_row_at_the_end() {
        let members = parse(concat!(
            "Team Name,First Name,Family Name,Email,Gender\n",
            "3 rows,,,,\n",
            "A,B,C,d@example.com,F\n",
        ))
        .unwrap();
        let teams: Vec<String> = members.into_iter().map(|m| m.team_name).collect();
        assert_eq!(teams, strings(&["3 rows", "A"]));
    }

    #[test]
    fn keeps_a_final_row_with_more_than_one_value() {
        let members =
            parse("Team Name,First Name,Family Name,Email,Gender\n2 rows,X,,,\n").unwrap();
        assert_eq!(members.len(), 1);
    }

    #[test]
    fn drops_rows_whose_member_fields_are_all_blank() {
        let members =
            parse("Team Name,First Name,Family Name,Email,Gender,Extra\n,,,,,note\n").unwrap();
        assert_eq!(members, vec![]);
    }

    #[test]
    fn returns_nothing_for_an_empty_export() {
        assert_eq!(parse("").unwrap(), vec![]);
        assert_eq!(parse("\n\n").unwrap(), vec![]);
        assert_eq!(parse("5 rows\n").unwrap(), vec![]);
    }

    #[test]
    fn falls_back_to_column_order_when_headers_are_unrecognised() {
        assert_eq!(
            parse("a,b,c,d,e\nT,F,L,E,G\n").unwrap(),
            vec![member("T", "F", "L", "E", "G")]
        );
    }

    #[test]
    fn fails_when_a_column_is_missing_and_there_are_too_few_columns() {
        assert_eq!(
            parse("Team Name,First Name,Family Name,Email\nT,F,L,E\n")
                .unwrap_err()
                .0,
            "GameDay export was missing a required column (gender)."
        );
    }
}

fn response(body: &str, status: u16, content_type: &str) -> ReportResponse {
    ReportResponse {
        status,
        headers: vec![("content-type".into(), content_type.into())],
        body: body.as_bytes().to_vec(),
    }
}

fn ok(body: &str) -> ReportResponse {
    response(body, 200, "text/csv")
}

fn report_request() -> ReportRequest {
    ReportRequest {
        action: "https://gameday.test/main.cgi".into(),
        body: "a=1&b=2".into(),
        client: "client-token".into(),
        selected_ids: strings(&["strEmail"]),
        job_id: "job-1".into(),
    }
}

/// `context.request` mocked: status polls pop `statuses` (then `Queued`),
/// the download returns `download`, the report post fails with `post_error`.
struct FakeRequestContext {
    statuses: Mutex<VecDeque<ReportResponse>>,
    download: ReportResponse,
    post_error: Option<String>,
    gets: Mutex<Vec<(String, ReportGetOptions)>>,
    posts: Mutex<Vec<(String, ReportPostOptions)>>,
}

impl FakeRequestContext {
    fn new(statuses: Vec<ReportResponse>) -> Self {
        FakeRequestContext {
            statuses: Mutex::new(statuses.into()),
            download: ok("csv-body"),
            post_error: None,
            gets: Mutex::new(Vec::new()),
            posts: Mutex::new(Vec::new()),
        }
    }

    fn gets(&self) -> Vec<(String, ReportGetOptions)> {
        self.gets.lock().unwrap().clone()
    }
}

fn param<'a>(options: &'a ReportGetOptions, name: &str) -> Option<&'a str> {
    options
        .params
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.as_str())
}

impl ReportRequestContext for FakeRequestContext {
    fn get(
        &self,
        url: String,
        options: ReportGetOptions,
    ) -> BoxFuture<'_, GamedayResult<ReportResponse>> {
        let downloading = param(&options, "format") == Some("downloading");
        self.gets.lock().unwrap().push((url, options));
        let result = if downloading {
            self.download.clone()
        } else {
            self.statuses
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or_else(|| ok(r#"{"status":"Queued"}"#))
        };
        Box::pin(async move { Ok(result) })
    }

    fn post(&self, url: String, options: ReportPostOptions) -> BoxFuture<'_, GamedayResult<()>> {
        self.posts.lock().unwrap().push((url, options));
        let result = match &self.post_error {
            Some(error) => Err(GamedayError(error.clone())),
            None => Ok(()),
        };
        Box::pin(async move { result })
    }
}

/// The report tests log `Report status:` lines; one at a time keeps a
/// capture free of the others' lines.
static REPORT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn run_report(
    context: FakeRequestContext,
    timeout_ms: f64,
) -> (GamedayResult<Vec<u8>>, Arc<FakeRequestContext>) {
    let context = Arc::new(context);
    let result = run_report_and_download(context.clone(), &report_request(), timeout_ms).await;
    (result, context)
}

mod run_report_and_download_tests {
    use super::*;
    use crate::log::Level;

    #[tokio::test(start_paused = true)]
    async fn posts_the_report_polls_until_complete_and_downloads_the_csv() {
        let _lock = REPORT_LOCK.lock().await;
        let capture = crate::log::capture();
        let (result, context) = run_report(
            FakeRequestContext::new(vec![
                ok(r#"{"status":"Queued"}"#),
                ok(r#"{"status":"Queued"}"#),
                ok(r#"{"status":"Running"}"#),
                ok(r#"{"status":"Complete"}"#),
            ]),
            60_000.0,
        )
        .await;
        assert_eq!(String::from_utf8(result.unwrap()).unwrap(), "csv-body");

        assert_eq!(
            context.posts.lock().unwrap().clone(),
            vec![(
                report_request().action,
                ReportPostOptions {
                    headers: vec![(
                        "Content-Type".into(),
                        "application/x-www-form-urlencoded".into()
                    )],
                    data: report_request().body,
                    timeout_ms: 60_000.0,
                }
            )]
        );
        let gets = context.gets();
        assert_eq!(gets.len(), 5);
        assert_eq!(
            gets[0],
            (
                report_request().action,
                ReportGetOptions {
                    params: vec![
                        ("a".into(), "REP_STATUS".into()),
                        ("jobID".into(), "job-1".into()),
                        ("client".into(), "client-token".into()),
                        ("ajax".into(), "1".into()),
                        ("format".into(), "download".into()),
                    ],
                    timeout_ms: 30_000.0,
                }
            )
        );
        assert_eq!(param(&gets[4].1, "format"), Some("downloading"));
        // each status change is logged once
        let logged: Vec<String> = capture
            .lines(Level::Error)
            .into_iter()
            .filter(|line| line.starts_with("Report status:"))
            .collect();
        assert_eq!(
            logged,
            strings(&[
                "Report status: Queued",
                "Report status: Running",
                "Report status: Complete",
            ])
        );
    }

    #[tokio::test(start_paused = true)]
    async fn reports_a_failed_report_request_once_the_job_completes() {
        let _lock = REPORT_LOCK.lock().await;
        let mut context = FakeRequestContext::new(vec![ok(r#"{"status":"Complete"}"#)]);
        context.post_error = Some("socket hang up".into());
        let (result, _) = run_report(context, 60_000.0).await;
        assert_eq!(
            result.unwrap_err().0,
            "The GameDay report request failed: socket hang up"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn fails_when_gameday_reports_the_job_failed() {
        let _lock = REPORT_LOCK.lock().await;
        let (result, _) = run_report(
            FakeRequestContext::new(vec![ok(r#"{"status":"Failed"}"#)]),
            60_000.0,
        )
        .await;
        assert_eq!(
            result.unwrap_err().0,
            "GameDay reported that the export job failed."
        );
    }

    #[tokio::test(start_paused = true)]
    async fn fails_on_a_non_json_status_response() {
        let _lock = REPORT_LOCK.lock().await;
        let body = format!("<html>{}", "x".repeat(300));
        let (result, _) = run_report(
            FakeRequestContext::new(vec![response(&body, 502, "text/csv")]),
            60_000.0,
        )
        .await;
        let message = result.unwrap_err().0;
        assert_eq!(
            message,
            format!(
                "GameDay returned a non-JSON report status response (502): <html>{}",
                "x".repeat(244)
            )
        );
    }

    #[tokio::test(start_paused = true)]
    async fn times_out_when_the_status_never_completes() {
        let _lock = REPORT_LOCK.lock().await;
        let (result, context) = run_report(
            FakeRequestContext::new((0..20).map(|_| ok(r#"{"other":true}"#)).collect()),
            10_000.0,
        )
        .await;
        assert_eq!(
            result.unwrap_err().0,
            "Timed out waiting for GameDay report after 10 seconds."
        );
        let gets = context.gets();
        assert!(gets.len() > 1);
        assert!(
            gets.iter()
                .all(|(_, options)| param(options, "format") == Some("download"))
        );
    }

    #[tokio::test(start_paused = true)]
    async fn fails_when_the_download_is_not_successful() {
        let _lock = REPORT_LOCK.lock().await;
        let mut context = FakeRequestContext::new(vec![ok(r#"{"status":"Complete"}"#)]);
        context.download = response("Server error", 500, "text/csv");
        let (result, _) = run_report(context, 60_000.0).await;
        assert_eq!(
            result.unwrap_err().0,
            "CSV download failed with HTTP 500: Server error"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn rejects_an_html_page_instead_of_a_csv() {
        let _lock = REPORT_LOCK.lock().await;
        let mut context = FakeRequestContext::new(vec![ok(r#"{"status":"Complete"}"#)]);
        context.download = response("  <html>login</html>", 200, "text/html; charset=utf-8");
        let (result, _) = run_report(context, 60_000.0).await;
        assert_eq!(
            result.unwrap_err().0,
            "CSV download looked like HTML instead of CSV:   <html>login</html>"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn accepts_csv_content_even_when_labelled_as_html() {
        let _lock = REPORT_LOCK.lock().await;
        let mut context = FakeRequestContext::new(vec![ok(r#"{"status":"Complete"}"#)]);
        context.download = response("a,b\n1,2\n", 200, "text/html");
        let (result, _) = run_report(context, 60_000.0).await;
        assert_eq!(String::from_utf8(result.unwrap()).unwrap(), "a,b\n1,2\n");
    }
}

mod helpers {
    use super::*;

    #[test]
    fn generates_v4_uuids() {
        let id = random_uuid();
        let re =
            Regex::new(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
                .unwrap();
        assert!(re.is_match(&id), "{id}");
        assert_ne!(random_uuid(), id);
    }

    #[test]
    fn escapes_regex_metacharacters_like_the_ts_helper() {
        assert_eq!(escape_regex("A.B (C) [D] $1+"), r"A\.B \(C\) \[D\] \$1\+");
    }

    #[test]
    fn resolves_relative_links_against_the_page() {
        assert_eq!(
            resolve_url("main.cgi?a=CO_L", "https://m.test/x/main.cgi?client=1").unwrap(),
            "https://m.test/x/main.cgi?a=CO_L"
        );
    }
}
