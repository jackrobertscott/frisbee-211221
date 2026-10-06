//! Port of `server/src/db/table.ts`: typed table helpers.
//!
//! Every table is a zero-sized [`Table<T>`] constant (`tables::TEAM`). Its
//! async methods take the [`Db`] handle and run on a pooled connection:
//!
//! ```ignore
//! let team = TEAM.get_one(&db, Team::ID.eq(&team_id)).await?;
//! ```
//!
//! Inside a transaction (or any other synchronous connection scope) use the
//! same methods through [`Table::tx`]:
//!
//! ```ignore
//! db.transaction(move |c| {
//!     MEMBER.tx(c).delete_many(&Member::TEAM_ID.eq(&team_id))?;
//!     TEAM.tx(c).delete_one(&Team::ID.eq(&team_id))
//! }).await?;
//! ```

use super::filter::{Filter, Query};
use super::schema::{
    ChildDef, Col, ColumnDef, ColumnKind, TableDef, json_to_sql, row_to_map, select_list,
};
use super::{Db, savepoint};
use crate::shared::errors::{
    AppError, AppResult, ErrorInput, ErrorOptions, not_found_error, to_app_error,
};
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, params_from_iter};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::marker::PhantomData;

/// A stored record type, bound to its table declaration.
pub trait Record: Serialize + DeserializeOwned + Clone + Send + Sync + 'static {
    fn table() -> &'static TableDef;
}

/// Changes for `update_one` / `update_many`: fields to set, and fields to
/// unset (the TS `{field: undefined}`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Patch {
    entries: Vec<(String, Option<Value>)>,
}

impl Patch {
    pub fn new() -> Self {
        Patch::default()
    }

    /// Sets `col` to `value`.
    pub fn set<V: Serialize>(self, col: Col<V>, value: impl Into<V>) -> Self {
        let value = serde_json::to_value(value.into()).unwrap_or(Value::Null);
        self.set_field(col.field(), value)
    }

    /// Sets `col` when `Some`, unsets it when `None` (`{field: maybeUndefined}`).
    pub fn set_opt<V: Serialize>(self, col: Col<V>, value: Option<V>) -> Self {
        match value {
            Some(value) => self.set(col, value),
            None => self.unset(col),
        }
    }

    /// Unsets `col` (`{field: undefined}`).
    pub fn unset<V>(self, col: Col<V>) -> Self {
        self.unset_field(col.field())
    }

    /// Sets an array stored in a child table (e.g. `User::EMAILS`).
    pub fn set_list<V: Serialize>(self, col: &super::filter::ChildCol, values: &[V]) -> Self {
        let value = serde_json::to_value(values).unwrap_or(Value::Array(Vec::new()));
        self.set_field(col.child.field, value)
    }

    /// Sets a field by its record name.
    pub fn set_field(mut self, field: &str, value: Value) -> Self {
        self.entries.retain(|(key, _)| key != field);
        self.entries.push((field.to_string(), Some(value)));
        self
    }

    /// Unsets a field by its record name.
    pub fn unset_field(mut self, field: &str) -> Self {
        self.entries.retain(|(key, _)| key != field);
        self.entries.push((field.to_string(), None));
        self
    }

    /// Every key of `object` is set (spreading a validated payload).
    pub fn from_object(object: Map<String, Value>) -> Self {
        object
            .into_iter()
            .fold(Patch::new(), |patch, (key, value)| {
                patch.set_field(&key, value)
            })
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn entries(&self) -> &[(String, Option<Value>)] {
        &self.entries
    }
}

/// Operators for [`TableTx::find_one_and_update`] (`$set`, `$inc`, `$setOnInsert`).
#[derive(Clone, Debug, Default)]
pub struct AtomicUpdate {
    pub set: Patch,
    pub inc: Vec<(&'static ColumnDef, f64)>,
    pub set_on_insert: Patch,
}

/// Which version `find_one_and_update` returns.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ReturnDocument {
    Before,
    #[default]
    After,
}

/// Changed columns of one row (`None` clears the field).
type Changes = Vec<(&'static ColumnDef, Option<Value>)>;

/// A typed table. Declared once per record type in `crate::tables`.
pub struct Table<T>(PhantomData<fn() -> T>);

impl<T> Table<T> {
    pub const fn new() -> Self {
        Table(PhantomData)
    }
}

impl<T> Default for Table<T> {
    fn default() -> Self {
        Table::new()
    }
}

impl<T> Clone for Table<T> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<T> Copy for Table<T> {}

/// The table's synchronous helpers bound to one connection.
pub struct TableTx<'c, T> {
    conn: &'c Connection,
    _record: PhantomData<fn() -> T>,
}

/// `db.record_not_found` as `getOne` raises it.
pub fn record_not_found(def: &TableDef, message: &str) -> AppError {
    let mut meta = Map::new();
    meta.insert("table".into(), Value::String(def.key.to_string()));
    not_found_error(
        message,
        ErrorOptions::code("db.record_not_found").with_meta(meta),
    )
}

/// A schema validation failure inside a table helper. The TS tables `throw` the
/// raw error string, which becomes a 500 with that string as its message.
pub fn invalid_record(error: String) -> AppError {
    to_app_error(
        ErrorInput::Value(Some(Value::String(error))),
        ErrorOptions::default(),
    )
}

fn record_from_map<T: DeserializeOwned>(map: Map<String, Value>) -> AppResult<T> {
    serde_json::from_value(Value::Object(map)).map_err(AppError::internal_from)
}

fn to_object(value: Value) -> AppResult<Map<String, Value>> {
    match value {
        Value::Object(map) => Ok(map),
        other => Err(AppError::internal_from(format!(
            "Expected an object record but got {other}."
        ))),
    }
}

impl<T: Record> Table<T> {
    pub fn def(&self) -> &'static TableDef {
        T::table()
    }

    /// `$Table.key()`.
    pub fn key(&self) -> &'static str {
        T::table().key
    }

    /// `$Table.validator()`.
    pub fn validator(&self) -> crate::shared::torva::Io {
        (T::table().schema)()
    }

    /// Synchronous helpers on `conn` (inside `db.call` / `db.transaction`).
    pub fn tx<'c>(&self, conn: &'c Connection) -> TableTx<'c, T> {
        TableTx {
            conn,
            _record: PhantomData,
        }
    }

    pub async fn count(&self, db: &Db, filter: Filter) -> AppResult<i64> {
        let table = *self;
        db.call(move |c| table.tx(c).count(&filter)).await
    }

    pub async fn maybe_one(&self, db: &Db, filter: Filter) -> AppResult<Option<T>> {
        let table = *self;
        db.call(move |c| table.tx(c).maybe_one(&filter)).await
    }

    /// `maybeOne` with a sort (the first match in that order).
    pub async fn maybe_one_sorted(
        &self,
        db: &Db,
        filter: Filter,
        query: Query,
    ) -> AppResult<Option<T>> {
        let table = *self;
        db.call(move |c| table.tx(c).maybe_one_sorted(&filter, &query))
            .await
    }

    pub async fn get_one(&self, db: &Db, filter: Filter) -> AppResult<T> {
        let table = *self;
        db.call(move |c| table.tx(c).get_one(&filter)).await
    }

    pub async fn get_many(&self, db: &Db, filter: Filter, query: Query) -> AppResult<Vec<T>> {
        let table = *self;
        db.call(move |c| table.tx(c).get_many(&filter, &query))
            .await
    }

    pub async fn create_one(&self, db: &Db, value: impl Serialize) -> AppResult<T> {
        let table = *self;
        let value = serde_json::to_value(value)?;
        db.call(move |c| table.tx(c).create_one_value(value)).await
    }

    pub async fn create_many<V: Serialize>(&self, db: &Db, values: Vec<V>) -> AppResult<usize> {
        let table = *self;
        let values = values
            .iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()?;
        db.call(move |c| table.tx(c).create_many_values(values))
            .await
    }

    pub async fn update_one(&self, db: &Db, filter: Filter, patch: Patch) -> AppResult<T> {
        let table = *self;
        db.call(move |c| table.tx(c).update_one(&filter, &patch))
            .await
    }

    pub async fn update_many(&self, db: &Db, filter: Filter, patch: Patch) -> AppResult<usize> {
        let table = *self;
        db.call(move |c| table.tx(c).update_many(&filter, &patch))
            .await
    }

    pub async fn update_bulk(&self, db: &Db, tasks: Vec<(Filter, Patch)>) -> AppResult<()> {
        let table = *self;
        db.call(move |c| table.tx(c).update_bulk(&tasks)).await
    }

    pub async fn find_one_and_update(
        &self,
        db: &Db,
        filter: Filter,
        update: AtomicUpdate,
        upsert: bool,
        returns: ReturnDocument,
    ) -> AppResult<Option<T>> {
        let table = *self;
        db.call(move |c| {
            table
                .tx(c)
                .find_one_and_update(&filter, &update, upsert, returns)
        })
        .await
    }

    pub async fn delete_one(&self, db: &Db, filter: Filter) -> AppResult<usize> {
        let table = *self;
        db.call(move |c| table.tx(c).delete_one(&filter)).await
    }

    pub async fn delete_many(&self, db: &Db, filter: Filter) -> AppResult<usize> {
        let table = *self;
        db.call(move |c| table.tx(c).delete_many(&filter)).await
    }

    pub async fn sum(&self, db: &Db, column: Col<f64>, filter: Filter) -> AppResult<f64> {
        let table = *self;
        db.call(move |c| table.tx(c).sum(column, &filter)).await
    }

    /// `scanStored`: every stored row as raw JSON (legacy columns included,
    /// no schema applied).
    pub async fn scan_stored(&self, db: &Db, filter: Filter) -> AppResult<Vec<Map<String, Value>>> {
        let table = *self;
        db.call(move |c| table.tx(c).scan_stored(&filter)).await
    }
}

impl<'c, T: Record> TableTx<'c, T> {
    fn def(&self) -> &'static TableDef {
        T::table()
    }

    /// `(_seq, stored fields)` rows matching `filter` in `query` order.
    fn select_maps(
        &self,
        filter: &Filter,
        query: &Query,
        include_legacy: bool,
    ) -> AppResult<Vec<(i64, Map<String, Value>)>> {
        let def = self.def();
        let columns = def.plain_columns(include_legacy);
        let mut params = Vec::new();
        let where_sql = filter.to_sql("t", None, &mut params);
        let order = query.to_sql("t").map_err(AppError::internal_from)?;
        let sql = format!(
            "SELECT t.\"_seq\", {} FROM \"{}\" t WHERE {where_sql}{order}",
            select_list("t", &columns),
            def.sql
        );
        let mut statement = self.conn.prepare_cached(&sql)?;
        let rows = statement
            .query_map(params_from_iter(params.iter()), |row| {
                Ok((row.get::<_, i64>(0)?, row_to_map(row, &columns, 1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut rows = rows;
        self.attach_children(&mut rows)?;
        Ok(rows
            .into_iter()
            .map(|(seq, map)| (seq, self.order_fields(map, include_legacy)))
            .collect())
    }

    /// Puts fields in schema order (child arrays at their declared position).
    fn order_fields(
        &self,
        mut map: Map<String, Value>,
        include_legacy: bool,
    ) -> Map<String, Value> {
        let def = self.def();
        let mut ordered = Map::new();
        let legacy: &[&ColumnDef] = if include_legacy {
            def.legacy_columns
        } else {
            &[]
        };
        for column in def.columns.iter().chain(legacy.iter()) {
            if let Some(value) = map.remove(column.field) {
                ordered.insert(column.field.to_string(), value);
            }
        }
        ordered
    }

    fn attach_children(&self, rows: &mut [(i64, Map<String, Value>)]) -> AppResult<()> {
        for child in self.def().children() {
            let ids: Vec<String> = rows
                .iter()
                .filter_map(|(_, map)| map.get("id").and_then(Value::as_str).map(str::to_string))
                .collect();
            let mut by_parent = load_children(self.conn, child, &ids)?;
            for (_, map) in rows.iter_mut() {
                let id = map
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let items = by_parent.remove(&id).unwrap_or_default();
                map.insert(child.field.to_string(), Value::Array(items));
            }
        }
        Ok(())
    }

    /// `$Table.count(query)`.
    pub fn count(&self, filter: &Filter) -> AppResult<i64> {
        let mut params = Vec::new();
        let where_sql = filter.to_sql("t", None, &mut params);
        let sql = format!(
            "SELECT COUNT(*) FROM \"{}\" t WHERE {where_sql}",
            self.def().sql
        );
        Ok(self
            .conn
            .prepare_cached(&sql)?
            .query_row(params_from_iter(params.iter()), |row| row.get(0))?)
    }

    /// `$Table.maybeOne(query)`: the first match in insertion order.
    pub fn maybe_one(&self, filter: &Filter) -> AppResult<Option<T>> {
        self.maybe_one_sorted(filter, &Query::new())
    }

    /// `$Table.maybeOne(query, {sort})`.
    pub fn maybe_one_sorted(&self, filter: &Filter, query: &Query) -> AppResult<Option<T>> {
        let query = Query {
            limit: Some(1),
            ..query.clone()
        };
        match self.select_maps(filter, &query, false)?.into_iter().next() {
            Some((_, map)) => Ok(Some(record_from_map(map)?)),
            None => Ok(None),
        }
    }

    /// `$Table.getOne(query)`: raises `db.record_not_found` (404) when missing.
    pub fn get_one(&self, filter: &Filter) -> AppResult<T> {
        self.maybe_one(filter)?.ok_or_else(|| {
            record_not_found(self.def(), &format!("Failed to get {}.", self.def().key))
        })
    }

    /// `$Table.getMany(query, {sort, skip, limit})`: sorted in SQL before paging.
    pub fn get_many(&self, filter: &Filter, query: &Query) -> AppResult<Vec<T>> {
        self.select_maps(filter, query, false)?
            .into_iter()
            .map(|(_, map)| record_from_map(map))
            .collect()
    }

    /// `scanStored`: raw stored rows, legacy columns included, no schema applied.
    pub fn scan_stored(&self, filter: &Filter) -> AppResult<Vec<Map<String, Value>>> {
        Ok(self
            .select_maps(filter, &Query::new(), true)?
            .into_iter()
            .map(|(_, map)| map)
            .collect())
    }

    /// Sum of a numeric column over matching rows (`$group` / `$sum`).
    pub fn sum(&self, column: Col<f64>, filter: &Filter) -> AppResult<f64> {
        let mut params = Vec::new();
        let where_sql = filter.to_sql("t", None, &mut params);
        let sql = format!(
            "SELECT TOTAL(t.\"{}\") FROM \"{}\" t WHERE {where_sql}",
            column.sql(),
            self.def().sql
        );
        Ok(self
            .conn
            .prepare_cached(&sql)?
            .query_row(params_from_iter(params.iter()), |row| row.get(0))?)
    }

    fn defaults(&self) -> Map<String, Value> {
        self.def()
            .defaults
            .iter()
            .map(|(field, make)| (field.to_string(), make()))
            .collect()
    }

    fn validate(&self, map: Map<String, Value>) -> AppResult<Map<String, Value>> {
        let validated = (self.def().schema)()
            .validate(&Value::Object(map))
            .map_err(invalid_record)?;
        to_object(validated)
    }

    /// `{...defaults, ...value}`, validated.
    fn prepare_create(&self, value: Value) -> AppResult<Map<String, Value>> {
        let mut map = self.defaults();
        map.extend(to_object(value)?);
        self.validate(map)
    }

    fn read_by_seq(&self, seq: i64) -> AppResult<T> {
        let sql = format!(
            "SELECT {} FROM \"{}\" t WHERE t.\"_seq\" = ?",
            select_list("t", &self.def().plain_columns(false)),
            self.def().sql
        );
        let columns = self.def().plain_columns(false);
        let map = self
            .conn
            .prepare_cached(&sql)?
            .query_row([seq], |row| row_to_map(row, &columns, 0))?;
        let mut rows = vec![(seq, map)];
        self.attach_children(&mut rows)?;
        let (_, map) = rows.remove(0);
        record_from_map(self.order_fields(map, false))
    }

    /// `$Table.createOne(value)`: applies defaults (id, createdOn, updatedOn, ...),
    /// validates against the schema and returns the stored record.
    pub fn create_one(&self, value: impl Serialize) -> AppResult<T> {
        self.create_one_value(serde_json::to_value(value)?)
    }

    fn create_one_value(&self, value: Value) -> AppResult<T> {
        let map = self.prepare_create(value)?;
        let seq = savepoint(self.conn, |c| insert_map(c, self.def(), &map))?;
        self.read_by_seq(seq)
    }

    /// `$Table.createMany(values)`: validates every value before writing any.
    pub fn create_many<V: Serialize>(&self, values: &[V]) -> AppResult<usize> {
        let values = values
            .iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()?;
        self.create_many_values(values)
    }

    fn create_many_values(&self, values: Vec<Value>) -> AppResult<usize> {
        let maps = values
            .into_iter()
            .map(|v| self.prepare_create(v))
            .collect::<AppResult<Vec<_>>>()?;
        savepoint(self.conn, |c| {
            for map in &maps {
                insert_map(c, self.def(), map)?;
            }
            Ok(maps.len())
        })
    }

    /// Writes a stored row exactly as given: no defaults, no validation. For
    /// imports and tests that need legacy or invalid data.
    pub fn insert_raw(&self, map: &Map<String, Value>) -> AppResult<()> {
        savepoint(self.conn, |c| insert_map(c, self.def(), map)).map(|_| ())
    }

    /// The validated merge of `current` and `patch`, plus the changed columns.
    fn prepare_update(
        &self,
        current: Map<String, Value>,
        patch: &Patch,
    ) -> AppResult<(Map<String, Value>, Changes)> {
        let mut merged = current;
        for (field, value) in patch.entries() {
            match value {
                Some(value) => {
                    merged.insert(field.clone(), value.clone());
                }
                None => {
                    merged.remove(field);
                }
            }
        }
        let validated = self.validate(merged)?;
        // only touch the fields the caller changed, with their validated values
        let mut changes = Vec::new();
        for (field, value) in patch.entries() {
            if field == "id" || field == "_id" {
                continue;
            }
            let Some(column) = self.def().column(field) else {
                continue;
            };
            let next = match value {
                Some(_) => validated.get(field).cloned(),
                None => None,
            };
            changes.push((column, next));
        }
        Ok((validated, changes))
    }

    /// `$Table.updateOne(query, value)`: merges, validates, writes only the
    /// changed fields and returns the validated record. Does not touch
    /// `updatedOn` unless the patch sets it.
    pub fn update_one(&self, filter: &Filter, patch: &Patch) -> AppResult<T> {
        let Some((seq, current)) = self
            .select_maps(filter, &Query::new().limit(1), false)?
            .into_iter()
            .next()
        else {
            return Err(record_not_found(self.def(), "Failed to find document."));
        };
        let (validated, changes) = self.prepare_update(current, patch)?;
        if !changes.is_empty() {
            let id = validated_id(&validated);
            savepoint(self.conn, |c| {
                write_changes(c, self.def(), seq, &id, &changes)
            })?;
        }
        record_from_map(validated)
    }

    /// `$Table.updateMany(query, value)`: raw `$set`/`$unset` without
    /// validation; returns how many rows actually changed.
    pub fn update_many(&self, filter: &Filter, patch: &Patch) -> AppResult<usize> {
        let def = self.def();
        let mut sets = Vec::new();
        let mut set_params = Vec::new();
        let mut same = Vec::new();
        let mut same_params = Vec::new();
        for (field, value) in patch.entries() {
            if field == "id" || field == "_id" {
                continue;
            }
            let Some(column) = def.column(field) else {
                continue;
            };
            if matches!(column.kind, ColumnKind::Children(_)) {
                return Err(AppError::internal_from(format!(
                    "update_many cannot write the array field \"{field}\"."
                )));
            }
            let sql_value = value
                .as_ref()
                .map(|v| json_to_sql(column.kind, v))
                .unwrap_or(SqlValue::Null);
            sets.push(format!("\"{}\" = ?", column.sql));
            set_params.push(sql_value.clone());
            same.push(format!("\"{}\" IS ?", column.sql));
            same_params.push(sql_value);
        }
        if sets.is_empty() {
            return Ok(0);
        }
        let mut where_params = Vec::new();
        let where_sql = filter.to_sql("t", None, &mut where_params);
        let sql = format!(
            "UPDATE \"{table}\" SET {sets} WHERE \"_seq\" IN (SELECT t.\"_seq\" FROM \"{table}\" t WHERE {where_sql}) AND NOT ({same})",
            table = def.sql,
            sets = sets.join(", "),
            same = same.join(" AND "),
        );
        let params: Vec<SqlValue> = set_params
            .into_iter()
            .chain(where_params)
            .chain(same_params)
            .collect();
        Ok(self
            .conn
            .prepare_cached(&sql)?
            .execute(params_from_iter(params.iter()))?)
    }

    /// `$Table.updateBulk(tasks)`: validates every task first; writes nothing
    /// if any task fails.
    pub fn update_bulk(&self, tasks: &[(Filter, Patch)]) -> AppResult<()> {
        let mut planned = Vec::new();
        for (filter, patch) in tasks {
            let Some((seq, current)) = self
                .select_maps(filter, &Query::new().limit(1), false)?
                .into_iter()
                .next()
            else {
                return Err(record_not_found(self.def(), "Failed to find document."));
            };
            let (validated, changes) = self.prepare_update(current, patch)?;
            if !changes.is_empty() {
                planned.push((seq, validated_id(&validated), changes));
            }
        }
        if planned.is_empty() {
            return Ok(());
        }
        savepoint(self.conn, |c| {
            for (seq, id, changes) in &planned {
                write_changes(c, self.def(), *seq, id, changes)?;
            }
            Ok(())
        })
    }

    /// `$Table.updateAtomic(query, update, {upsert, returnDocument})`: one
    /// atomic read-modify-write without schema validation (callers must
    /// write every required field). Upserts seed the new row from the
    /// filter's top-level equalities, like Mongo.
    pub fn find_one_and_update(
        &self,
        filter: &Filter,
        update: &AtomicUpdate,
        upsert: bool,
        returns: ReturnDocument,
    ) -> AppResult<Option<T>> {
        let def = self.def();
        savepoint(self.conn, |c| {
            let tx = TableTx::<T> {
                conn: c,
                _record: PhantomData,
            };
            let existing = tx
                .select_maps(filter, &Query::new().limit(1), false)?
                .into_iter()
                .next();
            match existing {
                Some((seq, before)) => {
                    let mut changes = Vec::new();
                    for (field, value) in update.set.entries() {
                        if let Some(column) = def.column(field) {
                            changes.push((column, value.clone()));
                        }
                    }
                    for (column, amount) in &update.inc {
                        let current = before
                            .get(column.field)
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0);
                        changes.push((*column, Some(crate::js::number(current + amount))));
                    }
                    let id = validated_id(&before);
                    if !changes.is_empty() {
                        write_changes(c, def, seq, &id, &changes)?;
                    }
                    match returns {
                        ReturnDocument::Before => record_from_map(before).map(Some),
                        ReturnDocument::After => tx.read_by_seq(seq).map(Some),
                    }
                }
                None if upsert => {
                    let mut map = Map::new();
                    for (column, value) in filter.equalities() {
                        if let Some(json) = super::schema::sql_to_json(column.kind, value) {
                            map.insert(column.field.to_string(), json);
                        }
                    }
                    for (field, value) in update
                        .set_on_insert
                        .entries()
                        .iter()
                        .chain(update.set.entries())
                    {
                        match value {
                            Some(value) => map.insert(field.clone(), value.clone()),
                            None => map.remove(field),
                        };
                    }
                    for (column, amount) in &update.inc {
                        let current = map.get(column.field).and_then(Value::as_f64).unwrap_or(0.0);
                        map.insert(
                            column.field.to_string(),
                            crate::js::number(current + amount),
                        );
                    }
                    let seq = insert_map(c, def, &map)?;
                    match returns {
                        ReturnDocument::Before => Ok(None),
                        ReturnDocument::After => tx.read_by_seq(seq).map(Some),
                    }
                }
                None => Ok(None),
            }
        })
    }

    /// `$Table.deleteOne(query)`: deletes the first match in insertion order.
    pub fn delete_one(&self, filter: &Filter) -> AppResult<usize> {
        let mut params = Vec::new();
        let where_sql = filter.to_sql("t", None, &mut params);
        let sql = format!(
            "DELETE FROM \"{table}\" WHERE \"_seq\" = (SELECT t.\"_seq\" FROM \"{table}\" t WHERE {where_sql} ORDER BY t.\"_seq\" LIMIT 1)",
            table = self.def().sql
        );
        Ok(self
            .conn
            .prepare_cached(&sql)?
            .execute(params_from_iter(params.iter()))?)
    }

    /// `$Table.deleteMany(query)`.
    pub fn delete_many(&self, filter: &Filter) -> AppResult<usize> {
        let mut params = Vec::new();
        let where_sql = filter.to_sql("t", None, &mut params);
        let sql = format!(
            "DELETE FROM \"{table}\" WHERE \"_seq\" IN (SELECT t.\"_seq\" FROM \"{table}\" t WHERE {where_sql})",
            table = self.def().sql
        );
        Ok(self
            .conn
            .prepare_cached(&sql)?
            .execute(params_from_iter(params.iter()))?)
    }
}

fn validated_id(map: &Map<String, Value>) -> String {
    map.get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn load_children(
    conn: &Connection,
    child: &ChildDef,
    ids: &[String],
) -> AppResult<HashMap<String, Vec<Value>>> {
    let mut out: HashMap<String, Vec<Value>> = HashMap::new();
    for chunk in ids.chunks(500) {
        if chunk.is_empty() {
            continue;
        }
        let marks = vec!["?"; chunk.len()].join(", ");
        let sql = format!(
            "SELECT c.\"{parent}\", {cols} FROM \"{table}\" c WHERE c.\"{parent}\" IN ({marks}) ORDER BY c.\"{parent}\", c.\"{position}\"",
            parent = child.parent_column,
            cols = select_list("c", child.columns),
            table = child.table,
            position = child.position_column,
        );
        let mut statement = conn.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(chunk.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row_to_map(row, child.columns, 1)?))
        })?;
        for row in rows {
            let (parent, map) = row?;
            out.entry(parent).or_default().push(Value::Object(map));
        }
    }
    Ok(out)
}

fn insert_children(
    conn: &Connection,
    child: &ChildDef,
    parent_id: &str,
    items: Option<&Value>,
) -> AppResult<()> {
    conn.prepare_cached(&format!(
        "DELETE FROM \"{}\" WHERE \"{}\" = ?",
        child.table, child.parent_column
    ))?
    .execute([parent_id])?;
    let Some(Value::Array(items)) = items else {
        return Ok(());
    };
    let columns: Vec<String> = child
        .columns
        .iter()
        .map(|c| format!("\"{}\"", c.sql))
        .collect();
    let sql = format!(
        "INSERT INTO \"{}\" (\"{}\", \"{}\", {}) VALUES (?, ?, {})",
        child.table,
        child.parent_column,
        child.position_column,
        columns.join(", "),
        vec!["?"; columns.len()].join(", ")
    );
    let mut statement = conn.prepare_cached(&sql)?;
    for (position, item) in items.iter().enumerate() {
        let mut params: Vec<SqlValue> = vec![
            SqlValue::Text(parent_id.to_string()),
            SqlValue::Integer(position as i64),
        ];
        for column in child.columns {
            params.push(
                item.get(column.field)
                    .map(|v| json_to_sql(column.kind, v))
                    .unwrap_or(SqlValue::Null),
            );
        }
        statement.execute(params_from_iter(params.iter()))?;
    }
    Ok(())
}

/// Inserts one stored row (plus child rows) and returns its `_seq`.
fn insert_map(conn: &Connection, def: &TableDef, map: &Map<String, Value>) -> AppResult<i64> {
    let columns = def.plain_columns(true);
    let names: Vec<String> = columns.iter().map(|c| format!("\"{}\"", c.sql)).collect();
    let sql = format!(
        "INSERT INTO \"{}\" ({}) VALUES ({})",
        def.sql,
        names.join(", "),
        vec!["?"; names.len()].join(", ")
    );
    let params: Vec<SqlValue> = columns
        .iter()
        .map(|c| {
            map.get(c.field)
                .map(|v| json_to_sql(c.kind, v))
                .unwrap_or(SqlValue::Null)
        })
        .collect();
    conn.prepare_cached(&sql)?
        .execute(params_from_iter(params.iter()))?;
    let seq = conn.last_insert_rowid();
    let id = validated_id(map);
    for child in def.children() {
        insert_children(conn, child, &id, map.get(child.field))?;
    }
    Ok(seq)
}

/// Writes changed columns of one row (`None` clears the field).
fn write_changes(
    conn: &Connection,
    def: &TableDef,
    seq: i64,
    id: &str,
    changes: &[(&'static ColumnDef, Option<Value>)],
) -> AppResult<()> {
    let mut sets = Vec::new();
    let mut params = Vec::new();
    for (column, value) in changes {
        match column.kind {
            ColumnKind::Children(child) => insert_children(conn, child, id, value.as_ref())?,
            kind => {
                sets.push(format!("\"{}\" = ?", column.sql));
                params.push(
                    value
                        .as_ref()
                        .map(|v| json_to_sql(kind, v))
                        .unwrap_or(SqlValue::Null),
                );
            }
        }
    }
    if sets.is_empty() {
        return Ok(());
    }
    params.push(SqlValue::Integer(seq));
    let sql = format!(
        "UPDATE \"{}\" SET {} WHERE \"_seq\" = ?",
        def.sql,
        sets.join(", ")
    );
    conn.prepare_cached(&sql)?
        .execute(params_from_iter(params.iter()))?;
    Ok(())
}

#[cfg(test)]
#[path = "table_tests.rs"]
mod tests;
