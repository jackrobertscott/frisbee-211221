//! Port of `server/src/queries`: read queries that go beyond single-table
//! filters (joins, aggregates, computed sort keys).
//!
//! Each TS query module becomes a Rust module here, owned by its domain.
//! Rules: SQL lives only here and in `crate::tables` / `crate::db`; take table
//! and column names from the typed definitions (`team::TABLE.sql`,
//! `Team::NAME.sql()`), never as raw literals spread through endpoint code;
//! sort in SQL before `LIMIT`/`OFFSET`; never sort or tie-break on `id`.

pub mod user_list;
