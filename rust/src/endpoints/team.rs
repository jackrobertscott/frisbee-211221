//! Port of `server/src/endpoints/Team.ts` — endpoints for
//! `shared/src/endpoints/TeamDef.ts` (`crate::shared::contract::team`).
//!
//! Owned by the Team domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Team endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
