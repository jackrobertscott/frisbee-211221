//! The SQLite database layer (replaces `server/src/db/mongo.ts`).
//!
//! [`Db`] is a cheap, cloneable handle on a connection pool. Work runs on a
//! blocking thread with a pooled connection:
//!
//! - [`Db::call`] runs a closure on one connection (autocommit statements);
//! - [`Db::transaction`] runs it inside `BEGIN IMMEDIATE ... COMMIT`, rolling
//!   back when the closure returns an error (replaces `mongo.transaction`).
//!
//! Every connection gets WAL mode, a busy timeout, and the custom collations
//! (`ci`, `season_name`) and functions (`contains_ci`) the queries rely on.

pub mod audit;
pub mod filter;
pub mod migrations;
pub mod schema;
pub mod table;

use crate::shared::errors::{AppError, AppResult};
use crate::shared::utils::season_name::{SEASON_NAME_SQL_COLLATION, compare_season_names};
use r2d2::{Pool, PooledConnection};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::functions::FunctionFlags;
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

pub use filter::{ChildCol, Filter, Query, SortKey};
pub use schema::{Col, Collation};
pub use table::{AtomicUpdate, Patch, Record, ReturnDocument, Table, TableTx};

const BUSY_TIMEOUT: Duration = Duration::from_secs(10);
const POOL_SIZE: u32 = 8;

/// A handle on the SQLite database.
#[derive(Clone)]
pub struct Db {
    pool: Pool<SqliteConnectionManager>,
    path: PathBuf,
}

impl std::fmt::Debug for Db {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Db({})", self.path.display())
    }
}

/// Registers pragmas, collations and functions on a new connection.
pub fn init_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    register_collations(conn)?;
    conn.create_scalar_function(
        "contains_ci",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let haystack: Option<String> = ctx.get(0)?;
            let needle: Option<String> = ctx.get(1)?;
            Ok(match (haystack, needle) {
                (Some(h), Some(n)) => crate::shared::utils::regex::contains_ci(&h, &n),
                _ => false,
            })
        },
    )?;
    Ok(())
}

fn register_collations(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_collation("ci", |a, b| a.to_lowercase().cmp(&b.to_lowercase()))?;
    conn.create_collation(SEASON_NAME_SQL_COLLATION, compare_season_names)?;
    Ok(())
}

impl Db {
    /// Opens (creating if needed) the database at `path` and its parent directories.
    pub fn open(path: impl AsRef<Path>) -> AppResult<Db> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent)?;
        }
        let manager = SqliteConnectionManager::file(&path).with_init(|c| init_connection(c));
        let pool = Pool::builder()
            .max_size(POOL_SIZE)
            .connection_timeout(Duration::from_secs(30))
            .build(manager)
            .map_err(AppError::internal_from)?;
        Ok(Db { pool, path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn connection(&self) -> AppResult<PooledConnection<SqliteConnectionManager>> {
        self.pool.get().map_err(AppError::internal_from)
    }

    /// Runs `work` on a pooled connection, on a blocking thread.
    pub async fn call<R, F>(&self, work: F) -> AppResult<R>
    where
        F: FnOnce(&Connection) -> AppResult<R> + Send + 'static,
        R: Send + 'static,
    {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.call_blocking(work))
            .await
            .map_err(AppError::internal_from)?
    }

    /// Runs `work` inside a transaction; any error rolls every write back.
    pub async fn transaction<R, F>(&self, work: F) -> AppResult<R>
    where
        F: FnOnce(&Connection) -> AppResult<R> + Send + 'static,
        R: Send + 'static,
    {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.transaction_blocking(work))
            .await
            .map_err(AppError::internal_from)?
    }

    /// Writes a consistent copy of the database to `path` with `VACUUM INTO`,
    /// which works while the server is writing, then checks the copy is sound.
    pub async fn snapshot_to(&self, path: PathBuf) -> AppResult<()> {
        let target = path.to_string_lossy().into_owned();
        self.call(move |conn| {
            conn.execute("VACUUM INTO ?1", [target])?;
            Ok(())
        })
        .await?;
        tokio::task::spawn_blocking(move || check_integrity(&path))
            .await
            .map_err(AppError::internal_from)?
    }

    /// [`Db::call`] for synchronous contexts (startup, tests, CLIs).
    pub fn call_blocking<R>(&self, work: impl FnOnce(&Connection) -> AppResult<R>) -> AppResult<R> {
        let conn = self.connection()?;
        work(&conn)
    }

    /// [`Db::transaction`] for synchronous contexts.
    pub fn transaction_blocking<R>(
        &self,
        work: impl FnOnce(&Connection) -> AppResult<R>,
    ) -> AppResult<R> {
        let mut conn = self.connection()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let result = work(&tx)?;
        tx.commit()?;
        Ok(result)
    }
}

/// Fails unless `PRAGMA integrity_check` passes on the database at `path`.
pub fn check_integrity(path: &Path) -> AppResult<()> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    register_collations(&conn)?;
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result != "ok" {
        return Err(AppError::internal_from(format!(
            "Integrity check failed: {result}"
        )));
    }
    Ok(())
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// Swaps in a backup left at `<database>.restore`, keeping the current database
/// as `<database>.before-restore`. Call before opening the database: the swap is
/// only safe with no connections open. Returns whether it restored. A backup
/// that fails its integrity check is left in place, with the database untouched.
pub fn apply_pending_restore(path: &Path) -> AppResult<bool> {
    let restore = with_suffix(path, ".restore");
    if !restore.exists() {
        return Ok(false);
    }
    check_integrity(&restore)?;
    let before = with_suffix(path, ".before-restore");
    // when the database is already gone, an interrupted swap moved it to `before`
    if path.exists() {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(with_suffix(&before, suffix));
        }
        std::fs::rename(path, &before)?;
    }
    let wal = with_suffix(path, "-wal");
    if wal.exists() {
        std::fs::rename(&wal, with_suffix(&before, "-wal"))?;
    }
    let _ = std::fs::remove_file(with_suffix(path, "-shm"));
    std::fs::rename(&restore, path)?;
    Ok(true)
}

static SAVEPOINT_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Runs `work` atomically on `conn` whether or not a transaction is already
/// open (a nested `SAVEPOINT`), rolling back its writes on error.
pub fn savepoint<R>(
    conn: &Connection,
    work: impl FnOnce(&Connection) -> AppResult<R>,
) -> AppResult<R> {
    let name = format!("sp_{}", SAVEPOINT_COUNTER.fetch_add(1, Ordering::Relaxed));
    conn.execute_batch(&format!("SAVEPOINT {name}"))?;
    match work(conn) {
        Ok(result) => {
            conn.execute_batch(&format!("RELEASE {name}"))?;
            Ok(result)
        }
        Err(error) => {
            let _ = conn.execute_batch(&format!("ROLLBACK TO {name}; RELEASE {name}"));
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::errors::{ErrorOptions, bad_request_error};

    fn temp_db() -> (tempfile::TempDir, Db) {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("nested/dir/test.sqlite")).unwrap();
        db.call_blocking(|c| Ok(c.execute_batch("CREATE TABLE item (name TEXT)")?))
            .unwrap();
        (dir, db)
    }

    fn count(db: &Db) -> i64 {
        db.call_blocking(|c| Ok(c.query_row("SELECT COUNT(*) FROM item", [], |r| r.get(0))?))
            .unwrap()
    }

    // mongo.test.ts: connection caching and transaction detection are Mongo
    // driver details; the transaction behaviour is ported below.

    #[tokio::test]
    async fn runs_work_in_a_transaction_and_commits_it() {
        let (_dir, db) = temp_db();
        db.transaction(|c| {
            c.execute("INSERT INTO item (name) VALUES ('Committed')", [])?;
            // reads in the same transaction see the uncommitted write
            let seen: i64 = c.query_row(
                "SELECT COUNT(*) FROM item WHERE name = 'Committed'",
                [],
                |r| r.get(0),
            )?;
            assert_eq!(seen, 1);
            Ok(())
        })
        .await
        .unwrap();
        assert_eq!(count(&db), 1);
    }

    #[tokio::test]
    async fn rolls_back_every_write_when_the_work_fails() {
        let (_dir, db) = temp_db();
        let result: AppResult<()> = db
            .transaction(|c| {
                c.execute("INSERT INTO item (name) VALUES ('Rolled back 1')", [])?;
                c.execute("INSERT INTO item (name) VALUES ('Rolled back 2')", [])?;
                Err(bad_request_error("stop", ErrorOptions::default()))
            })
            .await;
        assert_eq!(result.unwrap_err().message, "stop");
        assert_eq!(count(&db), 0);
    }

    #[test]
    fn savepoints_nest_inside_transactions() {
        let (_dir, db) = temp_db();
        db.transaction_blocking(|c| {
            c.execute("INSERT INTO item (name) VALUES ('outer')", [])?;
            let inner: AppResult<()> = savepoint(c, |c| {
                c.execute("INSERT INTO item (name) VALUES ('inner')", [])?;
                Err(bad_request_error("inner failed", ErrorOptions::default()))
            });
            assert!(inner.is_err());
            Ok(())
        })
        .unwrap();
        assert_eq!(count(&db), 1);
    }

    #[test]
    fn registers_collations_and_functions() {
        let (_dir, db) = temp_db();
        let (ci, season, contains): (i64, i64, i64) = db
            .call_blocking(|c| {
                Ok(c.query_row(
                    "SELECT 'A@x.com' = 'a@X.com' COLLATE ci, 'Season 10' > 'Season 2' COLLATE season_name, contains_ci('Hello', 'ELL')",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )?)
            })
            .unwrap();
        assert_eq!((ci, season, contains), (1, 1, 1));
    }

    #[tokio::test]
    async fn snapshots_a_sound_copy_and_rejects_a_corrupt_one() {
        let (dir, db) = temp_db();
        let copy = dir.path().join("copy.sqlite");
        db.call_blocking(|c| Ok(c.execute("INSERT INTO item (name) VALUES ('a')", [])?))
            .unwrap();
        db.snapshot_to(copy.clone()).await.unwrap();
        let rows: i64 = Connection::open(&copy)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM item", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rows, 1);

        let garbage = dir.path().join("garbage.sqlite");
        std::fs::write(&garbage, vec![7u8; 8192]).unwrap();
        assert!(check_integrity(&garbage).is_err());
    }

    fn item_count(path: &Path) -> i64 {
        Connection::open(path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM item", [], |row| row.get(0))
            .unwrap()
    }

    fn database_with_items(path: &Path, items: usize) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch("CREATE TABLE item (name TEXT)").unwrap();
        for _ in 0..items {
            conn.execute("INSERT INTO item (name) VALUES ('a')", [])
                .unwrap();
        }
    }

    #[test]
    fn restoring_does_nothing_without_a_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        database_with_items(&path, 1);
        assert!(!apply_pending_restore(&path).unwrap());
        assert_eq!(item_count(&path), 1);
    }

    #[test]
    fn restoring_swaps_in_the_backup_and_keeps_the_old_database_with_its_wal() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        let restore = dir.path().join("test.sqlite.restore");
        database_with_items(&restore, 2);
        // left open so its writes stay in the WAL, as after a hard stop
        let current = Connection::open(&path).unwrap();
        current.pragma_update(None, "journal_mode", "WAL").unwrap();
        current
            .pragma_update(None, "wal_autocheckpoint", 0)
            .unwrap();
        current
            .execute_batch("CREATE TABLE item (name TEXT); INSERT INTO item VALUES ('old')")
            .unwrap();
        assert!(dir.path().join("test.sqlite-wal").exists());

        assert!(apply_pending_restore(&path).unwrap());
        drop(current);

        assert_eq!(item_count(&path), 2);
        assert!(!restore.exists());
        assert_eq!(
            item_count(&dir.path().join("test.sqlite.before-restore")),
            1
        );
        assert!(!apply_pending_restore(&path).unwrap());
    }

    #[test]
    fn restoring_leaves_the_database_alone_when_the_backup_is_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        let restore = dir.path().join("test.sqlite.restore");
        database_with_items(&path, 1);
        std::fs::write(&restore, vec![7u8; 8192]).unwrap();

        assert!(apply_pending_restore(&path).is_err());
        assert_eq!(item_count(&path), 1);
        assert!(restore.exists());
    }

    #[test]
    fn restoring_finishes_after_being_interrupted_without_losing_the_old_database() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        let before = dir.path().join("test.sqlite.before-restore");
        database_with_items(&before, 1);
        database_with_items(&dir.path().join("test.sqlite.restore"), 2);

        assert!(apply_pending_restore(&path).unwrap());
        assert_eq!(item_count(&path), 2);
        assert_eq!(item_count(&before), 1);
    }
}
