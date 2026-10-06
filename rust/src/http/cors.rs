//! Port of `server/src/http/cors.ts`: CORS headers on every response.

use super::origin::Origin;
use axum::http::{HeaderMap, HeaderName, HeaderValue};

const ALLOWED_AGE: u32 = 60 * 60 * 24; // 24 hours
const ALLOWED_METHODS: [&str; 2] = ["POST", "OPTIONS"];
const ALLOWED_HEADERS: [&str; 4] = ["Access-Control-Allow-Origin", "Content-Type", "Authorization", "Accept"];

/// The CORS headers for a request from `request_origin` (`attachCorsToResponse`).
pub fn cors_headers(request_origin: Option<&str>, origin: &Origin) -> Vec<(HeaderName, String)> {
    let mut headers = Vec::new();
    let allowed_origin = origin.allowed();
    if let Some(request_origin) = request_origin.filter(|o| origin.is_allowed(Some(o))) {
        headers.push((HeaderName::from_static("access-control-allow-origin"), request_origin.to_string()));
        headers.push((HeaderName::from_static("access-control-allow-credentials"), "true".into()));
    } else if !allowed_origin.is_empty() {
        headers.push((HeaderName::from_static("access-control-allow-origin"), allowed_origin));
        headers.push((HeaderName::from_static("access-control-allow-credentials"), "true".into()));
    }
    headers.push((HeaderName::from_static("vary"), "Origin".into()));
    headers.push((HeaderName::from_static("access-control-allow-methods"), ALLOWED_METHODS.join(",")));
    headers.push((HeaderName::from_static("access-control-allow-headers"), ALLOWED_HEADERS.join(",")));
    headers.push((HeaderName::from_static("access-control-max-age"), ALLOWED_AGE.to_string()));
    headers
}

/// Writes the CORS headers into `target` (replacing earlier values).
pub fn attach(target: &mut HeaderMap, request_origin: Option<&str>, origin: &Origin) {
    for (name, value) in cors_headers(request_origin, origin) {
        if let Ok(value) = HeaderValue::from_str(&value) {
            target.insert(name, value);
        } else if let Ok(value) = HeaderValue::from_bytes(&value.chars().map(|c| c as u32 as u8).collect::<Vec<_>>()) {
            target.insert(name, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn echoes_an_allowed_origin_and_falls_back_to_the_client_url() {
        let origin = Origin::new("http://localhost:3000");
        let allowed = cors_headers(Some("http://localhost:3000"), &origin);
        assert_eq!(allowed[0].1, "http://localhost:3000");
        let other = cors_headers(Some("https://evil.example.com"), &origin);
        assert_eq!(other[0].1, "http://localhost:3000");
        let values: Vec<&str> = other.iter().map(|(_, v)| v.as_str()).collect();
        assert_eq!(
            values,
            [
                "http://localhost:3000",
                "true",
                "Origin",
                "POST,OPTIONS",
                "Access-Control-Allow-Origin,Content-Type,Authorization,Accept",
                "86400"
            ]
        );
    }
}
