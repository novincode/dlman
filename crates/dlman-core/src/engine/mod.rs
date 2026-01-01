//! Download Engine - The heart of DLMan
//!
//! This module implements a robust, IDM-style download engine with:
//! - Multi-segment parallel downloads
//! - Atomic persistence (SQLite)
//! - Token bucket rate limiting
//! - Clean pause/resume/cancel
//! - Crash-safe resume

mod persistence;
mod rate_limiter;
mod segment_worker;
mod download_task;
mod manager;

pub use persistence::*;
pub use rate_limiter::*;
pub use segment_worker::*;
pub use download_task::*;
pub use manager::*;
