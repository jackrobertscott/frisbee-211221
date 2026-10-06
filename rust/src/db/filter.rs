//! Typed filters and sorts — the SQLite counterpart of the Mongo query
//! documents (`{teamId, pending: false}`, `{$or: [...]}`) and sort objects
//! the TS server passes to its tables.
//!
//! Filters keep Mongo's semantics for missing (`NULL`) fields: `eq`, `in` and
//! comparisons never match a missing field, while `ne` and `not_in` do.

use super::schema::{ChildDef, Col, Collation, ColumnDef, ColumnValue};
use rusqlite::types::Value as SqlValue;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Op {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
}

/// A query filter. Build it from typed columns (`Member::TEAM_ID.eq(id)`) and
/// combine with [`Filter::and`] / [`Filter::or`].
#[derive(Clone, Debug)]
pub enum Filter {
    /// Matches everything (`{}`).
    All,
    And(Vec<Filter>),
    Or(Vec<Filter>),
    Cmp {
        column: &'static ColumnDef,
        op: Op,
        value: SqlValue,
        collation: Option<Collation>,
    },
    In {
        column: &'static ColumnDef,
        values: Vec<SqlValue>,
        negate: bool,
        collation: Option<Collation>,
    },
    Exists {
        column: &'static ColumnDef,
        exists: bool,
    },
    /// `regex.from(needle)`: a case-insensitive substring match.
    ContainsCi {
        column: &'static ColumnDef,
        needle: String,
    },
    /// Some element of a child-table array matches (`{'emails.value': ...}`).
    Any {
        child: &'static ChildDef,
        filter: Box<Filter>,
    },
}

impl Filter {
    pub fn all() -> Filter {
        Filter::All
    }

    pub fn and(filters: impl IntoIterator<Item = Filter>) -> Filter {
        Filter::And(filters.into_iter().collect())
    }

    pub fn or(filters: impl IntoIterator<Item = Filter>) -> Filter {
        Filter::Or(filters.into_iter().collect())
    }

    /// `self AND other`.
    pub fn and_also(self, other: Filter) -> Filter {
        match self {
            Filter::All => other,
            Filter::And(mut list) => {
                list.push(other);
                Filter::And(list)
            }
            first => Filter::And(vec![first, other]),
        }
    }

    /// Equality conditions at the top level (`{id, kind}`), used to seed upserts.
    pub fn equalities(&self) -> Vec<(&'static ColumnDef, SqlValue)> {
        match self {
            Filter::Cmp {
                column,
                op: Op::Eq,
                value,
                collation: None,
            } => vec![(*column, value.clone())],
            Filter::And(list) => list.iter().flat_map(Filter::equalities).collect(),
            _ => Vec::new(),
        }
    }

    /// Renders the filter as SQL against table alias `alias`, pushing bound values.
    pub fn to_sql(
        &self,
        alias: &str,
        parent: Option<(&str, &str)>,
        params: &mut Vec<SqlValue>,
    ) -> String {
        match self {
            Filter::All => "1".into(),
            Filter::And(list) => {
                if list.is_empty() {
                    return "1".into();
                }
                format!(
                    "({})",
                    list.iter()
                        .map(|f| f.to_sql(alias, parent, params))
                        .collect::<Vec<_>>()
                        .join(" AND ")
                )
            }
            Filter::Or(list) => {
                if list.is_empty() {
                    return "0".into();
                }
                format!(
                    "({})",
                    list.iter()
                        .map(|f| f.to_sql(alias, parent, params))
                        .collect::<Vec<_>>()
                        .join(" OR ")
                )
            }
            Filter::Cmp {
                column,
                op,
                value,
                collation,
            } => {
                let col = format!("{alias}.\"{}\"", column.sql);
                let collate = collation
                    .map(|c| format!(" COLLATE {}", c.sql_name()))
                    .unwrap_or_default();
                params.push(value.clone());
                match op {
                    Op::Eq => format!("{col} = ?{collate}"),
                    Op::Ne => format!("({col} IS NULL OR {col} <> ?{collate})"),
                    Op::Gt => format!("{col} > ?{collate}"),
                    Op::Gte => format!("{col} >= ?{collate}"),
                    Op::Lt => format!("{col} < ?{collate}"),
                    Op::Lte => format!("{col} <= ?{collate}"),
                }
            }
            Filter::In {
                column,
                values,
                negate,
                collation,
            } => {
                let col = format!("{alias}.\"{}\"", column.sql);
                let collate = collation
                    .map(|c| format!(" COLLATE {}", c.sql_name()))
                    .unwrap_or_default();
                if values.is_empty() {
                    return if *negate { "1".into() } else { "0".into() };
                }
                let marks = vec!["?"; values.len()].join(", ");
                params.extend(values.iter().cloned());
                if *negate {
                    format!("({col} IS NULL OR {col}{collate} NOT IN ({marks}))")
                } else {
                    format!("{col}{collate} IN ({marks})")
                }
            }
            Filter::Exists { column, exists } => {
                let col = format!("{alias}.\"{}\"", column.sql);
                if *exists {
                    format!("{col} IS NOT NULL")
                } else {
                    format!("{col} IS NULL")
                }
            }
            Filter::ContainsCi { column, needle } => {
                params.push(SqlValue::Text(needle.clone()));
                format!("contains_ci({alias}.\"{}\", ?)", column.sql)
            }
            Filter::Any { child, filter } => {
                let child_alias = format!("{alias}_{}", child.field);
                let inner = filter.to_sql(&child_alias, Some((alias, child.parent_column)), params);
                let _ = parent;
                format!(
                    "EXISTS (SELECT 1 FROM \"{}\" {child_alias} WHERE {child_alias}.\"{}\" = {alias}.\"id\" AND {inner})",
                    child.table, child.parent_column
                )
            }
        }
    }
}

impl<V: ColumnValue> Col<V> {
    fn cmp(self, op: Op, value: V) -> Filter {
        Filter::Cmp {
            column: self.def,
            op,
            value: value.to_sql(),
            collation: None,
        }
    }
    /// `{field: value}`
    pub fn eq(self, value: impl Into<V>) -> Filter {
        self.cmp(Op::Eq, value.into())
    }
    /// `{field: {$ne: value}}` (also matches a missing field)
    pub fn ne(self, value: impl Into<V>) -> Filter {
        self.cmp(Op::Ne, value.into())
    }
    /// `{field: {$gt: value}}`
    pub fn gt(self, value: impl Into<V>) -> Filter {
        self.cmp(Op::Gt, value.into())
    }
    /// `{field: {$gte: value}}`
    pub fn gte(self, value: impl Into<V>) -> Filter {
        self.cmp(Op::Gte, value.into())
    }
    /// `{field: {$lt: value}}`
    pub fn lt(self, value: impl Into<V>) -> Filter {
        self.cmp(Op::Lt, value.into())
    }
    /// `{field: {$lte: value}}`
    pub fn lte(self, value: impl Into<V>) -> Filter {
        self.cmp(Op::Lte, value.into())
    }
    /// `{field: {$in: values}}`
    pub fn is_in<I: Into<V>>(self, values: impl IntoIterator<Item = I>) -> Filter {
        Filter::In {
            column: self.def,
            values: values.into_iter().map(|v| v.into().to_sql()).collect(),
            negate: false,
            collation: None,
        }
    }
    /// `{field: {$nin: values}}` (also matches a missing field)
    pub fn not_in<I: Into<V>>(self, values: impl IntoIterator<Item = I>) -> Filter {
        Filter::In {
            column: self.def,
            values: values.into_iter().map(|v| v.into().to_sql()).collect(),
            negate: true,
            collation: None,
        }
    }
}

impl<V> Col<V> {
    /// `{field: {$exists: true}}`
    pub fn exists(self) -> Filter {
        Filter::Exists {
            column: self.def,
            exists: true,
        }
    }
    /// `{field: {$exists: false}}`
    pub fn missing(self) -> Filter {
        Filter::Exists {
            column: self.def,
            exists: false,
        }
    }
    /// Ascending sort on this column.
    pub fn asc(self) -> SortKey {
        SortKey {
            column: self.def,
            descending: false,
            collation: None,
        }
    }
    /// Descending sort on this column.
    pub fn desc(self) -> SortKey {
        SortKey {
            column: self.def,
            descending: true,
            collation: None,
        }
    }
}

impl Col<String> {
    /// `{field: regex.from(needle)}`: contains `needle`, ignoring case.
    pub fn contains_ci(self, needle: impl Into<String>) -> Filter {
        Filter::ContainsCi {
            column: self.def,
            needle: needle.into(),
        }
    }
    /// Equality under the case-insensitive collation (Mongo strength 2).
    pub fn eq_ci(self, value: impl Into<String>) -> Filter {
        Filter::Cmp {
            column: self.def,
            op: Op::Eq,
            value: SqlValue::Text(value.into()),
            collation: Some(Collation::CaseInsensitive),
        }
    }
    /// `$in` under the case-insensitive collation.
    pub fn in_ci<I: Into<String>>(self, values: impl IntoIterator<Item = I>) -> Filter {
        Filter::In {
            column: self.def,
            values: values
                .into_iter()
                .map(|v| SqlValue::Text(v.into()))
                .collect(),
            negate: false,
            collation: Some(Collation::CaseInsensitive),
        }
    }
}

/// A child-table array column (`User::EMAILS`).
pub struct ChildCol {
    pub child: &'static ChildDef,
}

impl ChildCol {
    pub const fn new(child: &'static ChildDef) -> Self {
        ChildCol { child }
    }
    /// Some element matches `filter` (built from the child's columns).
    pub fn any(&self, filter: Filter) -> Filter {
        Filter::Any {
            child: self.child,
            filter: Box::new(filter),
        }
    }
}

/// One key of a sort. Never sort by, or tie-break on, `id`.
#[derive(Clone, Copy, Debug)]
pub struct SortKey {
    pub column: &'static ColumnDef,
    pub descending: bool,
    pub collation: Option<Collation>,
}

impl SortKey {
    /// Applies a collation (e.g. season names, case-insensitive).
    pub fn collate(mut self, collation: Collation) -> SortKey {
        self.collation = Some(collation);
        self
    }

    pub fn to_sql(&self, alias: &str) -> String {
        let collate = self
            .collation
            .map(|c| format!(" COLLATE {}", c.sql_name()))
            .unwrap_or_default();
        format!(
            "{alias}.\"{}\"{collate} {}",
            self.column.sql,
            if self.descending { "DESC" } else { "ASC" }
        )
    }
}

/// Sorting and paging (`TQueryOptions`). Without a sort, rows come back in
/// insertion order (Mongo's natural order).
#[derive(Clone, Debug, Default)]
pub struct Query {
    pub sort: Vec<SortKey>,
    pub skip: Option<u64>,
    pub limit: Option<u64>,
}

impl Query {
    pub fn new() -> Self {
        Query::default()
    }
    /// Sorts by the given keys, in priority order.
    pub fn sort(mut self, keys: impl IntoIterator<Item = SortKey>) -> Self {
        self.sort = keys.into_iter().collect();
        self
    }
    pub fn skip(mut self, skip: u64) -> Self {
        self.skip = Some(skip);
        self
    }
    pub fn limit(mut self, limit: u64) -> Self {
        self.limit = Some(limit);
        self
    }

    /// `ORDER BY ... LIMIT ... OFFSET ...` for alias `alias`. `id` is never a
    /// sort key; insertion order (`_seq`) is used only when nothing is sorted.
    pub fn to_sql(&self, alias: &str) -> Result<String, String> {
        if let Some(key) = self.sort.iter().find(|key| key.column.field == "id") {
            return Err(format!(
                "Sorting by \"{}\" is not allowed.",
                key.column.field
            ));
        }
        let order = if self.sort.is_empty() {
            format!(" ORDER BY {alias}.\"_seq\" ASC")
        } else {
            format!(
                " ORDER BY {}",
                self.sort
                    .iter()
                    .map(|key| key.to_sql(alias))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        };
        // Mongo treats a limit of 0 as "no limit" and ignores a skip of 0
        let limit = self.limit.filter(|l| *l > 0);
        let skip = self.skip.filter(|s| *s > 0);
        let paging = match (limit, skip) {
            (None, None) => String::new(),
            (Some(limit), None) => format!(" LIMIT {limit}"),
            (None, Some(skip)) => format!(" LIMIT -1 OFFSET {skip}"),
            (Some(limit), Some(skip)) => format!(" LIMIT {limit} OFFSET {skip}"),
        };
        Ok(format!("{order}{paging}"))
    }
}
