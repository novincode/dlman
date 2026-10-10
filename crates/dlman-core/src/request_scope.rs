//! Which per-site request state may accompany a request.
//!
//! Cookies and saved HTTP credentials are tied to the URL the user added. Once a
//! redirect or a playlist entry points a request somewhere else, they only go
//! along if the destination is still the same site.

use url::Url;

/// Header names that carry per-site state and are subject to [`may_send_site_auth`].
const SITE_AUTH_HEADERS: &[&str] = &["cookie", "authorization"];

/// Whether cookies or credentials that belong to `origin_url` may be sent with a
/// request to `target_url`.
///
/// The target must have the same host and must not move from `https` to plain
/// `http`. Any other target, including one that fails to parse, gets `false`.
pub fn may_send_site_auth(origin_url: &str, target_url: &str) -> bool {
    let (Ok(origin), Ok(target)) = (Url::parse(origin_url), Url::parse(target_url)) else {
        return false;
    };
    let same_host = match (origin.host_str(), target.host_str()) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
        _ => false,
    };
    let downgrade = origin.scheme() == "https" && target.scheme() != "https";
    same_host && !downgrade
}

/// `headers` with the per-site entries (`Cookie`, `Authorization`) removed unless
/// [`may_send_site_auth`] allows them for `target_url`.
pub fn scope_headers(
    headers: &[(String, String)],
    origin_url: &str,
    target_url: &str,
) -> Vec<(String, String)> {
    if may_send_site_auth(origin_url, target_url) {
        return headers.to_vec();
    }
    headers
        .iter()
        .filter(|(name, _)| !SITE_AUTH_HEADERS.contains(&name.to_ascii_lowercase().as_str()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_host_is_allowed() {
        assert!(may_send_site_auth("https://example.com/a", "https://example.com/b?x=1"));
        assert!(may_send_site_auth("https://Example.COM/a", "https://example.com:443/b"));
    }

    #[test]
    fn upgrade_to_https_is_allowed() {
        assert!(may_send_site_auth("http://example.com/a", "https://example.com/a"));
    }

    #[test]
    fn other_hosts_are_refused() {
        assert!(!may_send_site_auth("https://example.com/a", "https://cdn.example.net/a"));
        assert!(!may_send_site_auth("https://example.com/a", "https://dl.example.com/a"));
        assert!(!may_send_site_auth("https://dl.example.com/a", "https://example.com/a"));
        assert!(!may_send_site_auth("https://example.com/a", "https://example.com.evil.net/a"));
        assert!(!may_send_site_auth("https://example.com/a", "http://127.0.0.1/a"));
    }

    #[test]
    fn downgrade_to_http_is_refused() {
        assert!(!may_send_site_auth("https://example.com/a", "http://example.com/a"));
    }

    #[test]
    fn unparseable_urls_are_refused() {
        assert!(!may_send_site_auth("https://example.com/a", "not a url"));
        assert!(!may_send_site_auth("not a url", "https://example.com/a"));
    }

    #[test]
    fn scope_headers_keeps_everything_for_the_same_site() {
        let headers = vec![
            ("Cookie".to_string(), "sid=1".to_string()),
            ("Referer".to_string(), "https://example.com/".to_string()),
        ];
        let scoped = scope_headers(&headers, "https://example.com/m.m3u8", "https://example.com/s.ts");
        assert_eq!(scoped, headers);
    }

    #[test]
    fn scope_headers_drops_site_state_for_another_host() {
        let headers = vec![
            ("Cookie".to_string(), "sid=1".to_string()),
            ("authorization".to_string(), "Basic eDp5".to_string()),
            ("Referer".to_string(), "https://example.com/".to_string()),
        ];
        let scoped = scope_headers(&headers, "https://example.com/m.m3u8", "https://cdn.other.net/s.ts");
        assert_eq!(scoped, vec![("Referer".to_string(), "https://example.com/".to_string())]);
    }
}
