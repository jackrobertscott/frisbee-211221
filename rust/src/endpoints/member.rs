//! Port of `server/src/endpoints/Member.ts` — endpoints for
//! `shared/src/endpoints/MemberDef.ts` (`crate::shared::contract::member`).
//!
//! Owned by the Member domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Member endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
