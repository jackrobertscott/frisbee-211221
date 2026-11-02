//! A small client for S3-compatible buckets (Railway's), over plain HTTPS.

use crate::config::BackupConfig;
use crate::shared::errors::{AppError, AppResult};
use crate::utils::sigv4::{SigV4Request, sha256_hex, sign_v4};
use std::path::Path;
use std::time::Duration;

/// Keeps a stalled transfer from blocking later backups for good.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);

pub struct S3Client {
    client: reqwest::Client,
    /// `<bucket>.<endpoint host>`: virtual-hosted addressing.
    host: String,
    region: String,
    access_key_id: String,
    secret_access_key: String,
}

impl S3Client {
    pub fn new(config: &BackupConfig) -> AppResult<Self> {
        let endpoint = url::Url::parse(&config.endpoint).map_err(AppError::internal_from)?;
        let endpoint_host = endpoint
            .host_str()
            .ok_or_else(|| AppError::internal_from("The bucket endpoint has no host"))?;
        Ok(S3Client {
            client: crate::utils::http_client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .map_err(AppError::internal_from)?,
            host: format!("{}.{endpoint_host}", config.bucket),
            region: config.region.clone(),
            access_key_id: config.access_key_id.clone(),
            secret_access_key: config.secret_access_key.clone(),
        })
    }

    fn request(
        &self,
        method: reqwest::Method,
        path: &str,
        query: &str,
        payload_sha256: &str,
    ) -> reqwest::RequestBuilder {
        let amz_date = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let authorization = sign_v4(&SigV4Request {
            method: method.as_str(),
            path,
            query,
            headers: &[
                ("host", &self.host),
                ("x-amz-content-sha256", payload_sha256),
                ("x-amz-date", &amz_date),
            ],
            payload_sha256,
            amz_date: &amz_date,
            region: &self.region,
            service: "s3",
            access_key_id: &self.access_key_id,
            secret_access_key: &self.secret_access_key,
        });
        let separator = if query.is_empty() { "" } else { "?" };
        self.client
            .request(
                method,
                format!("https://{}{path}{separator}{query}", self.host),
            )
            .header("x-amz-content-sha256", payload_sha256)
            .header("x-amz-date", amz_date)
            .header("authorization", authorization)
    }

    /// The keys under `prefix`.
    pub async fn list(&self, prefix: &str) -> AppResult<Vec<String>> {
        let encoded: String = url::form_urlencoded::byte_serialize(prefix.as_bytes()).collect();
        let query = format!("list-type=2&prefix={encoded}");
        let response = self
            .request(reqwest::Method::GET, "/", &query, &sha256_hex(b""))
            .send()
            .await
            .map_err(AppError::internal_from)?;
        let body = read_success(response, "list").await?;
        // a listing holds 1000 keys, far more than are ever kept
        if body.contains("<IsTruncated>true</IsTruncated>") {
            return Err(AppError::internal_from(
                "S3 list failed: too many keys for one page",
            ));
        }
        Ok(parse_list_keys(&body))
    }

    /// Uploads the file at `file`, whose SHA-256 is `sha256`, without reading
    /// it all into memory.
    pub async fn put_file(&self, key: &str, file: &Path, sha256: &str) -> AppResult<()> {
        let body = tokio::fs::File::open(file).await?;
        let length = body.metadata().await?.len();
        let response = self
            .request(reqwest::Method::PUT, &format!("/{key}"), "", sha256)
            .header("content-type", "application/gzip")
            .header("content-length", length)
            .body(body)
            .send()
            .await
            .map_err(AppError::internal_from)?;
        read_success(response, "upload").await?;
        Ok(())
    }

    pub async fn delete(&self, key: &str) -> AppResult<()> {
        let response = self
            .request(
                reqwest::Method::DELETE,
                &format!("/{key}"),
                "",
                &sha256_hex(b""),
            )
            .send()
            .await
            .map_err(AppError::internal_from)?;
        read_success(response, "delete").await?;
        Ok(())
    }
}

async fn read_success(response: reqwest::Response, action: &str) -> AppResult<String> {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(AppError::internal_from(format!(
            "S3 {action} failed ({status}): {text}"
        )));
    }
    Ok(text)
}

/// The `<Key>` values of a `ListObjectsV2` response.
fn parse_list_keys(xml: &str) -> Vec<String> {
    xml.split("<Key>")
        .skip(1)
        .filter_map(|part| part.split_once("</Key>"))
        .map(|(key, _)| key.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_keys_from_a_listing() {
        let xml = "<ListBucketResult><Name>b</Name><Contents><Key>backups/a.gz</Key><Size>1</Size></Contents><Contents><Key>backups/b.gz</Key></Contents></ListBucketResult>";
        assert_eq!(parse_list_keys(xml), vec!["backups/a.gz", "backups/b.gz"]);
        assert!(parse_list_keys("<ListBucketResult></ListBucketResult>").is_empty());
    }
}
