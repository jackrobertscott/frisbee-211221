//! Port of `server/src/endpoints/Security.ts` — endpoints for
//! `shared/src/endpoints/SecurityDef.ts` (`crate::shared::contract::security`).
//!
//! Owned by the Security domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Security endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
