/**
 * Hook to fetch and display queue schedule information
 * Updates periodically to show countdown to next scheduled start
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface QueueScheduleInfo {
  queueId: string;
  secondsUntilStart: number | null;
}

interface UseQueueSchedulesResult {
  schedules: Map<string, number | null>;
  loading: boolean;
  refresh: () => void;
}

// Check if we're in Tauri context
const isTauri = () =>
  typeof window !== 'undefined' &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

/**
 * Format seconds until start as human-readable string
 */
export function formatTimeUntil(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  
  if (seconds < 60) {
    return 'Starting soon';
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours === 0) {
    return `${minutes}m`;
  } else if (hours < 24) {
    return `${hours}h ${minutes}m`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
}

export function useQueueSchedules(): UseQueueSchedulesResult {
  const [schedules, setSchedules] = useState<Map<string, number | null>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }

    try {
      const result = await invoke<QueueScheduleInfo[]>('get_queue_schedules');
      const map = new Map<string, number | null>();
      for (const info of result) {
        map.set(info.queueId, info.secondsUntilStart);
      }
      setSchedules(map);
    } catch (err) {
      console.error('Failed to fetch queue schedules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch immediately
    fetchSchedules();

    // Refresh every 30 seconds
    const interval = setInterval(fetchSchedules, 30000);

    return () => clearInterval(interval);
  }, [fetchSchedules]);

  // Also decrement locally every second for smoother countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setSchedules(prev => {
        const newMap = new Map<string, number | null>();
        for (const [key, value] of prev) {
          if (value !== null && value > 0) {
            newMap.set(key, value - 1);
          } else {
            newMap.set(key, value);
          }
        }
        return newMap;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    schedules,
    loading,
    refresh: fetchSchedules,
  };
}
