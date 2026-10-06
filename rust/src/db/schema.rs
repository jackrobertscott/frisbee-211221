//! Table, column and index definitions — the SQLite counterpart of the
//! `db.table({key, indexes, schema, defaults})` declarations in
//! `server/src/tables/*`.
//!
//! Every top-level field of a record is one column (`snake_case` SQL name).
//! Nested arrays are either a JSON text column ([`ColumnKind::Json`]) or rows
//! of a child table ([`ColumnKind::Children`], used for `user.emails` so
//! emails can be indexed and looked up case-insensitively).

use crate::js;
use crate::shared::torva::Io;
use rusqlite::types::Value as SqlValue;
use serde_json::{Map, Number, Value};
use std::marker::PhantomData;

/// How a field is stored.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColumnKind {
    Text,
    Bool,
    Integer,
    Real,
    /// Arrays and objects, stored as JSON text (queryable with SQLite json1).
    Json,
    /// An array of objects stored as rows of a child table.
    Children(&'static ChildDef),
}

/// One stored field.
#[derive(Debug, PartialEq, Eq)]
pub struct ColumnDef {
    /// The record (JSON) field name, e.g. `firstName`.
    pub field: &'static str,
    /// The SQL column name, e.g. `first_name`.
    pub sql: &'static str,
    pub kind: ColumnKind,
}

impl ColumnDef {
    pub const fn new(field: &'static str, sql: &'static str, kind: ColumnKind) -> Self {
        ColumnDef { field, sql, kind }
    }
}

/// A child table holding the elements of one array field.
#[derive(Debug, PartialEq, Eq)]
pub struct ChildDef {
    /// The parent field, e.g. `emails`.
    pub field: &'static str,
    /// The SQL table, e.g. `user_email`.
    pub table: &'static str,
    /// Column holding the parent's `id`.
    pub parent_column: &'static str,
    /// Column holding the element's index in the array.
    pub position_column: &'static str,
    pub columns: &'static [&'static ColumnDef],
}

/// Sort direction of an index key (`1` / `-1` in Mongo).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    Asc,
    Desc,
}

/// A declared index (`TTableIndex`). `key` uses record field paths; a path
/// into a child table (`emails.value`) indexes that child table.
#[derive(Debug, PartialEq, Eq)]
pub struct IndexDef {
    pub key: &'static [(&'static str, Direction)],
    pub name: Option<&'static str>,
    pub unique: bool,
    pub collation: Option<Collation>,
}

impl IndexDef {
    pub const fn new(key: &'static [(&'static str, Direction)]) -> Self {
        IndexDef {
            key,
            name: None,
            unique: false,
            collation: None,
        }
    }
    pub const fn unique(mut self) -> Self {
        self.unique = true;
        self
    }
    pub const fn named(mut self, name: &'static str) -> Self {
        self.name = Some(name);
        self
    }
    pub const fn collation(mut self, collation: Collation) -> Self {
        self.collation = Some(collation);
        self
    }
}

/// Custom collations registered on every connection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Collation {
    /// Case-insensitive, accent-sensitive (Mongo `{locale: 'en', strength: 2}`),
    /// used for email lookups.
    CaseInsensitive,
    /// Season names (Mongo `{locale: 'en', numericOrdering: true, strength: 1}`).
    SeasonName,
}

impl Collation {
    pub fn sql_name(self) -> &'static str {
        match self {
            Collation::CaseInsensitive => "ci",
            Collation::SeasonName => crate::shared::utils::season_name::SEASON_NAME_SQL_COLLATION,
        }
    }
}

/// A default value for a field missing on create.
pub type DefaultFn = fn() -> Value;

/// A table declaration (`db.table({...})`).
pub struct TableDef {
    /// The TS table key (`user`, `authAttemptLimit`), reported in errors.
    pub key: &'static str,
    /// The SQL table name.
    pub sql: &'static str,
    /// Stored fields in schema order.
    pub columns: &'static [&'static ColumnDef],
    /// Extra columns kept only for legacy data (e.g. `user.gender`); they are
    /// visible to `scan_stored` but are not part of the record.
    pub legacy_columns: &'static [&'static ColumnDef],
    pub indexes: &'static [IndexDef],
    pub schema: fn() -> Io,
    pub defaults: &'static [(&'static str, DefaultFn)],
}

/// A compiled index: name and the SQL that creates it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompiledIndex {
    /// The TS index name, e.g. `seasonId_asc__date_asc`.
    pub name: String,
    /// The SQLite index name (`<table>__<name>`), unique across the database.
    pub sql_name: String,
    /// The table the index lives on (the child table for child paths).
    pub table: String,
    /// `CREATE [UNIQUE] INDEX ...`
    pub create_sql: String,
}

impl TableDef {
    pub fn column(&self, field: &str) -> Option<&'static ColumnDef> {
        self.columns
            .iter()
            .chain(self.legacy_columns.iter())
            .copied()
            .find(|c| c.field == field)
    }

    /// Child tables of this table.
    pub fn children(&self) -> impl Iterator<Item = &'static ChildDef> + '_ {
        self.columns.iter().filter_map(|c| match c.kind {
            ColumnKind::Children(child) => Some(child),
            _ => None,
        })
    }

    /// Plain (non-child) columns, including legacy ones when asked.
    pub fn plain_columns(&self, include_legacy: bool) -> Vec<&'static ColumnDef> {
        let legacy: &[&'static ColumnDef] = if include_legacy {
            self.legacy_columns
        } else {
            &[]
        };
        self.columns
            .iter()
            .chain(legacy.iter())
            .copied()
            .filter(|c| !matches!(c.kind, ColumnKind::Children(_)))
            .collect()
    }

    /// The declared indexes with their names and SQL (`_compileTableIndex`).
    pub fn compiled_indexes(&self) -> Result<Vec<CompiledIndex>, String> {
        let mut out: Vec<CompiledIndex> = Vec::new();
        for index in self.indexes {
            let compiled = compile_index(self, index)?;
            if out.iter().any(|other| other.name == compiled.name) {
                return Err(format!(
                    "Duplicate index name \"{}\" on table \"{}\".",
                    compiled.name, self.key
                ));
            }
            out.push(compiled);
        }
        Ok(out)
    }
}

/// `_compileTableIndex`: names the index from its keys unless named explicitly.
pub fn compile_index(table: &TableDef, index: &IndexDef) -> Result<CompiledIndex, String> {
    if index.key.is_empty() {
        return Err("Index requires at least one field.".into());
    }
    let name = index.name.map(str::to_string).unwrap_or_else(|| {
        index
            .key
            .iter()
            .map(|(field, direction)| {
                format!(
                    "{field}_{}",
                    if *direction == Direction::Asc {
                        "asc"
                    } else {
                        "desc"
                    }
                )
            })
            .collect::<Vec<_>>()
            .join("__")
    });
    let mut target_table = table.sql.to_string();
    let mut parts = Vec::new();
    for (path, direction) in index.key {
        let (sql_table, column) = match path.split_once('.') {
            Some((parent, child_field)) => {
                let child = table
                    .children()
                    .find(|child| child.field == parent)
                    .ok_or_else(|| {
                        format!("Unknown index field \"{path}\" on table \"{}\".", table.key)
                    })?;
                let column = child
                    .columns
                    .iter()
                    .find(|c| c.field == child_field)
                    .ok_or_else(|| {
                        format!("Unknown index field \"{path}\" on table \"{}\".", table.key)
                    })?;
                (child.table.to_string(), column.sql)
            }
            None => {
                let column = table.column(path).ok_or_else(|| {
                    format!("Unknown index field \"{path}\" on table \"{}\".", table.key)
                })?;
                (table.sql.to_string(), column.sql)
            }
        };
        if parts.is_empty() {
            target_table = sql_table;
        } else if target_table != sql_table {
            return Err(format!(
                "Index \"{name}\" mixes tables on \"{}\".",
                table.key
            ));
        }
        let collate = index
            .collation
            .map(|c| format!(" COLLATE {}", c.sql_name()))
            .unwrap_or_default();
        let dir = if *direction == Direction::Asc {
            "ASC"
        } else {
            "DESC"
        };
        parts.push(format!("\"{column}\"{collate} {dir}"));
    }
    let sql_name = format!("{}__{}", table.sql, name);
    let create_sql = format!(
        "CREATE {}INDEX \"{sql_name}\" ON \"{target_table}\" ({})",
        if index.unique { "UNIQUE " } else { "" },
        parts.join(", ")
    );
    Ok(CompiledIndex {
        name,
        sql_name,
        table: target_table,
        create_sql,
    })
}

/// A typed handle on a column, used to build filters, sorts and patches:
/// `Team::NAME.eq("Hawks")`, `Team::CREATED_ON.desc()`.
pub struct Col<V> {
    pub def: &'static ColumnDef,
    _value: PhantomData<fn() -> V>,
}

impl<V> Col<V> {
    pub const fn new(def: &'static ColumnDef) -> Self {
        Col {
            def,
            _value: PhantomData,
        }
    }
    pub fn field(&self) -> &'static str {
        self.def.field
    }
    pub fn sql(&self) -> &'static str {
        self.def.sql
    }
}

impl<V> Clone for Col<V> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<V> Copy for Col<V> {}

impl<V> std::fmt::Debug for Col<V> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Col({})", self.def.field)
    }
}

/// Values that can be compared against a column.
pub trait ColumnValue {
    fn to_sql(&self) -> SqlValue;
}

impl ColumnValue for String {
    fn to_sql(&self) -> SqlValue {
        SqlValue::Text(self.clone())
    }
}
impl ColumnValue for bool {
    fn to_sql(&self) -> SqlValue {
        SqlValue::Integer(i64::from(*self))
    }
}
impl ColumnValue for i64 {
    fn to_sql(&self) -> SqlValue {
        SqlValue::Integer(*self)
    }
}
impl ColumnValue for f64 {
    fn to_sql(&self) -> SqlValue {
        if self.fract() == 0.0 && self.abs() < 9.2e18 {
            SqlValue::Integer(*self as i64)
        } else {
            SqlValue::Real(*self)
        }
    }
}

macro_rules! enum_column_value {
    ($($ty:ty),*) => {
        $(impl ColumnValue for $ty {
            fn to_sql(&self) -> SqlValue {
                SqlValue::Text(self.as_str().to_string())
            }
        })*
    };
}
enum_column_value!(
    crate::shared::schemas::GenderMatching,
    crate::shared::schemas::SeasonGenderDivision,
    crate::shared::schemas::AttemptKind,
    crate::shared::schemas::AttemptScope
);

impl ColumnValue for crate::shared::schemas::GamedayImportRunStatus {
    fn to_sql(&self) -> SqlValue {
        SqlValue::Text(
            serde_json::to_value(self)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default(),
        )
    }
}
impl ColumnValue for crate::shared::schemas::GamedayImportRunTrigger {
    fn to_sql(&self) -> SqlValue {
        SqlValue::Text(
            serde_json::to_value(self)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default(),
        )
    }
}

/// Converts a JSON field value to its stored SQL form.
pub fn json_to_sql(kind: ColumnKind, value: &Value) -> SqlValue {
    if kind == ColumnKind::Json && !value.is_null() {
        return SqlValue::Text(js::stringify(value));
    }
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                if kind == ColumnKind::Real {
                    SqlValue::Real(i as f64)
                } else {
                    SqlValue::Integer(i)
                }
            } else {
                let f = n.as_f64().unwrap_or(0.0);
                if kind != ColumnKind::Real && js::is_integer(f) && f.abs() < 9.2e18 {
                    SqlValue::Integer(f as i64)
                } else {
                    SqlValue::Real(f)
                }
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => SqlValue::Text(js::stringify(value)),
    }
}

/// Converts a stored SQL value back to the field's JSON value (`None` = missing).
pub fn sql_to_json(kind: ColumnKind, value: SqlValue) -> Option<Value> {
    match value {
        SqlValue::Null => None,
        SqlValue::Integer(i) => Some(match kind {
            ColumnKind::Bool => Value::Bool(i != 0),
            _ => Value::Number(Number::from(i)),
        }),
        SqlValue::Real(f) => Some(js::number(f)),
        SqlValue::Text(text) => Some(match kind {
            ColumnKind::Json => serde_json::from_str(&text)
                .map(|mut v: Value| {
                    js::normalize_numbers(&mut v);
                    v
                })
                .unwrap_or(Value::String(text)),
            _ => Value::String(text),
        }),
        SqlValue::Blob(bytes) => Some(Value::String(String::from_utf8_lossy(&bytes).into_owned())),
    }
}

/// Reads the plain columns of `row` (starting at `offset`) into a JSON object.
pub fn row_to_map(
    row: &rusqlite::Row<'_>,
    columns: &[&'static ColumnDef],
    offset: usize,
) -> rusqlite::Result<Map<String, Value>> {
    let mut map = Map::new();
    for (index, column) in columns.iter().enumerate() {
        let value: SqlValue = row.get(offset + index)?;
        if let Some(json) = sql_to_json(column.kind, value) {
            map.insert(column.field.to_string(), json);
        }
    }
    Ok(map)
}

/// Comma-separated, alias-qualified column list for `SELECT`.
pub fn select_list(alias: &str, columns: &[&'static ColumnDef]) -> String {
    columns
        .iter()
        .map(|c| format!("{alias}.\"{}\"", c.sql))
        .collect::<Vec<_>>()
        .join(", ")
}
