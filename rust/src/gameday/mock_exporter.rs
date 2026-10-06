//! A scripted [`GamedayExporter`] for tests (the TS tests' `vi.mock` of
//! `runGamedayExportProcess`): records every input and plays back queued
//! results, failing with an internal error when none is queued.

use super::run_export_process::{ExportFuture, GamedayExporter};
use super::types::{GamedayExportInput, GamedayExportMember, GamedayExportOutput};
use crate::shared::errors::{AppError, AppResult};
use std::collections::VecDeque;
use std::sync::Mutex;

#[derive(Default)]
pub struct MockExporter {
    calls: Mutex<Vec<GamedayExportInput>>,
    results: Mutex<VecDeque<AppResult<GamedayExportOutput>>>,
}

impl MockExporter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Queues members for the next export (`mockResolvedValueOnce`).
    pub fn resolve(&self, members: Vec<GamedayExportMember>) {
        self.push(Ok(GamedayExportOutput { members }));
    }

    /// Queues a failure for the next export (`mockRejectedValueOnce`).
    pub fn reject(&self, error: AppError) {
        self.push(Err(error));
    }

    fn push(&self, result: AppResult<GamedayExportOutput>) {
        self.results
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push_back(result);
    }

    /// Every input received so far.
    pub fn calls(&self) -> Vec<GamedayExportInput> {
        self.calls.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Forgets the recorded calls (`mockClear`).
    pub fn clear(&self) {
        self.calls.lock().unwrap_or_else(|e| e.into_inner()).clear();
    }
}

impl GamedayExporter for MockExporter {
    fn export(&self, input: GamedayExportInput) -> ExportFuture {
        self.calls
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(input);
        let next = self
            .results
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .pop_front()
            .unwrap_or_else(|| {
                Err(AppError::internal_from(
                    "No GameDay export result was queued.",
                ))
            });
        Box::pin(async move { next })
    }
}
