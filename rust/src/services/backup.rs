//! Daily database backups to an S3-compatible bucket. Each object is
//! `backups/<UTC time>-<SHA-256 of the database>.sqlite.gz`, so a listing shows
//! both when the newest backup was taken and what it contains.

use crate::config::{BackupConfig, Config};
use crate::db::Db;
use crate::log;
use crate::shared::errors::{AppError, AppResult};
use crate::utils::s3::S3Client;
use chrono::{DateTime, NaiveDateTime, TimeDelta, Utc};
use flate2::Compression;
use flate2::write::GzEncoder;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::future::Future;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

const PREFIX: &str = "backups/";
const KEY_TIME: &str = "%Y%m%dT%H%M%SZ";
const KEEP: usize = 14;
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(60);
const CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

fn backup_interval() -> TimeDelta {
    TimeDelta::days(1)
}

pub type StoreFuture<'a, T> = Pin<Box<dyn Future<Output = AppResult<T>> + Send + 'a>>;

/// Where backups go. A trait so tests can keep them in memory.
pub trait BackupStore: Send + Sync {
    fn list<'a>(&'a self, prefix: &'a str) -> StoreFuture<'a, Vec<String>>;
    fn put_file<'a>(&'a self, key: &'a str, file: &'a Path, sha256: &'a str)
    -> StoreFuture<'a, ()>;
    fn delete<'a>(&'a self, key: &'a str) -> StoreFuture<'a, ()>;
}

impl BackupStore for S3Client {
    fn list<'a>(&'a self, prefix: &'a str) -> StoreFuture<'a, Vec<String>> {
        Box::pin(S3Client::list(self, prefix))
    }
    fn put_file<'a>(
        &'a self,
        key: &'a str,
        file: &'a Path,
        sha256: &'a str,
    ) -> StoreFuture<'a, ()> {
        Box::pin(S3Client::put_file(self, key, file, sha256))
    }
    fn delete<'a>(&'a self, key: &'a str) -> StoreFuture<'a, ()> {
        Box::pin(S3Client::delete(self, key))
    }
}

pub type Clock = Box<dyn Fn() -> DateTime<Utc> + Send + Sync>;

pub struct Backup {
    store: Arc<dyn BackupStore>,
    db: Db,
    prefix: String,
    /// Holds the temporary files; the database's own folder, so they are on
    /// the same volume.
    temp_dir: PathBuf,
    now: Clock,
    /// Until then the bucket isn't contacted: the server sleeps when idle, and
    /// hourly requests would be outbound traffic for nothing.
    next_check_at: Option<DateTime<Utc>>,
}

impl Backup {
    pub fn new(store: Arc<dyn BackupStore>, db: Db, dir: &Path, now: Clock) -> Self {
        Backup::with_prefix(store, db, dir, now, PREFIX)
    }

    pub fn with_prefix(
        store: Arc<dyn BackupStore>,
        db: Db,
        dir: &Path,
        now: Clock,
        prefix: &str,
    ) -> Self {
        Backup {
            store,
            db,
            prefix: prefix.to_string(),
            temp_dir: dir.join("backup-tmp"),
            now,
            next_check_at: None,
        }
    }

    /// Takes a backup when the newest is a day old and the database has changed
    /// since, then deletes all but the newest [`KEEP`]. Returns the uploaded
    /// key, if any.
    pub async fn run_if_due(&mut self) -> AppResult<Option<String>> {
        let now = (self.now)();
        if self.next_check_at.is_some_and(|at| now < at) {
            return Ok(None);
        }
        let mut keys: Vec<String> = self
            .store
            .list(&self.prefix)
            .await?
            .into_iter()
            .filter(|key| self.parse_key(key).is_some())
            .collect();
        keys.sort();
        let newest = keys.last().and_then(|key| self.parse_key(key));
        if let Some((at, _)) = &newest
            && now - *at < backup_interval()
        {
            self.next_check_at = Some(*at + backup_interval());
            return Ok(None);
        }

        let temp_dir = self.temp_dir.clone();
        // a crash can leave these behind
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir)?;
        let result = self
            .upload_if_changed(now, newest.map(|(_, hash)| hash))
            .await;
        let _ = std::fs::remove_dir_all(&temp_dir);
        let uploaded = result?;
        self.next_check_at = Some(now + backup_interval());
        let Some(key) = uploaded else {
            return Ok(None);
        };

        keys.push(key.clone());
        for old in &keys[..keys.len().saturating_sub(KEEP)] {
            self.store.delete(old).await?;
        }
        Ok(Some(key))
    }

    async fn upload_if_changed(
        &self,
        now: DateTime<Utc>,
        newest_hash: Option<String>,
    ) -> AppResult<Option<String>> {
        let snapshot = self.temp_dir.join("backup.sqlite");
        let zipped = self.temp_dir.join("backup.sqlite.gz");
        self.db.snapshot_to(snapshot.clone()).await?;
        let zipped_for_task = zipped.clone();
        let hashes = tokio::task::spawn_blocking(move || -> AppResult<Option<(String, String)>> {
            let hash = sha256_file(&snapshot)?;
            if newest_hash.as_deref() == Some(hash.as_str()) {
                return Ok(None);
            }
            gzip_file(&snapshot, &zipped_for_task)?;
            Ok(Some((hash, sha256_file(&zipped_for_task)?)))
        })
        .await
        .map_err(AppError::internal_from)??;
        let Some((hash, zipped_hash)) = hashes else {
            return Ok(None);
        };
        let key = format!("{}{}-{hash}.sqlite.gz", self.prefix, now.format(KEY_TIME));
        self.store.put_file(&key, &zipped, &zipped_hash).await?;
        Ok(Some(key))
    }

    /// The time and database hash in a backup's key; other objects are `None`
    /// and are left alone.
    fn parse_key(&self, key: &str) -> Option<(DateTime<Utc>, String)> {
        let name = key.strip_prefix(&self.prefix)?.strip_suffix(".sqlite.gz")?;
        let (stamp, hash) = name.split_once('-')?;
        let at = NaiveDateTime::parse_from_str(stamp, KEY_TIME).ok()?;
        Some((at.and_utc(), hash.to_string()))
    }
}

fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            return Ok(hex::encode(hasher.finalize()));
        }
        hasher.update(&buffer[..read]);
    }
}

fn gzip_file(from: &Path, to: &Path) -> AppResult<()> {
    let mut encoder = GzEncoder::new(File::create(to)?, Compression::default());
    std::io::copy(&mut File::open(from)?, &mut encoder)?;
    encoder.finish()?;
    Ok(())
}

/// Checks a minute after starting and then hourly. The server sleeps when
/// idle, so a fixed daily time could be missed; checking whether a backup is
/// due catches up on wake, and nothing changes while it sleeps.
pub fn start_backups(config: &Config, db: &Db) {
    let Some(backup_config) = &config.backup else {
        return;
    };
    let dir = match config.sqlite_path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let mut backup = match new_s3_backup(backup_config, db, &dir) {
        Ok(backup) => backup,
        Err(error) => {
            log::error(format!("Backups are off. {}", error.message));
            return;
        }
    };
    log::log("Starting database backups...");
    tokio::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_DELAY).await;
        loop {
            match backup.run_if_due().await {
                Ok(Some(key)) => log::log(format!("Backup uploaded {key}")),
                Ok(None) => {}
                Err(error) => log::error(format!("Backup failed. {}", error.message)),
            }
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

fn new_s3_backup(config: &BackupConfig, db: &Db, dir: &Path) -> AppResult<Backup> {
    Ok(Backup::new(
        Arc::new(S3Client::new(config)?),
        db.clone(),
        dir,
        Box::new(Utc::now),
    ))
}

#[cfg(test)]
#[path = "backup_tests.rs"]
mod tests;
