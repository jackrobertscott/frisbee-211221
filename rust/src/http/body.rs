//! micro's `json(req)`: reads the body (1mb limit) and parses it as JSON,
//! with micro's errors (`413 Body exceeded 1mb limit`, `400 Invalid JSON`,
//! `400 Invalid body`).

use super::headers::header;
use crate::shared::errors::{
    AppResult, ErrorOptions, bad_request_error, internal_error, payload_too_large_error,
};
use axum::body::Body;
use axum::http::HeaderMap;
use futures_util::StreamExt;
use serde_json::Value;

/// micro's default limit, `'1mb'` = 1048576 bytes.
pub const JSON_BODY_LIMIT: usize = 1024 * 1024;

enum Charset {
    Utf8,
    Latin1,
}

/// `content-type`'s parse of the header, as micro does before reading.
fn charset(headers: &HeaderMap) -> AppResult<Option<Charset>> {
    let value = header(headers, "content-type").unwrap_or_else(|| "text/plain".into());
    let mut parts = value.split(';');
    let media = crate::js::trim(parts.next().unwrap_or("")).to_string();
    let valid_token = |s: &str| {
        !s.is_empty()
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+.^_`|~-".contains(&b))
    };
    let valid_media = media
        .split_once('/')
        .is_some_and(|(t, s)| valid_token(t) && valid_token(s));
    if !valid_media {
        return Err(internal_error(
            Some("invalid media type"),
            ErrorOptions::default(),
        ));
    }
    let mut charset = None;
    for parameter in parts {
        let Some((key, raw)) = parameter.split_once('=') else {
            return Err(internal_error(
                Some("invalid parameter format"),
                ErrorOptions::default(),
            ));
        };
        let key = crate::js::trim(key).to_ascii_lowercase();
        let raw = crate::js::trim(raw).trim_matches('"').to_ascii_lowercase();
        if key == "charset" {
            charset = Some(raw);
        }
    }
    Ok(match charset.as_deref() {
        None => None,
        Some("utf-8" | "utf8" | "us-ascii" | "ascii") => Some(Charset::Utf8),
        Some("iso-8859-1" | "latin1" | "binary" | "l1") => Some(Charset::Latin1),
        // raw-body rejects charsets it cannot decode, which micro reports as an invalid body
        Some(_) => return Err(bad_request_error("Invalid body", ErrorOptions::default())),
    })
}

/// How much of an oversized body is read and thrown away before answering.
pub const DRAIN_LIMIT: usize = 16 * 1024 * 1024;

/// Reads and discards the rest of a request body (at most [`DRAIN_LIMIT`]
/// bytes). Node dumps a request body the handler did not read once the
/// response ends, so the client finishes sending and reads the `413`; closing
/// the connection with unread data instead resets it, and the client sees a
/// network error rather than the response.
async fn drain<S, E>(stream: &mut S)
where
    S: futures_util::Stream<Item = Result<bytes::Bytes, E>> + Unpin,
{
    let mut drained = 0usize;
    while let Some(Ok(chunk)) = stream.next().await {
        drained += chunk.len();
        if drained > DRAIN_LIMIT {
            break;
        }
    }
}

/// Reads at most `limit` bytes of `body` (`413` beyond it, `400` if the stream fails).
pub async fn read_limited(headers: &HeaderMap, body: Body, limit: usize) -> AppResult<Vec<u8>> {
    let too_large = || payload_too_large_error("Body exceeded 1mb limit", ErrorOptions::default());
    let mut stream = body.into_data_stream();
    if let Some(length) =
        header(headers, "content-length").and_then(|v| v.trim().parse::<usize>().ok())
        && length > limit
    {
        drain(&mut stream).await;
        return Err(too_large());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|_| bad_request_error("Invalid body", ErrorOptions::default()))?;
        if bytes.len() + chunk.len() > limit {
            drain(&mut stream).await;
            return Err(too_large());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

/// `json(req)`.
pub async fn read_json(headers: &HeaderMap, body: Body) -> AppResult<Value> {
    let charset = charset(headers)?;
    let bytes = read_limited(headers, body, JSON_BODY_LIMIT).await?;
    let text = match charset {
        Some(Charset::Latin1) => bytes.iter().map(|b| *b as char).collect(),
        _ => String::from_utf8_lossy(&bytes).into_owned(),
    };
    parse_json(&text)
}

/// `JSON.parse(text)` with micro's error.
pub fn parse_json(text: &str) -> AppResult<Value> {
    serde_json::from_str(text)
        .map_err(|_| bad_request_error("Invalid JSON", ErrorOptions::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A body of `chunks` 64KB chunks that counts how many were read.
    fn counted_body(chunks: usize) -> (Body, Arc<AtomicUsize>) {
        let read = Arc::new(AtomicUsize::new(0));
        let counter = read.clone();
        let stream = futures_util::stream::iter(0..chunks).map(move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
            Ok::<_, std::io::Error>(bytes::Bytes::from(vec![b'x'; 64 * 1024]))
        });
        (Body::from_stream(stream), read)
    }

    #[tokio::test]
    async fn reads_the_rest_of_an_oversized_body_before_answering_413() {
        // 20 x 64KB = 1.25MB, past the 1mb limit after 16 chunks
        let (body, read) = counted_body(20);
        let error = read_limited(&HeaderMap::new(), body, JSON_BODY_LIMIT)
            .await
            .unwrap_err();
        assert_eq!(error.status_code, 413);
        assert_eq!(read.load(Ordering::SeqCst), 20);
    }

    #[tokio::test]
    async fn reads_a_body_declared_too_large_before_answering_413() {
        let (body, read) = counted_body(20);
        let mut headers = HeaderMap::new();
        headers.insert("content-length", (20 * 64 * 1024).to_string().parse().unwrap());
        let error = read_limited(&headers, body, JSON_BODY_LIMIT)
            .await
            .unwrap_err();
        assert_eq!(error.status_code, 413);
        assert_eq!(read.load(Ordering::SeqCst), 20);
    }

    #[tokio::test]
    async fn stops_draining_past_the_drain_limit() {
        let (body, read) = counted_body(1000);
        let error = read_limited(&HeaderMap::new(), body, JSON_BODY_LIMIT)
            .await
            .unwrap_err();
        assert_eq!(error.status_code, 413);
        let drained = read.load(Ordering::SeqCst);
        assert!(drained < 1000 && drained * 64 * 1024 > DRAIN_LIMIT, "{drained}");
    }
}
