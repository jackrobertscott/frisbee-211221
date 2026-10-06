//! Port of `server/src/endpoints`: the endpoint registry. Each domain module
//! exposes `routes()`; [`all`] collects them for the app.

pub mod feature;
pub mod fixture;
pub mod member;
pub mod port;
pub mod report;
pub mod season;
pub mod security;
pub mod team;
pub mod user;

use crate::http::endpoint::Endpoint;

/// Every registered endpoint (`endpoints/index.ts`).
pub fn all() -> Vec<Endpoint> {
    [
        feature::routes(),
        fixture::routes(),
        member::routes(),
        port::routes(),
        report::routes(),
        season::routes(),
        security::routes(),
        team::routes(),
        user::routes(),
    ]
    .into_iter()
    .flatten()
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::contract::all_defs;
    use std::collections::HashSet;

    #[test]
    fn registers_each_path_once_and_only_contract_paths() {
        let endpoints = all();
        let paths: HashSet<&str> = endpoints.iter().map(|e| e.def.path).collect();
        assert_eq!(paths.len(), endpoints.len(), "duplicate endpoint registration");
        let contract: HashSet<&str> = all_defs().iter().map(|(_, def)| def.path).collect();
        for path in paths {
            assert!(contract.contains(path), "{path} is not in the shared contract");
        }
    }
}
