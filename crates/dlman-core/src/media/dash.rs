//! DASH (MPD) Protocol Handler
//!
//! Parses MPD XML manifests to extract quality variants and segment URLs.
//! Uses quick-xml for lightweight XML parsing.

use crate::error::DlmanError;
use crate::media::ProtocolHandler;
use dlman_types::{MediaProtocol, MediaVariant};
use quick_xml::events::Event;
use quick_xml::Reader;
use url::Url;

pub struct DashHandler {
    client: reqwest::Client,
}

impl DashHandler {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }

    async fn fetch_mpd(
        &self,
        url: &str,
        headers: &[(String, String)],
    ) -> Result<String, DlmanError> {
        let mut req = self.client.get(url);
        for (k, v) in headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let resp = req.send().await?;
        if !resp.status().is_success() {
            return Err(DlmanError::ServerError {
                status: resp.status().as_u16(),
                message: format!("Failed to fetch MPD: {url}"),
            });
        }
        Ok(resp.text().await?)
    }
}

// ── Parsed intermediate structs ──────────────────────────────────────────

#[derive(Debug, Default, Clone)]
struct Representation {
    id: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    bandwidth: Option<u64>,
    codecs: Option<String>,
    mime_type: Option<String>,
    base_url: Option<String>,
    /// SegmentTemplate media pattern (e.g. "seg-$Number$.m4s")
    seg_tpl_media: Option<String>,
    /// SegmentTemplate init pattern
    seg_tpl_init: Option<String>,
    seg_tpl_start: u64,
    seg_tpl_timescale: u64,
    seg_tpl_duration: u64,
    /// Explicit SegmentList URLs
    segment_urls: Vec<String>,
}

#[derive(Debug, Default, Clone)]
struct AdaptationSet {
    mime_type: Option<String>,
    codecs: Option<String>,
    /// Inherited SegmentTemplate at AdaptationSet level
    seg_tpl_media: Option<String>,
    seg_tpl_init: Option<String>,
    seg_tpl_start: u64,
    seg_tpl_timescale: u64,
    seg_tpl_duration: u64,
    representations: Vec<Representation>,
}

// ── XML Parsing ──────────────────────────────────────────────────────────

fn parse_mpd(xml: &str) -> Result<(Vec<AdaptationSet>, f64), DlmanError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut adaptation_sets: Vec<AdaptationSet> = Vec::new();
    let mut current_as: Option<AdaptationSet> = None;
    let mut current_rep: Option<Representation> = None;
    let mut in_segment_list = false;
    let mut duration_secs: f64 = 0.0;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => break,
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "MPD" => {
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"mediaPresentationDuration" {
                                let val = String::from_utf8_lossy(&attr.value);
                                duration_secs = parse_iso8601_duration(&val);
                            }
                        }
                    }
                    "AdaptationSet" => {
                        let mut a = AdaptationSet::default();
                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref();
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            match key {
                                b"mimeType" => a.mime_type = Some(val),
                                b"codecs" => a.codecs = Some(val),
                                _ => {}
                            }
                        }
                        current_as = Some(a);
                    }
                    "Representation" => {
                        let mut r = Representation::default();
                        // Inherit from AdaptationSet
                        if let Some(ref a) = current_as {
                            r.mime_type = a.mime_type.clone();
                            r.codecs = a.codecs.clone();
                            r.seg_tpl_media = a.seg_tpl_media.clone();
                            r.seg_tpl_init = a.seg_tpl_init.clone();
                            r.seg_tpl_start = a.seg_tpl_start;
                            r.seg_tpl_timescale = a.seg_tpl_timescale;
                            r.seg_tpl_duration = a.seg_tpl_duration;
                        }
                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref();
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            match key {
                                b"id" => r.id = Some(val),
                                b"width" => r.width = val.parse().ok(),
                                b"height" => r.height = val.parse().ok(),
                                b"bandwidth" => r.bandwidth = val.parse().ok(),
                                b"codecs" => r.codecs = Some(val),
                                b"mimeType" => r.mime_type = Some(val),
                                _ => {}
                            }
                        }
                        current_rep = Some(r);
                    }
                    "SegmentTemplate" => {
                        let mut target = if current_rep.is_some() {
                            current_rep.as_mut()
                        } else {
                            None
                        };
                        for attr in e.attributes().flatten() {
                            let key = attr.key.as_ref();
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            match key {
                                b"media" => {
                                    if let Some(ref mut r) = target {
                                        r.seg_tpl_media = Some(val.clone());
                                    }
                                    if let Some(ref mut a) = current_as {
                                        a.seg_tpl_media = Some(val);
                                    }
                                }
                                b"initialization" => {
                                    if let Some(ref mut r) = target {
                                        r.seg_tpl_init = Some(val.clone());
                                    }
                                    if let Some(ref mut a) = current_as {
                                        a.seg_tpl_init = Some(val);
                                    }
                                }
                                b"startNumber" => {
                                    let n = val.parse().unwrap_or(1);
                                    if let Some(ref mut r) = target {
                                        r.seg_tpl_start = n;
                                    }
                                    if let Some(ref mut a) = current_as {
                                        a.seg_tpl_start = n;
                                    }
                                }
                                b"timescale" => {
                                    let n = val.parse().unwrap_or(1);
                                    if let Some(ref mut r) = target {
                                        r.seg_tpl_timescale = n;
                                    }
                                    if let Some(ref mut a) = current_as {
                                        a.seg_tpl_timescale = n;
                                    }
                                }
                                b"duration" => {
                                    let n = val.parse().unwrap_or(0);
                                    if let Some(ref mut r) = target {
                                        r.seg_tpl_duration = n;
                                    }
                                    if let Some(ref mut a) = current_as {
                                        a.seg_tpl_duration = n;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    "BaseURL" => { /* text content handled in Event::Text */ }
                    "SegmentList" => {
                        in_segment_list = true;
                    }
                    "SegmentURL" => {
                        if in_segment_list {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"media" {
                                    let val =
                                        String::from_utf8_lossy(&attr.value).to_string();
                                    if let Some(ref mut r) = current_rep {
                                        r.segment_urls.push(val);
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref t)) => {
                let text = t.unescape().unwrap_or_default().to_string();
                if !text.trim().is_empty() {
                    if let Some(ref mut r) = current_rep {
                        r.base_url = Some(text.trim().to_string());
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "Representation" => {
                        if let Some(r) = current_rep.take() {
                            if let Some(ref mut a) = current_as {
                                a.representations.push(r);
                            }
                        }
                    }
                    "AdaptationSet" => {
                        if let Some(a) = current_as.take() {
                            adaptation_sets.push(a);
                        }
                    }
                    "SegmentList" => {
                        in_segment_list = false;
                    }
                    _ => {}
                }
            }
            Err(e) => {
                return Err(DlmanError::InvalidOperation(
                    format!("MPD XML parse error: {e}"),
                ));
            }
            _ => {}
        }
        buf.clear();
    }

    Ok((adaptation_sets, duration_secs))
}

/// Parse ISO 8601 duration like "PT1H2M3.4S" into seconds.
fn parse_iso8601_duration(s: &str) -> f64 {
    let s = s.trim().trim_start_matches("PT").trim_start_matches("P");
    let mut secs = 0.0f64;
    let mut num_buf = String::new();
    for ch in s.chars() {
        match ch {
            'H' | 'h' => {
                secs += num_buf.parse::<f64>().unwrap_or(0.0) * 3600.0;
                num_buf.clear();
            }
            'M' | 'm' => {
                secs += num_buf.parse::<f64>().unwrap_or(0.0) * 60.0;
                num_buf.clear();
            }
            'S' | 's' => {
                secs += num_buf.parse::<f64>().unwrap_or(0.0);
                num_buf.clear();
            }
            _ => num_buf.push(ch),
        }
    }
    secs
}

/// Resolve a possibly-relative URL against a base.
fn resolve_url(base: &str, relative: &str) -> Result<String, DlmanError> {
    if relative.starts_with("http://") || relative.starts_with("https://") {
        return Ok(relative.to_string());
    }
    let base_url = Url::parse(base)
        .map_err(|e| DlmanError::InvalidOperation(format!("Bad base URL: {e}")))?;
    let resolved = base_url
        .join(relative)
        .map_err(|e| DlmanError::InvalidOperation(format!("URL resolution failed: {e}")))?;
    Ok(resolved.to_string())
}

/// Expand SegmentTemplate pattern ($Number$, $RepresentationID$, $Bandwidth$).
fn expand_template(tpl: &str, number: u64, rep_id: &str, bandwidth: u64) -> String {
    tpl.replace("$Number$", &number.to_string())
        .replace("$RepresentationID$", rep_id)
        .replace("$Bandwidth$", &bandwidth.to_string())
}

fn build_label(r: &Representation) -> String {
    if let Some(h) = r.height {
        return format!("{h}p");
    }
    if let Some(ref mime) = r.mime_type {
        if mime.starts_with("audio") {
            if let Some(bw) = r.bandwidth {
                return format!("Audio {}kbps", bw / 1000);
            }
            return "Audio".to_string();
        }
    }
    if let Some(bw) = r.bandwidth {
        return format!("{}kbps", bw / 1000);
    }
    r.id.clone().unwrap_or_else(|| "Unknown".to_string())
}

// ── ProtocolHandler impl ─────────────────────────────────────────────────

#[async_trait::async_trait]
impl ProtocolHandler for DashHandler {
    fn protocol(&self) -> MediaProtocol {
        MediaProtocol::Dash
    }

    async fn resolve_variants(
        &self,
        url: &str,
        headers: &[(String, String)],
    ) -> Result<Vec<MediaVariant>, DlmanError> {
        let xml = self.fetch_mpd(url, headers).await?;
        let (adaptation_sets, _duration) = parse_mpd(&xml)?;

        let mut variants = Vec::new();
        for a_set in &adaptation_sets {
            for rep in &a_set.representations {
                let is_audio = rep
                    .mime_type
                    .as_deref()
                    .map(|m| m.starts_with("audio"))
                    .unwrap_or(false);

                let variant_url = if let Some(ref bu) = rep.base_url {
                    resolve_url(url, bu)?
                } else {
                    url.to_string()
                };

                variants.push(MediaVariant {
                    url: variant_url,
                    label: build_label(rep),
                    width: rep.width,
                    height: rep.height,
                    bandwidth: rep.bandwidth,
                    codecs: rep.codecs.clone(),
                    audio_only: is_audio,
                    estimated_size: None,
                });
            }
        }

        // Sort: video by height desc, audio last
        variants.sort_by(|a, b| {
            let va = !a.audio_only;
            let vb = !b.audio_only;
            vb.cmp(&va)
                .then_with(|| b.height.unwrap_or(0).cmp(&a.height.unwrap_or(0)))
                .then_with(|| b.bandwidth.unwrap_or(0).cmp(&a.bandwidth.unwrap_or(0)))
        });

        Ok(variants)
    }

    async fn get_segment_urls(
        &self,
        variant: &MediaVariant,
        headers: &[(String, String)],
    ) -> Result<Vec<String>, DlmanError> {
        let mpd_url = &variant.url;

        // If variant URL is a direct media file (BaseURL case), return it
        if !mpd_url.ends_with(".mpd") && !mpd_url.contains(".mpd?") {
            return Ok(vec![mpd_url.clone()]);
        }

        let xml = self.fetch_mpd(mpd_url, headers).await?;
        let (adaptation_sets, duration) = parse_mpd(&xml)?;

        // Find matching representation
        for a_set in &adaptation_sets {
            for rep in &a_set.representations {
                let matches = rep.height == variant.height
                    && rep.bandwidth == variant.bandwidth
                    && rep.codecs == variant.codecs;
                if !matches {
                    continue;
                }

                let rep_id = rep.id.as_deref().unwrap_or("1");
                let bw = rep.bandwidth.unwrap_or(0);
                let mut urls = Vec::new();

                // SegmentTemplate with duration
                if let Some(ref media_tpl) = rep.seg_tpl_media {
                    let timescale = if rep.seg_tpl_timescale > 0 {
                        rep.seg_tpl_timescale
                    } else {
                        1
                    };

                    if let Some(ref init_tpl) = rep.seg_tpl_init {
                        let init = expand_template(init_tpl, 0, rep_id, bw);
                        urls.push(resolve_url(mpd_url, &init)?);
                    }

                    if rep.seg_tpl_duration > 0 && duration > 0.0 {
                        let seg_dur_secs =
                            rep.seg_tpl_duration as f64 / timescale as f64;
                        let seg_count = (duration / seg_dur_secs).ceil() as u64;
                        let start = if rep.seg_tpl_start > 0 {
                            rep.seg_tpl_start
                        } else {
                            1
                        };

                        for i in 0..seg_count {
                            let num = start + i;
                            let seg = expand_template(media_tpl, num, rep_id, bw);
                            urls.push(resolve_url(mpd_url, &seg)?);
                        }
                    }

                    if !urls.is_empty() {
                        return Ok(urls);
                    }
                }

                // SegmentList
                if !rep.segment_urls.is_empty() {
                    for seg_url in &rep.segment_urls {
                        urls.push(resolve_url(mpd_url, seg_url)?);
                    }
                    return Ok(urls);
                }

                // BaseURL (single file)
                if let Some(ref bu) = rep.base_url {
                    return Ok(vec![resolve_url(mpd_url, bu)?]);
                }
            }
        }

        Err(DlmanError::InvalidOperation(
            "Could not find matching DASH representation".to_string(),
        ))
    }
}

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iso8601_duration() {
        assert!((parse_iso8601_duration("PT1H2M3.5S") - 3723.5).abs() < 0.01);
        assert!((parse_iso8601_duration("PT30S") - 30.0).abs() < 0.01);
        assert!((parse_iso8601_duration("PT2M") - 120.0).abs() < 0.01);
    }

    #[test]
    fn test_expand_template() {
        let tpl = "video/$RepresentationID$/seg-$Number$.m4s";
        let result = expand_template(tpl, 5, "v1", 2000000);
        assert_eq!(result, "video/v1/seg-5.m4s");
    }

    #[test]
    fn test_parse_simple_mpd() {
        let xml = r#"<?xml version="1.0"?>
<MPD mediaPresentationDuration="PT10S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <SegmentTemplate media="seg-$Number$.m4s" initialization="init.m4s" startNumber="1" timescale="1000" duration="2000"/>
      <Representation id="720" bandwidth="1500000" width="1280" height="720" codecs="avc1.4d401f"/>
      <Representation id="480" bandwidth="800000" width="854" height="480" codecs="avc1.4d401e"/>
    </AdaptationSet>
  </Period>
</MPD>"#;
        let (sets, dur) = parse_mpd(xml).unwrap();
        assert!((dur - 10.0).abs() < 0.01);
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].representations.len(), 2);
        assert_eq!(sets[0].representations[0].height, Some(720));
        assert_eq!(sets[0].representations[1].height, Some(480));
    }

    #[test]
    fn test_build_label() {
        let r = Representation {
            height: Some(1080),
            ..Default::default()
        };
        assert_eq!(build_label(&r), "1080p");

        let r2 = Representation {
            mime_type: Some("audio/mp4".to_string()),
            bandwidth: Some(128000),
            ..Default::default()
        };
        assert_eq!(build_label(&r2), "Audio 128kbps");
    }
}
