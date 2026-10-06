//! Rust port of the Frisbee league server (`server/` + `shared/` in the TS
//! tree), backed by SQLite instead of MongoDB. See `ARCHITECTURE.md`.

#![forbid(unsafe_code)]

pub mod config;
pub mod db;
pub mod js;
pub mod log;
pub mod shared;
pub mod tables;
pub mod utils;
