//! Port of `server/src/queries/userList.ts`: the admin user list, filtered,
//! sorted and paged in SQL.
//!
//! The Mongo pipeline (`$match`, an `$addFields` primary-email sort key for
//! email sorts, `$sort`, `$skip`, `$limit`) becomes one `SELECT` with the
//! same filter, a computed `ORDER BY` and `LIMIT`/`OFFSET` applied after the
//! sort. Strings compare by code point (BINARY), like Mongo's default
//! (collation-free) sort; missing values sort first ascending and last
//! descending, as in Mongo.

use crate::db::{Filter, TableTx};
use crate::shared::contract::user::UserListSortKey;
use crate::shared::schemas::{User, UserEmail};
use crate::shared::utils::endpoint_def::SortDirection;
use crate::shared::errors::AppResult;
use crate::tables::user::EMAILS;
use rusqlite::types::Value as SqlValue;

/// `USER_LIST_DEFAULT_SORT_BY`.
pub const USER_LIST_DEFAULT_SORT_BY: UserListSortKey = UserListSortKey::CreatedOn;
/// `USER_LIST_DEFAULT_SORT_DIRECTION`.
pub const USER_LIST_DEFAULT_SORT_DIRECTION: SortDirection = SortDirection::Desc;

/// Characters Mongo's `$trim` removes by default (Unicode whitespace). NUL,
/// which Mongo also trims, cannot be passed to SQLite's `trim`; stored emails
/// are validated and trimmed, so it never appears at their edges.
const MONGO_TRIM_CHARS: &str = " \t\n\u{0B}\u{0C}\r\u{A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}";

/// `getUserListQuery(search)`: users whose first name, last name or any email
/// contains `search`, ignoring case (everything for an empty search).
pub fn user_list_filter(search: &str) -> Filter {
    Filter::or([
        User::FIRST_NAME.contains_ci(search),
        User::LAST_NAME.contains_ci(search),
        User::EMAILS.any(UserEmail::VALUE.contains_ci(search)),
    ])
}

/// The email sort key (`_sortPrimaryEmail`): the primary email (or the first
/// email when none is primary, or `''`), trimmed and lowercased. SQLite's
/// `lower` folds ASCII only, like Mongo's `$toLower`. Binds one parameter
/// (the trim characters).
fn primary_email_sort_sql(alias: &str) -> String {
    let value = format!("e.\"{}\"", UserEmail::VALUE.sql());
    let from = format!(
        "FROM \"{table}\" e WHERE e.\"{parent}\" = {alias}.\"{id}\"",
        table = EMAILS.table,
        parent = EMAILS.parent_column,
        id = User::ID.sql(),
    );
    let position = format!("e.\"{}\"", EMAILS.position_column);
    format!(
        "lower(trim(COALESCE((SELECT {value} {from} AND e.\"{primary}\" ORDER BY {position} LIMIT 1), (SELECT {value} {from} ORDER BY {position} LIMIT 1), ''), ?))",
        primary = UserEmail::PRIMARY.sql(),
    )
}

/// `getUserListSort`: `ORDER BY` for a sort key, pushing any bound values.
/// Name tie-breakers are always ascending; `createdOn` has none.
pub fn user_list_order_sql(
    sort_by: UserListSortKey,
    direction: SortDirection,
    alias: &str,
    params: &mut Vec<SqlValue>,
) -> String {
    let key = |sort: crate::db::SortKey| sort.to_sql(alias);
    let dir = |col: crate::db::Col<String>| match direction {
        SortDirection::Asc => col.asc(),
        SortDirection::Desc => col.desc(),
    };
    let keys: Vec<String> = match sort_by {
        UserListSortKey::FirstName => vec![
            key(dir(User::FIRST_NAME)),
            key(User::LAST_NAME.asc()),
        ],
        UserListSortKey::LastName => vec![
            key(dir(User::LAST_NAME)),
            key(User::FIRST_NAME.asc()),
        ],
        UserListSortKey::Email => {
            params.push(SqlValue::Text(MONGO_TRIM_CHARS.to_string()));
            let order = match direction {
                SortDirection::Asc => "ASC",
                SortDirection::Desc => "DESC",
            };
            vec![
                format!("{} {order}", primary_email_sort_sql(alias)),
                key(User::LAST_NAME.asc()),
                key(User::FIRST_NAME.asc()),
            ]
        }
        UserListSortKey::GenderMatching => {
            let col = match direction {
                SortDirection::Asc => User::GENDER_MATCHING.asc(),
                SortDirection::Desc => User::GENDER_MATCHING.desc(),
            };
            vec![
                key(col),
                key(User::LAST_NAME.asc()),
                key(User::FIRST_NAME.asc()),
            ]
        }
        UserListSortKey::CreatedOn => vec![key(dir(User::CREATED_ON))],
    };
    format!("ORDER BY {}", keys.join(", "))
}

/// `LIMIT`/`OFFSET` after the sort: a skip of 0 is omitted, as is a missing
/// limit (the contract only allows limits of at least 1).
pub fn user_list_paging_sql(skip: Option<u64>, limit: Option<u64>) -> String {
    match (limit, skip.filter(|skip| *skip > 0)) {
        (None, None) => String::new(),
        (Some(limit), None) => format!(" LIMIT {limit}"),
        (None, Some(skip)) => format!(" LIMIT -1 OFFSET {skip}"),
        (Some(limit), Some(skip)) => format!(" LIMIT {limit} OFFSET {skip}"),
    }
}

/// `getUserListPipeline`: the SQL tail (`WHERE ... ORDER BY ... LIMIT ...`)
/// for [`TableTx::select_where`] and its bound values.
pub fn user_list_sql(
    filter: &Filter,
    sort_by: UserListSortKey,
    direction: SortDirection,
    skip: Option<u64>,
    limit: Option<u64>,
) -> (String, Vec<SqlValue>) {
    let mut params = Vec::new();
    let where_sql = filter.to_sql("t", &mut params);
    let order = user_list_order_sql(sort_by, direction, "t", &mut params);
    let paging = user_list_paging_sql(skip, limit);
    (format!("WHERE {where_sql} {order}{paging}"), params)
}

/// The UserList result before field selection: the total number of matches
/// and the requested page.
pub struct UserListPage {
    pub count: i64,
    pub users: Vec<User>,
}

/// Runs the user list query on one connection.
pub fn user_list(
    users: TableTx<'_, User>,
    search: &str,
    sort_by: UserListSortKey,
    direction: SortDirection,
    skip: Option<u64>,
    limit: Option<u64>,
) -> AppResult<UserListPage> {
    let filter = user_list_filter(search);
    let count = users.count(&filter)?;
    let (tail, params) = user_list_sql(&filter, sort_by, direction, skip, limit);
    let users = users.select_where(&tail, &params)?;
    Ok(UserListPage { count, users })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schemas::GenderMatching;
    use crate::tables::USER;
    use crate::testing::TestApp;
    use serde_json::json;

    async fn create(app: &TestApp, first: &str, last: &str, emails: &[(&str, bool)]) -> User {
        let emails: Vec<_> = emails
            .iter()
            .map(|(value, primary)| {
                json!({"value": value, "verified": false, "code": "c", "createdOn": "2026-01-01T00:00:00.000Z", "primary": primary})
            })
            .collect();
        USER.create_one(
            app.db(),
            json!({
                "firstName": first,
                "lastName": last,
                "genderMatching": GenderMatching::Female,
                "termsAccepted": true,
                "emails": emails,
            }),
        )
        .await
        .unwrap()
    }

    async fn run(
        app: &TestApp,
        search: &str,
        sort_by: UserListSortKey,
        direction: SortDirection,
        skip: Option<u64>,
        limit: Option<u64>,
    ) -> (i64, Vec<String>) {
        let search = search.to_string();
        let page = app
            .db()
            .call(move |c| user_list(USER.tx(c), &search, sort_by, direction, skip, limit))
            .await
            .unwrap();
        (
            page.count,
            page.users.into_iter().map(|u| u.first_name).collect(),
        )
    }

    mod get_user_list_query {
        use super::*;

        #[tokio::test]
        async fn matches_the_search_case_insensitively_on_names_and_emails() {
            let Filter::Or(list) = user_list_filter("a.b") else {
                panic!("expected an $or filter");
            };
            assert_eq!(list.len(), 3);
            assert!(matches!(
                &list[0],
                Filter::ContainsCi { column, needle } if column.field == "firstName" && needle == "a.b"
            ));
            let app = TestApp::new(vec![]);
            create(&app, "xA.By", "L", &[("one@x.com", true)]).await;
            create(&app, "aXb", "L", &[("two@x.com", true)]).await;
            create(&app, "F", "L", &[("p@x.com", true), ("a.b@x.com", false)]).await;
            let (count, names) =
                run(&app, "a.b", UserListSortKey::CreatedOn, SortDirection::Asc, None, None).await;
            assert_eq!(count, 2);
            assert_eq!(names, ["xA.By", "F"]);
        }

        #[tokio::test]
        async fn matches_everything_for_an_empty_search() {
            let app = TestApp::new(vec![]);
            create(&app, "anything", "L", &[]).await;
            create(&app, "else", "L", &[("e@x.com", true)]).await;
            let (count, _) =
                run(&app, "", UserListSortKey::CreatedOn, SortDirection::Asc, None, None).await;
            assert_eq!(count, 2);
        }
    }

    mod get_user_list_pipeline {
        use super::*;

        #[test]
        fn sorts_before_skipping_and_limiting() {
            let (sql, params) = user_list_sql(
                &Filter::all(),
                UserListSortKey::CreatedOn,
                SortDirection::Desc,
                Some(10),
                Some(5),
            );
            assert_eq!(
                sql,
                "WHERE 1 ORDER BY t.\"created_on\" DESC LIMIT 5 OFFSET 10"
            );
            assert!(params.is_empty());
        }

        #[test]
        fn omits_a_zero_skip_and_a_missing_limit() {
            let (sql, _) = user_list_sql(
                &Filter::all(),
                UserListSortKey::FirstName,
                SortDirection::Asc,
                Some(0),
                None,
            );
            assert_eq!(
                sql,
                "WHERE 1 ORDER BY t.\"first_name\" ASC, t.\"last_name\" ASC"
            );
        }

        #[test]
        fn breaks_name_ties_on_the_other_name() {
            let order = |sort_by, direction| {
                user_list_order_sql(sort_by, direction, "t", &mut Vec::new())
            };
            assert_eq!(
                order(UserListSortKey::LastName, SortDirection::Desc),
                "ORDER BY t.\"last_name\" DESC, t.\"first_name\" ASC"
            );
            assert_eq!(
                order(UserListSortKey::GenderMatching, SortDirection::Asc),
                "ORDER BY t.\"gender_matching\" ASC, t.\"last_name\" ASC, t.\"first_name\" ASC"
            );
        }

        #[tokio::test]
        async fn adds_the_primary_email_sort_key_and_returns_plain_users() {
            let (sql, params) = user_list_sql(
                &Filter::all(),
                UserListSortKey::Email,
                SortDirection::Asc,
                Some(0),
                Some(20),
            );
            assert!(sql.starts_with("WHERE 1 ORDER BY lower(trim(COALESCE("));
            assert!(sql.ends_with(
                " ASC, t.\"last_name\" ASC, t.\"first_name\" ASC LIMIT 20"
            ));
            assert_eq!(params.len(), 1);

            // primary email first, else the first email, else '' (sorts first);
            // trimmed and lowercased
            let app = TestApp::new(vec![]);
            create(&app, "C", "L", &[("aaa@x.com", false), ("Zed@x.com", true)]).await;
            create(&app, "B", "L", &[("Mid@x.com", false), ("aaa2@x.com", false)]).await;
            create(&app, "A", "L", &[]).await;
            create(&app, "D", "L", &[("BETA@x.com", true)]).await;
            let (_, names) =
                run(&app, "", UserListSortKey::Email, SortDirection::Asc, Some(0), Some(20)).await;
            assert_eq!(names, ["A", "D", "B", "C"]);
            let (_, names) =
                run(&app, "", UserListSortKey::Email, SortDirection::Desc, Some(1), Some(2)).await;
            assert_eq!(names, ["B", "D"]);
        }
    }
}
