//! AWS Signature Version 4, for the AWS and S3-compatible APIs called over
//! plain HTTPS.

use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};

/// The parts of a request Signature Version 4 covers.
pub struct SigV4Request<'a> {
    pub method: &'a str,
    pub path: &'a str,
    /// Already-canonical query string (sorted, encoded), or empty.
    pub query: &'a str,
    /// The signed headers: lowercase names, sorted by name, including `host`
    /// and `x-amz-date`.
    pub headers: &'a [(&'a str, &'a str)],
    /// Lowercase hex SHA-256 of the body.
    pub payload_sha256: &'a str,
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

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// The `Authorization` header value for `request`.
pub fn sign_v4(request: &SigV4Request<'_>) -> String {
    let date = &request.amz_date[..8];
    let canonical_headers: String = request
        .headers
        .iter()
        .map(|(name, value)| format!("{name}:{value}\n"))
        .collect();
    let signed_headers = request
        .headers
        .iter()
        .map(|(name, _)| *name)
        .collect::<Vec<_>>()
        .join(";");
    let canonical_request = format!(
        "{}\n{}\n{}\n{canonical_headers}\n{signed_headers}\n{}",
        request.method, request.path, request.query, request.payload_sha256
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

    #[test]
    fn signs_requests_like_the_aws_signature_v4_reference() {
        // AWS documentation example (IAM ListUsers)
        let authorization = sign_v4(&SigV4Request {
            method: "GET",
            path: "/",
            query: "Action=ListUsers&Version=2010-05-08",
            headers: &[
                (
                    "content-type",
                    "application/x-www-form-urlencoded; charset=utf-8",
                ),
                ("host", "iam.amazonaws.com"),
                ("x-amz-date", "20150830T123600Z"),
            ],
            payload_sha256: &sha256_hex(b""),
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
