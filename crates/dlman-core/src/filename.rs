//! Filename resolution for downloads.
//!
//! A download's name can come from three places, in decreasing order of trust:
//!
//! 1. the `Content-Disposition` response header — the server's explicit intent
//! 2. the last path segment of the URL
//! 3. the literal [`DEFAULT_FILENAME`]
//!
//! Whichever we end up with is sanitized for the local filesystem, and if it
//! still carries no extension we infer one from `Content-Type`.
//!
//! Only source (2) used to be consulted when a download was added, so a URL
//! like `codeload.github.com/owner/repo/zip/refs/heads/main` was saved as
//! `main` — no extension — even though the response says
//! `content-disposition: attachment; filename=repo-main.zip`.

/// Name used when neither the server nor the URL offers anything usable.
pub const DEFAULT_FILENAME: &str = "download";

/// Longest filename we will produce, in characters. Comfortably inside the
/// 255-byte limit that NTFS/ext4/APFS impose on a single path component, with
/// room to spare for a ` (12)` collision suffix.
const MAX_FILENAME_CHARS: usize = 180;

/// Characters that are illegal in a Windows filename. This is a superset of
/// what POSIX rejects, so one rule serves every platform we ship on.
const ILLEGAL_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// DOS device names. On Windows a file called `NUL`, or even `nul.txt`, cannot
/// be opened, so these get a `_` prefix.
const RESERVED_STEMS: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Pick the best filename available for a download.
///
/// Prefers `Content-Disposition`, falls back to the URL's last path segment,
/// then to [`DEFAULT_FILENAME`]. The result is always sanitized, and gains an
/// extension inferred from `content_type` if it has none of its own.
pub fn resolve_filename(
    url: &url::Url,
    content_disposition: Option<&str>,
    content_type: Option<&str>,
) -> String {
    let name = content_disposition
        .and_then(filename_from_content_disposition)
        .and_then(|name| sanitize_filename(&name))
        .or_else(|| filename_from_url(url))
        .unwrap_or_else(|| DEFAULT_FILENAME.to_string());

    ensure_extension(name, content_type)
}

/// Extract the filename from a `Content-Disposition` header value.
///
/// Handles the quoted, unquoted, and RFC 5987 extended (`filename*=`) forms.
/// Returns `None` when the header carries no filename at all — a bare
/// `attachment` is common and means "use the URL".
pub fn filename_from_content_disposition(header: &str) -> Option<String> {
    let mut plain: Option<String> = None;
    let mut extended: Option<String> = None;

    for param in split_params(header) {
        let (key, value) = match param.split_once('=') {
            Some((key, value)) => (key.trim().to_ascii_lowercase(), value.trim()),
            None => continue,
        };

        match key.as_str() {
            "filename" if plain.is_none() => plain = Some(unquote(value)),
            "filename*" if extended.is_none() => extended = decode_extended_value(value),
            _ => {}
        }
    }

    // RFC 6266 §4.3: when both forms are present, `filename*` wins.
    extended.or(plain).filter(|name| !name.trim().is_empty())
}

/// Derive a filename from the URL's last non-empty path segment.
pub fn filename_from_url(url: &url::Url) -> Option<String> {
    let segment = url.path_segments()?.rfind(|s| !s.is_empty())?;

    // Path segments are percent-encoded; `My%20File.zip` is `My File.zip`.
    let decoded = match urlencoding::decode(segment) {
        Ok(decoded) => decoded.into_owned(),
        Err(_) => segment.to_string(),
    };

    sanitize_filename(&decoded)
}

/// Make `raw` safe to use as a single path component.
///
/// Returns `None` when nothing usable survives, so callers can fall through to
/// their next-best source rather than creating a file named `_`.
pub fn sanitize_filename(raw: &str) -> Option<String> {
    // Keep only the final component. A server that sends
    // `filename="../../etc/passwd"` must not be able to escape the
    // destination directory.
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw).trim();

    if base.is_empty() || base == "." || base == ".." {
        return None;
    }

    let replaced: String = base
        .chars()
        .map(|c| {
            if ILLEGAL_CHARS.contains(&c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Windows silently drops trailing dots and spaces, which would leave us
    // tracking a name the filesystem never actually created.
    let trimmed = replaced.trim().trim_end_matches(['.', ' ']).trim();

    if trimmed.is_empty() {
        return None;
    }

    let (stem, extension) = split_stem_ext(trimmed);
    let escaped = if RESERVED_STEMS
        .iter()
        .any(|reserved| reserved.eq_ignore_ascii_case(stem))
    {
        match extension {
            Some(extension) => format!("_{}.{}", stem, extension),
            None => format!("_{}", stem),
        }
    } else {
        trimmed.to_string()
    };

    Some(truncate_keeping_extension(escaped))
}

/// Split a filename into `(stem, extension)`.
///
/// Unlike [`std::path::Path::extension`] this will not invent an extension out
/// of a trailing version number: `Path` reads `app-v1.11.1` as stem
/// `app-v1.11` plus extension `1`, which is how collision handling used to
/// produce `app-v1.11 (1).1`.
pub fn split_stem_ext(filename: &str) -> (&str, Option<&str>) {
    match filename.rfind('.') {
        // A leading dot marks a hidden file (`.gitignore`), not an extension.
        Some(index) if index > 0 => {
            let extension = &filename[index + 1..];
            if is_plausible_extension(extension) {
                (&filename[..index], Some(extension))
            } else {
                (filename, None)
            }
        }
        _ => (filename, None),
    }
}

/// Map a `Content-Type` onto a file extension.
///
/// Deliberately conservative: `application/octet-stream` is how servers say
/// "no idea", so guessing from it would be worse than leaving the name alone.
pub fn extension_for_mime(content_type: &str) -> Option<&'static str> {
    // Drop parameters (`; charset=utf-8`) and normalise case.
    let mime = content_type.split(';').next()?.trim().to_ascii_lowercase();

    let extension = match mime.as_str() {
        // Archives
        "application/zip" | "application/x-zip-compressed" => "zip",
        "application/gzip" | "application/x-gzip" => "gz",
        "application/x-tar" => "tar",
        "application/x-7z-compressed" => "7z",
        "application/vnd.rar" | "application/x-rar-compressed" => "rar",
        "application/x-bzip2" => "bz2",
        "application/x-xz" => "xz",
        "application/zstd" => "zst",
        // Installers and disk images
        "application/x-msdownload"
        | "application/x-msdos-program"
        | "application/vnd.microsoft.portable-executable" => "exe",
        "application/x-msi" | "application/x-ms-installer" => "msi",
        "application/x-apple-diskimage" => "dmg",
        "application/vnd.debian.binary-package" | "application/x-deb" => "deb",
        "application/x-rpm" | "application/x-redhat-package-manager" => "rpm",
        "application/vnd.android.package-archive" => "apk",
        "application/x-iso9660-image" => "iso",
        // Documents
        "application/pdf" => "pdf",
        "application/epub+zip" => "epub",
        "application/rtf" => "rtf",
        "application/msword" => "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx",
        "application/vnd.ms-excel" => "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "xlsx",
        "application/vnd.ms-powerpoint" => "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => "pptx",
        // Text and code
        "text/plain" => "txt",
        "text/html" => "html",
        "text/css" => "css",
        "text/csv" => "csv",
        "text/markdown" => "md",
        "application/json" => "json",
        "application/xml" | "text/xml" => "xml",
        "application/javascript" | "text/javascript" => "js",
        "application/wasm" => "wasm",
        // Images
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "image/svg+xml" => "svg",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        // Video
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "video/x-matroska" => "mkv",
        "video/quicktime" => "mov",
        // Audio
        "audio/mpeg" => "mp3",
        "audio/mp4" | "audio/x-m4a" => "m4a",
        "audio/ogg" | "application/ogg" => "ogg",
        "audio/flac" | "audio/x-flac" => "flac",
        "audio/wav" | "audio/x-wav" => "wav",
        _ => return None,
    };

    Some(extension)
}

/// Give `filename` an extension inferred from `content_type`, if it has none.
pub fn ensure_extension(filename: String, content_type: Option<&str>) -> String {
    if split_stem_ext(&filename).1.is_some() {
        return filename;
    }

    match content_type.and_then(extension_for_mime) {
        Some(extension) => {
            format!("{}.{}", filename.trim_end_matches(['.', ' ']), extension)
        }
        None => filename,
    }
}

/// Is `extension` something we should treat as a real file extension?
fn is_plausible_extension(extension: &str) -> bool {
    !extension.is_empty()
        && extension.len() <= 8
        && extension.chars().all(|c| c.is_ascii_alphanumeric())
        // An all-digit tail is a version fragment (`v1.11.1`, `part.2`), not an
        // extension. This also covers split archives such as `archive.001`,
        // which lose nothing by being treated as extension-less.
        && !extension.chars().all(|c| c.is_ascii_digit())
}

/// Split a header value on `;`, ignoring separators inside quoted strings.
fn split_params(header: &str) -> Vec<&str> {
    let mut params = Vec::new();
    let mut start = 0;
    let mut in_quotes = false;
    let mut escaped = false;

    for (index, c) in header.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match c {
            '\\' if in_quotes => escaped = true,
            '"' => in_quotes = !in_quotes,
            ';' if !in_quotes => {
                params.push(&header[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    params.push(&header[start..]);

    params
}

/// Strip surrounding double quotes and unescape the contents.
fn unquote(value: &str) -> String {
    let value = value.trim();

    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        let inner = &value[1..value.len() - 1];
        let mut out = String::with_capacity(inner.len());
        let mut chars = inner.chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                if let Some(escaped) = chars.next() {
                    out.push(escaped);
                }
            } else {
                out.push(c);
            }
        }
        out
    } else {
        value.to_string()
    }
}

/// Decode an RFC 5987 extended parameter value: `charset'language'pct-encoded`.
fn decode_extended_value(value: &str) -> Option<String> {
    // Some servers quote the extended form even though the RFC forbids it.
    let value = unquote(value);
    let mut parts = value.splitn(3, '\'');

    let charset = parts.next()?.to_ascii_lowercase();
    let _language = parts.next()?;
    let encoded = parts.next()?;

    // Anything exotic is better served by the plain `filename` parameter.
    if !charset.is_empty() && charset != "utf-8" && charset != "us-ascii" {
        return None;
    }

    urlencoding::decode(encoded)
        .ok()
        .map(|decoded| decoded.into_owned())
}

/// Clamp a filename to [`MAX_FILENAME_CHARS`] without discarding its extension.
fn truncate_keeping_extension(filename: String) -> String {
    if filename.chars().count() <= MAX_FILENAME_CHARS {
        return filename;
    }

    let (stem, extension) = split_stem_ext(&filename);
    match extension {
        Some(extension) => {
            let budget = MAX_FILENAME_CHARS.saturating_sub(extension.chars().count() + 1);
            let stem: String = stem.chars().take(budget).collect();
            format!("{}.{}", stem.trim_end(), extension)
        }
        None => filename.chars().take(MAX_FILENAME_CHARS).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_url(raw: &str) -> url::Url {
        url::Url::parse(raw).expect("test URL should parse")
    }

    // ── Content-Disposition parsing ──────────────────────────────────────

    #[test]
    fn parses_unquoted_filename() {
        assert_eq!(
            filename_from_content_disposition("attachment; filename=dlman-main.zip").as_deref(),
            Some("dlman-main.zip")
        );
    }

    #[test]
    fn parses_quoted_filename() {
        assert_eq!(
            filename_from_content_disposition("attachment; filename=\"my report.pdf\"").as_deref(),
            Some("my report.pdf")
        );
    }

    #[test]
    fn quoted_filename_may_contain_a_semicolon() {
        assert_eq!(
            filename_from_content_disposition("attachment; filename=\"a;b.zip\"; size=42")
                .as_deref(),
            Some("a;b.zip")
        );
    }

    #[test]
    fn extended_form_wins_over_plain() {
        let header = "attachment; filename=\"fallback.zip\"; filename*=UTF-8''caf%C3%A9.zip";
        assert_eq!(
            filename_from_content_disposition(header).as_deref(),
            Some("café.zip")
        );
    }

    #[test]
    fn ignores_unknown_charset_in_extended_form() {
        let header = "attachment; filename=\"fallback.zip\"; filename*=iso-8859-1''caf%E9.zip";
        assert_eq!(
            filename_from_content_disposition(header).as_deref(),
            Some("fallback.zip")
        );
    }

    #[test]
    fn bare_attachment_yields_nothing() {
        assert_eq!(filename_from_content_disposition("attachment"), None);
        assert_eq!(filename_from_content_disposition("inline"), None);
    }

    #[test]
    fn header_keys_are_case_insensitive() {
        assert_eq!(
            filename_from_content_disposition("ATTACHMENT; FileName=Setup.exe").as_deref(),
            Some("Setup.exe")
        );
    }

    // ── Sanitizing ───────────────────────────────────────────────────────

    #[test]
    fn strips_directory_traversal() {
        assert_eq!(
            sanitize_filename("../../etc/passwd").as_deref(),
            Some("passwd")
        );
        assert_eq!(
            sanitize_filename("..\\..\\windows\\system32\\evil.dll").as_deref(),
            Some("evil.dll")
        );
    }

    #[test]
    fn replaces_illegal_characters() {
        assert_eq!(
            sanitize_filename("in:va|lid?.txt").as_deref(),
            Some("in_va_lid_.txt")
        );
    }

    #[test]
    fn drops_trailing_dots_and_spaces() {
        assert_eq!(
            sanitize_filename("report.pdf . ").as_deref(),
            Some("report.pdf")
        );
    }

    #[test]
    fn escapes_reserved_device_names() {
        assert_eq!(sanitize_filename("NUL").as_deref(), Some("_NUL"));
        assert_eq!(sanitize_filename("nul.txt").as_deref(), Some("_nul.txt"));
        // Only an exact match is reserved.
        assert_eq!(
            sanitize_filename("nullable.txt").as_deref(),
            Some("nullable.txt")
        );
    }

    #[test]
    fn rejects_names_with_nothing_usable() {
        assert_eq!(sanitize_filename(""), None);
        assert_eq!(sanitize_filename("   "), None);
        assert_eq!(sanitize_filename("."), None);
        assert_eq!(sanitize_filename(".."), None);
        assert_eq!(sanitize_filename("/"), None);
    }

    #[test]
    fn truncates_long_names_but_keeps_the_extension() {
        let long = format!("{}.zip", "a".repeat(500));
        let sanitized = sanitize_filename(&long).expect("should survive sanitizing");
        assert!(sanitized.chars().count() <= MAX_FILENAME_CHARS);
        assert!(sanitized.ends_with(".zip"));
    }

    // ── Stem/extension splitting ─────────────────────────────────────────

    #[test]
    fn splits_a_normal_extension() {
        assert_eq!(split_stem_ext("archive.zip"), ("archive", Some("zip")));
        assert_eq!(split_stem_ext("foo.tar.gz"), ("foo.tar", Some("gz")));
    }

    #[test]
    fn version_numbers_are_not_extensions() {
        // The regression that produced `dlman-extension-chrome-v1.11 (1).1`.
        assert_eq!(
            split_stem_ext("dlman-extension-chrome-v1.11.1"),
            ("dlman-extension-chrome-v1.11.1", None)
        );
        assert_eq!(split_stem_ext("archive.001"), ("archive.001", None));
    }

    #[test]
    fn hidden_files_have_no_extension() {
        assert_eq!(split_stem_ext(".gitignore"), (".gitignore", None));
    }

    #[test]
    fn implausible_extensions_are_ignored() {
        assert_eq!(split_stem_ext("name."), ("name.", None));
        assert_eq!(
            split_stem_ext("file.superlongextension"),
            ("file.superlongextension", None)
        );
        assert_eq!(split_stem_ext("host.example"), ("host", Some("example")));
    }

    // ── Extension inference ──────────────────────────────────────────────

    #[test]
    fn infers_extension_from_mime() {
        assert_eq!(
            ensure_extension("main".to_string(), Some("application/zip")),
            "main.zip"
        );
        assert_eq!(
            ensure_extension("installer".to_string(), Some("application/x-msdownload")),
            "installer.exe"
        );
        assert_eq!(
            ensure_extension("page".to_string(), Some("text/html; charset=utf-8")),
            "page.html"
        );
    }

    #[test]
    fn leaves_existing_extensions_alone() {
        assert_eq!(
            ensure_extension("already.zip".to_string(), Some("application/pdf")),
            "already.zip"
        );
    }

    #[test]
    fn octet_stream_infers_nothing() {
        assert_eq!(
            ensure_extension("mystery".to_string(), Some("application/octet-stream")),
            "mystery"
        );
        assert_eq!(ensure_extension("mystery".to_string(), None), "mystery");
    }

    // ── End-to-end resolution ────────────────────────────────────────────

    #[test]
    fn content_disposition_beats_the_url_path() {
        // The exact bug: the URL segment is `main`, the server says otherwise.
        let resolved = resolve_filename(
            &parse_url("https://codeload.github.com/novincode/dlman/zip/refs/heads/main"),
            Some("attachment; filename=dlman-main.zip"),
            Some("application/zip"),
        );
        assert_eq!(resolved, "dlman-main.zip");
    }

    #[test]
    fn falls_back_to_content_type_when_no_disposition() {
        let resolved = resolve_filename(
            &parse_url("https://get.microsoft.com/installer/download/9N7JSXC1SJK6"),
            None,
            Some("application/x-msdownload"),
        );
        assert_eq!(resolved, "9N7JSXC1SJK6.exe");
    }

    #[test]
    fn falls_back_to_the_url_path() {
        let resolved = resolve_filename(
            &parse_url("https://example.com/files/My%20Report.pdf"),
            None,
            None,
        );
        assert_eq!(resolved, "My Report.pdf");
    }

    #[test]
    fn ignores_query_strings() {
        let resolved = resolve_filename(
            &parse_url("https://example.com/files/setup.exe?token=abc&expires=123"),
            None,
            None,
        );
        assert_eq!(resolved, "setup.exe");
    }

    #[test]
    fn uses_the_last_meaningful_segment_of_a_trailing_slash_url() {
        let resolved = resolve_filename(
            &parse_url("https://example.com/files/report.pdf/"),
            None,
            None,
        );
        assert_eq!(resolved, "report.pdf");
    }

    #[test]
    fn falls_back_to_the_default_name() {
        let resolved = resolve_filename(&parse_url("https://example.com/"), None, None);
        assert_eq!(resolved, DEFAULT_FILENAME);
    }

    #[test]
    fn default_name_still_gains_an_extension() {
        let resolved =
            resolve_filename(&parse_url("https://example.com/"), None, Some("video/mp4"));
        assert_eq!(resolved, "download.mp4");
    }

    #[test]
    fn a_hostile_disposition_cannot_escape_the_destination() {
        let resolved = resolve_filename(
            &parse_url("https://example.com/download"),
            Some("attachment; filename=\"../../../etc/cron.d/payload\""),
            None,
        );
        assert_eq!(resolved, "payload");
    }
}
