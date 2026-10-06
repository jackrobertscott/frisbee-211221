//! Port of `shared/src/endpoints/*Def.ts`: every endpoint's path, access
//! point, payload schema and result schema, one module per domain.
//!
//! Domain endpoint modules register handlers against these definitions
//! (`Endpoint::new(&contract::season::SEASON_LIST, handler)`), so paths and
//! validation can never drift from the shared contract.

pub mod feature;
pub mod fixture;
pub mod member;
pub mod port;
pub mod report;
pub mod season;
pub mod security;
pub mod team;
pub mod user;

use crate::shared::utils::endpoint_def::EndpointDef;

/// Every definition, grouped by its TS module name (`FeatureDef`, ...).
pub fn all_defs() -> Vec<(&'static str, &'static EndpointDef)> {
    let modules: [(&'static str, &'static [&'static EndpointDef]); 9] = [
        ("FeatureDef", feature::DEFS),
        ("FixtureDef", fixture::DEFS),
        ("MemberDef", member::DEFS),
        ("PortDef", port::DEFS),
        ("ReportDef", report::DEFS),
        ("SeasonDef", season::DEFS),
        ("SecurityDef", security::DEFS),
        ("TeamDef", team::DEFS),
        ("UserDef", user::DEFS),
    ];
    modules
        .iter()
        .flat_map(|(module, defs)| defs.iter().map(move |def| (*module, *def)))
        .collect()
}

#[cfg(test)]
#[path = "contract_tests.rs"]
mod tests;
