//! YouTube / Facebook / TikTok: the video file(s) behind a page link.
//!
//! Same recipe as the Tarteel Video app's link import:
//! - YouTube: the InnerTube `player` API as the Android app (then iOS) — plain
//!   googlevideo URLs, no signature deciphering, no JS.
//! - Facebook / TikTok: fetch the page like a desktop browser and read the media
//!   URL out of its inline JSON (yt-dlp's route). TikTok's file needs the
//!   `tt_chain_token` cookie its page sets, plus a Referer.
//!
//! Anonymous on purpose: the user's own cookies are never sent, so only public
//! videos work. Every request stays on the site's own hosts.

use crate::error::DlmanError;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

/// One downloadable choice for a video.
#[derive(Debug, Clone, Serialize)]
pub struct SocialFormat {
    pub id: String,
    pub label: String,
    pub size: Option<u64>,
    #[serde(skip)]
    pub video_url: String,
    /// Separate audio track to merge with `video_url` (YouTube above 360p).
    #[serde(skip)]
    pub audio_url: Option<String>,
    /// Extension of `video_url`'s file ("mp4" / "m4a").
    #[serde(skip)]
    pub ext: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SocialVideo {
    pub site: String,
    pub title: String,
    pub formats: Vec<SocialFormat>,
    /// Headers the media server wants back (TikTok).
    #[serde(skip)]
    pub referrer: Option<String>,
    #[serde(skip)]
    pub cookies: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Site {
    YouTube,
    Facebook,
    TikTok,
}

const YT_HOSTS: &[&str] = &["youtube.com", "youtu.be", "youtube-nocookie.com"];
const FB_HOSTS: &[&str] = &["facebook.com", "fb.watch", "fb.com"];
const TT_HOSTS: &[&str] = &["tiktok.com"];

const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

pub fn host_on(host: &str, domains: &[&str]) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    domains.iter().any(|d| h == *d || h.ends_with(&format!(".{d}")))
}

pub fn site_of(url: &url::Url) -> Option<Site> {
    let host = url.host_str()?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return None;
    }
    if host_on(host, YT_HOSTS) {
        Some(Site::YouTube)
    } else if host_on(host, FB_HOSTS) {
        Some(Site::Facebook)
    } else if host_on(host, TT_HOSTS) {
        Some(Site::TikTok)
    } else {
        None
    }
}

fn site_hosts(site: Site) -> &'static [&'static str] {
    match site {
        Site::YouTube => YT_HOSTS,
        Site::Facebook => FB_HOSTS,
        Site::TikTok => TT_HOSTS,
    }
}

fn media_hosts(site: Site) -> &'static [&'static str] {
    match site {
        Site::YouTube => &["googlevideo.com"],
        Site::Facebook => &["fbcdn.net"],
        Site::TikTok => &["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com"],
    }
}

fn media_ok(site: Site, u: &str) -> bool {
    url::Url::parse(u)
        .ok()
        .filter(|u| u.scheme() == "https" && u.username().is_empty())
        .and_then(|u| u.host_str().map(|h| host_on(h, media_hosts(site))))
        .unwrap_or(false)
}

/// The formats behind `page` (a YouTube / Facebook / TikTok link).
pub async fn resolve(page: &str) -> Result<SocialVideo, DlmanError> {
    let url = url::Url::parse(page).map_err(|_| DlmanError::InvalidUrl(page.to_string()))?;
    let site = site_of(&url).ok_or_else(|| DlmanError::InvalidUrl(page.to_string()))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        // A redirect may only stay on the site (vm.tiktok.com → www.tiktok.com).
        .redirect(reqwest::redirect::Policy::custom(move |a| {
            let ok = a.previous().len() < 10
                && a.url().host_str().map(|h| host_on(h, site_hosts(site))).unwrap_or(false);
            if ok { a.follow() } else { a.stop() }
        }))
        .build()
        .map_err(|e| DlmanError::Unknown(e.to_string()))?;
    let mut v = match site {
        Site::YouTube => youtube(&client, &url).await?,
        Site::Facebook => facebook(&client, &url).await?,
        Site::TikTok => tiktok(&client, &url).await?,
    };
    v.formats.retain(|f| {
        media_ok(site, &f.video_url) && f.audio_url.as_deref().map_or(true, |a| media_ok(site, a))
    });
    if v.formats.is_empty() {
        return Err(DlmanError::Unknown("No downloadable video found (private, login-only or removed?)".into()));
    }
    Ok(v)
}

fn err(msg: impl Into<String>) -> DlmanError {
    DlmanError::Unknown(msg.into())
}

// ---------------------------------------------------------------------------
// YouTube

/// The 11-character id in a YouTube link.
pub fn youtube_id(url: &url::Url) -> Option<String> {
    let ok = |s: &str| s.len() == 11 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    let host = url.host_str()?.to_ascii_lowercase();
    let segs: Vec<&str> = url.path_segments()?.filter(|s| !s.is_empty()).collect();
    let id = if host_on(&host, &["youtu.be"]) {
        segs.first().map(|s| s.to_string())
    } else if let Some((_, v)) = url.query_pairs().find(|(k, _)| k == "v") {
        Some(v.into_owned())
    } else if segs.len() >= 2 && ["shorts", "live", "embed", "v"].contains(&segs[0]) {
        Some(segs[1].to_string())
    } else {
        None
    }?;
    ok(&id).then_some(id)
}

/// (clientName, clientVersion, user agent, X-YouTube-Client-Name, extra client fields)
const YT_CLIENTS: &[(&str, &str, &str, &str, &[(&str, &str)])] = &[
    (
        "ANDROID",
        "20.10.38",
        "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
        "3",
        &[("osName", "Android"), ("osVersion", "11")],
    ),
    (
        "IOS",
        "20.10.4",
        "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        "5",
        &[("deviceMake", "Apple"), ("deviceModel", "iPhone16,2"), ("osName", "iPhone"), ("osVersion", "18.3.2.22D82")],
    ),
];

async fn youtube(client: &reqwest::Client, url: &url::Url) -> Result<SocialVideo, DlmanError> {
    let id = youtube_id(url).ok_or_else(|| err("Not a YouTube video link"))?;
    // yt-dlp first: YouTube now cuts the Android/iOS player URLs off after the first
    // MB on longer videos (no PO token), and yt-dlp solves the web player's JS check.
    // yt-dlp's error, kept: when the built-in route fails too, it's the useful one to show.
    let mut ytdlp_err = None;
    if let Some(ytdlp) = find_tool("yt-dlp") {
        match youtube_ytdlp(&ytdlp, &id).await {
            Ok(v) => return Ok(v),
            // An outdated yt-dlp (or no deno): the built-in route still serves short videos.
            Err(e) => {
                tracing::warn!("[social] yt-dlp YouTube: {e}");
                ytdlp_err = Some(e);
            }
        }
    }
    // ponytail: without a working yt-dlp only short videos download fully (Tarteel's InnerTube
    // route; fetch_ranged / the segment engine report the cut-off rather than finishing short).
    let r = youtube_innertube(client, &id).await;
    match (r, ytdlp_err) {
        (Ok(v), _) => Ok(v),
        (Err(_), Some(e)) => Err(e),
        (Err(e), None) => Err(e),
    }
}

async fn youtube_innertube(client: &reqwest::Client, id: &str) -> Result<SocialVideo, DlmanError> {
    let mut last = err("YouTube refused every client");
    for (name, version, ua, num, extra) in YT_CLIENTS {
        let mut c = serde_json::json!({
            "clientName": name, "clientVersion": version, "hl": "en", "timeZone": "UTC", "utcOffsetMinutes": 0,
        });
        for (k, v) in extra.iter() {
            c[*k] = Value::from(*v);
        }
        let body = serde_json::json!({"videoId": id, "context": {"client": c}, "contentCheckOk": true, "racyCheckOk": true});
        let res = client
            .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .header("user-agent", *ua)
            .header("origin", "https://www.youtube.com")
            .header("x-youtube-client-name", *num)
            .header("x-youtube-client-version", *version)
            .json(&body)
            .send()
            .await?;
        if !res.status().is_success() {
            last = err(format!("YouTube answered HTTP {}", res.status()));
            continue;
        }
        let j: Value = res.json().await?;
        match youtube_formats(&j) {
            Ok(v) => return Ok(v),
            Err(e) => last = e,
        }
    }
    Err(last)
}

async fn youtube_ytdlp(ytdlp: &std::path::Path, id: &str) -> Result<SocialVideo, DlmanError> {
    // id is checked: [A-Za-z0-9_-]{11}
    let j = run_ytdlp(ytdlp, &format!("https://www.youtube.com/watch?v={id}")).await?;
    youtube_formats(&ytdlp_as_player(&j))
}

/// `yt-dlp -J <url>`; `url` must already be a checked site link.
async fn run_ytdlp(ytdlp: &std::path::Path, url: &str) -> Result<Value, DlmanError> {
    // A GUI app's PATH lacks Homebrew's, where yt-dlp finds deno for the JS challenge.
    let path = std::env::join_paths(
        ["/opt/homebrew/bin", "/usr/local/bin"].iter().map(std::path::PathBuf::from)
            .chain(std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())),
    ).unwrap_or_default();
    let mut cmd = tokio::process::Command::new(ytdlp);
    cmd.args(["-J", "--no-warnings", "--no-playlist", "--ignore-config", "--"])
        .arg(url)
        .env("PATH", path)
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    let out = tokio::time::timeout(Duration::from_secs(30), cmd.output())
        .await
        .map_err(|_| err("yt-dlp took too long"))??;
    if !out.status.success() {
        let e = String::from_utf8_lossy(&out.stderr);
        let line = e.lines().rev().find(|l| l.contains("ERROR")).unwrap_or("failed");
        return Err(err(format!("yt-dlp: {}", line.trim_start_matches("ERROR: ").chars().take(200).collect::<String>())));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| err(format!("yt-dlp output: {e}")))
}

/// TikTok via yt-dlp: the plain H.264 files (play everywhere), best first, with the
/// cookies + Referer the CDN wants. yt-dlp's cookie string is a Set-Cookie dump: keep name=value pairs.
fn tiktok_from_ytdlp(j: &Value) -> Option<SocialVideo> {
    let mut fs: Vec<&Value> = j["formats"]
        .as_array()?
        .iter()
        .filter(|f| f["protocol"] == "https" && f["vcodec"].as_str().map_or(false, |c| c.starts_with("h264")) && f["acodec"] != "none")
        .collect();
    fs.sort_by_key(|f| std::cmp::Reverse((f["height"].as_u64().unwrap_or(0), f["tbr"].as_f64().unwrap_or(0.0) as u64)));
    let best = *fs.first()?;
    let attrs = ["domain", "path", "expires", "max-age", "secure", "httponly", "samesite"];
    let cookies = best["cookies"]
        .as_str()
        .unwrap_or("")
        .split(';')
        .filter_map(|p| p.trim().split_once('='))
        .filter(|(k, v)| !attrs.contains(&k.to_ascii_lowercase().as_str()) && !k.is_empty() && !v.is_empty())
        // Set-Cookie quotes some values ("QVqx…=="); the CDN 403s on the quoted form.
        .map(|(k, v)| format!("{}={}", k.trim(), v.trim().trim_matches('"')))
        .collect::<Vec<_>>()
        .join("; ");
    let title = j["title"].as_str().or(j["description"].as_str()).unwrap_or("TikTok video");
    Some(SocialVideo {
        site: "TikTok".into(),
        title: title.chars().filter(|c| !c.is_control()).take(120).collect(),
        formats: vec![SocialFormat {
            id: "tt-play".into(),
            label: best["height"].as_u64().map_or("Original".into(), |h| format!("{h}p · original")),
            size: best["filesize"].as_u64(),
            video_url: best["url"].as_str()?.to_string(),
            audio_url: None,
            ext: "mp4".into(),
        }],
        referrer: Some(best["http_headers"]["Referer"].as_str().unwrap_or("https://www.tiktok.com/").to_string()),
        cookies: (!cookies.is_empty()).then_some(cookies),
    })
}

/// yt-dlp's `-J` in the shape of an InnerTube `player` answer, so one picker serves both.
pub fn ytdlp_as_player(j: &Value) -> Value {
    let (mut muxed, mut adaptive) = (vec![], vec![]);
    let has_original = j["formats"].as_array().into_iter().flatten()
        .any(|g| g["format_note"].as_str().map_or(false, |n| n.contains("original")));
    for f in j["formats"].as_array().into_iter().flatten() {
        // Plain https files only. "140-drc" is skipped; multi-language videos name
        // tracks "140-0", "140-1"… — only the "original" one is kept (else the "default").
        let id = f["format_id"].as_str().unwrap_or("");
        let (base, suffix) = id.split_once('-').unwrap_or((id, ""));
        let Ok(itag) = base.parse::<u64>() else { continue };
        let note = f["format_note"].as_str().unwrap_or("");
        let dubbed = !suffix.is_empty() && !note.contains(if has_original { "original" } else { "default" });
        if f["protocol"] != "https" || suffix == "drc" || dubbed {
            continue;
        }
        let (v, a) = (f["vcodec"].as_str().unwrap_or("none"), f["acodec"].as_str().unwrap_or("none"));
        let kind = if v == "none" { "audio" } else { "video" };
        let codecs = [v, a].iter().filter(|c| **c != "none").cloned().collect::<Vec<_>>().join(", ");
        let size = f["filesize"].as_u64().or_else(|| f["filesize_approx"].as_u64());
        let x = serde_json::json!({
            "itag": itag,
            "url": f["url"],
            "mimeType": format!("{kind}/{}; codecs=\"{codecs}\"", f["ext"].as_str().unwrap_or("").replace("m4a", "mp4")),
            "height": f["height"],
            "contentLength": size.map(|n| n.to_string()),
            "bitrate": (f["tbr"].as_f64().unwrap_or(0.0) * 1000.0) as u64,
        });
        if v != "none" && a != "none" { muxed.push(x) } else { adaptive.push(x) }
    }
    let live = j["is_live"] == Value::Bool(true);
    serde_json::json!({
        "playabilityStatus": {"status": "OK"},
        "videoDetails": {"title": j["title"], "isLive": live},
        "streamingData": {"formats": muxed, "adaptiveFormats": adaptive},
    })
}

struct YtStream<'a> {
    itag: u64,
    url: &'a str,
    mime: &'a str,
    height: u64,
    bytes: Option<u64>,
    bitrate: u64,
}

fn yt_stream(f: &Value) -> Option<YtStream<'_>> {
    // Dubbed tracks are skipped; only the original audio.
    if f["audioTrack"]["audioIsDefault"] == Value::Bool(false) {
        return None;
    }
    Some(YtStream {
        itag: f["itag"].as_u64()?,
        url: f["url"].as_str()?, // (signatureCipher-only formats are skipped)
        mime: f["mimeType"].as_str()?,
        height: f["height"].as_u64().unwrap_or(0),
        bytes: f["contentLength"].as_str().and_then(|s| s.parse().ok()),
        bitrate: f["bitrate"].as_u64().unwrap_or(0),
    })
}

/// The choices in a `player` response: each height up to 4K as MP4 video + the
/// best AAC audio (merged after download), the muxed 360p MP4, and audio only.
pub fn youtube_formats(j: &Value) -> Result<SocialVideo, DlmanError> {
    let ps = &j["playabilityStatus"];
    if ps["status"] != "OK" {
        return Err(err(format!(
            "YouTube: {}",
            ps["reason"].as_str().unwrap_or(ps["status"].as_str().unwrap_or("unplayable"))
        )));
    }
    if j["videoDetails"]["isLive"] == Value::Bool(true) {
        return Err(err("YouTube: live streams can't be downloaded"));
    }
    let title = j["videoDetails"]["title"].as_str().unwrap_or("YouTube video").to_string();
    let sd = &j["streamingData"];
    let list = |k: &str| -> Vec<YtStream> {
        sd[k].as_array().map(|a| a.iter().filter_map(yt_stream).collect()).unwrap_or_default()
    };
    let (muxed, adaptive) = (list("formats"), list("adaptiveFormats"));

    let audio = adaptive
        .iter()
        .filter(|s| s.mime.starts_with("audio/mp4"))
        .max_by_key(|s| s.bitrate);
    let mut out = Vec::new();
    if let Some(a) = audio {
        let mut videos: Vec<&YtStream> = adaptive
            .iter()
            .filter(|s| s.mime.starts_with("video/mp4") && s.height > 0 && s.height <= 2160)
            .collect();
        // Per height: H.264 first (plays everywhere), then AV1; higher bitrate wins a tie.
        videos.sort_by_key(|s| (std::cmp::Reverse(s.height), !s.mime.contains("avc1"), std::cmp::Reverse(s.bitrate)));
        videos.dedup_by_key(|s| s.height);
        for v in videos {
            let codec = if v.mime.contains("avc1") { "H.264" } else if v.mime.contains("av01") { "AV1" } else { "MP4" };
            out.push(SocialFormat {
                id: format!("yt-v{}", v.itag),
                label: format!("{}p · {}", v.height, codec),
                size: v.bytes.zip(a.bytes).map(|(x, y)| x + y),
                video_url: v.url.to_string(),
                audio_url: Some(a.url.to_string()),
                ext: "mp4".into(),
            });
        }
    }
    if let Some(m) = muxed.iter().filter(|s| s.mime.starts_with("video/mp4")).max_by_key(|s| s.height) {
        out.push(SocialFormat {
            id: format!("yt-m{}", m.itag),
            label: format!("{}p · single file", m.height),
            size: m.bytes,
            video_url: m.url.to_string(),
            audio_url: None,
            ext: "mp4".into(),
        });
    }
    if let Some(a) = audio {
        out.push(SocialFormat {
            id: format!("yt-a{}", a.itag),
            label: "Audio only · M4A".into(),
            size: a.bytes,
            video_url: a.url.to_string(),
            audio_url: None,
            ext: "m4a".into(),
        });
    }
    if out.is_empty() {
        return Err(err("YouTube: no plain streams in the answer"));
    }
    Ok(SocialVideo { site: "YouTube".into(), title, formats: out, referrer: None, cookies: None })
}

// ---------------------------------------------------------------------------
// Facebook / TikTok page scraping

/// A page as a desktop browser asks for it (a non-HTML `accept` gets a page without the video JSON).
async fn page(client: &reqwest::Client, url: &str) -> Result<(String, reqwest::header::HeaderMap), DlmanError> {
    let res = client
        .get(url)
        .header("user-agent", CHROME_UA)
        .header("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("accept-language", "en-us,en;q=0.5")
        .header("sec-fetch-mode", "navigate")
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(err(format!("Page answered HTTP {}", res.status())));
    }
    let headers = res.headers().clone();
    let bytes = res.bytes().await?;
    if bytes.len() > 16 << 20 {
        return Err(err("Page too large"));
    }
    Ok((String::from_utf8_lossy(&bytes).into_owned(), headers))
}

/// The JSON string value after the first `"key":"` in `hay`, unescaped.
pub fn json_str_after(hay: &str, key: &str) -> Option<String> {
    let pat = format!("\"{key}\":\"");
    let start = hay.find(&pat)? + pat.len();
    let b = hay.as_bytes();
    let mut i = start;
    while i < b.len() && i - start < 8192 {
        match b[i] {
            b'\\' => i += 2,
            b'"' => return serde_json::from_str(&format!("\"{}\"", &hay[start..i])).ok(),
            _ => i += 1,
        }
    }
    None
}

fn html_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(p) = rest.find('&') {
        out.push_str(&rest[..p]);
        rest = &rest[p..];
        let end = rest.find(';').filter(|&e| e <= 10);
        let ent = end.map(|e| &rest[1..e]);
        let ch = match ent {
            Some("amp") => Some('&'),
            Some("quot") => Some('"'),
            Some("apos") => Some('\''),
            Some("lt") => Some('<'),
            Some("gt") => Some('>'),
            Some(e) if e.starts_with("#x") => u32::from_str_radix(&e[2..], 16).ok().and_then(char::from_u32),
            Some(e) if e.starts_with('#') => e[1..].parse().ok().and_then(char::from_u32),
            _ => None,
        };
        match (ch, end) {
            (Some(c), Some(e)) => {
                out.push(c);
                rest = &rest[e + 1..];
            }
            _ => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// og:title, without Facebook's " | 12K views · 300 reactions" parts.
fn og_title(html: &str) -> Option<String> {
    let pat = "property=\"og:title\" content=\"";
    let start = html.find(pat).map(|p| p + pat.len())?;
    let raw = &html[start..start + html[start..].find('"')?];
    html_unescape(raw)
        .split(" | ")
        .map(str::trim)
        .filter(|p| !p.is_empty() && p != &"Facebook" && !p.chars().next().unwrap().is_ascii_digit())
        .max_by_key(|p| p.len())
        .map(|p| p.chars().filter(|c| !c.is_control()).take(150).collect())
}

const FB_HD: &[&str] = &["browser_native_hd_url", "playable_url_quality_hd", "hd_src_no_ratelimit", "hd_src"];
const FB_SD: &[&str] = &["browser_native_sd_url", "playable_url", "sd_src_no_ratelimit", "sd_src"];

async fn facebook(client: &reqwest::Client, url: &url::Url) -> Result<SocialVideo, DlmanError> {
    let embed = format!(
        "https://www.facebook.com/plugins/video.php?href={}&show_text=false",
        urlencoding::encode(url.as_str())
    );
    let mut last = err("Facebook: no video in the page (private or login-only?)");
    for p in [url.to_string(), embed] {
        let html = match page(client, &p).await {
            Ok((h, _)) => h,
            Err(e) => {
                last = e;
                continue;
            }
        };
        let first = |keys: &[&str]| keys.iter().find_map(|k| json_str_after(&html, k));
        let (hd, sd) = (first(FB_HD), first(FB_SD));
        let mut formats = Vec::new();
        for (id, label, u) in [("fb-hd", "HD", hd), ("fb-sd", "SD", sd)] {
            if let Some(u) = u {
                formats.push(SocialFormat { id: id.into(), label: label.into(), size: None, video_url: u, audio_url: None, ext: "mp4".into() });
            }
        }
        if !formats.is_empty() {
            let title = og_title(&html).unwrap_or_else(|| "Facebook video".into());
            return Ok(SocialVideo { site: "Facebook".into(), title, formats, referrer: None, cookies: None });
        }
    }
    Err(last)
}

async fn tiktok(client: &reqwest::Client, url: &url::Url) -> Result<SocialVideo, DlmanError> {
    // yt-dlp first (its TikTok API route is steady; the page sometimes comes back empty).
    if let Some(ytdlp) = find_tool("yt-dlp") {
        for _ in 0..2 {
            match run_ytdlp(&ytdlp, url.as_str()).await {
                Ok(j) => match tiktok_from_ytdlp(&j) {
                    Some(v) => return Ok(v),
                    None => break, // same answer next time: no H.264 file (photo post?)
                },
                Err(e) => tracing::warn!("[social] yt-dlp TikTok: {e}"),
            }
        }
    }
    // TikTok now and then answers with an empty app shell: try again, then the
    // page by id (a share link that lands elsewhere loses it) — Tarteel's steps.
    let mut got = None;
    let mut last = err("TikTok: no video in the page (private, photo post or removed?)");
    for attempt in 0..3 {
        let target = match attempt {
            2 => match url.path().split('/').skip_while(|s| *s != "video").nth(1) {
                Some(id) if id.len() >= 15 && id.bytes().all(|b| b.is_ascii_digit()) => format!("https://www.tiktok.com/@/video/{id}"),
                _ => continue,
            },
            _ => url.to_string(),
        };
        match page(client, &target).await {
            Ok((h, hd)) if h.contains("\"playAddr\"") => {
                got = Some((h, hd));
                break;
            }
            Ok(_) => {}
            Err(e) => last = e,
        }
    }
    let (html, headers) = got.ok_or(last)?;
    let token = headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(|c| c.strip_prefix("tt_chain_token=").map(|v| v.split(';').next().unwrap_or("").to_string()))
        .filter(|t| !t.is_empty() && t.bytes().all(|b| b.is_ascii_graphic() && b != b';'));

    let item = universal_data(&html);
    let item = item.as_ref().map(|d| &d["__DEFAULT_SCOPE__"]["webapp.video-detail"]["itemInfo"]["itemStruct"]);
    let play = item
        .and_then(|i| i["video"]["playAddr"].as_str().map(str::to_string))
        .filter(|s| !s.is_empty())
        .or_else(|| json_str_after(&html, "playAddr"))
        .ok_or_else(|| err("TikTok: no video in the page (private, photo post or removed?)"))?;
    let height = item.and_then(|i| i["video"]["height"].as_u64().or_else(|| i["video"]["height"].as_str()?.parse().ok()));
    let size = item.and_then(|i| i["video"]["PlayAddrStruct"]["DataSize"].as_str()?.parse().ok());
    let title = item
        .and_then(|i| i["desc"].as_str())
        .map(|d| d.chars().filter(|c| !c.is_control()).take(120).collect::<String>())
        .filter(|d| !d.trim().is_empty())
        .unwrap_or_else(|| "TikTok video".into());
    Ok(SocialVideo {
        site: "TikTok".into(),
        title,
        formats: vec![SocialFormat {
            id: "tt-play".into(),
            label: height.map_or("Original".into(), |h| format!("{h}p · original")),
            size,
            video_url: play,
            audio_url: None,
            ext: "mp4".into(),
        }],
        referrer: Some("https://www.tiktok.com/".into()),
        cookies: token.map(|t| format!("tt_chain_token={t}")),
    })
}

fn universal_data(html: &str) -> Option<Value> {
    let tag = html.find("id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\"")?;
    let start = tag + html[tag..].find('>')? + 1;
    let end = start + html[start..].find("</script>")?;
    serde_json::from_str(&html[start..end]).ok()
}

/// `url` into `dest` in 10 MB ranges (googlevideo throttles one big request), each retried.
pub async fn fetch_ranged(url: &str, dest: &std::path::Path) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    const CHUNK: u64 = 10 << 20;
    let client = reqwest::Client::builder()
        .user_agent(CHROME_UA)
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    if let Some(dir) = dest.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    }
    let mut file = tokio::fs::File::create(dest).await.map_err(|e| e.to_string())?;
    let mut at = 0u64;
    let mut total: Option<u64> = None;
    loop {
        let mut tries = 0;
        let body = loop {
            let r = client.get(url).header("range", format!("bytes={}-{}", at, at + CHUNK - 1)).send().await;
            match r {
                Ok(r) if r.status() == 416 && total.is_some() => break None, // past the end
                // A fresh link: 403 for its first seconds (see probe_url); retried below.
                Ok(r) if r.status() == 403 && at == 0 && tries < 4 => {}
                Ok(r) if r.status() == 206 => {
                    // "bytes 0-1023/98844734": the whole size, so a short answer is caught.
                    total = total.or_else(|| {
                        r.headers().get("content-range")?.to_str().ok()?.rsplit('/').next()?.parse().ok()
                    });
                    match r.bytes().await {
                        Ok(b) => break Some(b),
                        Err(e) if tries >= 3 => return Err(e.to_string()),
                        Err(_) => {}
                    }
                }
                Ok(r) if r.status().is_success() => return Err(format!("server ignored the range (HTTP {})", r.status())),
                Ok(r) if tries >= 3 => return Err(format!("HTTP {}", r.status())),
                Err(e) if tries >= 3 => return Err(e.to_string()),
                _ => {}
            }
            tries += 1;
            tokio::time::sleep(Duration::from_secs(2 * tries)).await;
        };
        let Some(body) = body else { break };
        if body.is_empty() {
            break;
        }
        file.write_all(&body).await.map_err(|e| e.to_string())?;
        at += body.len() as u64;
        if total.map_or(true, |t| at >= t) {
            break;
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    match total {
        Some(t) if at == t => Ok(()),
        Some(t) => Err(format!("audio cut off at {at} of {t} bytes (YouTube refused the rest)")),
        None => Err("no size from the server".into()),
    }
}

/// A tool on PATH or in the usual install places (a GUI app's PATH lacks Homebrew's).
pub fn find_tool(name: &str) -> Option<std::path::PathBuf> {
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let path = std::env::var_os("PATH").unwrap_or_default();
    std::env::split_paths(&path)
        .chain(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].map(Into::into))
        .map(|d: std::path::PathBuf| d.join(&exe))
        .find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> url::Url {
        url::Url::parse(s).unwrap()
    }

    #[test]
    fn sites_and_ids() {
        assert_eq!(site_of(&u("https://m.youtube.com/watch?v=dQw4w9WgXcQ")), Some(Site::YouTube));
        assert_eq!(site_of(&u("https://vm.tiktok.com/ZMabc/")), Some(Site::TikTok));
        assert_eq!(site_of(&u("https://fb.watch/abc")), Some(Site::Facebook));
        assert_eq!(site_of(&u("https://notyoutube.com/watch?v=dQw4w9WgXcQ")), None);
        assert_eq!(site_of(&u("https://youtube.com.evil.io/x")), None);
        for l in [
            "https://youtu.be/dQw4w9WgXcQ?t=3",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
        ] {
            assert_eq!(youtube_id(&u(l)).as_deref(), Some("dQw4w9WgXcQ"), "{l}");
        }
        assert_eq!(youtube_id(&u("https://www.youtube.com/@channel")), None);
        assert!(media_ok(Site::YouTube, "https://rr1---sn-x.googlevideo.com/videoplayback?a=1"));
        assert!(!media_ok(Site::YouTube, "http://rr1.googlevideo.com/x"));
        assert!(!media_ok(Site::TikTok, "https://evil.io/tiktok.com"));
    }

    #[test]
    fn scraping_helpers() {
        let h = r#"x"browser_native_hd_url":"https:\/\/video.fbcdn.net\/v.mp4?a=1&2","y":1"#;
        assert_eq!(json_str_after(h, "browser_native_hd_url").as_deref(), Some("https://video.fbcdn.net/v.mp4?a=1&2"));
        assert_eq!(json_str_after(r#""k":"a\"b""#, "k").as_deref(), Some("a\"b"));
        assert_eq!(json_str_after(r#""k":"unterminated"#, "k"), None);
        let t = r#"<meta property="og:title" content="12K views · 3 reactions | Surah Al-Mulk &amp; more | Facebook" />"#;
        assert_eq!(og_title(t).as_deref(), Some("Surah Al-Mulk & more"));
        assert_eq!(html_unescape("a &#39;b&#x27; & c"), "a 'b' & c");
    }

    #[test]
    fn tiktok_ytdlp() {
        let j = serde_json::json!({"title": "T", "formats": [
            {"format_id": "audio", "protocol": "https", "url": "https://v16m.tiktokcdn.com/a", "vcodec": "none", "acodec": "mp3"},
            {"format_id": "bytevc1_720p", "protocol": "https", "url": "https://v16.tiktok.com/h265", "vcodec": "h265", "acodec": "aac", "height": 1280},
            {"format_id": "h264_540p-0", "protocol": "https", "url": "https://v16.tiktok.com/h264", "vcodec": "h264", "acodec": "aac", "height": 1024, "filesize": 9, "tbr": 323,
             "cookies": "ttwid=1%7Cx; Domain=.tiktok.com; Path=/; Expires=1; tt_chain_token=\"abc==\"; Domain=.tiktok.com",
             "http_headers": {"Referer": "https://www.tiktok.com/@u/video/1"}}
        ]});
        let v = tiktok_from_ytdlp(&j).unwrap();
        assert_eq!(v.formats[0].video_url, "https://v16.tiktok.com/h264");
        assert_eq!(v.cookies.as_deref(), Some("ttwid=1%7Cx; tt_chain_token=abc=="));
        assert_eq!(v.referrer.as_deref(), Some("https://www.tiktok.com/@u/video/1"));
    }

    #[test]
    fn youtube_choices() {
        let j = serde_json::json!({
            "playabilityStatus": {"status": "OK"},
            "videoDetails": {"title": "T", "isLive": false},
            "streamingData": {
                "formats": [{"itag": 18, "url": "https://a.googlevideo.com/18", "mimeType": "video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"", "height": 360, "contentLength": "100"}],
                "adaptiveFormats": [
                    {"itag": 399, "url": "https://a.googlevideo.com/399", "mimeType": "video/mp4; codecs=\"av01.0.08M.08\"", "height": 1080, "contentLength": "30", "bitrate": 9},
                    {"itag": 137, "url": "https://a.googlevideo.com/137", "mimeType": "video/mp4; codecs=\"avc1.640028\"", "height": 1080, "contentLength": "80", "bitrate": 5},
                    {"itag": 401, "url": "https://a.googlevideo.com/401", "mimeType": "video/mp4; codecs=\"av01.0.12M.08\"", "height": 2160, "contentLength": "240", "bitrate": 20},
                    {"itag": 248, "url": "https://a.googlevideo.com/248", "mimeType": "video/webm; codecs=\"vp9\"", "height": 1080, "bitrate": 7},
                    {"itag": 140, "url": "https://a.googlevideo.com/140", "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"", "contentLength": "3", "bitrate": 128},
                    {"itag": 139, "url": "https://a.googlevideo.com/139", "mimeType": "audio/mp4; codecs=\"mp4a.40.5\"", "bitrate": 48},
                    {"itag": 141, "url": "https://a.googlevideo.com/141", "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"", "bitrate": 999, "audioTrack": {"audioIsDefault": false}},
                    {"itag": 136, "signatureCipher": "s=x", "mimeType": "video/mp4; codecs=\"avc1\"", "height": 720}
                ]
            }
        });
        let v = youtube_formats(&j).unwrap();
        let ids: Vec<_> = v.formats.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["yt-v401", "yt-v137", "yt-m18", "yt-a140"]);
        assert_eq!(v.formats[1].audio_url.as_deref(), Some("https://a.googlevideo.com/140"));
        assert_eq!(v.formats[1].size, Some(83));
        assert_eq!(v.formats[1].label, "1080p · H.264");
        // yt-dlp's -J maps onto the same picker.
        let y = serde_json::json!({"title": "Y", "formats": [
            {"format_id": "137", "protocol": "https", "url": "https://a.googlevideo.com/137", "ext": "mp4", "vcodec": "avc1.640028", "acodec": "none", "height": 1080, "filesize": 80, "tbr": 277.0},
            {"format_id": "140", "protocol": "https", "url": "https://a.googlevideo.com/140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.2", "filesize": 3, "tbr": 129.0},
            {"format_id": "140-drc", "protocol": "https", "url": "https://a.googlevideo.com/drc", "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.2", "tbr": 999.0},
            {"format_id": "140-1", "protocol": "https", "url": "https://a.googlevideo.com/dub", "ext": "m4a", "vcodec": "none", "acodec": "mp4a.40.2", "tbr": 500.0, "format_note": "Español, medium"},
            {"format_id": "18", "protocol": "https", "url": "https://a.googlevideo.com/18", "ext": "mp4", "vcodec": "avc1.42001E", "acodec": "mp4a.40.2", "height": 360, "filesize_approx": 100},
            {"format_id": "96", "protocol": "m3u8_native", "url": "https://a.googlevideo.com/96", "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "height": 1080}
        ]});
        let v = youtube_formats(&ytdlp_as_player(&y)).unwrap();
        let ids: Vec<_> = v.formats.iter().map(|f| f.id.as_str()).collect();
        assert_eq!(ids, ["yt-v137", "yt-m18", "yt-a140"]);
        assert_eq!(v.formats[0].audio_url.as_deref(), Some("https://a.googlevideo.com/140"));
        let bad = serde_json::json!({"playabilityStatus": {"status": "LOGIN_REQUIRED", "reason": "Sign in to confirm you’re not a bot"}});
        assert!(youtube_formats(&bad).unwrap_err().to_string().contains("not a bot"));
    }
}
