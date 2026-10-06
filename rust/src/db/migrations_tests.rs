//! Port of `server/src/db/syncIndexes.test.ts`, plus migration checks.

use super::*;
use crate::db::Db;
use crate::tables::{all_tables, team, user};

fn fresh() -> (tempfile::TempDir, Db) {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(dir.path().join("test.sqlite")).unwrap();
    db.call_blocking(|c| run_schema_migrations(c).map(|_| ()))
        .unwrap();
    (dir, db)
}

fn sync(db: &Db) -> Vec<String> {
    db.call_blocking(|c| {
        let mut lines = Vec::new();
        sync_indexes_into(c, &all_tables(), &mut lines)?;
        Ok(lines)
    })
    .unwrap()
}

fn index_sql(db: &Db, name: &str) -> Option<String> {
    let name = name.to_string();
    db.call_blocking(move |c| {
        Ok(c.query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
            [name],
            |row| row.get(0),
        )
        .ok())
    })
    .unwrap()
}

mod schema_migrations {
    use super::*;

    #[test]
    fn applies_each_migration_once() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("test.sqlite")).unwrap();
        assert_eq!(
            db.call_blocking(run_schema_migrations).unwrap(),
            MIGRATIONS.len()
        );
        assert_eq!(db.call_blocking(run_schema_migrations).unwrap(), 0);
        let version: i64 = db
            .call_blocking(|c| Ok(c.query_row("PRAGMA user_version", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(version, MIGRATIONS.last().map(|m| m.0).unwrap());
    }

    #[test]
    fn creates_a_column_for_every_declared_field() {
        let (_dir, db) = fresh();
        for table in all_tables() {
            let mut expected: Vec<(String, String)> = table
                .plain_columns(true)
                .iter()
                .map(|c| (table.sql.to_string(), c.sql.to_string()))
                .collect();
            for child in table.children() {
                expected.extend(
                    child
                        .columns
                        .iter()
                        .map(|c| (child.table.to_string(), c.sql.to_string())),
                );
                expected.push((child.table.to_string(), child.parent_column.to_string()));
                expected.push((child.table.to_string(), child.position_column.to_string()));
            }
            for (sql_table, column) in expected {
                let query =
                    format!("SELECT COUNT(*) FROM pragma_table_info('{sql_table}') WHERE name = ?");
                let found: i64 = db
                    .call_blocking(|c| Ok(c.query_row(&query, [&column], |r| r.get(0))?))
                    .unwrap();
                assert_eq!(found, 1, "{sql_table}.{column}");
            }
        }
    }

    #[test]
    fn deleting_a_user_deletes_its_email_rows() {
        let (_dir, db) = fresh();
        let remaining: i64 = db
            .call_blocking(|c| {
                c.execute_batch(
                    "INSERT INTO user (id) VALUES ('u1'); INSERT INTO user_email (user_id, position, value) VALUES ('u1', 0, 'a@b.co');
                     DELETE FROM user WHERE id = 'u1';",
                )?;
                Ok(c.query_row("SELECT COUNT(*) FROM user_email", [], |r| r.get(0))?)
            })
            .unwrap();
        assert_eq!(remaining, 0);
    }
}

mod run_startup_index_sync {
    use super::*;

    #[test]
    fn creates_every_declared_index_on_an_empty_database() {
        let (_dir, db) = fresh();
        let lines = sync(&db);
        for table in all_tables() {
            let mut declared = declared_index_names(table);
            declared.sort();
            assert_eq!(
                db.call_blocking(|c| index_names(c, table)).unwrap(),
                declared,
                "{}",
                table.key
            );
        }
        assert_eq!(
            lines.first().map(String::as_str),
            Some("Syncing SQLite indexes...")
        );
        assert_eq!(
            lines.last().map(String::as_str),
            Some("SQLite indexes synced.")
        );
        assert!(lines.contains(&format!(
            "- team | created: {}",
            declared_index_names(&team::TABLE).join(", ")
        )));

        // the collation is applied to the created index
        let email_index = index_sql(&db, "user__emails.value_asc").unwrap();
        assert!(
            email_index.contains("ON \"user_email\" (\"value\" COLLATE ci ASC)"),
            "{email_index}"
        );
        let _ = &user::TABLE;
    }

    #[test]
    fn changes_nothing_when_the_indexes_already_match() {
        let (_dir, db) = fresh();
        sync(&db);
        assert_eq!(
            sync(&db),
            ["Syncing SQLite indexes...", "SQLite indexes synced."]
        );
    }

    #[test]
    fn drops_unknown_indexes_and_recreates_changed_ones() {
        let (_dir, db) = fresh();
        sync(&db);
        db.call_blocking(|c| {
            c.execute_batch(
                r#"CREATE INDEX "team__stray_index" ON "team" ("phone" ASC);
                   DROP INDEX "team__createdOn_asc";
                   CREATE UNIQUE INDEX "team__createdOn_asc" ON "team" ("created_on" ASC);"#,
            )?;
            Ok(())
        })
        .unwrap();

        let lines = sync(&db);

        assert!(
            lines.contains(
                &"- team | dropped: stray_index, createdOn_asc | created: createdOn_asc"
                    .to_string()
            ),
            "{lines:?}"
        );
        let mut declared = declared_index_names(&team::TABLE);
        declared.sort();
        assert_eq!(
            db.call_blocking(|c| index_names(c, &team::TABLE)).unwrap(),
            declared
        );
        let created_on = index_sql(&db, "team__createdOn_asc").unwrap();
        assert!(!created_on.contains("UNIQUE"));
    }

    #[test]
    fn rethrows_errors_instead_of_swallowing_them() {
        // the TS sync rethrows listIndexes failures other than a missing
        // collection; here a failing CREATE INDEX must surface the same way
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("test.sqlite")).unwrap();
        let result = db.call_blocking(|c| {
            let mut lines = Vec::new();
            sync_indexes_into(c, &all_tables(), &mut lines)
        });
        assert!(result.is_err());
    }

    #[test]
    fn treats_a_table_without_indexes_as_having_none() {
        let (_dir, db) = fresh();
        let lines = sync(&db);
        let created: Vec<String> = lines
            .iter()
            .filter_map(|line| {
                line.split_once("created: ")
                    .map(|(_, names)| names.to_string())
            })
            .flat_map(|names| names.split(", ").map(str::to_string).collect::<Vec<_>>())
            .collect();
        let declared: Vec<String> = all_tables()
            .iter()
            .flat_map(|table| declared_index_names(table))
            .collect();
        assert_eq!(created, declared);
    }
}
