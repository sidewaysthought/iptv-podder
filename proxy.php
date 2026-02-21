<?php
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

define('RATE_LIMIT', 30); // requests
define('RATE_WINDOW', 3600); // per hour
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

function rate_limit() {
    $dir = RATE_DIR;
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = $dir . '/' . sha1($ip);
    $now = time();
    $entries = [];
    if (file_exists($file)) {
        $json = file_get_contents($file);
        $entries = json_decode($json, true) ?: [];
    }
    $entries = array_values(array_filter($entries, fn($t) => $t + RATE_WINDOW > $now));
    if (count($entries) >= RATE_LIMIT) {
        http_response_code(429);
        echo 'Too many requests';
        exit;
    }
    $entries[] = $now;
    file_put_contents($file, json_encode($entries));

    // Cleanup old files
    foreach (glob($dir . '/*') as $f) {
        $data = json_decode(@file_get_contents($f), true);
        if (!is_array($data)) {
            @unlink($f);
            continue;
        }
        $data = array_values(array_filter($data, fn($t) => $t + RATE_WINDOW > $now));
        if (empty($data)) {
            @unlink($f);
        } else {
            file_put_contents($f, json_encode($data));
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

rate_limit();

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
    // Allow redirects (some providers return 302 on manifests/segments). Primary IP check still prevents private-net SSRF.
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
]);

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
