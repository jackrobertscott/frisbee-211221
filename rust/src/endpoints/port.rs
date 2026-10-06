//! Port of `server/src/endpoints/Port.ts` — endpoints for
//! `shared/src/endpoints/PortDef.ts` (`crate::shared::contract::port`).
//!
//! Owned by the Port domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Port endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
