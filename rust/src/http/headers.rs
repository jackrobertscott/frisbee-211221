//! Node-compatible request header access.
//!
//! Node exposes header values as latin1 strings, keeps only the first value
//! of headers such as `Authorization`, and joins other duplicates with `, `
//! (e.g. two `X-Forwarded-For` lines). These helpers reproduce that so header
//! handling matches the TS server exactly.

use axum::http::HeaderMap;

/// Headers whose duplicates Node discards (keeping the first).
const SINGLE_VALUE: [&str; 18] = [
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "server",
    "user-agent",
];

fn latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|b| *b as char).collect()
}

/// `req.headers[name]` as Node would present it (`None` when absent).
pub fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    let lower = name.to_ascii_lowercase();
    let mut values = headers.get_all(lower.as_str()).iter().map(|v| latin1(v.as_bytes()));
    if SINGLE_VALUE.contains(&lower.as_str()) {
        return values.next();
    }
    let all: Vec<String> = values.collect();
    if all.is_empty() { None } else { Some(all.join(", ")) }
}
