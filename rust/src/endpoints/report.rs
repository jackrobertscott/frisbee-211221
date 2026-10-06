//! Port of `server/src/endpoints/Report.ts` — endpoints for
//! `shared/src/endpoints/ReportDef.ts` (`crate::shared::contract::report`).
//!
//! Owned by the Report domain: add one `Endpoint` per definition to [`routes`].

use crate::http::endpoint::Endpoint;

/// The Report endpoints.
pub fn routes() -> Vec<Endpoint> {
    vec![]
}
