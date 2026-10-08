//! Port of `server/src/utils/mail.ts`: sends email through Amazon SES v2
//! (`SendEmail`), signing requests with AWS Signature Version 4.
//!
//! The transport is a trait so tests can capture sends instead of calling AWS.

use crate::config::Config;
use crate::shared::errors::{AppError, AppResult};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

/// `mail.send({...})`'s options.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MailMessage {
    pub to: Vec<String>,
    /// Defaults to `${APP_NAME} <${SES_FROM_EMAIL}>`.
    pub from: Option<String>,
    pub subject: String,
    pub text: Option<String>,
    pub html: Option<String>,
    pub reply: Option<String>,
}

/// The `SendEmailCommand` input (also the SES v2 JSON request body).
pub fn send_email_input(config: &Config, message: &MailMessage) -> Value {
    let from = message
        .from
        .clone()
        .unwrap_or_else(|| format!("{} <{}>", config.app_name, config.ses_from_email));
    let body = match &message.html {
        Some(html) if !html.is_empty() => json!({"Html": {"Data": html}}),
        _ => match &message.text {
            Some(text) => json!({"Text": {"Data": text}}),
            None => json!({"Text": {}}),
        },
    };
    let mut input = Map::new();
    input.insert("FromEmailAddress".into(), json!(from));
    input.insert("Destination".into(), json!({"ToAddresses": message.to}));
    input.insert(
        "Content".into(),
        json!({"Simple": {"Subject": {"Data": message.subject}, "Body": body}}),
    );
    if let Some(reply) = &message.reply {
        input.insert("ReplyToAddresses".into(), json!([reply]));
    }
    Value::Object(input)
}

pub type SendFuture = Pin<Box<dyn Future<Output = AppResult<()>> + Send>>;

/// Delivers a `SendEmail` input.
pub trait MailTransport: Send + Sync {
    fn send(&self, input: Value) -> SendFuture;
}

/// The mailer the app uses.
#[derive(Clone)]
pub struct Mailer {
    config: Arc<Config>,
    transport: Arc<dyn MailTransport>,
}

impl Mailer {
    pub fn new(config: Arc<Config>, transport: Arc<dyn MailTransport>) -> Self {
        Mailer { config, transport }
    }

    /// SES with the configured credentials and region.
    pub fn ses(config: Arc<Config>) -> Self {
        let transport = Arc::new(SesTransport::new(&config));
        Mailer::new(config, transport)
    }

    /// `mail.send(message)`: delivery failures go to the caller.
    pub async fn send(&self, message: MailMessage) -> AppResult<()> {
        let input = send_email_input(&self.config, &message);
        self.transport.send(input).await
    }
}

/// A transport that records inputs (for tests).
#[derive(Default)]
pub struct CapturingTransport {
    pub sent: Mutex<Vec<Value>>,
    pub fail_with: Mutex<Option<String>>,
}

impl MailTransport for CapturingTransport {
    fn send(&self, input: Value) -> SendFuture {
        let failure = self
            .fail_with
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Some(message) = failure {
            return Box::pin(async move { Err(AppError::internal_from(message)) });
        }
        self.sent
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(input);
        Box::pin(async { Ok(()) })
    }
}

/// Amazon SES v2 over HTTPS.
pub struct SesTransport {
    client: reqwest::Client,
    access_key_id: String,
    secret_access_key: String,
    region: Option<String>,
}

impl SesTransport {
    pub fn new(config: &Config) -> Self {
        SesTransport {
            client: crate::utils::http_client::client(),
            access_key_id: config.ses_access_key_id.clone(),
            secret_access_key: config.ses_secret_access_key.clone(),
            region: config.ses_region.clone().filter(|r| !r.is_empty()),
        }
    }
}

impl MailTransport for SesTransport {
    fn send(&self, input: Value) -> SendFuture {
        let client = self.client.clone();
        let key = self.access_key_id.clone();
        let secret = self.secret_access_key.clone();
        let region = self.region.clone();
        Box::pin(async move {
            let region = region.ok_or_else(|| AppError::internal_from("Region is missing"))?;
            if key.is_empty() || secret.is_empty() {
                return Err(AppError::internal_from(
                    "Could not load credentials from any providers",
                ));
            }
            let host = format!("email.{region}.amazonaws.com");
            let path = "/v2/email/outbound-emails";
            let body = crate::js::stringify(&input);
            let amz_date = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
            let signed = sign_v4(&SigV4Request {
                method: "POST",
                host: &host,
                path,
                query: "",
                content_type: "application/json",
                body: body.as_bytes(),
                amz_date: &amz_date,
                region: &region,
                service: "ses",
                access_key_id: &key,
                secret_access_key: &secret,
            });
            let response = client
                .post(format!("https://{host}{path}"))
                .header("content-type", "application/json")
                .header("x-amz-date", &amz_date)
                .header("authorization", signed)
                .body(body)
                .send()
                .await
                .map_err(AppError::internal_from)?;
            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(AppError::internal_from(format!(
                    "SES SendEmail failed ({status}): {text}"
                )));
            }
            Ok(())
        })
    }
}

/// The parts of a request Signature Version 4 covers.
pub struct SigV4Request<'a> {
    pub method: &'a str,
    pub host: &'a str,
    pub path: &'a str,
    /// Already-canonical query string (sorted, encoded), or empty.
    pub query: &'a str,
    pub content_type: &'a str,
    pub body: &'a [u8],
    /// `YYYYMMDDTHHMMSSZ`.
    pub amz_date: &'a str,
    pub region: &'a str,
    pub service: &'a str,
    pub access_key_id: &'a str,
    pub secret_access_key: &'a str,
}

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(key).unwrap_or_else(|_| unreachable!());
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// The `Authorization` header value for `request`.
pub fn sign_v4(request: &SigV4Request<'_>) -> String {
    let date = &request.amz_date[..8];
    let signed_headers = "content-type;host;x-amz-date";
    let canonical_request = format!(
        "{}\n{}\n{}\ncontent-type:{}\nhost:{}\nx-amz-date:{}\n\n{}\n{}",
        request.method,
        request.path,
        request.query,
        request.content_type,
        request.host,
        request.amz_date,
        signed_headers,
        sha256_hex(request.body)
    );
    let scope = format!("{date}/{}/{}/aws4_request", request.region, request.service);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{scope}\n{}",
        request.amz_date,
        sha256_hex(canonical_request.as_bytes())
    );
    let k_date = hmac(
        format!("AWS4{}", request.secret_access_key).as_bytes(),
        date,
    );
    let k_region = hmac(&k_date, request.region);
    let k_service = hmac(&k_region, request.service);
    let k_signing = hmac(&k_service, "aws4_request");
    let signature = hex::encode(hmac(&k_signing, &string_to_sign));
    format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        request.access_key_id
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Arc<Config> {
        let mut config = Config::for_tests("unused.sqlite");
        config.app_name = "Frisbee Test".into();
        config.ses_from_email = "noreply@example.com".into();
        Arc::new(config)
    }

    mod mail_send {
        use super::*;

        #[tokio::test]
        async fn sends_an_html_email_from_the_app_address() {
            let transport = Arc::new(CapturingTransport::default());
            let mailer = Mailer::new(config(), transport.clone());
            mailer
                .send(MailMessage {
                    to: vec!["a@example.com".into(), "b@example.com".into()],
                    subject: "Hello".into(),
                    html: Some("<p>Hi</p>".into()),
                    text: Some("ignored when html is set".into()),
                    ..Default::default()
                })
                .await
                .unwrap();
            let sent = transport.sent.lock().unwrap();
            assert_eq!(sent.len(), 1);
            assert_eq!(
                sent[0],
                json!({
                    "FromEmailAddress": "Frisbee Test <noreply@example.com>",
                    "Destination": {"ToAddresses": ["a@example.com", "b@example.com"]},
                    "Content": {"Simple": {"Subject": {"Data": "Hello"}, "Body": {"Html": {"Data": "<p>Hi</p>"}}}}
                })
            );
        }

        #[tokio::test]
        async fn sends_a_plain_text_email_with_a_custom_sender_and_reply_address() {
            let transport = Arc::new(CapturingTransport::default());
            let mailer = Mailer::new(config(), transport.clone());
            mailer
                .send(MailMessage {
                    to: vec!["a@example.com".into()],
                    from: Some("Other <other@example.com>".into()),
                    subject: "Plain".into(),
                    text: Some("Just text".into()),
                    reply: Some("reply@example.com".into()),
                    ..Default::default()
                })
                .await
                .unwrap();
            let sent = transport.sent.lock().unwrap();
            assert_eq!(sent[0]["FromEmailAddress"], "Other <other@example.com>");
            assert_eq!(
                sent[0]["Content"]["Simple"]["Body"],
                json!({"Text": {"Data": "Just text"}})
            );
            assert_eq!(sent[0]["ReplyToAddresses"], json!(["reply@example.com"]));
        }

        #[tokio::test]
        async fn passes_delivery_failures_to_the_caller() {
            let transport = Arc::new(CapturingTransport::default());
            *transport.fail_with.lock().unwrap() = Some("MessageRejected".into());
            let mailer = Mailer::new(config(), transport);
            let error = mailer
                .send(MailMessage {
                    to: vec!["a@example.com".into()],
                    subject: "x".into(),
                    text: Some("y".into()),
                    ..Default::default()
                })
                .await
                .unwrap_err();
            assert_eq!(error.message, "MessageRejected");
        }
    }

    #[test]
    fn signs_requests_like_the_aws_signature_v4_reference() {
        // AWS documentation example (IAM ListUsers), adapted to the signed
        // header set this signer uses
        let authorization = sign_v4(&SigV4Request {
            method: "GET",
            host: "iam.amazonaws.com",
            path: "/",
            query: "Action=ListUsers&Version=2010-05-08",
            content_type: "application/x-www-form-urlencoded; charset=utf-8",
            body: b"",
            amz_date: "20150830T123600Z",
            region: "us-east-1",
            service: "iam",
            access_key_id: "AKIDEXAMPLE",
            secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        });
        assert_eq!(
            authorization,
            "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7"
        );
    }
}
