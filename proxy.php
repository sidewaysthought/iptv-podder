<?php
$https_on_for_cookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? 0) == 443)
    || (strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $https_on_for_cookie,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// Authentication
// This proxy is intended to be usable only from the site UI.
// The UI sets a session in index.php; we require that session here.
if (empty($_SESSION['user_active'])) {
    http_response_code(403);
    echo 'Session required';
    exit;
}

// Configuration
define('CACHE_TTL', 300); // 5 minutes
// Max size for cached text responses (playlists). Keep small to avoid session bloat.
define('MAX_CACHE_BYTES', 3670016); // 3.5 MB
// Max size for streamed binary responses (segments/keys). Tune as needed.
define('MAX_STREAM_BYTES', 52428800); // 50 MB

// Rate limit: playlists are low-volume; HLS playback is high-volume and bursty (segments).
// Use a token-bucket limiter (burst + steady refill) instead of a simple per-hour counter.
//
// Playlist: allow small bursts; refill slowly.
// Stream: allow big bursts for startup/channel flips; refill at a few req/sec.

define('RATE_PLAYLIST_CAPACITY', 30);           // max burst tokens
define('RATE_PLAYLIST_REFILL_PER_SEC', 0.5);   // 30/min

define('RATE_STREAM_CAPACITY', 500);           // max burst tokens
define('RATE_STREAM_REFILL_PER_SEC', 4.0);     // 240/min

define('RATE_DIR', sys_get_temp_dir() . '/proxy_rate');

function cleanup_cache() {
    if (!isset($_SESSION['proxy_cache'])) {
        return;
    }
    $now = time();
    foreach ($_SESSION['proxy_cache'] as $k => $entry) {
        if ($entry['time'] + CACHE_TTL <= $now) {
            unset($_SESSION['proxy_cache'][$k]);
        }
    }
}

function rate_limit($bucket = 'playlist') {
    $dir = RATE_DIR;
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }

    $capacity = ($bucket === 'stream') ? RATE_STREAM_CAPACITY : RATE_PLAYLIST_CAPACITY;
    $refillPerSec = ($bucket === 'stream') ? RATE_STREAM_REFILL_PER_SEC : RATE_PLAYLIST_REFILL_PER_SEC;

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $sid = session_id() ?: 'nosid';

    // Scope to session + IP so the proxy remains "UI-only" and one user can't starve the whole site.
    $file = $dir . '/' . sha1($bucket . ':' . $ip . ':' . $sid) . '.json';

    $now = microtime(true);

    $state = [
        'tokens' => $capacity,
        'ts' => $now,
    ];

    if (file_exists($file)) {
        $json = @file_get_contents($file);
        $decoded = json_decode($json, true);
        if (is_array($decoded) && isset($decoded['tokens']) && isset($decoded['ts'])) {
            $state = $decoded;
        }
    }

    $elapsed = max(0.0, $now - (float)$state['ts']);
    $tokens = min($capacity, (float)$state['tokens'] + ($elapsed * $refillPerSec));

    if ($tokens < 1.0) {
        http_response_code(429);
        header('Retry-After: 1');
        echo 'Too many requests';
        exit;
    }

    // Spend one token
    $tokens -= 1.0;

    $state = [
        'tokens' => $tokens,
        'ts' => $now,
    ];

    @file_put_contents($file, json_encode($state));

    // Best-effort cleanup: occasionally prune stale files.
    // Keep this cheap; don't glob on every request.
    if (mt_rand(1, 500) === 1) {
        foreach (glob($dir . '/*.json') as $f) {
            $st = json_decode(@file_get_contents($f), true);
            if (!is_array($st) || !isset($st['ts'])) {
                @unlink($f);
                continue;
            }
            // If untouched for 6 hours, delete.
            if ($now - (float)$st['ts'] > 21600) {
                @unlink($f);
            }
        }
    }
}

function public_ip_addresses($host) {
    $records = @dns_get_record($host, DNS_A | DNS_AAAA);
    if (!$records) {
        return [];
    }
    $ips = [];
    foreach ($records as $rec) {
        $ip = $rec['ip'] ?? ($rec['ipv6'] ?? null);
        if (!$ip) {
            continue;
        }
        if (filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) !== false) {
            $ips[] = $ip;
        }
    }
    return $ips;
}

cleanup_cache();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: *');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo 'Method Not Allowed';
    exit;
}

// Ensure the proxy endpoint itself is only served over HTTPS in production.
// Respect reverse proxies (e.g. Cloudflare/Nginx) via X-Forwarded-Proto.
$https_on = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? 0) == 443)
    || (strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if (!$https_on) {
    http_response_code(403);
    echo 'HTTPS required';
    exit;
}

// We are intentionally a CORS-bypass proxy for playlist fetches.
// Auth is enforced via session or PROXY_TOKEN; allow cross-origin reads.
header('Access-Control-Allow-Origin: *');

$url = $_GET['url'] ?? '';
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo "Invalid url";
    exit;
}

$parts = parse_url($url);
$scheme = strtolower($parts['scheme'] ?? '');
if (!in_array($scheme, ['http', 'https'], true)) {
    http_response_code(400);
    echo "Invalid scheme";
    exit;
}

$ips = public_ip_addresses($parts['host']);
if (!$ips) {
    http_response_code(400);
    echo "Refusing private address";
    exit;
}

$key = sha1($url);
if (!isset($_SESSION['proxy_cache'])) {
    $_SESSION['proxy_cache'] = [];
}

$path = strtolower($parts['path'] ?? '');
$is_playlist = preg_match('/\.m3u8?($|\?)/', $path) === 1;

// Apply rate limiting after we've classified the request type.
rate_limit($is_playlist ? 'playlist' : 'stream');

// Serve cached playlists quickly
if ($is_playlist && isset($_SESSION['proxy_cache'][$key]) && $_SESSION['proxy_cache'][$key]['time'] + CACHE_TTL > time()) {
    $entry = $_SESSION['proxy_cache'][$key];
    header('Content-Type: ' . $entry['type']);
    echo $entry['data'];
    exit;
}

$ch = curl_init($url);

// Capture content-type as early as possible
$contentType = 'application/octet-stream';
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) use (&$contentType) {
    $len = strlen($header);
    if (stripos($header, 'Content-Type:') === 0) {
        $value = trim(substr($header, strlen('Content-Type:')));
        if ($value !== '') {
            $contentType = $value;
        }
    }
    return $len;
});

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_USERAGENT => 'IPTV-Proxy',
    // Allow redirects (providers often return 302 for manifests/segments).
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
]);

if (defined('CURLOPT_PROTOCOLS')) {
    curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
}
if (defined('CURLOPT_REDIR_PROTOCOLS')) {
    curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
}


$sentHeaders = false;
$total = 0;
$buffer = '';
$maxBytes = $is_playlist ? MAX_CACHE_BYTES : MAX_STREAM_BYTES;

curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) use (&$sentHeaders, &$total, &$buffer, $maxBytes, $is_playlist, &$contentType) {
    $len = strlen($chunk);
    $total += $len;
    if ($total > $maxBytes) {
        return 0; // abort
    }

    if ($is_playlist) {
        $buffer .= $chunk;
        return $len;
    }

    if (!$sentHeaders) {
        header('Content-Type: ' . $contentType);
        header('Cache-Control: no-store');
        $sentHeaders = true;
    }

    echo $chunk;
    if (function_exists('fastcgi_finish_request')) {
        // no-op; just ensures function exists in some hosts
    }
    flush();
    return $len;
});

curl_exec($ch);

$primary = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
if ($primary && filter_var($primary, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
    http_response_code(400);
    echo 'Refusing private address';
    curl_close($ch);
    exit;
}

if (curl_errno($ch) === CURLE_WRITE_ERROR && $total > $maxBytes) {
    http_response_code(413);
    echo 'Response too large';
    curl_close($ch);
    exit;
}

if (curl_errno($ch)) {
    http_response_code(502);
    echo 'Failed to fetch';
    curl_close($ch);
    exit;
}

$http = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
if ($http >= 400) {
    http_response_code($http);
    echo $is_playlist ? $buffer : '';
    curl_close($ch);
    exit;
}

$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: $contentType;
curl_close($ch);

if ($is_playlist) {
    if (!$sentHeaders) {
        header('Content-Type: ' . $type);
    }
    echo $buffer;
    if (strlen($buffer) <= MAX_CACHE_BYTES) {
        $_SESSION['proxy_cache'][$key] = [
            'time' => time(),
            'data' => $buffer,
            'type' => $type,
        ];
    }
}
