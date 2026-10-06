//! Port of `server/src/http/uploads.ts`: multipart (and urlencoded) upload
//! parsing with busboy's semantics and limits — one file of at most 5MB,
//! at most 16 fields — writing the file to a temporary path.

use super::headers::header;
use crate::shared::errors::{
    bad_request_error, payload_too_large_error, too_many_requests_error, AppError, AppResult, ErrorOptions,
};
use axum::body::Body;
use axum::http::HeaderMap;
use futures_util::StreamExt;
use indexmap::IndexMap;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

pub const MAX_UPLOAD_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_UPLOAD_FILES: usize = 1;
pub const MAX_UPLOAD_FIELDS: usize = 16;
/// busboy's default field size limit; longer values are truncated.
const MAX_FIELD_BYTES: usize = 1024 * 1024;

/// `TUploadedFile`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UploadedFile {
    pub filepath: PathBuf,
    pub filename: String,
    pub extension: String,
    pub mimetype: String,
    pub encoding: String,
}

/// Where uploads are written (the OS temp directory by default).
#[derive(Clone, Debug)]
pub struct UploadOptions {
    pub temp_dir: PathBuf,
}

impl Default for UploadOptions {
    fn default() -> Self {
        UploadOptions { temp_dir: std::env::temp_dir() }
    }
}

pub type UploadFields = IndexMap<String, String>;

fn unsupported() -> AppError {
    bad_request_error(
        "Upload must be sent as multipart form data.",
        ErrorOptions::code("upload.unsupported_content_type"),
    )
}

fn aborted() -> AppError {
    bad_request_error("Upload was aborted.", ErrorOptions::code("upload.aborted"))
}

fn files_limit() -> AppError {
    too_many_requests_error("Too many files were uploaded.", ErrorOptions::code("upload.files_limit"))
}

fn fields_limit() -> AppError {
    too_many_requests_error("Too many fields were uploaded.", ErrorOptions::code("upload.fields_limit"))
}

fn size_limit() -> AppError {
    payload_too_large_error("Upload exceeded size limit.", ErrorOptions::code("upload.size_limit"))
}

/// busboy's `basename`: the part after the last `/` or `\`, never `.`/`..`.
fn basename(path: &str) -> String {
    let tail = path.rsplit(['/', '\\']).next().unwrap_or(path);
    if tail == "." || tail == ".." { String::new() } else { tail.to_string() }
}

/// Node's `path.extname(filename)`.
pub fn extname(filename: &str) -> String {
    let base = filename.rsplit('/').next().unwrap_or(filename);
    match base.rfind('.') {
        Some(0) | None => String::new(),
        Some(index) => base[index..].to_string(),
    }
}

fn percent_decode(value: &str) -> Vec<u8> {
    let bytes = value.as_bytes();
    let hex = |b: u8| (b as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                out.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    out
}

/// Parses `form-data; name="x"; filename="y"` (and RFC 5987 `filename*`).
fn parse_disposition(value: &str) -> Option<(String, IndexMap<String, String>)> {
    let mut chars = value.char_indices().peekable();
    let mut kind = String::new();
    for (_, c) in chars.by_ref() {
        if c == ';' {
            break;
        }
        kind.push(c);
    }
    let kind = crate::js::trim(&kind).to_ascii_lowercase();
    if kind.is_empty() {
        return None;
    }
    let rest: String = chars.map(|(_, c)| c).collect();
    let mut params = IndexMap::new();
    let mut remaining = rest.as_str();
    while !remaining.is_empty() {
        let trimmed = remaining.trim_start_matches(|c: char| c == ' ' || c == '\t' || c == ';');
        if trimmed.is_empty() {
            break;
        }
        let Some(eq) = trimmed.find('=') else { break };
        let key = crate::js::trim(&trimmed[..eq]).to_ascii_lowercase();
        let after = &trimmed[eq + 1..];
        let (value, next) = if let Some(quoted) = after.strip_prefix('"') {
            let mut out = String::new();
            let mut escaped = false;
            let mut end = quoted.len();
            for (index, c) in quoted.char_indices() {
                if escaped {
                    out.push(c);
                    escaped = false;
                } else if c == '\\' {
                    escaped = true;
                } else if c == '"' {
                    end = index + 1;
                    break;
                } else {
                    out.push(c);
                }
            }
            (out, &quoted[end.min(quoted.len())..])
        } else {
            let end = after.find(';').unwrap_or(after.len());
            (crate::js::trim(&after[..end]).to_string(), &after[end..])
        };
        let value = if key.ends_with('*') {
            // charset'language'percent-encoded
            let mut pieces = value.splitn(3, '\'');
            let charset = pieces.next().unwrap_or("").to_ascii_lowercase();
            let _language = pieces.next();
            let encoded = pieces.next().unwrap_or("");
            let bytes = percent_decode(encoded);
            if charset == "iso-8859-1" || charset == "latin1" {
                bytes.iter().map(|b| *b as char).collect()
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            }
        } else {
            value
        };
        params.insert(key, value);
        remaining = next;
    }
    Some((kind, params))
}

struct Collected {
    files: Vec<UploadedFile>,
    fields: UploadFields,
    filepaths: Vec<PathBuf>,
}

async fn cleanup(filepaths: &[PathBuf]) {
    for filepath in filepaths {
        let _ = tokio::fs::remove_file(filepath).await;
    }
}

/// `blob.digestRequest(req)`: the uploaded files (written to temp files) and
/// the form fields. On any failure every temp file is removed.
pub async fn digest_request(headers: &HeaderMap, body: Body, options: &UploadOptions) -> AppResult<(Vec<UploadedFile>, UploadFields)> {
    let content_type = header(headers, "content-type").ok_or_else(unsupported)?;
    let lower = content_type.to_ascii_lowercase();
    if lower.starts_with("application/x-www-form-urlencoded") {
        return digest_urlencoded(headers, body).await;
    }
    let boundary = multer::parse_boundary(&content_type).map_err(|_| unsupported())?;
    let mut collected = Collected { files: Vec::new(), fields: IndexMap::new(), filepaths: Vec::new() };
    match digest_multipart(body, boundary, options, &mut collected).await {
        Ok(()) => Ok((collected.files, collected.fields)),
        Err(error) => {
            cleanup(&collected.filepaths).await;
            Err(error)
        }
    }
}

fn map_multer_error(error: multer::Error) -> AppError {
    match error {
        multer::Error::StreamReadFailed(_) => aborted(),
        other => AppError::internal_from(other),
    }
}

async fn digest_multipart(body: Body, boundary: String, options: &UploadOptions, collected: &mut Collected) -> AppResult<()> {
    let stream = body.into_data_stream().map(|chunk| chunk.map_err(std::io::Error::other));
    let mut multipart = multer::Multipart::new(stream, boundary);
    let mut file_count = 0;
    let mut field_count = 0;
    while let Some(mut field) = multipart.next_field().await.map_err(map_multer_error)? {
        let headers = field.headers().clone();
        let Some(disposition) = header(&headers, "content-disposition") else { continue };
        let Some((kind, params)) = parse_disposition(&disposition) else { continue };
        if kind != "form-data" {
            continue;
        }
        let name = params.get("name").filter(|n| !n.is_empty()).cloned();
        let filename = params
            .get("filename*")
            .filter(|f| !f.is_empty())
            .or_else(|| params.get("filename").filter(|f| !f.is_empty()))
            .map(|f| basename(f));
        let part_type = header(&headers, "content-type")
            .and_then(|value| {
                let media = value.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
                media.split_once('/').map(|(t, s)| format!("{}/{}", t.trim(), s.trim()))
            })
            .unwrap_or_else(|| "text/plain".into());
        let encoding = header(&headers, "content-transfer-encoding")
            .map(|v| v.to_ascii_lowercase())
            .unwrap_or_else(|| "7bit".into());

        if part_type == "application/octet-stream" || filename.is_some() {
            if file_count == MAX_UPLOAD_FILES {
                return Err(files_limit());
            }
            file_count += 1;
            let Some(filename) = filename.filter(|f| !crate::js::trim(f).is_empty()) else {
                while field.chunk().await.map_err(map_multer_error)?.is_some() {}
                continue;
            };
            let extension = extname(&filename).to_lowercase();
            let suffix = if extension.is_empty() { ".bin".to_string() } else { extension.clone() };
            let filepath = options.temp_dir.join(format!("upload-{}{suffix}", crate::utils::random::generate_id()));
            collected.filepaths.push(filepath.clone());
            let mut output = tokio::fs::OpenOptions::new().write(true).create_new(true).open(&filepath).await?;
            let mut size: u64 = 0;
            while let Some(chunk) = field.chunk().await.map_err(map_multer_error)? {
                size += chunk.len() as u64;
                if size >= MAX_UPLOAD_BYTES {
                    drop(output);
                    return Err(size_limit());
                }
                output.write_all(&chunk).await?;
            }
            output.flush().await?;
            drop(output);
            collected.files.push(UploadedFile {
                filepath,
                filename,
                extension,
                mimetype: part_type,
                encoding,
            });
        } else {
            if field_count == MAX_UPLOAD_FIELDS {
                return Err(fields_limit());
            }
            field_count += 1;
            let mut bytes = Vec::new();
            while let Some(chunk) = field.chunk().await.map_err(map_multer_error)? {
                let room = MAX_FIELD_BYTES.saturating_sub(bytes.len());
                bytes.extend_from_slice(&chunk[..chunk.len().min(room)]);
            }
            collected.fields.insert(name.unwrap_or_else(|| "undefined".into()), String::from_utf8_lossy(&bytes).into_owned());
        }
    }
    Ok(())
}

async fn digest_urlencoded(headers: &HeaderMap, body: Body) -> AppResult<(Vec<UploadedFile>, UploadFields)> {
    let bytes = super::body::read_limited(headers, body, usize::MAX).await.map_err(|_| aborted())?;
    let mut fields = IndexMap::new();
    for (index, (key, value)) in url::form_urlencoded::parse(&bytes).enumerate() {
        if index == MAX_UPLOAD_FIELDS {
            return Err(fields_limit());
        }
        fields.insert(key.into_owned(), value.into_owned());
    }
    Ok((Vec::new(), fields))
}

/// `blob.filepathBuffer(filepath)`: reads an upload and removes its temp file.
pub async fn filepath_buffer(filepath: &Path) -> AppResult<Vec<u8>> {
    let result = tokio::fs::read(filepath).await;
    let _ = tokio::fs::remove_file(filepath).await;
    Ok(result?)
}

#[cfg(test)]
#[path = "uploads_tests.rs"]
mod tests;
