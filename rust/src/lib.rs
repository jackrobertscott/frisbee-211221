//! Rust port of the Frisbee league server (`server/` + `shared/` in the TS
//! tree), backed by SQLite instead of MongoDB. See `ARCHITECTURE.md`.

#![forbid(unsafe_code)]

pub mod app;
pub mod auth;
pub mod config;
pub mod db;
pub mod endpoints;
pub mod gameday;
pub mod http;
pub mod js;
pub mod log;
pub mod migrate;
pub mod migrations;
pub mod queries;
pub mod server;
pub mod services;
pub mod shared;
pub mod startup;
pub mod tables;
pub mod testing;
pub mod utils;
