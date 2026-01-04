//! Queue Scheduler - handles timed start/stop of queues
//!
//! Runs a background task that periodically checks queue schedules
//! and starts/stops queues at the configured times.

use chrono::{Local, NaiveTime, Datelike, Weekday};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{RwLock, broadcast};
use tokio::time::interval;
use tracing::{info, warn};
use uuid::Uuid;
use crate::queue::QueueManager;
use crate::DlmanCore;
use dlman_types::{CoreEvent, Queue, DownloadStatus};

/// Scheduler that manages automatic queue start/stop based on time schedules
pub struct QueueScheduler {
    /// Reference to queue manager
    queue_manager: Arc<QueueManager>,
    /// Cancellation flag
    running: Arc<RwLock<bool>>,
    /// Event sender for notifications
    event_tx: broadcast::Sender<CoreEvent>,
}

impl QueueScheduler {
    pub fn new(queue_manager: Arc<QueueManager>, event_tx: broadcast::Sender<CoreEvent>) -> Self {
        Self {
            queue_manager,
            running: Arc::new(RwLock::new(false)),
            event_tx,
        }
    }
    
    /// Start the scheduler background task
    pub async fn start(&self, core: DlmanCore) {
        let mut is_running = self.running.write().await;
        if *is_running {
            info!("Scheduler already running");
            return;
        }
        *is_running = true;
        drop(is_running);
        
        let running = self.running.clone();
        let queue_manager = self.queue_manager.clone();
        let event_tx = self.event_tx.clone();
        
        info!("Starting queue scheduler");
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(30)); // Check every 30 seconds
            
            loop {
                interval.tick().await;
                
                // Check if we should stop
                if !*running.read().await {
                    info!("Scheduler stopped");
                    break;
                }
                
                // Check all queues
                let queues = queue_manager.get_all_queues().await;
                let now = Local::now();
                let current_time = now.time();
                let current_day = now.weekday();
                
                for queue in queues {
                    if let Some(ref schedule) = queue.schedule {
                        if !schedule.enabled {
                            continue;
                        }
                        
                        // Check if today is in the scheduled days
                        if !schedule.days.contains(&current_day) {
                            continue;
                        }
                        
                        let is_running = queue_manager.is_running(queue.id).await;
                        
                        // Check if we should start
                        if let Some(start_time) = schedule.start_time {
                            if !is_running && is_time_to_start(current_time, start_time) {
                                info!("Scheduler: Starting queue '{}' at scheduled time {}", queue.name, start_time);
                                if let Err(e) = queue_manager.start_queue(core.clone(), queue.id).await {
                                    warn!("Failed to start scheduled queue '{}': {}", queue.name, e);
                                } else {
                                    let _ = event_tx.send(CoreEvent::QueueStarted { id: queue.id });
                                }
                            }
                        }
                        
                        // Check if we should stop
                        if let Some(stop_time) = schedule.stop_time {
                            if is_running && is_time_to_stop(current_time, stop_time) {
                                info!("Scheduler: Stopping queue '{}' at scheduled time {}", queue.name, stop_time);
                                if let Err(e) = stop_queue_downloads(core.clone(), queue.id).await {
                                    warn!("Failed to stop scheduled queue '{}': {}", queue.name, e);
                                } else {
                                    if let Err(e) = queue_manager.stop_queue(queue.id).await {
                                        warn!("Failed to mark queue as stopped: {}", e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    
    /// Stop the scheduler
    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
        info!("Stopping queue scheduler");
    }
}

/// Check if it's time to start (within a 1-minute window)
fn is_time_to_start(current: NaiveTime, start: NaiveTime) -> bool {
    let diff = (current - start).num_seconds().abs();
    // Start if within 30 seconds of the scheduled time
    diff <= 30
}

/// Check if it's time to stop (within a 1-minute window)
fn is_time_to_stop(current: NaiveTime, stop: NaiveTime) -> bool {
    let diff = (current - stop).num_seconds().abs();
    // Stop if within 30 seconds of the scheduled time
    diff <= 30
}

/// Stop all downloads in a queue
async fn stop_queue_downloads(core: DlmanCore, queue_id: Uuid) -> Result<(), crate::error::DlmanError> {
    let downloads = core.download_manager.db().get_downloads_by_queue(queue_id).await?;
    
    for download in downloads {
        if download.status == DownloadStatus::Downloading {
            if let Err(e) = core.pause_download(download.id).await {
                warn!("Failed to pause download {}: {}", download.id, e);
            }
        }
    }
    
    Ok(())
}

/// Calculate time until next scheduled start for a queue
pub fn time_until_next_start(queue: &Queue) -> Option<Duration> {
    let schedule = queue.schedule.as_ref()?;
    
    if !schedule.enabled {
        return None;
    }
    
    let start_time = schedule.start_time?;
    
    let now = Local::now();
    let current_time = now.time();
    let current_day = now.weekday();
    
    // Check each day starting from today
    for day_offset in 0u32..7 {
        let check_day = match (current_day.num_days_from_monday() + day_offset) % 7 {
            0 => Weekday::Mon,
            1 => Weekday::Tue,
            2 => Weekday::Wed,
            3 => Weekday::Thu,
            4 => Weekday::Fri,
            5 => Weekday::Sat,
            6 => Weekday::Sun,
            _ => unreachable!(),
        };
        
        if !schedule.days.contains(&check_day) {
            continue;
        }
        
        // If today and start_time is in the future
        if day_offset == 0 && start_time > current_time {
            let diff = start_time - current_time;
            return Some(Duration::from_secs(diff.num_seconds() as u64));
        }
        
        // For future days
        if day_offset > 0 {
            // Calculate seconds until midnight, then add time for remaining days and start_time
            let seconds_until_midnight = (NaiveTime::from_hms_opt(23, 59, 59).unwrap() - current_time).num_seconds() + 1;
            let seconds_for_full_days = (day_offset - 1) as i64 * 24 * 60 * 60;
            let seconds_until_start = start_time.signed_duration_since(NaiveTime::from_hms_opt(0, 0, 0).unwrap()).num_seconds();
            
            let total_seconds = seconds_until_midnight + seconds_for_full_days + seconds_until_start;
            return Some(Duration::from_secs(total_seconds as u64));
        }
    }
    
    None
}

/// Format duration as human-readable string
pub fn format_duration_until(duration: Duration) -> String {
    let total_secs = duration.as_secs();
    
    if total_secs < 60 {
        return format!("{}s", total_secs);
    }
    
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;
    
    if hours == 0 {
        format!("{}m", minutes)
    } else if hours < 24 {
        format!("{}h {}m", hours, minutes)
    } else {
        let days = hours / 24;
        let remaining_hours = hours % 24;
        format!("{}d {}h", days, remaining_hours)
    }
}
