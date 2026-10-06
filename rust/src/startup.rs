//! Port of `server/src/startup.ts`: tasks run before the server listens.
//! Outside production a failure is fatal at once; in production each task
//! is retried with backoff (1s doubling to 10s) for up to four minutes.

use crate::db::Db;
use crate::log;
use crate::shared::errors::AppError;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;
use tokio::time::Instant;

const STARTUP_TASK_RETRY_TIMEOUT_MS: u64 = 4 * 60 * 1000;
const STARTUP_TASK_RETRY_INITIAL_DELAY_MS: u64 = 1000;
const STARTUP_TASK_RETRY_MAX_DELAY_MS: u64 = 10000;

/// A task failure, formatted like `formatStartupTaskError`: `Name: message`
/// for errors, the bare value otherwise.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskError {
    pub name: Option<String>,
    pub message: String,
}

impl TaskError {
    pub fn named(name: &str, message: &str) -> Self {
        TaskError {
            name: Some(name.into()),
            message: message.into(),
        }
    }
    pub fn plain(message: &str) -> Self {
        TaskError {
            name: None,
            message: message.into(),
        }
    }
}

impl fmt::Display for TaskError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.name {
            Some(name) => write!(f, "{name}: {}", self.message),
            None => write!(f, "{}", self.message),
        }
    }
}

impl From<AppError> for TaskError {
    fn from(error: AppError) -> Self {
        TaskError::named("AppError", &error.message)
    }
}

pub type TaskFuture = Pin<Box<dyn Future<Output = Result<(), TaskError>> + Send>>;

/// `TStartupTask`.
pub struct StartupTask {
    pub name: String,
    pub run: Box<dyn Fn() -> TaskFuture + Send + Sync>,
}

impl StartupTask {
    pub fn new<F, Fut>(name: &str, run: F) -> Self
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), TaskError>> + Send + 'static,
    {
        StartupTask {
            name: name.into(),
            run: Box::new(move || Box::pin(run())),
        }
    }
}

/// The server's startup tasks, in order.
pub fn startup_tasks(db: &Db) -> Vec<StartupTask> {
    let schema_db = db.clone();
    let backfill_db = db.clone();
    vec![
        StartupTask::new("SQLite schema sync", move || {
            let db = schema_db.clone();
            async move {
                db.call(crate::db::migrations::run_startup_schema)
                    .await
                    .map_err(TaskError::from)
            }
        }),
        StartupTask::new("User gender matching backfill", move || {
            let db = backfill_db.clone();
            async move {
                crate::migrations::user_gender_matching::run_user_gender_matching_migration(&db)
                    .await
                    .map_err(TaskError::from)
            }
        }),
        // runStartupSchemaAudit is available in db::audit but, as in TS, not run by default
    ]
}

/// `runStartupTasks()`.
pub async fn run_startup_tasks(
    tasks: &[StartupTask],
    is_production: bool,
) -> Result<(), TaskError> {
    for task in tasks {
        run_startup_task(task, is_production).await?;
    }
    Ok(())
}

async fn run_startup_task(task: &StartupTask, is_production: bool) -> Result<(), TaskError> {
    if !is_production {
        return (task.run)().await;
    }
    let started_at = Instant::now();
    let mut attempt = 1;
    let mut retry_delay_ms = STARTUP_TASK_RETRY_INITIAL_DELAY_MS;
    loop {
        match (task.run)().await {
            Ok(()) => {
                if attempt > 1 {
                    log::log(format!(
                        "Startup task \"{}\" succeeded after {attempt} attempts.",
                        task.name
                    ));
                }
                return Ok(());
            }
            Err(error) => {
                let elapsed_ms = started_at.elapsed().as_millis() as u64;
                let remaining_ms = STARTUP_TASK_RETRY_TIMEOUT_MS.saturating_sub(elapsed_ms);
                if remaining_ms == 0 {
                    return Err(error);
                }
                let wait_ms = retry_delay_ms.min(remaining_ms);
                log::warn(format!(
                    "Startup task \"{}\" failed on attempt {attempt}. Retrying in {wait_ms}ms. {error}",
                    task.name
                ));
                tokio::time::sleep(Duration::from_millis(wait_ms)).await;
                attempt += 1;
                retry_delay_ms = (retry_delay_ms * 2).min(STARTUP_TASK_RETRY_MAX_DELAY_MS);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    type Script = Arc<Mutex<Vec<Result<(), TaskError>>>>;

    /// A task that plays back `script` (then succeeds) and counts its runs.
    fn scripted(
        name: &str,
        script: Vec<Result<(), TaskError>>,
        order: Arc<Mutex<Vec<String>>>,
    ) -> (StartupTask, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let script: Script = Arc::new(Mutex::new(script.into_iter().rev().collect()));
        let counter = calls.clone();
        let label = name.to_string();
        let task = StartupTask::new(name, move || {
            counter.fetch_add(1, Ordering::SeqCst);
            order.lock().unwrap().push(label.clone());
            let next = script.lock().unwrap().pop().unwrap_or(Ok(()));
            async move { next }
        });
        (task, calls)
    }

    fn always_failing(name: &str, error: TaskError) -> (StartupTask, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let task = StartupTask::new(name, move || {
            counter.fetch_add(1, Ordering::SeqCst);
            let error = error.clone();
            async move { Err(error) }
        });
        (task, calls)
    }

    mod run_startup_tasks_tests {
        use super::*;

        #[tokio::test]
        async fn runs_every_task_in_order() {
            let order = Arc::new(Mutex::new(Vec::new()));
            let (index, _) = scripted("index", vec![], order.clone());
            let (migration, _) = scripted("migration", vec![], order.clone());
            run_startup_tasks(&[index, migration], false).await.unwrap();
            assert_eq!(*order.lock().unwrap(), ["index", "migration"]);
        }

        #[tokio::test]
        async fn fails_immediately_outside_production() {
            let order = Arc::new(Mutex::new(Vec::new()));
            let failure = TaskError::named("Error", "db down");
            let (index, index_calls) = always_failing("index", failure.clone());
            let (migration, migration_calls) = scripted("migration", vec![], order);
            assert_eq!(
                run_startup_tasks(&[index, migration], false).await,
                Err(failure)
            );
            assert_eq!(index_calls.load(Ordering::SeqCst), 1);
            assert_eq!(migration_calls.load(Ordering::SeqCst), 0);
        }

        #[tokio::test(start_paused = true)]
        async fn retries_with_backoff_in_production_until_a_task_succeeds() {
            let capture = log::capture();
            let order = Arc::new(Mutex::new(Vec::new()));
            let (index, index_calls) = scripted(
                "Retry index sync",
                vec![
                    Err(TaskError::named("TypeError", "first")),
                    Err(TaskError::plain("second")),
                    Err(TaskError::named("Error", "third")),
                ],
                order.clone(),
            );
            let (migration, migration_calls) = scripted("Retry migration", vec![], order);
            run_startup_tasks(&[index, migration], true).await.unwrap();
            assert_eq!(index_calls.load(Ordering::SeqCst), 4);
            assert_eq!(migration_calls.load(Ordering::SeqCst), 1);
            assert_eq!(
                capture.matching(log::Level::Warn, "\"Retry index sync\""),
                [
                    "Startup task \"Retry index sync\" failed on attempt 1. Retrying in 1000ms. TypeError: first",
                    "Startup task \"Retry index sync\" failed on attempt 2. Retrying in 2000ms. second",
                    "Startup task \"Retry index sync\" failed on attempt 3. Retrying in 4000ms. Error: third",
                ]
            );
            assert!(capture.lines(log::Level::Log).contains(
                &"Startup task \"Retry index sync\" succeeded after 4 attempts.".to_string()
            ));
        }

        #[tokio::test(start_paused = true)]
        async fn caps_the_delay_and_gives_up_after_the_retry_budget() {
            let capture = log::capture();
            let order = Arc::new(Mutex::new(Vec::new()));
            let (index, index_calls) = scripted("Budget index sync", vec![], order);
            let failure = TaskError::named("Error", "still down");
            let (migration, _) = always_failing("Budget migration", failure.clone());
            assert_eq!(
                run_startup_tasks(&[index, migration], true).await,
                Err(failure)
            );
            let delays: Vec<u64> = capture
                .matching(log::Level::Warn, "\"Budget migration\"")
                .iter()
                .filter_map(|line| {
                    line.split("Retrying in ")
                        .nth(1)
                        .and_then(|rest| rest.split("ms").next())
                        .and_then(|n| n.parse().ok())
                })
                .collect();
            assert_eq!(delays[..6], [1000, 2000, 4000, 8000, 10000, 10000]);
            // the waits never run past the four minute budget
            assert_eq!(delays.iter().sum::<u64>(), 4 * 60 * 1000);
            // the first task succeeded once and is not retried
            assert_eq!(index_calls.load(Ordering::SeqCst), 1);
        }
    }
}
