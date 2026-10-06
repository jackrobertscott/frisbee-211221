//! Port of `server/src/endpoints/User.ts` — endpoints for
//! `shared/src/endpoints/UserDef.ts` (`crate::shared::contract::user`).
//!
//! Owned by the User domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The User endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
