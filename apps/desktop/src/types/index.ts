// Download types - mirrors Rust types (camelCase via serde)

export interface Download {
  id: string;
  url: string;
  finalUrl: string | null;
  filename: string;
  destination: string;
  size: number | null;
  downloaded: number;
  status: DownloadStatus;
  segments: Segment[];
  queueId: string;
  categoryId: string | null;
  color: string | null;
  error: string | null;
  speedLimit: number | null;
  createdAt: string;
  completedAt: string | null;
  retryCount?: number;
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
  maxConcurrent: number;
  speedLimit: number | null;
  segmentCount: number | null;
  schedule: Schedule | null;
  postAction: PostAction;
  createdAt: string;
}

export interface Schedule {
  enabled: boolean;
  startTime: string | null;
  stopTime: string | null;
  days: string[];
}

export type PostAction =
  | "none"
  | "shutdown"
  | "sleep"
  | "hibernate"
  | "notify"
  | { runCommand: string };

export interface QueueOptions {
  name?: string;
  color?: string;
  icon?: string | null;
  maxConcurrent?: number;
  speedLimit?: number | null;
  segmentCount?: number | null;
  schedule?: Schedule | null;
  postAction?: PostAction;
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
  maxRetries: number;
  retryDelaySeconds: number;
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
  finalUrl: string | null;
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
