// Download types - mirrors Rust types (snake_case)

export interface Download {
  id: string;
  url: string;
  final_url: string | null;
  filename: string;
  destination: string;
  size: number | null;
  downloaded: number;
  status: DownloadStatus;
  segments: Segment[];
  queue_id: string;
  category_id: string | null;
  color: string | null;
  error: string | null;
  speed_limit: number | null;
  created_at: string;
  completed_at: string | null;
  retry_count?: number;
}

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "queued"
  | "cancelled"
  | "deleted";

export interface Segment {
  index: number;
  start: number;
  end: number;
  downloaded: number;
  complete: boolean;
}

// Queue types

export interface Queue {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  max_concurrent: number;
  speed_limit: number | null;
  segment_count?: number | null;  // Deprecated - segment count is now managed at app settings level
  schedule: Schedule | null;
  post_action: PostAction;
  created_at: string;
}

export interface Schedule {
  enabled: boolean;
  start_time: string | null;
  stop_time: string | null;
  days: string[];
}

export type PostAction =
  | "none"
  | "shutdown"
  | "sleep"
  | "hibernate"
  | "notify"
  | { run_command: string };

export interface QueueOptions {
  name?: string;
  color?: string;
  icon?: string | null;
  max_concurrent?: number;
  speed_limit?: number | null;
  segment_count?: number | null;
  schedule?: Schedule | null;
  post_action?: PostAction;
}

// Settings types

export interface Settings {
  default_download_path: string;
  max_concurrent_downloads: number;
  default_segments: number;
  global_speed_limit: number | null;
  theme: Theme;
  dev_mode: boolean;
  minimize_to_tray: boolean;
  start_on_boot: boolean;
  browser_integration_port: number;
  remember_last_path: boolean;
  max_retries: number;
  retry_delay_seconds: number;
  // Notification settings
  notify_on_complete: boolean;
  notify_on_error: boolean;
  notify_sound: boolean;
  // Update settings
  auto_check_updates: boolean;
}

export type Theme = "light" | "dark" | "system";

// Event types

export type CoreEvent =
  | {
      type: "DownloadProgress";
      payload: {
        id: string;
        downloaded: number;
        total: number | null;
        speed: number;
        eta: number | null;
      };
    }
  | {
      type: "SegmentProgress";
      payload: {
        downloadId: string;
        segmentIndex: number;
        downloaded: number;
      };
    }
  | {
      type: "DownloadStatusChanged";
      payload: {
        id: string;
        status: DownloadStatus;
        error: string | null;
      };
    }
  | {
      type: "DownloadAdded";
      payload: {
        download: Download;
      };
    }
  | {
      type: "DownloadUpdated";
      payload: {
        download: Download;
      };
    }
  | {
      type: "DownloadRemoved";
      payload: {
        id: string;
      };
    }
  | {
      type: "QueueStarted";
      payload: {
        id: string;
      };
    }
  | {
      type: "QueueCompleted";
      payload: {
        id: string;
      };
    }
  | {
      type: "Error";
      payload: {
        message: string;
        context: string | null;
      };
    };

// API types

export interface LinkInfo {
  url: string;
  final_url: string | null;
  filename: string;
  size: number | null;
  content_type: string | null;
  resumable: boolean;
  error: string | null;
}

export interface ImportResult {
  successful: Download[];
  failed: ImportError[];
}

export interface ImportError {
  url: string;
  error: string;
}
