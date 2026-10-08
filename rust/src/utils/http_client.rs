//! Outgoing HTTP clients. TLS is rustls with the `ring` provider, which
//! builds far faster than rustls' default (`aws-lc-rs`).

/// A `reqwest` client builder with the TLS provider installed.
pub fn builder() -> reqwest::ClientBuilder {
    // fails only when a provider is already installed, which is fine
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
}

/// A default client.
pub fn client() -> reqwest::Client {
    builder().build().expect("the TLS provider is installed")
}
