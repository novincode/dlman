// Download types - mirrors Rust types

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
  color: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "queued"
  | "cancelled";

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
  icon?: string;
  max_concurrent?: number;
  speed_limit?: number;
  schedule?: Schedule;
  post_action?: PostAction;
}

// Settings types

export interface Settings {
  defaultDownloadPath: string;
  maxConcurrentDownloads: number;
  defaultSegments: number;
  globalSpeedLimit: number | null;
  theme: Theme;
  devMode: boolean;
  minimizeToTray: boolean;
  startOnBoot: boolean;
  browserIntegrationPort: number;
  rememberLastPath: boolean;
}

// Settings as returned from Rust (snake_case)
export interface RustSettings {
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
