//! Token bucket rate limiter for global speed control
//!
//! Implements a token bucket algorithm to accurately limit download speed
//! across all active downloads and segments. Uses a sliding window approach
//! for more accurate rate limiting with multiple concurrent segments.

use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Global rate limiter using token bucket algorithm
/// This limiter is shared across ALL segments of ALL downloads
#[derive(Clone)]
pub struct RateLimiter {
    state: Arc<Mutex<RateLimiterState>>,
}

struct RateLimiterState {
    /// Maximum tokens (bytes) in the bucket
    capacity: u64,
    /// Current available tokens
    tokens: f64,
    /// Last token refill time
    last_refill: Instant,
    /// Tokens added per second (the speed limit)
    refill_rate: u64,
    /// Whether this is an unlimited limiter
    is_unlimited: bool,
    /// Track bytes transferred in the last window for accurate rate calculation
    window_bytes: u64,
    /// Window start time
    window_start: Instant,
}

impl RateLimiter {
    /// Create a new rate limiter with a given bytes-per-second limit
    pub fn new(bytes_per_second: u64) -> Self {
        // Use 1 second capacity for smoother rate limiting
        // This allows better distribution among multiple segments
        let capacity = bytes_per_second;
        
        Self {
            state: Arc::new(Mutex::new(RateLimiterState {
                capacity,
                tokens: capacity as f64, // Start with full bucket
                last_refill: Instant::now(),
                refill_rate: bytes_per_second,
                is_unlimited: false,
                window_bytes: 0,
                window_start: Instant::now(),
            })),
        }
    }
    
    /// Create an unlimited rate limiter (no throttling)
    pub fn unlimited() -> Self {
        Self {
            state: Arc::new(Mutex::new(RateLimiterState {
                capacity: u64::MAX,
                tokens: f64::MAX,
                last_refill: Instant::now(),
                refill_rate: u64::MAX,
                is_unlimited: true,
                window_bytes: 0,
                window_start: Instant::now(),
            })),
        }
    }
    
    /// Update the speed limit
    pub async fn set_limit(&self, bytes_per_second: u64) {
        let mut state = self.state.lock().await;
        if bytes_per_second == 0 || bytes_per_second == u64::MAX {
            // Unlimited
            state.capacity = u64::MAX;
            state.refill_rate = u64::MAX;
            state.tokens = f64::MAX;
            state.is_unlimited = true;
        } else {
            // Use full second capacity
            state.capacity = bytes_per_second;
            state.refill_rate = bytes_per_second;
            state.is_unlimited = false;
            // Don't let tokens exceed new capacity
            state.tokens = (state.tokens).min(bytes_per_second as f64);
        }
    }
    
    /// Acquire tokens for downloading `bytes` amount of data
    /// This will block until enough tokens are available
    pub async fn acquire(&self, bytes: u64) {
        // For small requests, process immediately to avoid excessive waiting
        let bytes_to_acquire = bytes.min(16384); // Cap at 16KB per acquire call
        
        loop {
            let wait_time = {
                let mut state = self.state.lock().await;
                
                // Unlimited: return immediately
                if state.is_unlimited {
                    return;
                }
                
                // Refill tokens based on elapsed time
                self.refill_tokens(&mut state);
                
                // If we have enough tokens, consume and return
                if state.tokens >= bytes_to_acquire as f64 {
                    state.tokens -= bytes_to_acquire as f64;
                    state.window_bytes += bytes_to_acquire;
                    return;
                }
                
                // Not enough tokens - calculate wait time
                // Wait for just a small slice to allow other segments fair access
                let needed = bytes_to_acquire as f64 - state.tokens;
                let wait_secs = needed / state.refill_rate as f64;
                
                // Cap wait time to 50ms for responsiveness
                let wait = Duration::from_secs_f64(wait_secs.min(0.05));
                
                wait
            };
            
            // Wait outside the lock so other segments can also check
            if wait_time > Duration::ZERO {
                tokio::time::sleep(wait_time).await;
            }
        }
    }
    
    /// Non-blocking try to acquire tokens
    /// Returns true if tokens were acquired, false otherwise
    pub async fn try_acquire(&self, bytes: u64) -> bool {
        let mut state = self.state.lock().await;
        
        if state.is_unlimited {
            return true;
        }
        
        self.refill_tokens(&mut state);
        
        if state.tokens >= bytes as f64 {
            state.tokens -= bytes as f64;
            state.window_bytes += bytes;
            true
        } else {
            false
        }
    }
    
    /// Refill tokens based on elapsed time
    fn refill_tokens(&self, state: &mut RateLimiterState) {
        if state.is_unlimited {
            return;
        }
        
        let now = Instant::now();
        let elapsed = now.duration_since(state.last_refill);
        let elapsed_secs = elapsed.as_secs_f64();
        
        if elapsed_secs > 0.001 { // Only refill if at least 1ms has passed
            let new_tokens = elapsed_secs * state.refill_rate as f64;
            state.tokens = (state.tokens + new_tokens).min(state.capacity as f64);
            state.last_refill = now;
        }
        
        // Reset window stats every second
        if now.duration_since(state.window_start).as_secs() >= 1 {
            state.window_bytes = 0;
            state.window_start = now;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_rate_limiter_basic() {
        let limiter = RateLimiter::new(1000); // 1KB/s
        
        let start = Instant::now();
        limiter.acquire(500).await; // Should be immediate
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() < 50);
        
        limiter.acquire(500).await; // Should also be immediate
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() < 50);
        
        limiter.acquire(500).await; // Should wait ~0.5s
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() >= 400);
    }
    
    #[tokio::test]
    async fn test_rate_limiter_unlimited() {
        let limiter = RateLimiter::unlimited();
        
        let start = Instant::now();
        for _ in 0..100 {
            limiter.acquire(10000).await;
        }
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() < 50);
    }
}
