/**
 * Shared types for DLMan browser extension
 * These types match the dlman-types Rust crate for seamless integration
 */

// ============================================================================
// Download Types
// ============================================================================

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
  retry_count: number;
}

export type DownloadStatus =
  | 'pending'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'queued'
  | 'cancelled'
  | 'deleted';

export interface Segment {
  index: number;
  start: number;
  end: number;
  downloaded: number;
  complete: boolean;
}

// ============================================================================
// Queue Types
// ============================================================================

export interface Queue {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  max_concurrent: number;
  speed_limit: number | null;
  segment_count: number | null;
  schedule: Schedule | null;
  post_action: PostAction;
  created_at: string;
}

export interface Schedule {
  enabled: boolean;
  start_time: string | null;
  stop_time: string | null;
  days: Weekday[];
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type PostAction =
  | 'none'
  | 'shutdown'
  | 'sleep'
  | 'hibernate'
  | 'notify'
  | { runCommand: string };

// ============================================================================
// Settings Types
// ============================================================================

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
}

export type Theme = 'light' | 'dark' | 'system';

// ============================================================================
// Link Types
// ============================================================================

export interface LinkInfo {
  url: string;
  final_url: string | null;
  filename: string;
  size: number | null;
  content_type: string | null;
  resumable: boolean;
  error: string | null;
}

// ============================================================================
// API Message Types
// ============================================================================

export type MessageType =
  // Connection
  | 'ping'
  | 'pong'
  | 'authenticate'
  | 'authenticated'
  | 'error'
  // Download operations
  | 'add_download'
  | 'download_added'
  | 'download_progress'
  | 'download_completed'
  | 'download_error'
  | 'get_downloads'
  | 'downloads_list'
  // Queue operations
  | 'get_queues'
  | 'queues_list'
  // Status
  | 'get_status'
  | 'status';

export interface ApiMessage<T = unknown> {
  id: string;
  type: MessageType;
  payload?: T;
  timestamp: number;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface AddDownloadRequest {
  url: string;
  filename?: string;
  destination?: string;
  queue_id?: string;
  referrer?: string;
  cookies?: string;
  headers?: Record<string, string>;
}

export interface AddDownloadResponse {
  success: boolean;
  download?: Download;
  error?: string;
}

export interface StatusResponse {
  connected: boolean;
  version: string;
  active_downloads: number;
  queues: number;
}

export interface DownloadProgressEvent {
  id: string;
  downloaded: number;
  total: number | null;
  speed: number;
  eta: number | null;
}

// ============================================================================
// Extension Storage Types
// ============================================================================

export interface ExtensionSettings {
  enabled: boolean;
  port: number;
  autoIntercept: boolean;
  interceptPatterns: string[];
  disabledSites: string[];
  fallbackToBrowser: boolean;
  showNotifications: boolean;
  defaultQueueId: string | null;
  theme: 'light' | 'dark' | 'system';
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  enabled: true,
  port: 7899,
  autoIntercept: true,
  interceptPatterns: [
    '*.zip', '*.rar', '*.7z', '*.tar', '*.gz', '*.bz2',
    '*.exe', '*.msi', '*.dmg', '*.pkg', '*.deb', '*.rpm', '*.appimage',
    '*.mp4', '*.mkv', '*.avi', '*.mov', '*.webm', '*.m4v',
    '*.mp3', '*.flac', '*.wav', '*.m4a', '*.aac', '*.ogg',
    '*.pdf', '*.doc', '*.docx', '*.xls', '*.xlsx', '*.ppt', '*.pptx',
    '*.iso', '*.img',
  ],
  disabledSites: [],
  fallbackToBrowser: true,
  showNotifications: true,
  defaultQueueId: null,
  theme: 'system',
};

// ============================================================================
// Site Rule Types
// ============================================================================

export interface SiteRule {
  pattern: string;
  enabled: boolean;
  queueId?: string;
}
