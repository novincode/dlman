//! Token bucket rate limiter for global speed control
//!
//! Implements a token bucket algorithm to accurately limit download speed
//! across all active downloads.

use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Global rate limiter using token bucket algorithm
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
    /// Tokens added per second
    refill_rate: u64,
}

impl RateLimiter {
    /// Create a new rate limiter with a given bytes-per-second limit
    pub fn new(bytes_per_second: u64) -> Self {
        // Capacity is 1 second worth of bytes, allowing bursts
        let capacity = bytes_per_second;
        
        Self {
            state: Arc::new(Mutex::new(RateLimiterState {
                capacity,
                tokens: capacity as f64,
                last_refill: Instant::now(),
                refill_rate: bytes_per_second,
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
            })),
        }
    }
    
    /// Update the speed limit
    pub async fn set_limit(&self, bytes_per_second: u64) {
        let mut state = self.state.lock().await;
        state.capacity = bytes_per_second;
        state.refill_rate = bytes_per_second;
        // Don't reset tokens - let it drain/fill naturally
    }
    
    /// Acquire tokens for downloading `bytes` amount of data
    /// This will block until enough tokens are available
    pub async fn acquire(&self, bytes: u64) {
        let mut state = self.state.lock().await;
        
        // Refill tokens based on elapsed time
        self.refill_tokens(&mut state);
        
        // If we have enough tokens, consume and return immediately
        if state.tokens >= bytes as f64 {
            state.tokens -= bytes as f64;
            return;
        }
        
        // Not enough tokens - calculate how long to wait
        let needed = bytes as f64 - state.tokens;
        let wait_duration = if state.refill_rate > 0 {
            Duration::from_secs_f64(needed / state.refill_rate as f64)
        } else {
            Duration::from_millis(10) // Fallback for unlimited
        };
        
        // Consume all available tokens
        state.tokens = 0.0;
        
        drop(state);
        
        // Wait for tokens to refill
        tokio::time::sleep(wait_duration).await;
        
        // After waiting, tokens should have refilled enough
        // (We don't recurse - the next acquire will handle it)
    }
    
    /// Non-blocking try to acquire tokens
    /// Returns true if tokens were acquired, false otherwise
    pub async fn try_acquire(&self, bytes: u64) -> bool {
        let mut state = self.state.lock().await;
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
