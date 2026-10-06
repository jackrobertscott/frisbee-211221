//! Port of `server/src/http/intrusion.ts`: request screening. Clean requests
//! pass untracked; exploit probes, unknown routes from foreign origins and
//! forbidden origins earn strikes per client IP, and enough strikes block the
//! IP (answered through the tarpit) for escalating durations.

use super::tarpit::TarpitPlan;
use crate::js;
use crate::log;
use crate::shared::errors::{AppError, ErrorOptions, forbidden_error, not_found_error};
use indexmap::IndexMap;
use regex::{Regex, RegexBuilder};
use std::sync::{Mutex, OnceLock};

const STRIKE_RESET_MS: i64 = 30 * 60 * 1000;
const LOG_COOLDOWN_MS: i64 = 30 * 1000;
const BLOCK_THRESHOLD: i64 = 6;
const PRUNE_INTERVAL: u64 = 256;
const MAX_TRACKED_IPS: usize = 10000;
const BLOCK_DURATIONS_MS: [i64; 4] = [
    15 * 60 * 1000,
    60 * 60 * 1000,
    360 * 60 * 1000,
    1440 * 60 * 1000,
];
const STATE_RETENTION_MS: i64 = STRIKE_RESET_MS + BLOCK_DURATIONS_MS[3];

fn suspicious_path_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            r"(^|/)\.git(?:/|$)",
            r"(^|/)(wp-admin|wp-content|wp-includes|cgi-bin)(?:/|$)",
            r"(^|/)(xmlrpc|xmrlpc)\.php$",
            r"(^|/)\.well-known(?:/|$)",
            r"\.(?:php[0-9]*|asp|aspx|jsp|cgi)(?:/|$)",
        ]
        .iter()
        .map(|pattern| {
            RegexBuilder::new(pattern)
                .case_insensitive(true)
                .build()
                .unwrap_or_else(|error| panic!("invalid intrusion pattern: {error}"))
        })
        .collect()
    })
}

#[derive(Clone, Debug, Default)]
struct IntrusionState {
    score: i64,
    blocked_until: i64,
    block_count: usize,
    last_seen_at: i64,
    last_logged_at: i64,
}

/// What `getClientIp` reads from a request.
#[derive(Clone, Debug, Default)]
pub struct ClientInfo {
    /// `req.socket.remoteAddress`.
    pub remote_address: Option<String>,
    /// `req.headers['x-forwarded-for']` (Node joins duplicates into one value).
    pub forwarded_for: Vec<String>,
}

impl ClientInfo {
    pub fn new(remote_address: Option<&str>, forwarded_for: Option<&str>) -> Self {
        ClientInfo {
            remote_address: remote_address.map(str::to_string),
            forwarded_for: forwarded_for
                .map(|v| vec![v.to_string()])
                .unwrap_or_default(),
        }
    }
}

/// `IInspectOptions`.
#[derive(Clone, Debug)]
pub struct InspectOptions<'a> {
    pub pathname: &'a str,
    pub known_route: bool,
    pub origin_allowed: bool,
    pub origin: Option<&'a str>,
}

/// The per-IP screening state (module-global in TS, one per app here).
#[derive(Default)]
pub struct Intrusion {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    state_by_ip: IndexMap<String, IntrusionState>,
    inspect_count: u64,
}

fn parse_ipv4(value: &str) -> Option<[u32; 4]> {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut out = [0u32; 4];
    for (index, part) in parts.iter().enumerate() {
        // Number(part): empty is 0, anything non-integral fails
        let number = js::string_to_number(part);
        if !js::is_integer(number) || !(0.0..=255.0).contains(&number) {
            return None;
        }
        out[index] = number as u32;
    }
    Some(out)
}

fn is_private_ipv4(value: &str) -> bool {
    let Some(parts) = parse_ipv4(value) else {
        return false;
    };
    parts[0] == 10
        || parts[0] == 127
        // Railway forwards public traffic from RFC 6598 shared address space.
        || (parts[0] == 100 && (64..=127).contains(&parts[1]))
        || (parts[0] == 192 && parts[1] == 168)
        || (parts[0] == 172 && (16..=31).contains(&parts[1]))
}

fn strip_mapped(value: &str) -> &str {
    value.strip_prefix("::ffff:").unwrap_or(value)
}

fn is_trusted_proxy(ip: Option<&str>) -> bool {
    let Some(ip) = ip.filter(|ip| !ip.is_empty()) else {
        return false;
    };
    let normalized = strip_mapped(ip).to_lowercase();
    if normalized == "::1" || normalized == "localhost" {
        return true;
    }
    if normalized.starts_with("fc") || normalized.starts_with("fd") {
        return true;
    }
    is_private_ipv4(&normalized)
}

/// `getClientIp(req)`: the socket address, or — behind a trusted proxy — the
/// rightmost forwarded hop that is not itself a trusted proxy.
pub fn get_client_ip(info: &ClientInfo) -> String {
    let remote_address = info.remote_address.as_deref().map(js::trim);
    let mut raw_ip = remote_address
        .filter(|a| !a.is_empty())
        .unwrap_or("unknown")
        .to_string();
    if is_trusted_proxy(remote_address) {
        // proxies append the address they saw, so walk from the right past our
        // own proxy hops; entries further left are client-supplied and spoofable
        let header = info.forwarded_for.first().cloned().unwrap_or_default();
        let hops: Vec<&str> = header
            .split(',')
            .map(js::trim)
            .filter(|hop| !hop.is_empty())
            .collect();
        for hop in hops.iter().rev() {
            raw_ip = hop.to_string();
            if !is_trusted_proxy(Some(hop)) {
                break;
            }
        }
    }
    strip_mapped(&raw_ip).to_string()
}

/// `getPathname(url)`: the WHATWG URL pathname, falling back to splitting on `?`.
pub fn get_pathname(url: Option<&str>) -> String {
    let Some(url) = url.filter(|u| !u.is_empty()) else {
        return "/".into();
    };
    let base = url::Url::parse("http://localhost").ok();
    match base.and_then(|base| base.join(url).ok()) {
        Some(parsed) => {
            let path = parsed.path();
            if path.is_empty() {
                "/".into()
            } else {
                path.to_string()
            }
        }
        None => {
            let head = url.split('?').next().unwrap_or("");
            if head.is_empty() {
                "/".into()
            } else {
                head.to_string()
            }
        }
    }
}

fn create_tarpit_plan(blocked: bool, suspicious_path: bool) -> TarpitPlan {
    if blocked {
        return TarpitPlan {
            body: "Not found.".into(),
            drip_interval_ms: 4000,
            hold_ms: 45000,
            status_code: 404,
        };
    }
    if suspicious_path {
        return TarpitPlan {
            body: "Not found.".into(),
            drip_interval_ms: 5000,
            hold_ms: 25000,
            status_code: 404,
        };
    }
    TarpitPlan {
        body: "Not found.".into(),
        drip_interval_ms: 6000,
        hold_ms: 12000,
        status_code: 404,
    }
}

fn iso(ms: i64) -> String {
    js::date::to_iso_string(ms)
}

impl Inner {
    fn prune(&mut self, now: i64) {
        self.state_by_ip.retain(|_, state| {
            !(state.blocked_until <= now && now - state.last_seen_at > STATE_RETENTION_MS)
        });
    }

    fn get_existing_state(&mut self, ip: &str, now: i64) -> bool {
        self.inspect_count += 1;
        if self.inspect_count.is_multiple_of(PRUNE_INTERVAL) {
            self.prune(now);
        }
        let Some(existing) = self.state_by_ip.get_mut(ip) else {
            return false;
        };
        if existing.blocked_until <= now && now - existing.last_seen_at > STRIKE_RESET_MS {
            existing.score = 0;
        }
        existing.last_seen_at = now;
        true
    }

    // only offending IPs are tracked, and the map is bounded so a flood of
    // spoofed or rotating addresses cannot grow memory without limit
    fn create_state(&mut self, ip: &str, now: i64) {
        if self.state_by_ip.len() >= MAX_TRACKED_IPS {
            self.prune(now);
            if self.state_by_ip.len() >= MAX_TRACKED_IPS {
                self.state_by_ip.shift_remove_index(0);
            }
        }
        self.state_by_ip.insert(
            ip.to_string(),
            IntrusionState {
                last_seen_at: now,
                ..Default::default()
            },
        );
    }
}

fn log_event(ip: &str, state: &mut IntrusionState, message: &str, now: i64, force: bool) {
    if !force && now - state.last_logged_at < LOG_COOLDOWN_MS {
        return;
    }
    state.last_logged_at = now;
    log::warn(format!("[intrusion] {ip} {message}"));
}

fn add_strike(
    ip: &str,
    state: &mut IntrusionState,
    weight: i64,
    reason: &str,
    path: &str,
    now: i64,
) {
    state.score += weight;
    if state.score < BLOCK_THRESHOLD {
        let message = format!("{reason} on \"{path}\" score={}", state.score);
        log_event(ip, state, &message, now, false);
        return;
    }
    state.score = 0;
    state.block_count += 1;
    state.blocked_until =
        now + BLOCK_DURATIONS_MS[(state.block_count - 1).min(BLOCK_DURATIONS_MS.len() - 1)];
    let message = format!(
        "{reason} on \"{path}\" blocked-until={}",
        iso(state.blocked_until)
    );
    log_event(ip, state, &message, now, true);
}

impl Intrusion {
    pub fn new() -> Self {
        Intrusion::default()
    }

    /// `intrusion.inspect(req, options)` at the current time.
    pub fn inspect(&self, info: &ClientInfo, options: &InspectOptions<'_>) -> Option<AppError> {
        self.inspect_at(info, options, js::date::now_ms())
    }

    /// `inspect` at an explicit time (`now` in ms since the epoch).
    pub fn inspect_at(
        &self,
        info: &ClientInfo,
        options: &InspectOptions<'_>,
        now: i64,
    ) -> Option<AppError> {
        let ip = get_client_ip(info);
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let has_existing = inner.get_existing_state(&ip, now);

        if has_existing
            && let Some(state) = inner.state_by_ip.get_mut(&ip)
            && state.blocked_until > now
        {
            let message = format!(
                "attempted \"{}\" while blocked until {}",
                options.pathname,
                iso(state.blocked_until)
            );
            log_event(&ip, state, &message, now, false);
            return Some(not_found_error(
                "Not found.",
                ErrorOptions::code("intrusion.blocked")
                    .with_tarpit(create_tarpit_plan(true, false).to_value()),
            ));
        }

        let suspicious_path = suspicious_path_patterns()
            .iter()
            .any(|pattern| pattern.is_match(options.pathname));

        // clean requests never record a strike, so skip tracking them
        if !suspicious_path && options.origin_allowed {
            return None;
        }

        if !has_existing {
            inner.create_state(&ip, now);
        }
        let state = inner.state_by_ip.get_mut(&ip)?;

        if suspicious_path || (!options.known_route && !options.origin_allowed) {
            let mut reason = "suspicious request";
            let mut weight = 3;
            if suspicious_path {
                reason = "exploit probe";
                weight += 4;
            }
            if !options.known_route {
                if !suspicious_path {
                    reason = "unknown route probe";
                }
                weight += 2;
            }
            if !options.origin_allowed {
                weight += 1;
            }
            add_strike(&ip, state, weight, reason, options.pathname, now);
            return Some(not_found_error(
                "Not found.",
                ErrorOptions::code(if suspicious_path {
                    "intrusion.exploit_probe"
                } else {
                    "intrusion.suspicious_request"
                })
                .with_tarpit(create_tarpit_plan(false, suspicious_path).to_value()),
            ));
        }

        if !options.origin_allowed {
            let origin = options.origin.unwrap_or("undefined");
            add_strike(
                &ip,
                state,
                2,
                &format!("forbidden origin \"{origin}\""),
                options.pathname,
                now,
            );
            return Some(forbidden_error(
                format!(
                    "Forbidden origin \"{origin}\" attempted \"{}\"",
                    options.pathname
                ),
                ErrorOptions::code("intrusion.origin_forbidden"),
            ));
        }

        None
    }
}

#[cfg(test)]
#[path = "intrusion_tests.rs"]
mod tests;
