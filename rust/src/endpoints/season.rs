//! Port of `server/src/endpoints/Season.ts` — endpoints for
//! `shared/src/endpoints/SeasonDef.ts` (`crate::shared::contract::season`).
//!
//! Owned by the Season domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Season endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
