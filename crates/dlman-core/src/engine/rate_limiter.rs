//! Token bucket rate limiter for global speed control
//!
//! Implements a token bucket algorithm to accurately limit download speed
//! across all active downloads and segments.

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
    /// Maximum tokens (bytes) in the bucket - kept small to prevent bursting
    capacity: u64,
    /// Current available tokens
    tokens: f64,
    /// Last token refill time
    last_refill: Instant,
    /// Tokens added per second (the speed limit)
    refill_rate: u64,
    /// Whether this is an unlimited limiter
    is_unlimited: bool,
}

impl RateLimiter {
    /// Create a new rate limiter with a given bytes-per-second limit
    pub fn new(bytes_per_second: u64) -> Self {
        // Small capacity (100ms worth of data) to prevent large bursts
        // This means multiple segments will all wait for tokens, not burst
        let capacity = (bytes_per_second as f64 * 0.1) as u64;
        let capacity = capacity.max(1024); // Minimum 1KB capacity
        
        Self {
            state: Arc::new(Mutex::new(RateLimiterState {
                capacity,
                tokens: capacity as f64,
                last_refill: Instant::now(),
                refill_rate: bytes_per_second,
                is_unlimited: false,
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
            // Small capacity for tight control
            let capacity = (bytes_per_second as f64 * 0.1) as u64;
            let capacity = capacity.max(1024);
            state.capacity = capacity;
            state.refill_rate = bytes_per_second;
            state.is_unlimited = false;
            // Reset tokens to prevent immediate burst
            state.tokens = (state.tokens as u64).min(capacity) as f64;
        }
    }
    
    /// Acquire tokens for downloading `bytes` amount of data
    /// This will block until enough tokens are available
    pub async fn acquire(&self, bytes: u64) {
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
                if state.tokens >= bytes as f64 {
                    state.tokens -= bytes as f64;
                    return;
                }
                
                // Calculate how long to wait for tokens
                let needed = bytes as f64 - state.tokens;
                let wait_secs = needed / state.refill_rate as f64;
                
                // Consume all available tokens now
                let consumed = state.tokens;
                state.tokens = 0.0;
                
                // Calculate remaining wait time using saturating subtraction to prevent overflow
                // This can happen due to floating point rounding or when consumed >= needed
                let consumed_time_secs = consumed / state.refill_rate as f64;
                if consumed_time_secs >= wait_secs {
                    // We've already "consumed" enough time, no need to wait
                    Duration::ZERO
                } else {
                    Duration::from_secs_f64(wait_secs - consumed_time_secs)
                }
            };
            
            // Wait outside the lock so other segments can also acquire
            if wait_time > Duration::ZERO {
                tokio::time::sleep(wait_time.min(Duration::from_millis(100))).await;
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
        
        if elapsed.as_secs_f64() > 0.0 {
            let new_tokens = elapsed.as_secs_f64() * state.refill_rate as f64;
            state.tokens = (state.tokens + new_tokens).min(state.capacity as f64);
            state.last_refill = now;
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
