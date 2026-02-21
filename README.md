# iptv-podder
A lightweight IPTV/HLS stream explorer and player.

### Accessibility
- Hidden skip links let keyboard and screen reader users jump directly to the playlist form or the video player. The links are stacked in a small menu so they're separated and easy to reach when tabbing.

### Features
- Pass `playlist` and optional `program` parameters in the URL to automatically load a playlist and play a stream.
- The PHP proxy limits each response to 3.5 MB, rate limits clients by IP and
  periodically cleans its cache.
- The proxy validates IPv4 and IPv6 addresses to support modern DNS records.
- Proxy auth:
  - By default, the browser UI enables a session-based proxy.
  - For non-browser/programmatic use, set an environment variable `PROXY_TOKEN` and pass `token=...` to `proxy.php` (or include `token=...` in the page URL so the JS will reuse it).
