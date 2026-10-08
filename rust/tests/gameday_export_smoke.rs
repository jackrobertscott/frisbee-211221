//! A real-browser smoke test of the GameDay exporter (ignored by default: it
//! needs a local Chrome/Chromium). Run with
//! `cargo test --test gameday_export_smoke -- --ignored --nocapture`.
//!
//! Chrome runs the whole export. Requests to `membership.mygameday.app` are
//! intercepted (CDP `Fetch`) and answered with fixture pages, so the GameDay
//! site is never contacted; the report form posts to a local HTTP server,
//! which the exporter's cookie-carrying request context polls and downloads
//! the CSV from.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use base64::Engine;
use frisbee::gameday::browser::ChromePage;
use frisbee::gameday::exporter::{ExportHooks, GamedayResult, export_gameday_members_with};
use frisbee::gameday::types::{GamedayExportInput, GamedayExportMember};
use futures_util::future::BoxFuture;
use serde_json::json;

#[derive(Default)]
struct Recorded {
    browser_urls: Vec<String>,
    report_posts: Vec<String>,
    status_cookies: Vec<String>,
}

type Shared = Arc<Mutex<Recorded>>;

fn fixture(url: &str, report_origin: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let query: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
    let page = |body: &str| {
        format!(
            "<!doctype html><html><head><title>GameDay</title></head><body>{body}</body></html>"
        )
    };
    let html = match (parsed.path(), query.get("a").map(String::as_str)) {
        ("/login/", _) => page(
            r#"<form action="/home.cgi" method="get">
                 <input name="email" type="email"> <input name="password" type="password">
                 <input type="submit" value="Login">
               </form>
               <script>setTimeout(() => { window.grecaptcha = {execute() {}} }, 300)</script>"#,
        ),
        ("/home.cgi", _) => page("<p>Welcome</p>"),
        ("/authlist.cgi", _) => page(
            r#"<a href="/elsewhere">Another Association</a>
               <a class="org-list-entry" href="/main.cgi?client=ASSOC">  Frisbee   Association </a>"#,
        ),
        ("/main.cgi", None) => page(
            r#"<a id="menu_listcompetitions" href="main.cgi?client=ASSOC&amp;a=CO_L">List Competitions</a>"#,
        ),
        ("/main.cgi", Some("CO_L")) => page(
            r#"<label for="season">Season</label>
               <select id="season" name="season">
                 <option value="2024" selected>2024</option>
                 <option value="-1">All Seasons</option>
               </select>
               <script>var griddata = [{"strTitle":"Mixed League","SelectLink":"main.cgi?client=COMP&amp;a=C_HOME","strSeasonName":"2024","id":7}];</script>"#,
        ),
        ("/main.cgi", Some("C_HOME")) => page("<h1>Mixed League</h1>"),
        ("/main.cgi", Some("REP_CONFIG"))
            if query.get("client").map(String::as_str) == Some("COMP") =>
        {
            let field = |id: &str, label: &str| {
                format!(
                    r#"<li><div class="RO_fieldblock" id="fld_{id}"><span class="RO_fieldname">{label}</span></div></li>"#
                )
            };
            page(&format!(
                r##"<form id="reportform" action="{report_origin}/report.cgi" method="post">
                     <input type="hidden" name="client" value="COMP">
                     <input type="hidden" name="ROselectedfieldlist" id="ROselectedfieldlist" value="">
                     <div id="hide_search"></div><div id="search_results"></div>
                     <div id="ROselectedfields"><ul id="ROselectedfields-list">
                       <li><div class="RO_fieldblock" id="fld_strNotes"><span class="RO_fieldname">Notes</span>
                         <span class="RO_remove"><a href="#" onclick="removefield('fld_strNotes','pool')">x</a></span></div></li>
                     </ul></div>
                     <ul id="pool">{}{}{}{}{}</ul>
                     <input type="radio" name="RO_RecordFilter" value="DISTINCT">
                     <input type="radio" name="RO_RecordFilter" value="ALL" checked>
                     <input type="radio" name="RO_OutputType" value="display" checked>
                     <input type="radio" name="RO_OutputType" value="download">
                     <select name="RO_OutputFormat"><option value="html">HTML</option><option value="csv">CSV</option></select>
                   </form>"##,
                field("strTeamName", "Team Name"),
                field("strFirstname", "First Name"),
                field("strSurname", "Family Name"),
                field("strEmail", "Email"),
                field("strGender", "Gender"),
            ))
        }
        _ => return None,
    };
    Some(html)
}

struct SmokeHooks {
    recorded: Shared,
    report_origin: String,
}

impl ExportHooks for SmokeHooks {
    fn prepare_page<'a>(&'a self, page: &'a ChromePage) -> BoxFuture<'a, GamedayResult<()>> {
        Box::pin(async move {
            let raw = page.raw().clone();
            let mut paused = raw.listen("Fetch.requestPaused");
            raw.execute(
                "Fetch.enable",
                json!({"patterns": [{"urlPattern": "https://membership.mygameday.app/*"}]}),
            )
            .await?;
            // the report server's session cookie, which the request context
            // must carry over from the browser
            raw.execute(
                "Network.setCookie",
                json!({
                    "name": "session",
                    "value": "smoke-session",
                    "url": format!("{}/", self.report_origin),
                }),
            )
            .await?;

            let recorded = self.recorded.clone();
            let report_origin = self.report_origin.clone();
            tokio::spawn(async move {
                while let Some(event) = paused.recv().await {
                    let url = event["request"]["url"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string();
                    recorded.lock().unwrap().browser_urls.push(url.clone());
                    let (status, body) = match fixture(&url, &report_origin) {
                        Some(html) => (200, html),
                        None => (404, "not found".to_string()),
                    };
                    let fulfill = json!({
                        "requestId": event["requestId"],
                        "responseCode": status,
                        "responseHeaders": [
                            {"name": "Content-Type", "value": "text/html; charset=utf-8"},
                        ],
                        "body": base64::engine::general_purpose::STANDARD.encode(body),
                    });
                    let _ = raw.execute("Fetch.fulfillRequest", fulfill).await;
                }
            });
            Ok(())
        })
    }
}

async fn report_status(
    State(recorded): State<Shared>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> (StatusCode, [(&'static str, &'static str); 1], String) {
    let cookie = headers
        .get("cookie")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    recorded.lock().unwrap().status_cookies.push(cookie.clone());
    match query.get("format").map(String::as_str) {
        Some("download") => (
            StatusCode::OK,
            [("content-type", "application/json")],
            r#"{"status":"Complete"}"#.into(),
        ),
        Some("downloading") if cookie.contains("session=smoke-session") => (
            StatusCode::OK,
            [("content-type", "text/csv")],
            "Team,First,Last,Mail,Sex\r\nRed,Ann,Lee,ann@example.com,Female\r\n\"Blue, Inc\",Bob,O'Neil,bob@example.com,Male\r\n2 rows\r\n".into(),
        ),
        _ => (
            StatusCode::FORBIDDEN,
            [("content-type", "text/plain")],
            "no session".into(),
        ),
    }
}

async fn report_post(State(recorded): State<Shared>, body: String) -> &'static str {
    recorded.lock().unwrap().report_posts.push(body);
    "{}"
}

#[tokio::test]
#[ignore = "launches a local Chrome"]
async fn exports_members_through_a_real_browser() {
    let debug_dir = tempfile::tempdir().unwrap();
    // SAFETY: this test binary runs this single test, before any threads read
    // the environment.
    unsafe { std::env::set_var("GAMEDAY_DEBUG_DIR", debug_dir.path()) };

    let recorded: Shared = Arc::default();
    let app = Router::new()
        .route("/report.cgi", get(report_status).post(report_post))
        .with_state(recorded.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let report_origin = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let hooks = SmokeHooks {
        recorded: recorded.clone(),
        report_origin,
    };
    let output = export_gameday_members_with(
        GamedayExportInput {
            starting_url: "https://membership.mygameday.app/login/".into(),
            username: "smoke@example.com".into(),
            password: "secret".into(),
            association: "Frisbee   Association".into(),
            competition: "mixed league".into(),
            headless: Some(true),
            debug: Some(true),
            timeout_ms: Some(60_000.0),
            ..Default::default()
        },
        &hooks,
    )
    .await
    .expect("export succeeds");

    assert_eq!(
        output.members,
        vec![
            GamedayExportMember {
                team_name: "Red".into(),
                first_name: "Ann".into(),
                last_name: "Lee".into(),
                email: "ann@example.com".into(),
                gender: "Female".into(),
            },
            GamedayExportMember {
                team_name: "Blue, Inc".into(),
                first_name: "Bob".into(),
                last_name: "O'Neil".into(),
                email: "bob@example.com".into(),
                gender: "Male".into(),
            },
        ]
    );

    let recorded = recorded.lock().unwrap();
    // the login form was filled and submitted
    assert!(
        recorded
            .browser_urls
            .iter()
            .any(|url| url.contains("/home.cgi?email=smoke%40example.com&password=secret")),
        "{:?}",
        recorded.browser_urls
    );
    // the competition picked from griddata, then the report configuration
    assert!(
        recorded
            .browser_urls
            .iter()
            .any(|url| url.ends_with("/main.cgi?client=COMP&a=C_HOME"))
    );
    assert!(
        recorded
            .browser_urls
            .iter()
            .any(|url| url.ends_with("/main.cgi?client=COMP&a=REP_CONFIG&rID=3"))
    );
    // the report form as configured in the page
    let post = recorded
        .report_posts
        .first()
        .expect("the report was posted");
    for part in [
        "client=COMP",
        "ROselectedfieldlist=strTeamName%2CstrFirstname%2CstrSurname%2CstrEmail%2CstrGender",
        "RO_RecordFilter=DISTINCT",
        "RO_OutputType=download",
        "RO_OutputFormat=csv",
        "ajax=1",
        "jobID=",
    ] {
        assert!(post.contains(part), "{part} missing from {post}");
    }
    assert!(!post.contains("strNotes"), "{post}");
    assert!(
        recorded
            .status_cookies
            .iter()
            .all(|cookie| cookie.contains("session=smoke-session"))
    );

    // debug snapshots (HTML and full-page PNG) for every step
    for label in [
        "after-login",
        "authlist",
        "association-home",
        "competition-list-all-seasons",
        "competition-list",
        "competition-home",
        "report-config",
    ] {
        for extension in ["html", "png"] {
            let path = debug_dir.path().join(format!("{label}.{extension}"));
            assert!(path.exists(), "{} missing", path.display());
        }
    }
}
