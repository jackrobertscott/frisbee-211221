//! Port of `server/src/endpoints/Feature.ts` — endpoints for
//! `shared/src/endpoints/FeatureDef.ts` (`crate::shared::contract::feature`).
//!
//! Owned by the Feature domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Feature endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
