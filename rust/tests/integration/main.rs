//! All integration tests, built as one binary so they link once and run in parallel.

mod common;
mod dashboards;
mod fixtures;
mod gameday_export_cli;
mod gameday_export_smoke;
mod gameday_import;
mod http;
mod members;
mod migrate_mongo;
mod migrations;
mod port;
mod reports;
mod seasons;
mod security;
mod teams;
mod users;
