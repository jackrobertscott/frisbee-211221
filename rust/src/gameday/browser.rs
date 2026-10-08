//! Headless Chrome over the DevTools protocol ([`super::cdp`]): the subset of
//! Playwright that `server/src/gameday/exporter.ts` uses.
//!
//! - [`ChromeLauncher`] is `chromium.launch(...)`: it starts a locally
//!   installed Chrome/Chromium with a fresh temporary profile (Playwright's
//!   `browser.newContext()`), Playwright's 1280x720 viewport and its default
//!   `--no-sandbox` (Playwright's `chromiumSandbox: false`).
//! - [`ChromePage`] is `Page` plus the `locator(...).first()` calls the
//!   exporter makes. Waits poll the page (Playwright's auto-waiting) and fail
//!   with Playwright-style messages (`page.goto: Timeout 60000ms exceeded.`).
//! - [`BrowserRequestContext`] is `context.request`: plain HTTP requests that
//!   start with the browser's cookies and user agent and keep any cookies the
//!   responses set.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use futures_util::future::BoxFuture;
use serde::Serialize;
use serde_json::{Value, json};
use tokio::time::Instant;

use super::cdp::{Browser, CdpError, LaunchConfig, Session};

use super::exporter::{
    BrowserLauncher, GamedayError, GamedayResult, LaunchOptions, ReportGetOptions,
    ReportPostOptions, ReportRequestContext, ReportResponse,
};

/// Playwright's default timeout for actions (`fill`, `click`, `inputValue`,
/// `innerText`, ...).
pub const DEFAULT_TIMEOUT_MS: f64 = 30_000.0;

/// How often waits re-check the page (Playwright polls on animation frames).
const POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Playwright's `networkidle`: no requests in flight for this long.
const NETWORK_IDLE: Duration = Duration::from_millis(500);

/// Playwright's default launch timeout.
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(180);

impl From<CdpError> for GamedayError {
    fn from(error: CdpError) -> Self {
        GamedayError(error.0)
    }
}

fn timeout_error(api: &str, timeout_ms: f64) -> GamedayError {
    GamedayError(format!(
        "{api}: Timeout {}ms exceeded.",
        crate::js::number_to_string(timeout_ms)
    ))
}

/// A wait's time budget (`timeout: 0` means no limit, as in Playwright).
#[derive(Clone, Copy)]
struct Deadline {
    at: Option<Instant>,
}

impl Deadline {
    fn new(timeout_ms: f64) -> Self {
        let at = (timeout_ms > 0.0)
            .then(|| Instant::now() + Duration::from_secs_f64(timeout_ms / 1000.0));
        Deadline { at }
    }

    fn expired(&self) -> bool {
        self.at.is_some_and(|at| Instant::now() >= at)
    }

    fn remaining(&self) -> Duration {
        match self.at {
            Some(at) => at.saturating_duration_since(Instant::now()),
            None => Duration::from_secs(60 * 60 * 24 * 365),
        }
    }
}

// ---------------------------------------------------------------------------
// launching

/// Playwright's install locations for the `channel` launch option.
fn channel_executable_paths(channel: &str) -> Option<Vec<PathBuf>> {
    let unix = |linux: &str, mac: &str| -> Vec<PathBuf> {
        if cfg!(target_os = "macos") {
            vec![PathBuf::from(mac)]
        } else {
            vec![PathBuf::from(linux)]
        }
    };
    let windows = |suffix: &str| -> Vec<PathBuf> {
        ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"]
            .iter()
            .filter_map(|key| std::env::var(key).ok())
            .map(|prefix| PathBuf::from(prefix).join(suffix))
            .collect()
    };
    let paths = match channel {
        "chrome" if cfg!(windows) => windows("Google\\Chrome\\Application\\chrome.exe"),
        "chrome" => unix(
            "/opt/google/chrome/chrome",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        "chrome-beta" if cfg!(windows) => windows("Google\\Chrome Beta\\Application\\chrome.exe"),
        "chrome-beta" => unix(
            "/opt/google/chrome-beta/chrome",
            "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
        ),
        "chrome-dev" if cfg!(windows) => windows("Google\\Chrome Dev\\Application\\chrome.exe"),
        "chrome-dev" => unix(
            "/opt/google/chrome-unstable/chrome",
            "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
        ),
        "chrome-canary" if cfg!(windows) => windows("Google\\Chrome SxS\\Application\\chrome.exe"),
        "chrome-canary" => unix(
            "/opt/google/chrome-canary/chrome",
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        ),
        "msedge" if cfg!(windows) => windows("Microsoft\\Edge\\Application\\msedge.exe"),
        "msedge" => unix(
            "/opt/microsoft/msedge/msedge",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ),
        "msedge-beta" if cfg!(windows) => windows("Microsoft\\Edge Beta\\Application\\msedge.exe"),
        "msedge-beta" => unix(
            "/opt/microsoft/msedge-beta/msedge",
            "/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta",
        ),
        "msedge-dev" if cfg!(windows) => windows("Microsoft\\Edge Dev\\Application\\msedge.exe"),
        "msedge-dev" => unix(
            "/opt/microsoft/msedge-dev/msedge",
            "/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev",
        ),
        "msedge-canary" if cfg!(windows) => windows("Microsoft\\Edge SxS\\Application\\msedge.exe"),
        "msedge-canary" => unix(
            "/opt/microsoft/msedge-canary/msedge",
            "/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary",
        ),
        _ => return None,
    };
    Some(paths)
}

/// Resolves the browser binary: an explicit path, a channel's install
/// location, or (Playwright's bundled Chromium, which Rust does not ship) the
/// Chrome/Chromium found on `PATH` or in the usual install locations.
fn resolve_executable(options: &LaunchOptions) -> GamedayResult<PathBuf> {
    if let Some(path) = &options.executable_path {
        return Ok(PathBuf::from(path));
    }
    if let Some(channel) = &options.channel {
        let Some(paths) = channel_executable_paths(channel) else {
            return Err(GamedayError(format!(
                "Unsupported chromium channel \"{channel}\""
            )));
        };
        return match paths.iter().find(|path| path.exists()) {
            Some(path) => Ok(path.clone()),
            None => Err(GamedayError(format!(
                "Chromium distribution '{channel}' is not found at {}",
                paths
                    .first()
                    .map(|path| path.display().to_string())
                    .unwrap_or_default()
            ))),
        };
    }
    super::cdp::default_executable().map_err(|error| {
        GamedayError(format!(
            "Could not find a Chromium-based browser to launch: {error}"
        ))
    })
}

/// `chromium.launch(options)` for a locally installed Chrome/Chromium.
pub struct ChromeLauncher;

impl BrowserLauncher for ChromeLauncher {
    type Browser = ChromeBrowser;

    fn launch(&self, options: LaunchOptions) -> BoxFuture<'_, GamedayResult<ChromeBrowser>> {
        Box::pin(async move { ChromeBrowser::launch(options).await })
    }
}

/// A running browser with its own temporary profile.
pub struct ChromeBrowser {
    browser: Browser,
    // removed when the browser is dropped
    _profile: tempfile::TempDir,
}

impl ChromeBrowser {
    async fn launch(options: LaunchOptions) -> GamedayResult<Self> {
        let executable = resolve_executable(&options)?;
        let profile = tempfile::Builder::new()
            .prefix("gameday-export-profile-")
            .tempdir()
            .map_err(|error| {
                GamedayError(format!("Could not create a browser profile: {error}"))
            })?;
        let browser = Browser::launch(LaunchConfig {
            executable: &executable,
            user_data_dir: profile.path(),
            headless: options.headless,
            args: &options.args,
            timeout: LAUNCH_TIMEOUT,
        })
        .await
        .map_err(|error| {
            GamedayError(format!(
                "Failed to launch {}: {error}",
                executable.display()
            ))
        })?;
        Ok(ChromeBrowser {
            browser,
            _profile: profile,
        })
    }

    fn session(&self) -> Session {
        Session {
            connection: self.browser.connection.clone(),
            id: None,
        }
    }

    /// `context.newPage()`.
    pub async fn new_page(&self) -> GamedayResult<ChromePage> {
        let browser = self.session();
        let target = browser
            .execute("Target.createTarget", json!({"url": "about:blank"}))
            .await?;
        let target_id = target["targetId"].as_str().unwrap_or_default().to_string();
        let attached = browser
            .execute(
                "Target.attachToTarget",
                json!({"targetId": target_id, "flatten": true}),
            )
            .await?;
        let session = Session {
            connection: self.browser.connection.clone(),
            id: attached["sessionId"].as_str().map(str::to_string),
        };
        ChromePage::attach(session, target_id).await
    }

    /// `context.request`, seeded with the browser's current cookies.
    pub async fn request_context(&self) -> GamedayResult<BrowserRequestContext> {
        let browser = self.session();
        let cookies = browser.execute("Storage.getCookies", json!({})).await?;
        let version = browser.execute("Browser.getVersion", json!({})).await?;
        let user_agent = version["userAgent"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let jar = reqwest::cookie::Jar::default();
        for cookie in cookies["cookies"].as_array().into_iter().flatten() {
            let text = |key: &str| cookie[key].as_str().unwrap_or_default();
            let (domain, path, secure) = (text("domain"), text("path"), cookie["secure"] == true);
            let host = domain.trim_start_matches('.');
            let scheme = if secure { "https" } else { "http" };
            let Ok(url) = url::Url::parse(&format!("{scheme}://{host}{path}")) else {
                continue;
            };
            let mut header = format!("{}={}; Path={path}", text("name"), text("value"));
            if domain.starts_with('.') {
                header.push_str(&format!("; Domain={host}"));
            }
            if secure {
                header.push_str("; Secure");
            }
            jar.add_cookie_str(&header, &url);
        }
        let client = crate::utils::http_client::builder()
            .cookie_provider(Arc::new(jar))
            .user_agent(user_agent)
            .redirect(reqwest::redirect::Policy::limited(20))
            .build()
            .map_err(|error| GamedayError(error_chain(&error)))?;
        Ok(BrowserRequestContext { client })
    }

    /// `browser.close()`: closes Chrome and removes its profile.
    pub async fn close(self) {
        self.browser.close().await;
    }
}

fn error_chain(error: &dyn std::error::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        let text = cause.to_string();
        if !message.contains(&text) {
            message.push_str(": ");
            message.push_str(&text);
        }
        source = cause.source();
    }
    message
}

// ---------------------------------------------------------------------------
// the page

/// `page.locator(selector).filter({hasText}).first()`. `has_text` is a
/// case-insensitive regular expression source (`new RegExp(source, 'i')`).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Locator {
    pub selector: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_text: Option<String>,
}

impl Locator {
    pub fn new(selector: impl Into<String>) -> Self {
        Locator {
            selector: selector.into(),
            has_text: None,
        }
    }

    pub fn has_text(mut self, pattern: impl Into<String>) -> Self {
        self.has_text = Some(pattern.into());
        self
    }
}

/// Finds a locator's elements (Playwright's `hasText` matches the element's
/// text, ignoring `<script>`, `<style>` and `<noscript>`).
const FIND_JS: &str = r#"(loc) => {
  const elements = Array.from(document.querySelectorAll(loc.selector))
  if (!loc.hasText) return elements
  const pattern = new RegExp(loc.hasText, 'i')
  const text = (node) => {
    let out = ''
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue
      else if (
        child.nodeType === Node.ELEMENT_NODE &&
        !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(child.nodeName)
      ) out += text(child)
    }
    return out
  }
  return elements.filter((element) => pattern.test(text(element)))
}"#;

/// Brings the first match into view and reports whether it can be acted on.
const ACTIONABLE_JS: &str = r#"(element) => {
  if (!element) return {state: 'missing'}
  if (!element.isConnected) return {state: 'missing'}
  element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'})
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  if (style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
    return {state: 'hidden'}
  }
  if (element.disabled) return {state: 'disabled'}
  return {state: 'ok', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
}"#;

#[derive(Default)]
struct NetworkActivity {
    in_flight: HashSet<String>,
    last_change: Option<Instant>,
}

/// A browser tab.
#[derive(Clone)]
pub struct ChromePage {
    page: Session,
    target_id: String,
    network: Arc<Mutex<NetworkActivity>>,
}

impl ChromePage {
    async fn attach(page: Session, target_id: String) -> GamedayResult<Self> {
        let mut started = page.listen("Network.requestWillBeSent");
        let mut finished = page.listen("Network.loadingFinished");
        let mut failed = page.listen("Network.loadingFailed");
        page.execute("Page.enable", json!({})).await?;
        page.execute("Network.enable", json!({})).await?;
        page.execute("Page.setLifecycleEventsEnabled", json!({"enabled": true}))
            .await?;
        // Playwright's default 1280x720 viewport
        page.execute(
            "Emulation.setDeviceMetricsOverride",
            json!({
                "width": 1280,
                "height": 720,
                "deviceScaleFactor": 1,
                "mobile": false,
                "screenOrientation": {"type": "portraitPrimary", "angle": 0},
            }),
        )
        .await?;
        let network = Arc::new(Mutex::new(NetworkActivity::default()));
        let tracker = network.clone();
        tokio::spawn(async move {
            let update = |event: Value, add: bool| {
                let id = event["requestId"].as_str().unwrap_or_default().to_string();
                let mut activity = tracker.lock().unwrap_or_else(|e| e.into_inner());
                if add {
                    activity.in_flight.insert(id);
                } else {
                    activity.in_flight.remove(&id);
                }
                activity.last_change = Some(Instant::now());
            };
            loop {
                tokio::select! {
                    Some(event) = started.recv() => update(event, true),
                    Some(event) = finished.recv() => update(event, false),
                    Some(event) = failed.recv() => update(event, false),
                    else => break,
                }
            }
        });
        Ok(ChromePage {
            page,
            target_id,
            network,
        })
    }

    /// Runtime.evaluate, returning the value (`undefined` becomes `null`).
    async fn evaluate_expression(&self, api: &str, expression: String) -> GamedayResult<Value> {
        let mut returns = self
            .page
            .execute(
                "Runtime.evaluate",
                json!({"expression": expression, "returnByValue": true, "awaitPromise": true}),
            )
            .await
            .map_err(|error| GamedayError(format!("{api}: {error}")))?;
        if let Some(details) = returns.get("exceptionDetails") {
            let description = details["exception"]["description"]
                .as_str()
                .or(details["text"].as_str())
                .unwrap_or_default();
            let first_line = description.lines().next().unwrap_or_default().to_string();
            return Err(GamedayError(format!("{api}: {first_line}")));
        }
        Ok(returns["result"]["value"].take())
    }

    /// `page.evaluate(fn, arg)`: `function` is JavaScript function source.
    pub async fn evaluate(&self, function: &str, arg: &Value) -> GamedayResult<Value> {
        self.evaluate_expression("page.evaluate", format!("({function})({arg})"))
            .await
    }

    async fn evaluate_on_first(
        &self,
        api: &str,
        locator: &Locator,
        function: &str,
        arg: &Value,
    ) -> GamedayResult<Value> {
        let expression = format!(
            "((find, loc, fn, arg) => fn(find(loc)[0], arg))({FIND_JS}, {}, {function}, {arg})",
            json!(locator)
        );
        self.evaluate_expression(api, expression).await
    }

    /// `context.addInitScript(source)` for this page.
    pub async fn add_init_script(&self, source: &str) -> GamedayResult<()> {
        self.page
            .execute(
                "Page.addScriptToEvaluateOnNewDocument",
                json!({"source": source}),
            )
            .await?;
        Ok(())
    }

    /// `page.goto(url, {waitUntil: 'domcontentloaded', timeout})`.
    pub async fn goto(&self, url: &str, timeout_ms: f64) -> GamedayResult<()> {
        let api = "page.goto";
        let deadline = Deadline::new(timeout_ms);
        let mut lifecycle = self.page.listen("Page.lifecycleEvent");
        let navigation = tokio::time::timeout(
            deadline.remaining(),
            self.page.execute("Page.navigate", json!({"url": url})),
        )
        .await
        .map_err(|_| timeout_error(api, timeout_ms))?
        .map_err(|error| GamedayError(format!("{api}: {error}")))?;
        if let Some(error) = navigation["errorText"]
            .as_str()
            .filter(|text| !text.is_empty())
        {
            return Err(GamedayError(format!("{api}: {error} at {url}")));
        }
        // same-document navigations have no new loader
        let Some(loader_id) = navigation["loaderId"].as_str() else {
            return Ok(());
        };
        loop {
            match tokio::time::timeout(deadline.remaining(), lifecycle.recv()).await {
                Ok(Some(event)) => {
                    if event["loaderId"] == loader_id
                        && (event["name"] == "DOMContentLoaded" || event["name"] == "load")
                    {
                        return Ok(());
                    }
                }
                Ok(None) => return Err(GamedayError(format!("{api}: Target page closed"))),
                Err(_) => return Err(timeout_error(api, timeout_ms)),
            }
        }
    }

    /// `page.url()`.
    pub async fn url(&self) -> GamedayResult<String> {
        match self
            .evaluate_expression("page.url", "location.href".into())
            .await
        {
            Ok(Value::String(href)) => Ok(href),
            _ => {
                let info = self
                    .page
                    .connection
                    .call(
                        None,
                        "Target.getTargetInfo",
                        json!({"targetId": self.target_id}),
                    )
                    .await?;
                Ok(info["targetInfo"]["url"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string())
            }
        }
    }

    /// `page.content()`.
    pub async fn content(&self) -> GamedayResult<String> {
        let value = self
            .evaluate_expression(
                "page.content",
                r#"(() => {
                  let retVal = ''
                  if (document.doctype) retVal = new XMLSerializer().serializeToString(document.doctype)
                  if (document.documentElement) retVal += document.documentElement.outerHTML
                  return retVal
                })()"#
                    .into(),
            )
            .await?;
        Ok(value.as_str().unwrap_or_default().to_string())
    }

    /// `page.waitForTimeout(ms)`.
    pub async fn wait_for_timeout(&self, ms: u64) {
        tokio::time::sleep(Duration::from_millis(ms)).await;
    }

    async fn ready_state(&self) -> Option<String> {
        match self
            .evaluate_expression("page.waitForLoadState", "document.readyState".into())
            .await
        {
            Ok(Value::String(state)) => Some(state),
            _ => None,
        }
    }

    /// `page.waitForLoadState('domcontentloaded' | 'load', {timeout})`.
    pub async fn wait_for_load_state(
        &self,
        state: LoadState,
        timeout_ms: f64,
    ) -> GamedayResult<()> {
        let deadline = Deadline::new(timeout_ms);
        loop {
            let ready = match (state, self.ready_state().await.as_deref()) {
                (LoadState::DomContentLoaded, Some("interactive" | "complete")) => true,
                (LoadState::Load, Some("complete")) => true,
                (LoadState::NetworkIdle, Some("complete")) => self.network_idle(),
                _ => false,
            };
            if ready {
                return Ok(());
            }
            if deadline.expired() {
                return Err(timeout_error("page.waitForLoadState", timeout_ms));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    fn network_idle(&self) -> bool {
        let activity = self.network.lock().unwrap_or_else(|e| e.into_inner());
        activity.in_flight.is_empty()
            && activity
                .last_change
                .is_none_or(|changed| changed.elapsed() >= NETWORK_IDLE)
    }

    /// `page.waitForURL(predicate, {timeout})`: the URL matches and the page
    /// has loaded (Playwright's default `waitUntil: 'load'`).
    pub async fn wait_for_url(
        &self,
        predicate: impl Fn(&url::Url) -> bool,
        timeout_ms: f64,
    ) -> GamedayResult<()> {
        let deadline = Deadline::new(timeout_ms);
        loop {
            let state = self
                .evaluate_expression(
                    "page.waitForURL",
                    "({href: location.href, ready: document.readyState})".into(),
                )
                .await
                .ok();
            if let Some(state) = state {
                let href = state["href"].as_str().unwrap_or_default();
                let matches = url::Url::parse(href).is_ok_and(|url| predicate(&url));
                if matches && state["ready"] == "complete" {
                    return Ok(());
                }
            }
            if deadline.expired() {
                return Err(timeout_error("page.waitForURL", timeout_ms));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    /// `page.waitForFunction(expression, null, {timeout})`.
    pub async fn wait_for_function(&self, expression: &str, timeout_ms: f64) -> GamedayResult<()> {
        let deadline = Deadline::new(timeout_ms);
        loop {
            let truthy = self
                .evaluate_expression("page.waitForFunction", format!("!!({expression})"))
                .await;
            match truthy {
                Ok(Value::Bool(true)) => return Ok(()),
                // a throwing predicate fails the wait, as in Playwright
                Err(error) if !is_navigation_error(&error) => return Err(error),
                _ => {}
            }
            if deadline.expired() {
                return Err(timeout_error("page.waitForFunction", timeout_ms));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    /// `page.waitForSelector(selector, {timeout})` (state `visible`).
    pub async fn wait_for_selector(&self, selector: &str, timeout_ms: f64) -> GamedayResult<()> {
        let deadline = Deadline::new(timeout_ms);
        let expression = format!(
            r#"(() => {{
              const element = document.querySelector({})
              if (!element) return false
              const style = getComputedStyle(element)
              const rect = element.getBoundingClientRect()
              return style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
            }})()"#,
            json!(selector)
        );
        loop {
            if let Ok(Value::Bool(true)) = self
                .evaluate_expression("page.waitForSelector", expression.clone())
                .await
            {
                return Ok(());
            }
            if deadline.expired() {
                return Err(timeout_error("page.waitForSelector", timeout_ms));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    /// `locator.count()` (of the unfiltered `first()` locator: 0 or 1).
    pub async fn count(&self, locator: &Locator) -> GamedayResult<usize> {
        let value = self
            .evaluate_on_first(
                "locator.count",
                locator,
                "(element) => element ? 1 : 0",
                &Value::Null,
            )
            .await?;
        Ok(value.as_u64().unwrap_or(0) as usize)
    }

    /// Waits for the first match to be visible and enabled; returns its
    /// centre in viewport coordinates.
    async fn wait_for_actionable(
        &self,
        api: &str,
        locator: &Locator,
        timeout_ms: f64,
    ) -> GamedayResult<(f64, f64)> {
        let deadline = Deadline::new(timeout_ms);
        loop {
            let result = self
                .evaluate_on_first(api, locator, ACTIONABLE_JS, &Value::Null)
                .await;
            match result {
                Ok(state) if state["state"] == "ok" => {
                    let x = state["x"].as_f64().unwrap_or_default();
                    let y = state["y"].as_f64().unwrap_or_default();
                    return Ok((x, y));
                }
                Err(error) if !is_navigation_error(&error) => return Err(error),
                _ => {}
            }
            if deadline.expired() {
                return Err(timeout_error(api, timeout_ms));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    /// `locator.fill(value)`: focus, select the current text, type `value`.
    pub async fn fill(&self, locator: &Locator, value: &str) -> GamedayResult<()> {
        let api = "locator.fill";
        self.wait_for_actionable(api, locator, DEFAULT_TIMEOUT_MS)
            .await?;
        let focused = self
            .evaluate_on_first(
                api,
                locator,
                r#"(element) => {
                  if (!element) return 'missing'
                  const editable =
                    element instanceof HTMLInputElement ||
                    element instanceof HTMLTextAreaElement ||
                    element.isContentEditable
                  if (!editable) return 'not-editable'
                  element.focus()
                  if (typeof element.select === 'function') {
                    try { element.select() } catch {}
                  } else {
                    const range = document.createRange()
                    range.selectNodeContents(element)
                    const selection = window.getSelection()
                    selection.removeAllRanges()
                    selection.addRange(range)
                  }
                  return 'ok'
                }"#,
                &Value::Null,
            )
            .await?;
        if focused == "not-editable" {
            return Err(GamedayError(format!(
                "{api}: Error: Element is not an <input>, <textarea> or [contenteditable] element"
            )));
        }
        if value.is_empty() {
            self.evaluate_on_first(
                api,
                locator,
                r#"(element) => {
                  if (!element) return
                  if ('value' in element) element.value = ''
                  else element.textContent = ''
                  element.dispatchEvent(new Event('input', {bubbles: true}))
                  element.dispatchEvent(new Event('change', {bubbles: true}))
                }"#,
                &Value::Null,
            )
            .await?;
        } else {
            self.page
                .execute("Input.insertText", json!({"text": value}))
                .await?;
        }
        Ok(())
    }

    /// `locator.click()`: a left mouse click at the element's centre.
    pub async fn click(&self, locator: &Locator) -> GamedayResult<()> {
        let (x, y) = self
            .wait_for_actionable("locator.click", locator, DEFAULT_TIMEOUT_MS)
            .await?;
        self.page
            .execute(
                "Input.dispatchMouseEvent",
                json!({"type": "mouseMoved", "x": x, "y": y}),
            )
            .await?;
        for kind in ["mousePressed", "mouseReleased"] {
            self.page
                .execute(
                    "Input.dispatchMouseEvent",
                    json!({
                        "type": kind,
                        "x": x,
                        "y": y,
                        "button": "left",
                        "buttons": 1,
                        "clickCount": 1,
                    }),
                )
                .await?;
        }
        Ok(())
    }

    /// Waits for the first match to exist, then reads from it.
    async fn read_first(
        &self,
        api: &str,
        locator: &Locator,
        function: &str,
        arg: &Value,
    ) -> GamedayResult<Value> {
        let deadline = Deadline::new(DEFAULT_TIMEOUT_MS);
        loop {
            let result = self
                .evaluate_on_first(
                    api,
                    locator,
                    &format!(
                        "(element, arg) => element ? {{value: ({function})(element, arg)}} : null"
                    ),
                    arg,
                )
                .await;
            match result {
                Ok(Value::Object(mut found)) => {
                    return Ok(found.remove("value").unwrap_or(Value::Null));
                }
                Err(error) if !is_navigation_error(&error) => return Err(error),
                _ => {}
            }
            if deadline.expired() {
                return Err(timeout_error(api, DEFAULT_TIMEOUT_MS));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    /// `locator.getAttribute(name)`.
    pub async fn get_attribute(
        &self,
        locator: &Locator,
        name: &str,
    ) -> GamedayResult<Option<String>> {
        let value = self
            .read_first(
                "locator.getAttribute",
                locator,
                "(element, name) => element.getAttribute(name)",
                &json!(name),
            )
            .await?;
        Ok(value.as_str().map(str::to_string))
    }

    /// `locator.inputValue()`.
    pub async fn input_value(&self, locator: &Locator) -> GamedayResult<String> {
        let api = "locator.inputValue";
        let value = self
            .read_first(
                api,
                locator,
                r#"(element) => {
                  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                    return {ok: element.value}
                  }
                  return {error: 'Node is not an <input>, <textarea> or <select> element'}
                }"#,
                &Value::Null,
            )
            .await?;
        match value.get("ok").and_then(Value::as_str) {
            Some(text) => Ok(text.to_string()),
            None => Err(GamedayError(format!(
                "{api}: Error: {}",
                value["error"].as_str().unwrap_or_default()
            ))),
        }
    }

    /// `locator.innerText()`.
    pub async fn inner_text(&self, locator: &Locator) -> GamedayResult<String> {
        let value = self
            .read_first(
                "locator.innerText",
                locator,
                "(element) => element.innerText",
                &Value::Null,
            )
            .await?;
        Ok(value.as_str().unwrap_or_default().to_string())
    }

    /// `page.screenshot({path, fullPage: true})`.
    pub async fn screenshot_full_page(&self, path: &Path) -> GamedayResult<()> {
        let metrics = self
            .page
            .execute("Page.getLayoutMetrics", json!({}))
            .await?;
        let size = match metrics.get("cssContentSize") {
            Some(size) => size,
            None => &metrics["contentSize"],
        };
        let shot = self
            .page
            .execute(
                "Page.captureScreenshot",
                json!({
                    "format": "png",
                    "captureBeyondViewport": true,
                    "clip": {
                        "x": 0,
                        "y": 0,
                        "width": size["width"],
                        "height": size["height"],
                        "scale": 1,
                    },
                }),
            )
            .await?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(shot["data"].as_str().unwrap_or_default())
            .map_err(|error| GamedayError(error.to_string()))?;
        tokio::fs::write(path, bytes)
            .await
            .map_err(|error| GamedayError(error.to_string()))
    }

    /// The page's CDP session (tests use it to intercept requests).
    pub fn raw(&self) -> &Session {
        &self.page
    }
}

/// Errors from evaluating while the page navigates; waits retry them.
fn is_navigation_error(error: &GamedayError) -> bool {
    let message = error.0.to_lowercase();
    message.contains("context")
        || message.contains("navigat")
        || message.contains("target closed")
        || message.contains("timeout")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoadState {
    DomContentLoaded,
    Load,
    NetworkIdle,
}

// ---------------------------------------------------------------------------
// HTTP requests with the browser's session

/// `context.request` over `reqwest`, sharing the browser's cookies.
pub struct BrowserRequestContext {
    client: reqwest::Client,
}

/// `url.searchParams.set(name, value)` for each param, as Playwright applies
/// `params`.
fn url_with_params(url: &str, params: &[(String, String)]) -> GamedayResult<url::Url> {
    let mut parsed = url::Url::parse(url).map_err(|_| GamedayError("Invalid URL".into()))?;
    if params.is_empty() {
        return Ok(parsed);
    }
    let mut pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    for (name, value) in params {
        match pairs.iter().position(|(key, _)| key == name) {
            Some(first) => {
                pairs[first].1 = value.clone();
                let mut index = 0;
                pairs.retain(|(key, _)| {
                    let keep = key != name || index == first;
                    index += 1;
                    keep
                });
            }
            None => pairs.push((name.clone(), value.clone())),
        }
    }
    parsed.query_pairs_mut().clear().extend_pairs(pairs);
    Ok(parsed)
}

fn request_timeout(timeout_ms: f64) -> Option<Duration> {
    (timeout_ms > 0.0).then(|| Duration::from_secs_f64(timeout_ms / 1000.0))
}

impl BrowserRequestContext {
    async fn send(
        &self,
        api: &str,
        mut request: reqwest::RequestBuilder,
        timeout_ms: f64,
    ) -> GamedayResult<ReportResponse> {
        if let Some(timeout) = request_timeout(timeout_ms) {
            request = request.timeout(timeout);
        }
        let map_error = |error: reqwest::Error| {
            if error.is_timeout() {
                timeout_error(api, timeout_ms)
            } else {
                GamedayError(format!("{api}: {}", error_chain(&error)))
            }
        };
        let response = request.send().await.map_err(map_error)?;
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .map(|(name, value)| {
                (
                    name.as_str().to_string(),
                    String::from_utf8_lossy(value.as_bytes()).into_owned(),
                )
            })
            .collect();
        let body = response.bytes().await.map_err(map_error)?.to_vec();
        Ok(ReportResponse {
            status,
            headers,
            body,
        })
    }
}

impl ReportRequestContext for BrowserRequestContext {
    fn get(
        &self,
        url: String,
        options: ReportGetOptions,
    ) -> BoxFuture<'_, GamedayResult<ReportResponse>> {
        Box::pin(async move {
            let url = url_with_params(&url, &options.params)?;
            self.send(
                "apiRequestContext.get",
                self.client.get(url),
                options.timeout_ms,
            )
            .await
        })
    }

    fn post(&self, url: String, options: ReportPostOptions) -> BoxFuture<'_, GamedayResult<()>> {
        Box::pin(async move {
            let url = url_with_params(&url, &[])?;
            let mut request = self.client.post(url).body(options.data);
            for (name, value) in &options.headers {
                request = request.header(name, value);
            }
            self.send("apiRequestContext.post", request, options.timeout_ms)
                .await
                .map(|_| ())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sets_params_like_url_search_params() {
        let params = vec![
            ("a".to_string(), "REP_STATUS".to_string()),
            ("jobID".to_string(), "j 1".to_string()),
        ];
        assert_eq!(
            url_with_params("https://x.test/main.cgi?a=old&b=1&a=dup", &params)
                .unwrap()
                .as_str(),
            "https://x.test/main.cgi?a=REP_STATUS&b=1&jobID=j+1"
        );
        assert_eq!(
            url_with_params("https://x.test/main.cgi", &[])
                .unwrap()
                .as_str(),
            "https://x.test/main.cgi"
        );
        assert_eq!(
            url_with_params("not a url", &[]).unwrap_err().0,
            "Invalid URL"
        );
    }

    #[test]
    fn resolves_channels_to_install_paths() {
        assert!(channel_executable_paths("chrome").is_some());
        assert!(channel_executable_paths("msedge").is_some());
        assert!(channel_executable_paths("firefox").is_none());
        let error = resolve_executable(&LaunchOptions {
            headless: true,
            args: vec![],
            executable_path: None,
            channel: Some("firefox".into()),
        })
        .unwrap_err();
        assert_eq!(error.0, "Unsupported chromium channel \"firefox\"");
    }

    #[test]
    fn prefers_an_explicit_executable() {
        let path = resolve_executable(&LaunchOptions {
            headless: true,
            args: vec![],
            executable_path: Some("/opt/chrome".into()),
            channel: Some("chrome".into()),
        })
        .unwrap();
        assert_eq!(path, PathBuf::from("/opt/chrome"));
    }
}
