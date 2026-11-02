use super::*;
use flate2::read::GzDecoder;
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

#[derive(Default)]
struct MemoryStore {
    objects: Mutex<BTreeMap<String, Vec<u8>>>,
    lists: AtomicUsize,
    fail_put: AtomicBool,
}

impl MemoryStore {
    fn keys(&self) -> Vec<String> {
        self.objects.lock().unwrap().keys().cloned().collect()
    }
    fn add(&self, key: &str) {
        self.objects.lock().unwrap().insert(key.into(), Vec::new());
    }
}

impl BackupStore for MemoryStore {
    fn list<'a>(&'a self, prefix: &'a str) -> StoreFuture<'a, Vec<String>> {
        Box::pin(async move {
            self.lists.fetch_add(1, Ordering::SeqCst);
            Ok(self
                .keys()
                .into_iter()
                .filter(|key| key.starts_with(prefix))
                .collect())
        })
    }
    fn put_file<'a>(
        &'a self,
        key: &'a str,
        file: &'a Path,
        sha256: &'a str,
    ) -> StoreFuture<'a, ()> {
        Box::pin(async move {
            if self.fail_put.load(Ordering::SeqCst) {
                return Err(AppError::internal_from("upload refused"));
            }
            assert_eq!(sha256_file(file)?, sha256);
            let bytes = std::fs::read(file)?;
            self.objects.lock().unwrap().insert(key.into(), bytes);
            Ok(())
        })
    }
    fn delete<'a>(&'a self, key: &'a str) -> StoreFuture<'a, ()> {
        Box::pin(async move {
            self.objects.lock().unwrap().remove(key);
            Ok(())
        })
    }
}

struct Setup {
    dir: tempfile::TempDir,
    db: Db,
    store: Arc<MemoryStore>,
    now: Arc<Mutex<DateTime<Utc>>>,
    backup: Backup,
}

impl Setup {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(dir.path().join("test.sqlite")).unwrap();
        db.call_blocking(|c| Ok(c.execute_batch("CREATE TABLE item (name TEXT)")?))
            .unwrap();
        let store = Arc::new(MemoryStore::default());
        let now = Arc::new(Mutex::new(
            DateTime::parse_from_rfc3339("2026-11-02T03:00:00Z")
                .unwrap()
                .to_utc(),
        ));
        let clock = now.clone();
        let backup = Backup::new(
            store.clone(),
            db.clone(),
            dir.path(),
            Box::new(move || *clock.lock().unwrap()),
        );
        Setup {
            dir,
            db,
            store,
            now,
            backup,
        }
    }

    fn write(&self, name: &str) {
        let name = name.to_string();
        self.db
            .call_blocking(|c| Ok(c.execute("INSERT INTO item (name) VALUES (?1)", [name])?))
            .unwrap();
    }

    fn advance(&self, hours: i64) {
        *self.now.lock().unwrap() += TimeDelta::hours(hours);
    }
}

fn item_count(path: &Path) -> i64 {
    rusqlite::Connection::open(path)
        .unwrap()
        .query_row("SELECT COUNT(*) FROM item", [], |row| row.get(0))
        .unwrap()
}

#[tokio::test]
async fn uploads_a_restorable_copy_named_by_time_and_hash() {
    let mut s = Setup::new();
    s.write("a");
    let key = s.backup.run_if_due().await.unwrap().unwrap();
    assert!(key.starts_with("backups/20261102T030000Z-"));
    assert!(key.ends_with(".sqlite.gz"));

    let bytes = s.store.objects.lock().unwrap()[&key].clone();
    let mut restored = Vec::new();
    GzDecoder::new(&bytes[..])
        .read_to_end(&mut restored)
        .unwrap();
    let path = s.dir.path().join("restored.sqlite");
    std::fs::write(&path, &restored).unwrap();
    assert_eq!(item_count(&path), 1);
    let hash = crate::utils::sigv4::sha256_hex(&restored);
    assert!(key.contains(&hash));
    assert!(!s.dir.path().join("backup-tmp").exists());
}

#[tokio::test]
async fn waits_a_day_without_contacting_the_bucket() {
    let mut s = Setup::new();
    s.write("a");
    s.backup.run_if_due().await.unwrap().unwrap();
    let lists = s.store.lists.load(Ordering::SeqCst);

    s.advance(23);
    s.write("b");
    assert_eq!(s.backup.run_if_due().await.unwrap(), None);
    assert_eq!(s.store.lists.load(Ordering::SeqCst), lists);

    s.advance(1);
    assert!(s.backup.run_if_due().await.unwrap().is_some());
    assert_eq!(s.store.keys().len(), 2);
}

#[tokio::test]
async fn a_restart_does_not_back_up_again_within_the_day() {
    let mut s = Setup::new();
    s.store.add("backups/20261102T020000Z-abc.sqlite.gz");
    assert_eq!(s.backup.run_if_due().await.unwrap(), None);
    assert_eq!(s.store.keys().len(), 1);
}

#[tokio::test]
async fn skips_the_upload_when_nothing_changed() {
    let mut s = Setup::new();
    s.write("a");
    s.backup.run_if_due().await.unwrap().unwrap();
    s.advance(24);
    assert_eq!(s.backup.run_if_due().await.unwrap(), None);
    assert_eq!(s.store.keys().len(), 1);
}

#[tokio::test]
async fn keeps_the_newest_fourteen_and_leaves_other_objects_alone() {
    let mut s = Setup::new();
    for day in 1..=14 {
        s.store.add(&format!(
            "backups/202610{day:02}T000000Z-old{day}.sqlite.gz"
        ));
    }
    s.store.add("backups/notes.txt");
    s.store.add("other/20261001T000000Z-x.sqlite.gz");
    s.write("a");
    let key = s.backup.run_if_due().await.unwrap().unwrap();

    let keys = s.store.keys();
    assert!(!keys.contains(&"backups/20261001T000000Z-old1.sqlite.gz".to_string()));
    assert!(keys.contains(&"backups/20261002T000000Z-old2.sqlite.gz".to_string()));
    assert!(keys.contains(&key));
    assert!(keys.contains(&"backups/notes.txt".to_string()));
    assert!(keys.contains(&"other/20261001T000000Z-x.sqlite.gz".to_string()));
    assert_eq!(keys.len(), 14 + 2);
}

#[tokio::test]
async fn a_failed_upload_cleans_up_and_retries_at_the_next_check() {
    let mut s = Setup::new();
    s.write("a");
    s.store.fail_put.store(true, Ordering::SeqCst);
    let error = s.backup.run_if_due().await.unwrap_err();
    assert_eq!(error.message, "upload refused");
    assert!(!s.dir.path().join("backup-tmp").exists());

    s.store.fail_put.store(false, Ordering::SeqCst);
    assert!(s.backup.run_if_due().await.unwrap().is_some());
}

/// Against a real bucket, under a separate prefix so real backups are never
/// touched: set the `BACKUP_*` variables and run with `--ignored`.
#[tokio::test]
#[ignore]
async fn round_trips_through_a_real_bucket() {
    let var = |key: &str| std::env::var(key).unwrap();
    let client = Arc::new(
        S3Client::new(&BackupConfig {
            bucket: var("BACKUP_BUCKET"),
            endpoint: var("BACKUP_ENDPOINT"),
            region: var("BACKUP_REGION"),
            access_key_id: var("BACKUP_ACCESS_KEY_ID"),
            secret_access_key: var("BACKUP_SECRET_ACCESS_KEY"),
        })
        .unwrap(),
    );
    let prefix = "test-round-trip/";
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open(dir.path().join("test.sqlite")).unwrap();
    db.call_blocking(|c| {
        Ok(c.execute_batch("CREATE TABLE item (name TEXT); INSERT INTO item VALUES ('a')")?)
    })
    .unwrap();
    let mut backup =
        Backup::with_prefix(client.clone(), db, dir.path(), Box::new(Utc::now), prefix);
    let key = backup.run_if_due().await.unwrap().unwrap();
    println!("uploaded {key}");
    let keys = client.list(prefix).await.unwrap();
    assert!(keys.contains(&key));
    if std::env::var("BACKUP_TEST_KEEP").is_err() {
        client.delete(&key).await.unwrap();
        assert!(!client.list(prefix).await.unwrap().contains(&key));
    }
}
