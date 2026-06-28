/**
 * DLMan MAIN-world media interception hooks.
 *
 * Injected into the page's MAIN JavaScript world to intercept:
 * 1. fetch() — catches m3u8/mpd manifest requests
 * 2. XMLHttpRequest — same, for legacy players
 * 3. URL.createObjectURL(MediaSource) — tracks blob: ↔ MediaSource mapping
 * 4. SourceBuffer.addSourceBuffer() — detects MIME types in use
 *
 * Communicates detected URLs to the content script via window.postMessage().
 */
(function () {
  'use strict';

  var DLMAN_HOOK_ID = '__dlman_media_hook__';
  if (window[DLMAN_HOOK_ID]) return;
  window[DLMAN_HOOK_ID] = true;

  var HLS_PATTERN = /\.m3u8(\?|#|$)/i;
  var DASH_PATTERN = /\.mpd(\?|#|$)/i;
  var VIDEO_PATTERN = /\.(mp4|webm|mkv|mov|m4v|flv)(\?|#|$)/i;
  var MANIFEST_MIMES = /mpegurl|dash\+xml/i;
  var VIDEO_MIMES = /^video\//i;
  var AD_DOMAINS = /doubleclick\.net|googlesyndication|googleadservices|facebook\.com\/tr|analytics|adserver|adsystem|sabavision\.com|imasdk\.googleapis|moatads|serving-sys\.com/i;

  var sent = {};

  function urlBase(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin + u.pathname;
    } catch (e) {
      return url;
    }
  }

  function classify(url, mime) {
    if (AD_DOMAINS.test(url)) return null;
    if (HLS_PATTERN.test(url) || (mime && MANIFEST_MIMES.test(mime) && mime.indexOf('mpegurl') >= 0)) return 'hls';
    if (DASH_PATTERN.test(url) || (mime && MANIFEST_MIMES.test(mime) && mime.indexOf('dash') >= 0)) return 'dash';
    if (VIDEO_PATTERN.test(url) || (mime && VIDEO_MIMES.test(mime))) return 'direct';
    return null;
  }

  function emit(url, protocol) {
    if (!url || url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return;
    if (url.indexOf('http://localhost') === 0 || url.indexOf('http://127.0.0.1') === 0) return;

    var key = urlBase(url);
    if (sent[key]) return;
    sent[key] = true;

    window.postMessage({
      source: 'dlman-media-hook',
      type: 'media-url-detected',
      url: url,
      protocol: protocol
    }, '*');
  }

  // =========================================================================
  // 1. Hook fetch()
  // =========================================================================
  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      var url;
      try {
        if (typeof input === 'string') {
          url = new URL(input, location.href).toString();
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input && typeof input === 'object' && input.url) {
          url = input.url;
        }
      } catch (e) { /* ignore */ }

      if (url) {
        var proto = classify(url);
        if (proto) emit(url, proto);
      }

      return originalFetch.apply(this, arguments).then(function (resp) {
        if (url && resp.ok) {
          try {
            var ct = resp.headers.get('content-type');
            if (ct) {
              var p = classify(url, ct);
              if (p) emit(url, p);
            }
          } catch (e) { /* ignore */ }
        }
        return resp;
      });
    };
  }

  // =========================================================================
  // 2. Hook XMLHttpRequest
  // =========================================================================
  var XHRProto = XMLHttpRequest.prototype;
  var originalOpen = XHRProto.open;
  var originalSend = XHRProto.send;

  XHRProto.open = function (method, url) {
    try {
      var resolved = new URL(typeof url === 'string' ? url : url.toString(), location.href).toString();
      this.__dlman_url = resolved;
      var proto = classify(resolved);
      if (proto) emit(resolved, proto);
    } catch (e) { /* ignore */ }
    return originalOpen.apply(this, arguments);
  };

  XHRProto.send = function () {
    var self = this;
    self.addEventListener('load', function () {
      var url = self.__dlman_url;
      if (!url) return;
      try {
        var ct = self.getResponseHeader('content-type');
        if (ct) {
          var proto = classify(url, ct);
          if (proto) emit(url, proto);
        }
      } catch (e) { /* ignore */ }
    }, { once: true });
    return originalSend.apply(this, arguments);
  };

  // =========================================================================
  // 3. Hook URL.createObjectURL — track blob: ↔ MediaSource
  // =========================================================================
  var originalCreateObjectURL = URL.createObjectURL;
  if (originalCreateObjectURL) {
    URL.createObjectURL = function (obj) {
      var blobUrl = originalCreateObjectURL.call(this, obj);
      if (typeof MediaSource !== 'undefined' && obj instanceof MediaSource) {
        window.postMessage({
          source: 'dlman-media-hook',
          type: 'mse-blob-created',
          blobUrl: blobUrl,
          pageUrl: location.href
        }, '*');
      }
      return blobUrl;
    };
  }

  // =========================================================================
  // 4. Hook MediaSource.addSourceBuffer — detect MIME types
  // =========================================================================
  if (typeof MediaSource !== 'undefined') {
    var originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (mimeType) {
      window.postMessage({
        source: 'dlman-media-hook',
        type: 'mse-source-buffer',
        mimeType: mimeType,
        pageUrl: location.href
      }, '*');
      return originalAddSourceBuffer.call(this, mimeType);
    };
  }
})();
