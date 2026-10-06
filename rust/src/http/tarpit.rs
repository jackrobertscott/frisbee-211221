//! Port of `server/src/http/tarpit.ts`: answers suspicious requests slowly,
//! dripping spaces until the hold time ends, then sending the body. At most
//! 24 tarpits are held open at once; beyond that the answer is immediate.

use axum::body::Body;
use axum::http::{HeaderValue, Response, StatusCode};
use bytes::Bytes;
use futures_util::stream;
use serde_json::{json, Value};
use std::convert::Infallible;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::Instant;

pub const MAX_CONCURRENT_TARPITS: usize = 24;

/// `ITarpitPlan`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TarpitPlan {
    pub body: String,
    pub drip_interval_ms: u64,
    pub hold_ms: u64,
    pub status_code: u16,
}

impl TarpitPlan {
    /// The plan as the JSON an `AppError.tarpit` carries.
    pub fn to_value(&self) -> Value {
        json!({
            "body": self.body,
            "dripIntervalMs": self.drip_interval_ms,
            "holdMs": self.hold_ms,
            "statusCode": self.status_code,
        })
    }

    /// `isTarpitPlan(value)`: all four fields present with the right types.
    pub fn from_value(value: Option<&Value>) -> Option<TarpitPlan> {
        let value = value?.as_object()?;
        let body = value.get("body")?.as_str()?.to_string();
        let drip = value.get("dripIntervalMs")?.as_f64()?;
        let hold = value.get("holdMs")?.as_f64()?;
        let status = value.get("statusCode")?.as_f64()?;
        let status_code = u16::try_from(status as i64).ok().filter(|s| StatusCode::from_u16(*s).is_ok())?;
        Some(TarpitPlan { body, drip_interval_ms: drip.max(0.0) as u64, hold_ms: hold.max(0.0) as u64, status_code })
    }
}

/// Counts open tarpits (module-global in TS, one per app here).
#[derive(Default)]
pub struct Tarpit {
    active: Arc<AtomicUsize>,
}

struct ActiveGuard(Arc<AtomicUsize>);

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        // closed connections stop their tarpit and free its slot
        let _ = self.0.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| Some(n.saturating_sub(1)));
    }
}

fn base_response(status_code: u16, body: Body) -> Response<Body> {
    let mut response = Response::new(body);
    *response.status_mut() = StatusCode::from_u16(status_code).unwrap_or(StatusCode::NOT_FOUND);
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store, max-age=0"));
    headers.insert("connection", HeaderValue::from_static("close"));
    headers.insert("content-type", HeaderValue::from_static("text/plain; charset=utf-8"));
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    response
}

enum Step {
    Start,
    Wait,
    Done,
}

impl Tarpit {
    pub fn new() -> Self {
        Tarpit::default()
    }

    /// How many tarpits are open right now.
    pub fn active(&self) -> usize {
        self.active.load(Ordering::SeqCst)
    }

    /// `tarpit.respond(res, plan)`: the (slow) response for `plan`.
    pub fn respond(&self, plan: &TarpitPlan) -> Response<Body> {
        let reserved = self
            .active
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| (n < MAX_CONCURRENT_TARPITS).then_some(n + 1))
            .is_ok();
        if !reserved {
            let mut response = base_response(plan.status_code, Body::from(plan.body.clone()));
            if let Ok(length) = HeaderValue::from_str(&plan.body.len().to_string()) {
                response.headers_mut().insert("content-length", length);
            }
            return response;
        }
        let guard = ActiveGuard(self.active.clone());
        let status_code = plan.status_code;
        let plan = plan.clone();
        let started_at = Instant::now();
        let chunks = stream::unfold((Step::Start, guard), move |(step, guard)| {
            let plan = plan.clone();
            async move {
                match step {
                    Step::Start => Some((Ok::<Bytes, Infallible>(Bytes::from_static(b" ")), (Step::Wait, guard))),
                    Step::Wait => loop {
                        let elapsed = started_at.elapsed().as_millis() as u64;
                        let remaining = plan.hold_ms.saturating_sub(elapsed);
                        if remaining == 0 || elapsed >= plan.hold_ms {
                            return Some((Ok(Bytes::from(plan.body.clone())), (Step::Done, guard)));
                        }
                        let wait = plan.drip_interval_ms.min(remaining);
                        tokio::time::sleep(Duration::from_millis(wait)).await;
                        if wait == plan.drip_interval_ms {
                            return Some((Ok(Bytes::from_static(b" ")), (Step::Wait, guard)));
                        }
                    },
                    Step::Done => {
                        drop(guard);
                        None
                    }
                }
            }
        });
        base_response(status_code, Body::from_stream(chunks))
    }
}

#[cfg(test)]
#[path = "tarpit_tests.rs"]
mod tests;
