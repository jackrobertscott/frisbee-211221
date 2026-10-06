//! Port of `server/src/endpoints/Fixture.ts` — endpoints for
//! `shared/src/endpoints/FixtureDef.ts` (`crate::shared::contract::fixture`).
//!
//! Owned by the Fixture domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Fixture endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
