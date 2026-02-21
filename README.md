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
  - The proxy is intended to be usable only from the site UI and requires a browser session.
