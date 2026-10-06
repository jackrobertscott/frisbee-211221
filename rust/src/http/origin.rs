//! Port of `server/src/http/origin.ts`: the client origin requests must come from.

use url::Url;

/// `normalizeOrigin(value)`: the URL's origin, or `None` when blank or invalid.
pub fn normalize(value: Option<&str>) -> Option<String> {
    let value = value?;
    if crate::js::trim(value).is_empty() {
        return None;
    }
    Url::parse(value)
        .ok()
        .map(|url| url.origin().ascii_serialization())
}

/// The allowed origin, derived from `URL_CLIENT`.
#[derive(Clone, Debug)]
pub struct Origin {
    url_client: String,
    allowed_origin: Option<String>,
}

impl Origin {
    pub fn new(url_client: &str) -> Self {
        Origin {
            url_client: url_client.to_string(),
            allowed_origin: normalize(Some(url_client)),
        }
    }

    /// `origin.allowed()`.
    pub fn allowed(&self) -> String {
        self.allowed_origin
            .clone()
            .unwrap_or_else(|| self.url_client.clone())
    }

    /// `origin.isAllowed(value)`.
    pub fn is_allowed(&self, value: Option<&str>) -> bool {
        match (normalize(value), &self.allowed_origin) {
            (Some(normalized), Some(allowed)) => &normalized == allowed,
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalises_and_compares_origins() {
        let origin = Origin::new("http://localhost:3000/");
        assert_eq!(origin.allowed(), "http://localhost:3000");
        assert!(origin.is_allowed(Some("http://localhost:3000")));
        assert!(origin.is_allowed(Some("http://localhost:3000/some/path")));
        assert!(!origin.is_allowed(Some("http://localhost:3001")));
        assert!(!origin.is_allowed(Some("  ")));
        assert!(!origin.is_allowed(None));
        assert_eq!(normalize(Some("not a url")), None);
    }
}
