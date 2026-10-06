//! Port of `server/src/http/uploads.test.ts`. Requests are fed straight to
//! `digest_request`; each test writes into its own temp directory so cleanup
//! can be checked by listing it.

use super::*;
use crate::shared::errors::get_error_status_code;
use axum::http::HeaderValue;
use bytes::Bytes;

const BOUNDARY: &str = "test-boundary-1234";

struct Part<'a> {
    name: &'a str,
    filename: Option<&'a str>,
    content_type: Option<&'a str>,
    content: Vec<u8>,
}

fn part<'a>(name: &'a str, filename: Option<&'a str>, content: &str) -> Part<'a> {
    Part {
        name,
        filename,
        content_type: None,
        content: content.as_bytes().to_vec(),
    }
}

fn multipart(parts: &[Part<'_>]) -> Vec<u8> {
    let mut out = Vec::new();
    for part in parts {
        let mut disposition = format!("form-data; name=\"{}\"", part.name);
        if let Some(filename) = part.filename {
            disposition.push_str(&format!("; filename=\"{filename}\""));
        }
        let mut head = vec![
            format!("--{BOUNDARY}"),
            format!("Content-Disposition: {disposition}"),
        ];
        if let Some(content_type) = part.content_type {
            head.push(format!("Content-Type: {content_type}"));
        }
        head.push(String::new());
        head.push(String::new());
        out.extend_from_slice(head.join("\r\n").as_bytes());
        out.extend_from_slice(&part.content);
        out.extend_from_slice(b"\r\n");
    }
    out.extend_from_slice(format!("--{BOUNDARY}--\r\n").as_bytes());
    out
}

fn headers(content_type: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("content-type", HeaderValue::from_str(content_type).unwrap());
    headers
}

fn multipart_headers() -> HeaderMap {
    headers(&format!("multipart/form-data; boundary={BOUNDARY}"))
}

struct TempUploads {
    dir: tempfile::TempDir,
}

impl TempUploads {
    fn new() -> Self {
        TempUploads {
            dir: tempfile::tempdir().unwrap(),
        }
    }
    fn options(&self) -> UploadOptions {
        UploadOptions {
            temp_dir: self.dir.path().to_path_buf(),
        }
    }
    fn files(&self) -> Vec<PathBuf> {
        std::fs::read_dir(self.dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect()
    }
}

async fn post(
    uploads: &TempUploads,
    body: Vec<u8>,
) -> AppResult<(Vec<UploadedFile>, UploadFields)> {
    digest_request(&multipart_headers(), Body::from(body), &uploads.options()).await
}

mod blob_digest_request {
    use super::*;

    #[tokio::test]
    async fn stores_the_file_in_the_temp_directory_and_collects_fields() {
        let uploads = TempUploads::new();
        let (files, fields) = post(
            &uploads,
            multipart(&[
                part("seasonId", None, "season-1"),
                Part {
                    name: "file",
                    filename: Some("Members.CSV"),
                    content_type: Some("text/csv"),
                    content: b"a,b\n1,2\n".to_vec(),
                },
            ]),
        )
        .await
        .unwrap();
        assert_eq!(fields.get("seasonId").map(String::as_str), Some("season-1"));
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].filename, "Members.CSV");
        assert_eq!(files[0].extension, ".csv");
        assert_eq!(files[0].mimetype, "text/csv");
        assert_eq!(files[0].encoding, "7bit");
        assert!(files[0].filepath.starts_with(uploads.dir.path()));
        // outside tests uploads go to the OS temp directory (`os.tmpdir()`)
        assert_eq!(UploadOptions::default().temp_dir, std::env::temp_dir());
        let name = files[0]
            .filepath
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        assert!(
            name.starts_with("upload-") && name.ends_with(".csv"),
            "{name}"
        );

        // reading the upload returns its contents and removes the temp file
        let buffer = filepath_buffer(&files[0].filepath).await.unwrap();
        assert_eq!(String::from_utf8(buffer).unwrap(), "a,b\n1,2\n");
        assert!(!files[0].filepath.exists());
    }

    #[tokio::test]
    async fn uses_a_bin_extension_for_files_without_one() {
        let uploads = TempUploads::new();
        let (files, _) = post(
            &uploads,
            multipart(&[part("file", Some("README"), "hello")]),
        )
        .await
        .unwrap();
        assert_eq!(files[0].extension, "");
        assert!(files[0].filepath.to_string_lossy().ends_with(".bin"));
        filepath_buffer(&files[0].filepath).await.unwrap();
    }

    #[tokio::test]
    async fn skips_file_parts_without_a_filename() {
        let uploads = TempUploads::new();
        let (files, fields) = post(
            &uploads,
            multipart(&[
                part("file", Some("   "), "ignored"),
                part("note", None, "kept"),
            ]),
        )
        .await
        .unwrap();
        assert!(files.is_empty());
        assert_eq!(
            fields.into_iter().collect::<Vec<_>>(),
            [("note".to_string(), "kept".to_string())]
        );
    }

    #[tokio::test]
    async fn rejects_more_than_one_file() {
        let uploads = TempUploads::new();
        let error = post(
            &uploads,
            multipart(&[
                part("file", Some("one.csv"), "one"),
                part("file", Some("two.csv"), "two"),
            ]),
        )
        .await
        .unwrap_err();
        assert_eq!(get_error_status_code(error.clone().into(), None), 429);
        assert_eq!(error.error_code, "upload.files_limit");
        // cleanup removes the first file's temp path
        assert!(uploads.files().is_empty());
    }

    #[tokio::test]
    async fn removes_the_temp_file_of_an_upload_rejected_for_too_many_files() {
        let uploads = TempUploads::new();
        let names: Vec<String> = (0..4).map(|index| format!("file{index}.csv")).collect();
        let contents: Vec<String> = (0..4).map(|index| format!("content {index}")).collect();
        let parts: Vec<Part<'_>> = (0..4)
            .map(|index| part("file", Some(&names[index]), &contents[index]))
            .collect();
        let error = post(&uploads, multipart(&parts)).await.unwrap_err();
        assert_eq!(error.status_code, 429);
        assert_eq!(error.error_code, "upload.files_limit");
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        assert!(uploads.files().is_empty());
    }

    #[tokio::test]
    async fn rejects_too_many_fields() {
        let uploads = TempUploads::new();
        let names: Vec<String> = (0..17).map(|index| format!("field{index}")).collect();
        let parts: Vec<Part<'_>> = names.iter().map(|name| part(name, None, "x")).collect();
        let error = post(&uploads, multipart(&parts)).await.unwrap_err();
        assert_eq!(error.status_code, 429);
        assert_eq!(error.error_code, "upload.fields_limit");
    }

    #[tokio::test]
    async fn rejects_files_over_5mb_and_removes_the_partial_file() {
        let uploads = TempUploads::new();
        let big = Part {
            name: "file",
            filename: Some("big.csv"),
            content_type: None,
            content: vec![b'a'; 5 * 1024 * 1024 + 1],
        };
        let error = post(&uploads, multipart(&[big])).await.unwrap_err();
        assert_eq!(error.status_code, 413);
        assert_eq!(error.error_code, "upload.size_limit");
        assert!(uploads.files().is_empty());
    }

    #[tokio::test]
    async fn rejects_a_request_that_is_not_multipart_as_a_bad_request() {
        let uploads = TempUploads::new();
        let error = digest_request(
            &headers("application/json"),
            Body::from(r#"{"payload":{}}"#),
            &uploads.options(),
        )
        .await
        .unwrap_err();
        assert_eq!(error.status_code, 400);
        assert_eq!(error.error_code, "upload.unsupported_content_type");
        let missing = digest_request(&HeaderMap::new(), Body::empty(), &uploads.options())
            .await
            .unwrap_err();
        assert_eq!(missing.error_code, "upload.unsupported_content_type");
        assert!(uploads.files().is_empty());
    }

    #[tokio::test]
    async fn rejects_a_request_that_is_aborted_mid_upload() {
        let uploads = TempUploads::new();
        let partial = multipart(&[part("file", Some("slow.csv"), &"x".repeat(1000))]);
        let first = Bytes::copy_from_slice(&partial[..300]);
        let stream = futures_util::stream::iter(vec![
            Ok::<Bytes, std::io::Error>(first),
            Err(std::io::Error::new(
                std::io::ErrorKind::ConnectionReset,
                "client went away",
            )),
        ]);
        let error = digest_request(
            &multipart_headers(),
            Body::from_stream(stream),
            &uploads.options(),
        )
        .await
        .unwrap_err();
        assert_eq!(error.status_code, 400);
        assert_eq!(error.error_code, "upload.aborted");
        assert!(uploads.files().is_empty());
    }
}

mod helpers {
    use super::*;

    #[test]
    fn parses_dispositions_like_busboy() {
        let (kind, params) =
            parse_disposition(r#"form-data; name="file"; filename="C:\\dir\\a.csv""#).unwrap();
        assert_eq!(kind, "form-data");
        assert_eq!(basename(&params["filename"]), "a.csv");
        let (_, params) =
            parse_disposition("form-data; name=x; filename*=UTF-8''%E2%9C%93.csv").unwrap();
        assert_eq!(params["filename*"], "✓.csv");
        assert_eq!(params["name"], "x");
    }

    #[test]
    fn computes_extensions_like_node() {
        assert_eq!(extname("a.CSV"), ".CSV");
        assert_eq!(extname(".bashrc"), "");
        assert_eq!(extname("file."), ".");
        assert_eq!(extname("README"), "");
    }
}
