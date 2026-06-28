//! Media Stream Detection & Download
//!
//! This module provides protocol-specific handlers for downloading
//! streaming media (HLS, DASH) and direct video files. It is designed
//! as a clean abstraction layer so new protocols can be added without
//! touching core download logic.
//!
//! Architecture:
//! ```text
//! ┌─────────────────────────────────────────────────┐
//! │  MediaDownloader (facade)                       │
//! │  ├── resolve(DetectedMedia) → Vec<MediaVariant> │
//! │  └── download(request) → Download               │
//! │      ├── DirectHandler   (mp4/webm → existing)  │
//! │      ├── HlsHandler      (m3u8 → segments)      │
//! │      └── DashHandler     (mpd → segments)        │
//! └─────────────────────────────────────────────────┘
//! ```

pub mod hls;
pub mod dash;

use crate::error::DlmanError;
use dlman_types::{DetectedMedia, MediaProtocol, MediaVariant};

// ============================================================================
// Protocol Handler Trait
// ============================================================================

/// Trait for protocol-specific media handlers.
///
/// Each handler is responsible for:
/// 1. Parsing the manifest/playlist for a given protocol
/// 2. Returning available variants (qualities)
/// 3. Providing the final download URL(s) for a chosen variant
///
/// Handlers do NOT perform the actual download — they resolve
/// what needs to be downloaded. The core DownloadManager handles
/// the actual HTTP transfer.
#[async_trait::async_trait]
pub trait ProtocolHandler: Send + Sync {
    /// Parse a manifest URL and return available variants.
    async fn resolve_variants(
        &self,
        url: &str,
        headers: &[(String, String)],
    ) -> Result<Vec<MediaVariant>, DlmanError>;

    /// Given a chosen variant, return the list of segment URLs
    /// to download (for HLS/DASH) or the single direct URL.
    async fn get_segment_urls(
        &self,
        variant: &MediaVariant,
        headers: &[(String, String)],
    ) -> Result<Vec<String>, DlmanError>;

    /// The protocol this handler supports.
    fn protocol(&self) -> MediaProtocol;
}

// ============================================================================
// Media Downloader (Facade)
// ============================================================================

/// Resolves detected media into downloadable variants.
///
/// This is the public entry point for media operations.
/// It delegates to the appropriate `ProtocolHandler` based on
/// the detected protocol.
pub struct MediaResolver {
    http_client: reqwest::Client,
}

impl MediaResolver {
    pub fn new(http_client: reqwest::Client) -> Self {
        Self { http_client }
    }

    /// Resolve available variants for a detected media stream.
    ///
    /// For HLS: parses the master playlist and returns quality variants.
    /// For DASH: parses the MPD and returns representations.
    /// For Direct: returns a single variant with the direct URL.
    pub async fn resolve(
        &self,
        media: &DetectedMedia,
    ) -> Result<Vec<MediaVariant>, DlmanError> {
        let headers = self.build_headers(media);

        match media.protocol {
            MediaProtocol::Direct => {
                // Direct files have exactly one "variant"
                Ok(vec![MediaVariant {
                    url: media.master_url.clone(),
                    label: "Direct".to_string(),
                    width: None,
                    height: None,
                    bandwidth: None,
                    codecs: None,
                    audio_only: false,
                    estimated_size: None,
                }])
            }
            MediaProtocol::Hls => {
                let handler = hls::HlsHandler::new(self.http_client.clone());
                handler.resolve_variants(&media.master_url, &headers).await
            }
            MediaProtocol::Dash => {
                let handler = dash::DashHandler::new(self.http_client.clone());
                handler.resolve_variants(&media.master_url, &headers).await
            }
        }
    }

    /// Get the downloadable segment URLs for a chosen variant.
    pub async fn get_segments(
        &self,
        media: &DetectedMedia,
        variant: &MediaVariant,
    ) -> Result<Vec<String>, DlmanError> {
        let headers = self.build_headers(media);

        match media.protocol {
            MediaProtocol::Direct => Ok(vec![variant.url.clone()]),
            MediaProtocol::Hls => {
                let handler = hls::HlsHandler::new(self.http_client.clone());
                handler.get_segment_urls(variant, &headers).await
            }
            MediaProtocol::Dash => {
                let handler = dash::DashHandler::new(self.http_client.clone());
                handler.get_segment_urls(variant, &headers).await
            }
        }
    }

    /// Build HTTP headers from media metadata (cookies, referrer).
    fn build_headers(&self, media: &DetectedMedia) -> Vec<(String, String)> {
        let mut headers = Vec::new();
        if let Some(ref cookies) = media.cookies {
            headers.push(("Cookie".to_string(), cookies.clone()));
        }
        if let Some(ref referrer) = media.referrer {
            headers.push(("Referer".to_string(), referrer.clone()));
        }
        headers
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_direct_protocol_returns_single_variant() {
        let media = DetectedMedia {
            id: "test".to_string(),
            page_url: "https://example.com".to_string(),
            page_title: None,
            master_url: "https://example.com/video.mp4".to_string(),
            protocol: MediaProtocol::Direct,
            variants: vec![],
            mime_type: Some("video/mp4".to_string()),
            filename: Some("video.mp4".to_string()),
            duration: None,
            thumbnail: None,
            cookies: None,
            referrer: None,
        };

        let resolver = MediaResolver::new(reqwest::Client::new());
        let rt = tokio::runtime::Runtime::new().unwrap();
        let variants = rt.block_on(resolver.resolve(&media)).unwrap();
        assert_eq!(variants.len(), 1);
        assert_eq!(variants[0].url, "https://example.com/video.mp4");
    }
}
