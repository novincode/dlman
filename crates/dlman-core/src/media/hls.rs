//! HLS (HTTP Live Streaming) Protocol Handler
//!
//! Parses M3U8 master and media playlists to extract available
//! quality variants and segment URLs for download.
//!
//! Supports:
//! - Master playlists with multiple quality variants
//! - Media playlists with segment lists
//! - Relative and absolute URL resolution
//! - EXT-X-STREAM-INF attributes (BANDWIDTH, RESOLUTION, CODECS)
//!
//! Does NOT support (yet):
//! - AES-128 encrypted segments (EXT-X-KEY)
//! - Byte-range requests (EXT-X-BYTERANGE)
//! - Live streams (only VOD)

use crate::error::DlmanError;
use crate::media::ProtocolHandler;
use dlman_types::{MediaProtocol, MediaVariant};
use url::Url;

/// Handler for HLS (m3u8) streams.
pub struct HlsHandler {
    client: reqwest::Client,
}

impl HlsHandler {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }

    /// Fetch and parse a playlist, returning its content.
    async fn fetch_playlist(
        &self,
        url: &str,
        headers: &[(String, String)],
    ) -> Result<String, DlmanError> {
        let mut request = self.client.get(url);
        for (key, value) in headers {
            request = request.header(key.as_str(), value.as_str());
        }
        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(DlmanError::ServerError {
                status: response.status().as_u16(),
                message: format!("Failed to fetch HLS playlist: {}", url),
            });
        }
        let text = response.text().await?;

        // Validate this is actually an m3u8 playlist and not HTML/JSON garbage
        if !text.trim_start().starts_with("#EXTM3U") {
            return Err(DlmanError::InvalidOperation(format!(
                "URL does not contain a valid HLS playlist (got {} bytes, starts with {:?})",
                text.len(),
                text.chars().take(40).collect::<String>()
            )));
        }

        Ok(text)
    }

    /// Check if a playlist is a master playlist (contains EXT-X-STREAM-INF).
    fn is_master_playlist(content: &str) -> bool {
        content.contains("#EXT-X-STREAM-INF")
    }

    /// Parse a master playlist into quality variants.
    fn parse_master_playlist(content: &str, base_url: &Url) -> Vec<MediaVariant> {
        let mut variants = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        let mut i = 0;
        while i < lines.len() {
            let line = lines[i].trim();

            if line.starts_with("#EXT-X-STREAM-INF:") {
                let attrs = &line["#EXT-X-STREAM-INF:".len()..];
                let bandwidth = Self::parse_attribute(attrs, "BANDWIDTH")
                    .and_then(|v| v.parse::<u64>().ok());
                let (width, height) = Self::parse_resolution(attrs);
                let codecs = Self::parse_attribute(attrs, "CODECS");

                // Next non-comment, non-empty line is the variant URL
                i += 1;
                while i < lines.len() {
                    let next = lines[i].trim();
                    if !next.is_empty() && !next.starts_with('#') {
                        let variant_url = Self::resolve_url(base_url, next);
                        let label = Self::build_label(width, height, bandwidth);

                        variants.push(MediaVariant {
                            url: variant_url,
                            label,
                            width,
                            height,
                            bandwidth,
                            codecs,
                            audio_only: width.is_none() && height.is_none(),
                            estimated_size: None,
                        });
                        break;
                    }
                    i += 1;
                }
            }

            i += 1;
        }

        // Sort by bandwidth descending (best quality first)
        variants.sort_by(|a, b| b.bandwidth.unwrap_or(0).cmp(&a.bandwidth.unwrap_or(0)));
        variants
    }

    /// Parse a media playlist into segment URLs.
    fn parse_media_playlist(content: &str, base_url: &Url) -> Vec<String> {
        let mut segments = Vec::new();

        for line in content.lines() {
            let line = line.trim();
            // Skip empty lines and comments
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            // This is a segment URL
            segments.push(Self::resolve_url(base_url, line));
        }

        segments
    }

    /// Resolve a potentially relative URL against a base URL.
    fn resolve_url(base: &Url, relative: &str) -> String {
        if relative.starts_with("http://") || relative.starts_with("https://") {
            return relative.to_string();
        }
        base.join(relative)
            .map(|u| u.to_string())
            .unwrap_or_else(|_| relative.to_string())
    }

    /// Parse a named attribute from an EXT-X-STREAM-INF line.
    fn parse_attribute(attrs: &str, name: &str) -> Option<String> {
        let prefix = format!("{}=", name);
        for part in Self::split_attributes(attrs) {
            let part = part.trim();
            if part.starts_with(&prefix) {
                let value = &part[prefix.len()..];
                // Strip quotes if present
                return Some(value.trim_matches('"').to_string());
            }
        }
        None
    }

    /// Split attribute string respecting quoted values.
    fn split_attributes(s: &str) -> Vec<String> {
        let mut parts = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;

        for ch in s.chars() {
            match ch {
                '"' => {
                    in_quotes = !in_quotes;
                    current.push(ch);
                }
                ',' if !in_quotes => {
                    parts.push(current.clone());
                    current.clear();
                }
                _ => current.push(ch),
            }
        }
        if !current.is_empty() {
            parts.push(current);
        }
        parts
    }

    /// Parse RESOLUTION=WIDTHxHEIGHT attribute.
    fn parse_resolution(attrs: &str) -> (Option<u32>, Option<u32>) {
        if let Some(res) = Self::parse_attribute(attrs, "RESOLUTION") {
            let parts: Vec<&str> = res.split('x').collect();
            if parts.len() == 2 {
                let w = parts[0].parse::<u32>().ok();
                let h = parts[1].parse::<u32>().ok();
                return (w, h);
            }
        }
        (None, None)
    }

    /// Build a human-readable label from variant attributes.
    fn build_label(_width: Option<u32>, height: Option<u32>, bandwidth: Option<u64>) -> String {
        if let Some(h) = height {
            return format!("{}p", h);
        }
        if let Some(bw) = bandwidth {
            if bw > 1_000_000 {
                return format!("{:.1} Mbps", bw as f64 / 1_000_000.0);
            }
            return format!("{} kbps", bw / 1000);
        }
        "Unknown".to_string()
    }
}

#[async_trait::async_trait]
impl ProtocolHandler for HlsHandler {
    fn protocol(&self) -> MediaProtocol {
        MediaProtocol::Hls
    }

    async fn resolve_variants(
        &self,
        url: &str,
        headers: &[(String, String)],
    ) -> Result<Vec<MediaVariant>, DlmanError> {
        let content = self.fetch_playlist(url, headers).await?;
        let base_url = Url::parse(url).map_err(|e| DlmanError::InvalidUrl(e.to_string()))?;

        if Self::is_master_playlist(&content) {
            let variants = Self::parse_master_playlist(&content, &base_url);
            if variants.is_empty() {
                return Err(DlmanError::InvalidOperation(
                    "No variants found in HLS master playlist".to_string(),
                ));
            }
            Ok(variants)
        } else {
            // Single-variant media playlist — treat as one quality
            Ok(vec![MediaVariant {
                url: url.to_string(),
                label: "Default".to_string(),
                width: None,
                height: None,
                bandwidth: None,
                codecs: None,
                audio_only: false,
                estimated_size: None,
            }])
        }
    }

    async fn get_segment_urls(
        &self,
        variant: &MediaVariant,
        headers: &[(String, String)],
    ) -> Result<Vec<String>, DlmanError> {
        let content = self.fetch_playlist(&variant.url, headers).await?;
        let base_url =
            Url::parse(&variant.url).map_err(|e| DlmanError::InvalidUrl(e.to_string()))?;

        // If this is still a master playlist, we need to fetch the actual media playlist
        if Self::is_master_playlist(&content) {
            let variants = Self::parse_master_playlist(&content, &base_url);
            if let Some(first) = variants.first() {
                let media_content = self.fetch_playlist(&first.url, headers).await?;
                let media_base =
                    Url::parse(&first.url).map_err(|e| DlmanError::InvalidUrl(e.to_string()))?;
                return Ok(Self::parse_media_playlist(&media_content, &media_base));
            }
            return Err(DlmanError::InvalidOperation(
                "Empty HLS master playlist".to_string(),
            ));
        }

        Ok(Self::parse_media_playlist(&content, &base_url))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MASTER_PLAYLIST: &str = r#"#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=640000,RESOLUTION=640x360,CODECS="avc1.42c01e,mp4a.40.2"
360p.m3u8
"#;

    const MEDIA_PLAYLIST: &str = r#"#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-VERSION:3
#EXTINF:9.009,
segment001.ts
#EXTINF:9.009,
segment002.ts
#EXTINF:3.003,
segment003.ts
#EXT-X-ENDLIST
"#;

    #[test]
    fn test_is_master_playlist() {
        assert!(HlsHandler::is_master_playlist(MASTER_PLAYLIST));
        assert!(!HlsHandler::is_master_playlist(MEDIA_PLAYLIST));
    }

    #[test]
    fn test_parse_master_playlist() {
        let base = Url::parse("https://example.com/stream/master.m3u8").unwrap();
        let variants = HlsHandler::parse_master_playlist(MASTER_PLAYLIST, &base);

        assert_eq!(variants.len(), 3);
        // Should be sorted by bandwidth descending
        assert_eq!(variants[0].label, "1080p");
        assert_eq!(variants[0].bandwidth, Some(2560000));
        assert_eq!(variants[1].label, "720p");
        assert_eq!(variants[2].label, "360p");
        assert!(variants[0].url.contains("1080p.m3u8"));
    }

    #[test]
    fn test_parse_media_playlist() {
        let base = Url::parse("https://example.com/stream/720p.m3u8").unwrap();
        let segments = HlsHandler::parse_media_playlist(MEDIA_PLAYLIST, &base);

        assert_eq!(segments.len(), 3);
        assert!(segments[0].ends_with("segment001.ts"));
        assert!(segments[1].ends_with("segment002.ts"));
        assert!(segments[2].ends_with("segment003.ts"));
    }

    #[test]
    fn test_parse_resolution() {
        let (w, h) = HlsHandler::parse_resolution("BANDWIDTH=1280000,RESOLUTION=1920x1080");
        assert_eq!(w, Some(1920));
        assert_eq!(h, Some(1080));
    }

    #[test]
    fn test_build_label() {
        assert_eq!(HlsHandler::build_label(Some(1920), Some(1080), Some(5000000)), "1080p");
        assert_eq!(HlsHandler::build_label(None, None, Some(2560000)), "2.6 Mbps");
        assert_eq!(HlsHandler::build_label(None, None, Some(640000)), "640 kbps");
        assert_eq!(HlsHandler::build_label(None, None, None), "Unknown");
    }
}
