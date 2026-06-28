/**
 * Media detection types — mirrors dlman-types Rust structs.
 *
 * These types define the contract between:
 * - Content script (detects media)
 * - Background script (manages state)
 * - Desktop app (receives download requests)
 */

// ============================================================================
// Protocol & Variant Types
// ============================================================================

/** Protocol used to deliver the media stream */
export type MediaProtocol = 'direct' | 'hls' | 'dash';

/** A single quality/variant of a detected media stream */
export interface MediaVariant {
  /** URL of this variant's manifest or direct file */
  url: string;
  /** Human-readable label (e.g. "1080p", "720p") */
  label: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Bitrate in bits per second */
  bandwidth?: number;
  /** Codec string */
  codecs?: string;
  /** Whether this variant is audio-only */
  audio_only?: boolean;
  /** Estimated file size in bytes */
  estimated_size?: number;
}

// ============================================================================
// Detected Media
// ============================================================================

/** A media stream detected on a webpage */
export interface DetectedMedia {
  /** Unique ID for this detection */
  id: string;
  /** Page URL where the media was found */
  page_url: string;
  /** Page title */
  page_title?: string;
  /** The master/top-level URL of the stream */
  master_url: string;
  /** Protocol (direct, hls, dash) */
  protocol: MediaProtocol;
  /** Available quality variants (empty for direct files before resolution) */
  variants: MediaVariant[];
  /** Detected MIME type */
  mime_type?: string;
  /** Suggested filename */
  filename?: string;
  /** Duration in seconds */
  duration?: number;
  /** Thumbnail URL */
  thumbnail?: string;
  /** Browser cookies for authenticated streams */
  cookies?: string;
  /** HTTP referrer */
  referrer?: string;
  /** The HTMLVideoElement position info (for overlay positioning) */
  element_rect?: DOMRect;
}

// ============================================================================
// Download Request/Response
// ============================================================================

/** Request from extension to download a media stream */
export interface MediaDownloadRequest {
  media: DetectedMedia;
  /** Index of chosen variant (undefined = best quality) */
  variant_index?: number;
  /** Desired output filename */
  output_filename?: string;
  /** Target queue ID */
  queue_id?: string;
}

/** Response after initiating a media download */
export interface MediaDownloadResponse {
  success: boolean;
  download_id?: string;
  error?: string;
}

// ============================================================================
// Internal messages (content script ↔ background)
// ============================================================================

/** Sent from content script to background when media is detected */
export interface MediaDetectedMessage {
  type: 'media-detected';
  media: DetectedMedia;
}

/** Sent from content script to background to trigger download */
export interface MediaDownloadMessage {
  type: 'media-download';
  request: MediaDownloadRequest;
}

/** Sent from background to content script to acknowledge detection */
export interface MediaDetectedAck {
  type: 'media-detected-ack';
  id: string;
  success: boolean;
}

/** Union type for all media-related messages */
export type MediaMessage =
  | MediaDetectedMessage
  | MediaDownloadMessage
  | MediaDetectedAck;
