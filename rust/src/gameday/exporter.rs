//! Port of `server/src/gameday/exporter.ts`: logs into GameDay in a headless
//! Chrome, opens the Advanced Member report, runs it as a CSV download and
//! parses the members out of it.
//!
//! The browser is driven over CDP (see [`super::browser`]). The two pieces the
//! TS tests fake are traits here: [`BrowserLauncher`] (`chromium.launch`) and
//! [`ReportRequestContext`] (`context.request`). Progress is logged to stderr
//! (`console.error`), so stdout stays free for the CLI's JSON output.

use std::fmt;
use std::path::Path;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use futures_util::future::BoxFuture;
use regex::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::time::Instant;

use super::browser::{ChromeBrowser, ChromeLauncher, ChromePage, LoadState, Locator};
use super::types::{GamedayExportInput, GamedayExportMember, GamedayExportOutput};
use crate::js;
use crate::utils::csv::{parse_csv_rows, replace_csv_header};

/// An exporter failure: the `Error` message the TS exporter throws.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GamedayError(pub String);

impl fmt::Display for GamedayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for GamedayError {}

impl From<String> for GamedayError {
    fn from(message: String) -> Self {
        GamedayError(message)
    }
}

impl From<&str> for GamedayError {
    fn from(message: &str) -> Self {
        GamedayError(message.to_string())
    }
}

pub type GamedayResult<T> = Result<T, GamedayError>;

fn fail<T>(message: impl Into<String>) -> GamedayResult<T> {
    Err(GamedayError(message.into()))
}

/// `console.error(message)`.
fn log(message: impl Into<String>) {
    crate::log::error(message);
}

// ---------------------------------------------------------------------------
// types

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MemberHeader {
    TeamName,
    FirstName,
    FamilyName,
    Email,
    Gender,
}

impl MemberHeader {
    fn as_str(self) -> &'static str {
        match self {
            MemberHeader::TeamName => "Team Name",
            MemberHeader::FirstName => "First Name",
            MemberHeader::FamilyName => "Family Name",
            MemberHeader::Email => "Email",
            MemberHeader::Gender => "Gender",
        }
    }

    fn preferred_ids(self) -> &'static [&'static str] {
        match self {
            MemberHeader::TeamName => &["strTeamName"],
            MemberHeader::FirstName => &["strFirstname"],
            MemberHeader::FamilyName => &["strSurname"],
            MemberHeader::Email => &["strEmail"],
            MemberHeader::Gender => &["strGender", "Gender", "intGender", "intGenderID"],
        }
    }

    fn matches(self, label: &str) -> bool {
        let normalized = normalize_label(label);
        match self {
            MemberHeader::TeamName => normalized == "team name",
            MemberHeader::FirstName => normalized == "first name",
            MemberHeader::FamilyName => normalized == "family name",
            MemberHeader::Email => normalized == "email",
            MemberHeader::Gender => {
                normalized == "gender"
                    || (normalized.contains("gender")
                        && !normalized.contains("parent")
                        && !normalized.contains("guardian"))
            }
        }
    }
}

/// `DEFAULT_FIELD_DEFS`, in order.
const DEFAULT_FIELD_DEFS: [MemberHeader; 5] = [
    MemberHeader::TeamName,
    MemberHeader::FirstName,
    MemberHeader::FamilyName,
    MemberHeader::Email,
    MemberHeader::Gender,
];

/// `TGamedayAvailableField`.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct AvailableField {
    pub id: String,
    pub label: String,
    pub selected: bool,
}

/// `TGamedayResolvedField`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedField {
    pub id: String,
    pub header: String,
    pub source_label: String,
}

/// `TGamedayResolvedOptions`.
#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedOptions {
    pub starting_url: String,
    pub username: String,
    pub password: String,
    pub association: String,
    pub competition: String,
    pub headless: bool,
    pub browser_channel: String,
    pub browser_executable_path: Option<String>,
    pub report_id: String,
    pub timeout_ms: f64,
    pub debug_dir: Option<String>,
    pub fields: Vec<String>,
    pub headers: Vec<String>,
    pub gender_field: Option<String>,
    pub record_filter: String,
    pub normalize_headers: bool,
}

/// `TGamedayReportRequest`.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRequest {
    pub action: String,
    pub body: String,
    pub client: String,
    pub selected_ids: Vec<String>,
    #[serde(default)]
    pub job_id: String,
}

/// `TGamedayCompetitionListItem`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CompetitionListItem {
    pub title: String,
    pub select_link: String,
    pub season_name: String,
    pub fixture_type: String,
    pub teams: String,
    pub abbreviation: String,
    pub status: String,
    pub id: String,
}

/// `TGamedayCompetitionSeasonFilterResult`.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompetitionSeasonFilterResult {
    found: bool,
    changed: bool,
    label: String,
    previous_label: String,
    selected_label: String,
}

/// A response from [`ReportRequestContext`] (Playwright's `APIResponse`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReportResponse {
    pub status: u16,
    /// Lower-case header names.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl ReportResponse {
    /// `response.ok()`.
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }

    /// `response.text()`.
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    /// `response.headers()[name]`.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

/// `get(url, {params, timeout})` options.
#[derive(Clone, Debug, PartialEq)]
pub struct ReportGetOptions {
    pub params: Vec<(String, String)>,
    pub timeout_ms: f64,
}

/// `post(url, {headers, data, timeout})` options.
#[derive(Clone, Debug, PartialEq)]
pub struct ReportPostOptions {
    pub headers: Vec<(String, String)>,
    pub data: String,
    pub timeout_ms: f64,
}

/// `TGamedayReportRequestContext`: the parts of Playwright's
/// `APIRequestContext` the report download uses.
pub trait ReportRequestContext: Send + Sync {
    fn get(
        &self,
        url: String,
        options: ReportGetOptions,
    ) -> BoxFuture<'_, GamedayResult<ReportResponse>>;
    fn post(&self, url: String, options: ReportPostOptions) -> BoxFuture<'_, GamedayResult<()>>;
}

/// `chromium.launch` options.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LaunchOptions {
    pub headless: bool,
    pub args: Vec<String>,
    pub executable_path: Option<String>,
    pub channel: Option<String>,
}

/// `chromium.launch(options)`.
pub trait BrowserLauncher: Sync {
    type Browser;
    fn launch(&self, options: LaunchOptions) -> BoxFuture<'_, GamedayResult<Self::Browser>>;
}

// ---------------------------------------------------------------------------
// constants

// GameDay sometimes appends a footer row like "525 rows" after the CSV body.
static GAMEDAY_SUMMARY_ROW_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"(?i)^(?:[0-9]+|[0-9]{{1,3}}(?:,[0-9]{{3}})*)[{}]+rows?$",
        js::WS_CLASS
    ))
    .expect("summary row pattern")
});

static GRIDDATA_ASSIGNMENT: LazyLock<Regex> = LazyLock::new(|| {
    let ws = js::WS_CLASS;
    Regex::new(&format!(r"var[{ws}]+griddata[{ws}]*=[{ws}]*")).expect("griddata pattern")
});

static HTML_ENTITY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"&(?:amp|quot|#39|lt|gt);").expect("entity pattern"));

const COMMON_BROWSER_PATHS: [&str; 5] = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const GAMEDAY_AUTHLIST_URL: &str = "https://membership.mygameday.app/authlist.cgi";
const GAMEDAY_MAIN_URL: &str = "https://membership.mygameday.app/main.cgi";
const GAMEDAY_MEMBERSHIP_HOST: &str = "membership.mygameday.app";

// ---------------------------------------------------------------------------
// entry point

/// Lets tests swap the parts of a real export that would leave the machine.
pub trait ExportHooks: Sync {
    /// Runs on the new page before the first navigation.
    fn prepare_page<'a>(&'a self, _page: &'a ChromePage) -> BoxFuture<'a, GamedayResult<()>> {
        Box::pin(async { Ok(()) })
    }

    /// `context.request`.
    fn request_context<'a>(
        &'a self,
        browser: &'a ChromeBrowser,
    ) -> BoxFuture<'a, GamedayResult<Arc<dyn ReportRequestContext>>> {
        Box::pin(async move {
            let context: Arc<dyn ReportRequestContext> = Arc::new(browser.request_context().await?);
            Ok(context)
        })
    }
}

/// The real GameDay site.
pub struct LiveHooks;

impl ExportHooks for LiveHooks {}

/// `exportGamedayMembers(input)`.
pub async fn export_gameday_members(
    input: GamedayExportInput,
) -> GamedayResult<GamedayExportOutput> {
    export_gameday_members_with(input, &LiveHooks).await
}

/// [`export_gameday_members`] with test hooks.
pub async fn export_gameday_members_with(
    input: GamedayExportInput,
    hooks: &dyn ExportHooks,
) -> GamedayResult<GamedayExportOutput> {
    let options = resolve_options(&input);
    let browser = launch_browser(
        &ChromeLauncher,
        &file_exists,
        options.headless,
        &options.browser_channel,
        options.browser_executable_path.as_deref(),
    )
    .await?;
    let result = run_export(&browser, &options, hooks).await;
    // finally: close the context and the browser, ignoring failures
    browser.close().await;
    result
}

async fn run_export(
    browser: &ChromeBrowser,
    options: &ResolvedOptions,
    hooks: &dyn ExportHooks,
) -> GamedayResult<GamedayExportOutput> {
    let page = browser.new_page().await?;
    install_browser_evaluate_name_helper(&page).await?;
    hooks.prepare_page(&page).await?;

    let debug_dir = options.debug_dir.as_deref();
    login(&page, options).await?;
    select_association(&page, &options.association, debug_dir).await?;
    select_competition(&page, &options.competition, debug_dir).await?;
    open_advanced_member_report(&page, &options.report_id, debug_dir).await?;

    let available_fields = collect_available_fields(&page).await?;
    let fields = resolve_fields(&available_fields, options)?;
    configure_report(&page, &fields, &options.record_filter).await?;

    let job_id = random_uuid();
    let request = build_report_request(&page, &job_id).await?;
    let request_context = hooks.request_context(browser).await?;
    let mut csv = run_report_and_download(request_context, &request, options.timeout_ms).await?;
    if options.normalize_headers {
        let headers: Vec<&str> = fields.iter().map(|field| field.header.as_str()).collect();
        csv = replace_csv_header(&csv, &headers);
    }

    let members = parse_member_rows(&csv)?;
    log(format!("Exported {} GameDay member row(s).", members.len()));
    Ok(GamedayExportOutput { members })
}

/// `crypto.randomUUID()`.
fn random_uuid() -> String {
    let mut bytes: [u8; 16] = rand::random();
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = hex::encode(bytes);
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

// ---------------------------------------------------------------------------
// options

/// `resolveOptions(input)`, reading the process environment.
pub fn resolve_options(input: &GamedayExportInput) -> ResolvedOptions {
    let cwd = std::env::current_dir().unwrap_or_default();
    resolve_options_with(input, &|key| std::env::var(key).ok(), &cwd)
}

/// `resolveOptions(input)` against an explicit environment and working
/// directory. `env(key)` is `process.env[key]` (`None` when unset).
pub fn resolve_options_with(
    input: &GamedayExportInput,
    env: &dyn Fn(&str) -> Option<String>,
    cwd: &Path,
) -> ResolvedOptions {
    let either = |first: &str, second: &str| env(first).or_else(|| env(second));
    let debug = input
        .debug
        .unwrap_or_else(|| parse_bool(env("GAMEDAY_DEBUG").as_deref(), false));
    let debug_dir = debug.then(|| {
        env("GAMEDAY_DEBUG_DIR")
            .unwrap_or_else(|| cwd.join("gameday-debug").to_string_lossy().into_owned())
    });

    ResolvedOptions {
        starting_url: input.starting_url.clone(),
        username: input.username.clone(),
        password: input.password.clone(),
        association: input.association.clone(),
        competition: input.competition.clone(),
        headless: input
            .headless
            .unwrap_or_else(|| parse_bool(either("GAMEDAY_HEADLESS", "HEADLESS").as_deref(), true)),
        browser_channel: input
            .browser_channel
            .clone()
            .or_else(|| either("GAMEDAY_BROWSER_CHANNEL", "BROWSER_CHANNEL"))
            .unwrap_or_else(|| "chrome".into()),
        browser_executable_path: input
            .browser_executable_path
            .clone()
            .or_else(|| env("GAMEDAY_BROWSER_EXECUTABLE_PATH"))
            .or_else(|| env("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"))
            .or_else(|| env("CHROME_PATH")),
        report_id: input
            .report_id
            .clone()
            .or_else(|| either("GAMEDAY_REPORT_ID", "REPORT_ID"))
            .unwrap_or_else(|| "3".into()),
        timeout_ms: input.timeout_ms.unwrap_or_else(|| {
            read_number_env(
                either("GAMEDAY_TIMEOUT_MS", "REPORT_TIMEOUT_MS").as_deref(),
                300_000.0,
            )
        }),
        debug_dir,
        fields: match &input.fields {
            Some(fields) if !fields.is_empty() => fields.clone(),
            _ => split_csv_like(&either("GAMEDAY_FIELDS", "FIELD_IDS").unwrap_or_default()),
        },
        headers: match &input.headers {
            Some(headers) if !headers.is_empty() => headers.clone(),
            _ => split_csv_like(&either("GAMEDAY_HEADERS", "OUTPUT_HEADERS").unwrap_or_default()),
        },
        gender_field: either("GAMEDAY_GENDER_FIELD", "GENDER_FIELD_ID"),
        record_filter: either("GAMEDAY_RECORD_FILTER", "RECORD_FILTER")
            .unwrap_or_else(|| "DISTINCT".into()),
        normalize_headers: parse_bool(
            either("GAMEDAY_NORMALIZE_HEADERS", "NORMALIZE_HEADERS").as_deref(),
            true,
        ),
    }
}

fn split_csv_like(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|part| js::trim(part).to_string())
        .filter(|part| !part.is_empty())
        .collect()
}

fn parse_bool(value: Option<&str>, fallback: bool) -> bool {
    let Some(value) = value.filter(|value| !value.is_empty()) else {
        return fallback;
    };
    let normalized = js::to_lower(js::trim(value));
    match normalized.as_str() {
        "1" | "true" | "yes" | "y" | "on" => true,
        "0" | "false" | "no" | "n" | "off" => false,
        _ => fallback,
    }
}

fn read_number_env(value: Option<&str>, fallback: f64) -> f64 {
    let Some(value) = value.filter(|value| !js::trim(value).is_empty()) else {
        return fallback;
    };
    let parsed = js::string_to_number(value);
    if parsed.is_finite() && parsed > 0.0 {
        parsed
    } else {
        fallback
    }
}

fn normalize_label(value: &str) -> String {
    let spaced = value.replace('+', " ");
    js::to_lower(js::trim(&js::replace_whitespace_runs(&spaced, " ")))
}

fn normalize_header(value: &str) -> String {
    let without_bom = value.strip_prefix('\u{FEFF}').unwrap_or(value);
    let lower = js::to_lower(js::trim(without_bom));
    let mut out = String::with_capacity(lower.len());
    for c in lower.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        }
    }
    out
}

/// `escapeRegex(value)` for a JavaScript `RegExp` source.
fn escape_regex(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        if ".*+?^${}()|[]\\".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// `new URL(href, baseUrl).href`.
fn resolve_url(href: &str, base_url: &str) -> GamedayResult<String> {
    url::Url::parse(base_url)
        .and_then(|base| base.join(href))
        .map(|url| url.to_string())
        .map_err(|_| GamedayError("Invalid URL".into()))
}

// ---------------------------------------------------------------------------
// launching

fn file_exists(path: &str) -> bool {
    Path::new(path).exists()
}

/// `launchBrowser({headless, browserChannel, browserExecutablePath})`.
/// `file_exists` is `fs.access`.
pub async fn launch_browser<L: BrowserLauncher>(
    launcher: &L,
    file_exists: &(dyn Fn(&str) -> bool + Sync),
    headless: bool,
    browser_channel: &str,
    browser_executable_path: Option<&str>,
) -> GamedayResult<L::Browser> {
    let executable_path = resolve_browser_executable_path(browser_executable_path, file_exists)?;
    let mut launch_options = LaunchOptions {
        headless,
        args: browser_launch_args(),
        executable_path: None,
        channel: None,
    };
    if let Some(path) = executable_path {
        launch_options.executable_path = Some(path);
    } else if !browser_channel.is_empty() && browser_channel != "bundled" {
        launch_options.channel = Some(browser_channel.to_string());
    }

    let channel = launch_options.channel.clone();
    match launcher.launch(launch_options).await {
        Ok(browser) => Ok(browser),
        Err(error) => match channel {
            Some(channel) => {
                log(format!(
                    "Could not launch browser channel \"{channel}\"; trying bundled Chromium."
                ));
                launcher
                    .launch(LaunchOptions {
                        headless,
                        args: browser_launch_args(),
                        executable_path: None,
                        channel: None,
                    })
                    .await
            }
            None => Err(error),
        },
    }
}

fn resolve_browser_executable_path(
    explicit_path: Option<&str>,
    file_exists: &(dyn Fn(&str) -> bool + Sync),
) -> GamedayResult<Option<String>> {
    if let Some(explicit) = explicit_path.map(js::trim).filter(|path| !path.is_empty()) {
        if file_exists(explicit) {
            return Ok(Some(explicit.to_string()));
        }
        return fail(format!(
            "Configured browser executable was not found: {explicit}"
        ));
    }
    Ok(COMMON_BROWSER_PATHS
        .iter()
        .find(|candidate| file_exists(candidate))
        .map(|candidate| candidate.to_string()))
}

fn browser_launch_args() -> Vec<String> {
    let mut args = vec!["--disable-dev-shm-usage".to_string()];
    if is_root() {
        args.push("--no-sandbox".into());
        args.push("--disable-setuid-sandbox".into());
    }
    args
}

#[cfg(unix)]
fn is_root() -> bool {
    rustix::process::getuid().is_root()
}

#[cfg(not(unix))]
fn is_root() -> bool {
    false
}

async fn install_browser_evaluate_name_helper(page: &ChromePage) -> GamedayResult<()> {
    // esbuild can wrap serialized Playwright page functions in __name(...).
    // Kept from the TS exporter so injected scripts see the same globals.
    page.add_init_script("globalThis.__name = (target) => target")
        .await
}

async fn maybe_debug(page: &ChromePage, debug_dir: Option<&str>, label: &str) -> GamedayResult<()> {
    let Some(debug_dir) = debug_dir else {
        return Ok(());
    };
    let io_error = |error: std::io::Error| GamedayError(error.to_string());
    tokio::fs::create_dir_all(debug_dir)
        .await
        .map_err(io_error)?;
    static UNSAFE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?i)[^a-z0-9_-]+").expect("label pattern"));
    let safe_label = UNSAFE.replace_all(label, "-");
    let dir = Path::new(debug_dir);
    let content = page.content().await?;
    tokio::fs::write(dir.join(format!("{safe_label}.html")), content)
        .await
        .map_err(io_error)?;
    let _ = page
        .screenshot_full_page(&dir.join(format!("{safe_label}.png")))
        .await;
    Ok(())
}

// ---------------------------------------------------------------------------
// navigation steps

async fn login(page: &ChromePage, options: &ResolvedOptions) -> GamedayResult<()> {
    log("Opening GameDay...");
    page.goto(&options.starting_url, 60_000.0).await?;

    let email_input = Locator::new(r#"input[name="email"]"#);
    if page.count(&email_input).await? == 0 {
        return Ok(());
    }

    log("Logging in...");
    page.fill(&email_input, &options.username).await?;
    page.fill(
        &Locator::new(r#"input[name="password"]"#),
        &options.password,
    )
    .await?;

    page.wait_for_function(
        "window.grecaptcha && typeof window.grecaptcha.execute === 'function'",
        45_000.0,
    )
    .await
    .map_err(|error| {
        GamedayError(format!(
            "Timed out waiting for GameDay reCAPTCHA to initialise. Try headed mode. {error}"
        ))
    })?;

    page.click(&Locator::new(
        r#"input[type="submit"][value*="Login"], button[type="submit"]"#,
    ))
    .await?;
    let _ = page
        .wait_for_url(|url| !url.as_str().contains("/login/"), 90_000.0)
        .await;

    let _ = page
        .wait_for_load_state(LoadState::DomContentLoaded, 60_000.0)
        .await;
    page.wait_for_timeout(1_500).await;
    maybe_debug(page, options.debug_dir.as_deref(), "after-login").await?;

    if page.url().await?.contains("/login/") {
        let body_text = page
            .inner_text(&Locator::new("body"))
            .await
            .unwrap_or_default();
        if js::to_lower(&body_text).contains("captcha") {
            return fail(
                "Login stayed on the login page after a reCAPTCHA error. Re-run in headed mode and avoid using headless mode.",
            );
        }
        return fail("Login stayed on the login page. Check the credentials.");
    }
    Ok(())
}

async fn select_association(
    page: &ChromePage,
    association: &str,
    debug_dir: Option<&str>,
) -> GamedayResult<()> {
    log("Selecting organisation...");
    page.goto(GAMEDAY_AUTHLIST_URL, 60_000.0).await?;
    maybe_debug(page, debug_dir, "authlist").await?;

    let association_link =
        Locator::new("a.org-list-entry, a.org-link-wrap, a").has_text(escape_regex(association));
    if page.count(&association_link).await? == 0 {
        return fail(format!(
            "Could not find organisation matching association \"{association}\" on the GameDay authorisation page."
        ));
    }

    // follow the link's href rather than clicking it: a click at the entry's
    // centre can miss while the organisation list is still laying out
    let href = page
        .get_attribute(&association_link, "href")
        .await?
        .filter(|href| !href.is_empty());
    let Some(href) = href else {
        return fail(format!(
            "Could not read the link for organisation \"{association}\" on the GameDay authorisation page."
        ));
    };
    page.goto(&resolve_url(&href, &page.url().await?)?, 60_000.0)
        .await?;
    let is_association_home = |url: &url::Url| {
        url.host_str() == Some(GAMEDAY_MEMBERSHIP_HOST) && url.path().ends_with("/main.cgi")
    };
    let _ = page.wait_for_url(&is_association_home, 90_000.0).await;
    let _ = page
        .wait_for_load_state(LoadState::DomContentLoaded, 60_000.0)
        .await;
    page.wait_for_timeout(1_500).await;
    maybe_debug(page, debug_dir, "association-home").await?;

    let current_url = page.url().await?;
    match url::Url::parse(&current_url) {
        Ok(url) if is_association_home(&url) => Ok(()),
        Ok(url) => fail(format!(
            "Opening organisation \"{association}\" did not reach the GameDay organisation home (stopped at {}{}).",
            url.origin().ascii_serialization(),
            url.path()
        )),
        Err(_) => fail(format!(
            "Opening organisation \"{association}\" did not reach the GameDay organisation home."
        )),
    }
}

async fn select_competition(
    page: &ChromePage,
    competition: &str,
    debug_dir: Option<&str>,
) -> GamedayResult<()> {
    log("Selecting competition...");
    let competition_list_link = Locator::new(r#"a#menu_listcompetitions, a[href*="a=CO_L"]"#);
    if page.count(&competition_list_link).await? == 0 {
        return fail("Could not find the GameDay List Competitions link.");
    }

    let href = page
        .get_attribute(&competition_list_link, "href")
        .await?
        .filter(|href| !href.is_empty());
    let Some(href) = href else {
        return fail("Could not read the GameDay List Competitions link.");
    };
    page.goto(&resolve_url(&href, &page.url().await?)?, 60_000.0)
        .await?;
    set_competition_list_season_filter_to_all(page, debug_dir).await?;
    maybe_debug(page, debug_dir, "competition-list").await?;

    let mut competition_list_items = read_competition_list_items(page).await?;
    let mut matching_competition =
        find_competition_list_item(&competition_list_items, competition).cloned();

    if matching_competition.is_none() {
        let filters_applied = apply_competition_list_filters(page).await?;
        if filters_applied {
            wait_for_competition_list_refresh(page).await;
            maybe_debug(page, debug_dir, "competition-list-filters-applied").await?;
            competition_list_items = read_competition_list_items(page).await?;
            matching_competition =
                find_competition_list_item(&competition_list_items, competition).cloned();
        }
    }

    if let Some(matching) = matching_competition {
        let season = if matching.season_name.is_empty() {
            String::new()
        } else {
            format!(" ({})", matching.season_name)
        };
        log(format!(
            "Matched GameDay competition \"{}\"{season}.",
            matching.title
        ));
        // selectLink was decoded when the competition list was read
        page.goto(
            &resolve_url(&matching.select_link, &page.url().await?)?,
            60_000.0,
        )
        .await?;
        let _ = page
            .wait_for_load_state(LoadState::DomContentLoaded, 60_000.0)
            .await;
        page.wait_for_timeout(1_500).await;
        return maybe_debug(page, debug_dir, "competition-home").await;
    }

    let competition_link = Locator::new("a").has_text(escape_regex(competition));
    if page.count(&competition_link).await? == 0 {
        return fail(format!(
            "Could not find competition matching \"{competition}\".{}",
            format_competition_list_for_error(&competition_list_items)
        ));
    }

    page.click(&competition_link).await?;
    let _ = page
        .wait_for_load_state(LoadState::DomContentLoaded, 60_000.0)
        .await;
    page.wait_for_timeout(1_500).await;
    maybe_debug(page, debug_dir, "competition-home").await
}

const SET_SEASON_FILTER_TO_ALL_JS: &str = r#"() => {
  const clean = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()

  const normalized = (value) => clean(value).toLowerCase()

  const selectLabels = (select) => {
    const labels = Array.from(document.querySelectorAll('label'))
      .filter((label) => {
        if (select.id && label.htmlFor === select.id) return true
        return label.contains(select)
      })
      .map((label) => clean(label.textContent))

    return [
      ...labels,
      select.getAttribute('aria-label') || '',
      select.getAttribute('title') || '',
      select.name,
      select.id,
    ].filter((label) => label.length > 0)
  }

  const optionLabel = (option) => {
    if (!option) return ''
    return clean(option.textContent || option.label || option.value)
  }

  const allOptionScore = (option) => {
    if (option.disabled) return 0
    const text = normalized(option.textContent || option.label || option.value)
    const value = normalized(option.value)
    const looksLikeYear = /(?:19|20)\d{2}/.test(text)

    const looksLikeNoFilter = /\b(any|none|no filter)\b/.test(text)

    if (/\ball\s+seasons?\b/.test(text) || text === 'all seasons') return 7
    if (text === 'all') return 6
    if (['all', 'all_seasons', 'all-seasons'].includes(value)) return 5
    if (value === '-1' && !looksLikeYear) return 4
    if (value === '0' && (looksLikeNoFilter || text === '')) return 3
    if (value === '' && (looksLikeNoFilter || text === '')) return 2
    return 0
  }

  const findAllOption = (options) => {
    return options
      .map((option) => ({option, score: allOptionScore(option)}))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.option
  }

  const selectScore = (select) => {
    const options = Array.from(select.options)
    const labels = selectLabels(select).map(normalized)
    const optionLabels = options.map((option) => normalized(option.textContent))
    const labelMentionsSeason = labels.some((label) => label.includes('season'))
    const optionMentionsSeason = optionLabels.some((label) =>
      label.includes('season'),
    )
    const yearOptionCount = optionLabels.filter((label) =>
      /(?:19|20)\d{2}/.test(label),
    ).length
    const hasAllOption = !!findAllOption(options)

    if (labelMentionsSeason) return 4
    if (optionMentionsSeason && hasAllOption) return 3
    if (yearOptionCount > 0 && hasAllOption) return 2
    return 0
  }

  const candidates = Array.from(document.querySelectorAll('select'))
    .map((select) => ({
      select,
      option: findAllOption(Array.from(select.options)),
      score: selectScore(select),
      label: selectLabels(select).join(' / ') || 'season filter',
    }))
    .filter((candidate) => candidate.score > 0 && !!candidate.option)
    .sort((left, right) => right.score - left.score)

  const candidate = candidates[0]
  if (!candidate) {
    return {
      found: false,
      changed: false,
      label: '',
      previousLabel: '',
      selectedLabel: '',
    }
  }

  const previousOption = candidate.select.selectedOptions[0]
  const previousLabel = optionLabel(previousOption)
  const selectedLabel = optionLabel(candidate.option)
  const previousValue = candidate.select.value

  if (candidate.option.selected && previousValue === candidate.option.value) {
    return {
      found: true,
      changed: false,
      label: candidate.label,
      previousLabel,
      selectedLabel,
    }
  }

  candidate.option.selected = true
  candidate.select.value = candidate.option.value
  candidate.select.dispatchEvent(new Event('input', {bubbles: true}))
  candidate.select.dispatchEvent(new Event('change', {bubbles: true}))

  return {
    found: true,
    changed: previousValue !== candidate.select.value,
    label: candidate.label,
    previousLabel,
    selectedLabel,
  }
}"#;

async fn set_competition_list_season_filter_to_all(
    page: &ChromePage,
    debug_dir: Option<&str>,
) -> GamedayResult<()> {
    let value = page
        .evaluate(SET_SEASON_FILTER_TO_ALL_JS, &Value::Null)
        .await?;
    let result: CompetitionSeasonFilterResult = serde_json::from_value(value)
        .map_err(|error| GamedayError(format!("page.evaluate: {error}")))?;

    if !result.found {
        log("No GameDay competition season filter was found; using the current competition list.");
        return Ok(());
    }

    if !result.changed {
        log(format!(
            "GameDay competition season filter \"{}\" is already \"{}\".",
            result.label, result.selected_label
        ));
        return Ok(());
    }

    log(format!(
        "Changed GameDay competition season filter \"{}\" from \"{}\" to \"{}\".",
        result.label, result.previous_label, result.selected_label
    ));
    wait_for_competition_list_refresh(page).await;
    maybe_debug(page, debug_dir, "competition-list-all-seasons").await
}

const APPLY_COMPETITION_LIST_FILTERS_JS: &str = r#"() => {
  const clean = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

  const selectLooksLikeSeasonFilter = (select) => {
    const optionLabels = Array.from(select.options).map((option) =>
      clean(option.textContent || option.label || option.value),
    )
    const labels = [
      select.name,
      select.id,
      select.getAttribute('aria-label') || '',
      select.getAttribute('title') || '',
      ...optionLabels,
    ].map(clean)
    const hasAllOption = optionLabels.some(
      (label) =>
        /\ball\s+seasons?\b/.test(label) ||
        label === 'all' ||
        label === 'all seasons',
    )
    const yearOptionCount = optionLabels.filter((label) =>
      /(?:19|20)\d{2}/.test(label),
    ).length
    return (
      labels.some((label) => label.includes('season')) ||
      (hasAllOption && yearOptionCount > 0)
    )
  }

  const seasonSelects = Array.from(document.querySelectorAll('select')).filter(
    selectLooksLikeSeasonFilter,
  )

  const seasonSelect = seasonSelects[0]
  const scope = seasonSelect?.form || document
  const controls = Array.from(
    scope.querySelectorAll('button, input[type="submit"], input[type="button"], a'),
  )

  const trigger = controls.find((control) => {
    const label =
      control instanceof HTMLInputElement
        ? clean(control.value)
        : clean(control.textContent)
    return /^(apply|filter|go|search|show|view|update)(\s|$)/.test(label)
  })

  if (trigger instanceof HTMLElement) {
    trigger.click()
    return true
  }

  if (seasonSelect?.form) {
    if (typeof seasonSelect.form.requestSubmit === 'function') {
      seasonSelect.form.requestSubmit()
    } else {
      seasonSelect.form.submit()
    }
    return true
  }

  return false
}"#;

async fn apply_competition_list_filters(page: &ChromePage) -> GamedayResult<bool> {
    let applied = page
        .evaluate(APPLY_COMPETITION_LIST_FILTERS_JS, &Value::Null)
        .await?
        .as_bool()
        .unwrap_or(false);
    if applied {
        log("Applied GameDay competition list filters.");
    }
    Ok(applied)
}

async fn wait_for_competition_list_refresh(page: &ChromePage) {
    let _ = page
        .wait_for_load_state(LoadState::DomContentLoaded, 30_000.0)
        .await;
    let _ = page
        .wait_for_load_state(LoadState::NetworkIdle, 10_000.0)
        .await;
    page.wait_for_timeout(1_500).await;
}

async fn read_competition_list_items(page: &ChromePage) -> GamedayResult<Vec<CompetitionListItem>> {
    let page_content = page.content().await?;
    Ok(dedupe_competition_list_items(
        read_competition_grid_data_items(&page_content),
    ))
}

/// `readCompetitionGridDataItems(pageContent)`.
pub fn read_competition_grid_data_items(page_content: &str) -> Vec<CompetitionListItem> {
    let raw_grid_data = read_javascript_array_assignment(page_content, &GRIDDATA_ASSIGNMENT);
    if raw_grid_data.is_empty() {
        return Vec::new();
    }
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(raw_grid_data) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| match item {
            Value::Object(record) => competition_list_item_from_record(record),
            _ => None,
        })
        .collect()
}

fn read_javascript_array_assignment<'a>(source: &'a str, assignment_pattern: &Regex) -> &'a str {
    let Some(marker) = assignment_pattern.find(source) else {
        return "";
    };
    let array_start = marker.end();
    let bytes = source.as_bytes();
    if bytes.get(array_start) != Some(&b'[') {
        return "";
    }

    let mut depth = 0i64;
    let mut in_string = false;
    let mut escaped = false;
    for (index, &character) in bytes.iter().enumerate().skip(array_start) {
        if in_string {
            if escaped {
                escaped = false;
            } else if character == b'\\' {
                escaped = true;
            } else if character == b'"' {
                in_string = false;
            }
        } else if character == b'"' {
            in_string = true;
        } else if character == b'[' {
            depth += 1;
        } else if character == b']' {
            depth -= 1;
            if depth == 0 {
                return &source[array_start..=index];
            }
        }
    }
    ""
}

fn competition_list_item_from_record(
    record: &serde_json::Map<String, Value>,
) -> Option<CompetitionListItem> {
    let title = read_competition_record_string(record, "strTitle");
    let select_link = read_competition_record_string(record, "SelectLink");
    if title.is_empty() || select_link.is_empty() {
        return None;
    }
    Some(CompetitionListItem {
        title,
        select_link,
        season_name: read_competition_record_string(record, "strSeasonName"),
        fixture_type: read_competition_record_string(record, "intFixtureType"),
        teams: read_competition_record_string(record, "teams"),
        abbreviation: read_competition_record_string(record, "strAbbrev"),
        status: read_competition_record_string(record, "intRecStatus"),
        id: read_competition_record_string(record, "id"),
    })
}

fn read_competition_record_string(record: &serde_json::Map<String, Value>, key: &str) -> String {
    match record.get(key) {
        Some(Value::String(value)) => js::trim(&decode_html_entities(value)).to_string(),
        Some(Value::Number(number)) => js::number_to_string(number.as_f64().unwrap_or(f64::NAN)),
        _ => String::new(),
    }
}

/// `dedupeCompetitionListItems(items)`: by title and link only.
pub fn dedupe_competition_list_items(items: Vec<CompetitionListItem>) -> Vec<CompetitionListItem> {
    let mut seen = std::collections::HashSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(format!("{}\u{0}{}", item.title, item.select_link)))
        .collect()
}

/// `findCompetitionListItem(items, competition)`: an exact title or
/// abbreviation match, else a partial one.
pub fn find_competition_list_item<'a>(
    items: &'a [CompetitionListItem],
    competition: &str,
) -> Option<&'a CompetitionListItem> {
    let competition_label = normalize_label(competition);
    let values = |item: &'a CompetitionListItem| {
        [item.title.as_str(), item.abbreviation.as_str()]
            .into_iter()
            .filter(|value| !value.is_empty())
    };
    items
        .iter()
        .find(|item| values(item).any(|value| normalize_label(value) == competition_label))
        .or_else(|| {
            items.iter().find(|item| {
                values(item).any(|value| normalize_label(value).contains(&competition_label))
            })
        })
}

/// `formatCompetitionListForError(items)`.
pub fn format_competition_list_for_error(items: &[CompetitionListItem]) -> String {
    if items.is_empty() {
        return String::new();
    }
    let preview = items
        .iter()
        .take(20)
        .map(|item| {
            if item.season_name.is_empty() {
                item.title.clone()
            } else {
                format!("{} ({})", item.title, item.season_name)
            }
        })
        .collect::<Vec<_>>()
        .join("; ");
    let suffix = if items.len() > 20 {
        format!("; and {} more", items.len() - 20)
    } else {
        String::new()
    };
    format!(" Available competitions: {preview}{suffix}.")
}

/// `decodeHtmlEntities(value)`: a single pass, so decoded text is never
/// decoded again (`&amp;lt;` -> `&lt;`).
pub fn decode_html_entities(value: &str) -> String {
    HTML_ENTITY
        .replace_all(value, |captures: &regex::Captures| {
            match &captures[0] {
                "&amp;" => "&",
                "&quot;" => "\"",
                "&#39;" => "'",
                "&lt;" => "<",
                "&gt;" => ">",
                other => other,
            }
            .to_string()
        })
        .into_owned()
}

async fn open_advanced_member_report(
    page: &ChromePage,
    report_id: &str,
    debug_dir: Option<&str>,
) -> GamedayResult<()> {
    log("Opening Advanced Member report configuration...");
    let client = current_client(page).await?;
    if client.is_empty() {
        return fail("Could not find the GameDay client token after selection.");
    }

    let mut url =
        url::Url::parse(GAMEDAY_MAIN_URL).map_err(|_| GamedayError("Invalid URL".into()))?;
    url.query_pairs_mut()
        .append_pair("client", &client)
        .append_pair("a", "REP_CONFIG")
        .append_pair("rID", report_id);

    page.goto(url.as_str(), 60_000.0).await?;
    page.wait_for_selector("#reportform", 60_000.0).await?;
    page.wait_for_function("document.querySelector('#ROselectedfields-list')", 60_000.0)
        .await?;
    maybe_debug(page, debug_dir, "report-config").await
}

async fn current_client(page: &ChromePage) -> GamedayResult<String> {
    let href = page.url().await?;
    let url = url::Url::parse(&href).map_err(|_| GamedayError("Invalid URL".into()))?;
    let from_url = url
        .query_pairs()
        .find(|(key, _)| key == "client")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_default();
    if !from_url.is_empty() {
        return Ok(from_url);
    }
    Ok(page
        .input_value(&Locator::new(r#"input[name="client"]"#))
        .await
        .unwrap_or_default())
}

const COLLECT_AVAILABLE_FIELDS_JS: &str = r#"() => {
  const clean = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
  return Array.from(document.querySelectorAll('.RO_fieldblock')).map((block) => {
    const id = block.id.replace(/^fld_/, '')
    const labelElement = block.querySelector('.RO_fieldname')
    const label = clean(labelElement ? labelElement.textContent : id)
    return {
      id,
      label,
      selected: Boolean(block.closest('#ROselectedfields-list')),
    }
  })
}"#;

async fn collect_available_fields(page: &ChromePage) -> GamedayResult<Vec<AvailableField>> {
    let value = page
        .evaluate(COLLECT_AVAILABLE_FIELDS_JS, &Value::Null)
        .await?;
    serde_json::from_value(value).map_err(|error| GamedayError(format!("page.evaluate: {error}")))
}

/// `resolveFields(availableFields, options)`.
pub fn resolve_fields(
    available_fields: &[AvailableField],
    options: &ResolvedOptions,
) -> GamedayResult<Vec<ResolvedField>> {
    let find = |id: &str| available_fields.iter().find(|field| field.id == id);

    if !options.fields.is_empty() {
        let missing: Vec<&str> = options
            .fields
            .iter()
            .filter(|id| find(id).is_none())
            .map(String::as_str)
            .collect();
        if !missing.is_empty() {
            return fail(format!(
                "Configured GameDay field id(s) were not found: {}",
                missing.join(", ")
            ));
        }
        let headers: Vec<String> = if options.headers.is_empty() {
            options
                .fields
                .iter()
                .map(|id| find(id).map_or_else(|| id.clone(), |field| field.label.clone()))
                .collect()
        } else {
            options.headers.clone()
        };
        if headers.len() != options.fields.len() {
            return fail("The configured GameDay header count must match the field count.");
        }
        return Ok(options
            .fields
            .iter()
            .zip(headers)
            .map(|(id, header)| ResolvedField {
                id: id.clone(),
                header,
                source_label: find(id).map_or_else(|| id.clone(), |field| field.label.clone()),
            })
            .collect());
    }

    let mut resolved = Vec::with_capacity(DEFAULT_FIELD_DEFS.len());
    for definition in DEFAULT_FIELD_DEFS {
        let mut preferred_ids: Vec<&str> = definition.preferred_ids().to_vec();
        if definition == MemberHeader::Gender
            && let Some(gender_field) = options.gender_field.as_deref().filter(|id| !id.is_empty())
        {
            preferred_ids.insert(0, gender_field);
        }

        let matched = preferred_ids.iter().find_map(|id| find(id)).or_else(|| {
            available_fields
                .iter()
                .find(|field| definition.matches(&field.label))
        });
        let Some(matched) = matched else {
            let gender_candidates = if definition == MemberHeader::Gender {
                let candidates = available_fields
                    .iter()
                    .filter(|field| js::to_lower(&field.label).contains("gender"))
                    .map(|field| format!("{} ({})", field.id, field.label))
                    .collect::<Vec<_>>()
                    .join(", ");
                let candidates = if candidates.is_empty() {
                    "none".to_string()
                } else {
                    candidates
                };
                format!(" Gender candidates: {candidates}.")
            } else {
                String::new()
            };
            return fail(format!(
                "Could not resolve GameDay field for \"{}\".{gender_candidates}",
                definition.as_str()
            ));
        };
        resolved.push(ResolvedField {
            id: matched.id.clone(),
            header: definition.as_str().to_string(),
            source_label: matched.label.clone(),
        });
    }

    if !options.headers.is_empty() {
        if options.headers.len() != resolved.len() {
            return fail("The configured GameDay header count must match the default field count.");
        }
        return Ok(resolved
            .into_iter()
            .zip(&options.headers)
            .map(|(field, header)| ResolvedField {
                header: header.clone(),
                ..field
            })
            .collect());
    }

    Ok(resolved)
}

const CONFIGURE_REPORT_JS: &str = r#"({fieldIds, recordFilterValue}) => {
  const selectedList = document.getElementById('ROselectedfields-list')
  if (!selectedList) throw new Error('Selected fields list was not found.')

  for (const li of Array.from(selectedList.children)) {
    const block = li.querySelector('.RO_fieldblock')
    const fieldId = block ? block.id.replace(/^fld_/, '') : ''
    const removeLink = block
      ? block.querySelector('.RO_remove a[onclick*="removefield"]')
      : null
    const onclick = removeLink ? removeLink.getAttribute('onclick') ?? '' : ''
    const parentMatch = onclick.match(/removefield\('[^']+'\s*,\s*'([^']+)'\)/)
    const parentId = parentMatch?.[1]
    const parent = parentId ? document.getElementById(parentId) : null
    ;(parent || document.getElementById('hide_search') || selectedList).appendChild(li)
    const searchItem = fieldId ? document.getElementById(`s_${fieldId}`) : null
    if (searchItem) {
      searchItem.style.display = 'none'
      ;(document.getElementById('search_results') || document.body).appendChild(
        searchItem,
      )
    }
  }

  for (const fieldId of fieldIds) {
    const block = document.getElementById(`fld_${fieldId}`)
    if (!block) throw new Error(`Field block not found: ${fieldId}`)
    const li = block.closest('li')
    if (!li) throw new Error(`Field list item not found: ${fieldId}`)
    selectedList.appendChild(li)
    const checkbox = document.getElementById(`f_chk_${fieldId}`)
    if (checkbox instanceof HTMLInputElement) checkbox.checked = true
    const searchItem = document.getElementById(`s_${fieldId}`)
    if (searchItem) {
      searchItem.style.display = 'none'
      ;(document.getElementById('hide_search') || document.body).appendChild(
        searchItem,
      )
    }
  }

  const recordFilterInput = document.querySelector(
    `input[name="RO_RecordFilter"][value="${recordFilterValue}"]`,
  )
  if (recordFilterInput instanceof HTMLInputElement) {
    recordFilterInput.checked = true
  }

  const downloadOutput = document.querySelector(
    'input[name="RO_OutputType"][value="download"]',
  )
  if (!(downloadOutput instanceof HTMLInputElement)) {
    throw new Error('Download output option was not found.')
  }
  downloadOutput.checked = true

  const outputFormat = document.querySelector('select[name="RO_OutputFormat"]')
  if (outputFormat instanceof HTMLSelectElement) outputFormat.value = 'csv'

  const selectedFieldList = document.getElementById('ROselectedfieldlist')
  if (selectedFieldList instanceof HTMLInputElement) {
    selectedFieldList.value = fieldIds.join(',')
  }
}"#;

async fn configure_report(
    page: &ChromePage,
    fields: &[ResolvedField],
    record_filter: &str,
) -> GamedayResult<()> {
    log(format!(
        "Selected report fields: {}",
        fields
            .iter()
            .map(|field| format!("{} <- {}", field.header, field.source_label))
            .collect::<Vec<_>>()
            .join(", ")
    ));

    let field_ids: Vec<&str> = fields.iter().map(|field| field.id.as_str()).collect();
    page.evaluate(
        CONFIGURE_REPORT_JS,
        &json!({"fieldIds": field_ids, "recordFilterValue": record_filter}),
    )
    .await?;
    Ok(())
}

const BUILD_REPORT_REQUEST_JS: &str = r#"(innerJobId) => {
  const form = document.getElementById('reportform')
  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Report form was not found.')
  }

  const selectedIds = Array.from(
    document.querySelectorAll('#ROselectedfields .RO_fieldblock'),
  ).map((block) => block.id.replace(/^fld_/, ''))
  const selectedFieldList = document.getElementById('ROselectedfieldlist')
  if (selectedFieldList instanceof HTMLInputElement) {
    selectedFieldList.value = selectedIds.join(',')
  }

  const params = new URLSearchParams()
  for (const [key, value] of new FormData(form).entries()) {
    params.append(key, String(value))
  }
  params.append('ajax', '1')
  params.append('jobID', innerJobId)

  return {
    action: form.action,
    body: params.toString(),
    client: params.get('client') || '',
    selectedIds,
  }
}"#;

async fn build_report_request(page: &ChromePage, job_id: &str) -> GamedayResult<ReportRequest> {
    let value = page
        .evaluate(BUILD_REPORT_REQUEST_JS, &json!(job_id))
        .await?;
    let request: ReportRequest = serde_json::from_value(value)
        .map_err(|error| GamedayError(format!("page.evaluate: {error}")))?;
    Ok(ReportRequest {
        job_id: job_id.to_string(),
        ..request
    })
}

// ---------------------------------------------------------------------------
// running the report

fn status_params(request: &ReportRequest, format: &str) -> Vec<(String, String)> {
    [
        ("a", "REP_STATUS"),
        ("jobID", request.job_id.as_str()),
        ("client", request.client.as_str()),
        ("ajax", "1"),
        ("format", format),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect()
}

fn elapsed_ms(started_at: Instant) -> f64 {
    started_at.elapsed().as_secs_f64() * 1000.0
}

/// `runReportAndDownload(requestContext, request, timeoutMs)`: starts the
/// report job, polls its status until it completes and downloads the CSV.
pub async fn run_report_and_download(
    request_context: Arc<dyn ReportRequestContext>,
    request: &ReportRequest,
    timeout_ms: f64,
) -> GamedayResult<Vec<u8>> {
    log("Starting GameDay report job...");
    let post_context = request_context.clone();
    let post_url = request.action.clone();
    let post_body = request.body.clone();
    // the request may only answer once the job finishes; it runs alongside
    // the polling and its failure (`{error}`) is checked on completion
    let mut post = tokio::spawn(async move {
        post_context
            .post(
                post_url,
                ReportPostOptions {
                    headers: vec![(
                        "Content-Type".into(),
                        "application/x-www-form-urlencoded".into(),
                    )],
                    data: post_body,
                    timeout_ms,
                },
            )
            .await
            .err()
            .map(|error| error.0)
    });

    let started_at = Instant::now();
    let mut last_status = String::new();
    tokio::time::sleep(Duration::from_millis(5_000)).await;

    while elapsed_ms(started_at) < timeout_ms {
        let status_response = request_context
            .get(
                request.action.clone(),
                ReportGetOptions {
                    params: status_params(request, "download"),
                    timeout_ms: 30_000.0,
                },
            )
            .await?;
        let status_text = status_response.text();
        let status = parse_report_status(&status_text, status_response.status)?;

        if let Some(status) = status.as_deref()
            && !status.is_empty()
            && status != last_status
        {
            log(format!("Report status: {status}"));
            last_status = status.to_string();
        }

        if status.as_deref() == Some("Complete") {
            let post_result = tokio::time::timeout(Duration::from_millis(1_000), &mut post).await;
            if let Ok(Ok(Some(error))) = post_result {
                return fail(format!("The GameDay report request failed: {error}"));
            }
            return download_completed_report(request_context.as_ref(), request, timeout_ms).await;
        }

        if status.as_deref() == Some("Failed") {
            return fail("GameDay reported that the export job failed.");
        }

        tokio::time::sleep(Duration::from_millis(1_000)).await;
    }

    fail(format!(
        "Timed out waiting for GameDay report after {} seconds.",
        js::number_to_string((timeout_ms / 1000.0 + 0.5).floor())
    ))
}

fn js_slice(value: &str, length: usize) -> String {
    value.chars().take(length).collect()
}

fn parse_report_status(status_text: &str, status_code: u16) -> GamedayResult<Option<String>> {
    match serde_json::from_str::<Value>(status_text) {
        Ok(Value::Object(parsed)) => Ok(match parsed.get("status") {
            Some(Value::String(status)) => Some(status.clone()),
            _ => None,
        }),
        Ok(_) => Ok(None),
        Err(_) => fail(format!(
            "GameDay returned a non-JSON report status response ({status_code}): {}",
            js_slice(status_text, 250)
        )),
    }
}

async fn download_completed_report(
    request_context: &dyn ReportRequestContext,
    request: &ReportRequest,
    timeout_ms: f64,
) -> GamedayResult<Vec<u8>> {
    log("Downloading completed CSV...");
    let response = request_context
        .get(
            request.action.clone(),
            ReportGetOptions {
                params: status_params(request, "downloading"),
                timeout_ms,
            },
        )
        .await?;

    if !response.ok() {
        return fail(format!(
            "CSV download failed with HTTP {}: {}",
            response.status,
            js_slice(&response.text(), 250)
        ));
    }

    let content_type = response.header("content-type").unwrap_or_default();
    let preview_bytes = &response.body[..response.body.len().min(100)];
    let preview = String::from_utf8_lossy(preview_bytes);
    let looks_like_html = preview
        .trim_start_matches(js::is_whitespace)
        .starts_with('<');
    if js::to_lower(content_type).contains("text/html") && looks_like_html {
        return fail(format!(
            "CSV download looked like HTML instead of CSV: {}",
            js_slice(&preview, 100)
        ));
    }

    Ok(response.body)
}

// ---------------------------------------------------------------------------
// parsing the CSV

/// `parseMemberRows(csvBuffer)`.
pub fn parse_member_rows(csv: &[u8]) -> GamedayResult<Vec<GamedayExportMember>> {
    let text = String::from_utf8_lossy(csv);
    let non_empty_rows: Vec<Vec<String>> = parse_csv_rows(&text)
        .into_iter()
        .filter(|row| row.iter().any(|token| !js::trim(token).is_empty()))
        .collect();
    let rows = remove_trailing_gameday_summary_row(non_empty_rows);
    let Some((raw_headers, body)) = rows.split_first() else {
        return Ok(Vec::new());
    };

    let headers: Vec<String> = raw_headers.iter().map(|h| normalize_header(h)).collect();
    let columns = resolve_member_column_indexes(&headers)?;
    let cell = |row: &[String], index: usize| {
        row.get(index)
            .map(|value| js::trim(value).to_string())
            .unwrap_or_default()
    };

    Ok(body
        .iter()
        .map(|row| GamedayExportMember {
            team_name: cell(row, columns.team),
            first_name: cell(row, columns.first),
            last_name: cell(row, columns.last),
            email: cell(row, columns.email),
            gender: cell(row, columns.gender),
        })
        .filter(|member| {
            [
                &member.team_name,
                &member.first_name,
                &member.last_name,
                &member.email,
                &member.gender,
            ]
            .iter()
            .any(|value| !value.is_empty())
        })
        .collect())
}

fn remove_trailing_gameday_summary_row(mut rows: Vec<Vec<String>>) -> Vec<Vec<String>> {
    if rows.last().is_some_and(|row| is_gameday_summary_row(row)) {
        rows.pop();
    }
    rows
}

fn is_gameday_summary_row(row: &[String]) -> bool {
    let populated: Vec<&str> = row
        .iter()
        .map(|token| js::trim(token))
        .filter(|token| !token.is_empty())
        .collect();
    populated.len() == 1 && GAMEDAY_SUMMARY_ROW_PATTERN.is_match(populated[0])
}

struct MemberColumns {
    team: usize,
    first: usize,
    last: usize,
    email: usize,
    gender: usize,
}

fn resolve_member_column_indexes(headers: &[String]) -> GamedayResult<MemberColumns> {
    let resolved = (|| {
        Ok(MemberColumns {
            team: resolve_required_column(headers, &["teamname", "team"])?,
            first: resolve_required_column(headers, &["firstname", "givenname"])?,
            last: resolve_required_column(headers, &["familyname", "lastname", "surname"])?,
            email: resolve_required_column(headers, &["email", "emailaddress"])?,
            gender: resolve_required_column(headers, &["gender"])?,
        })
    })();
    match resolved {
        Err(_) if headers.len() >= 5 => Ok(MemberColumns {
            team: 0,
            first: 1,
            last: 2,
            email: 3,
            gender: 4,
        }),
        other => other,
    }
}

fn resolve_required_column(headers: &[String], candidates: &[&str]) -> GamedayResult<usize> {
    headers
        .iter()
        .position(|header| candidates.contains(&header.as_str()))
        .ok_or_else(|| {
            GamedayError(format!(
                "GameDay export was missing a required column ({}).",
                candidates.join("/")
            ))
        })
}

#[cfg(test)]
#[path = "exporter_tests.rs"]
mod tests;
