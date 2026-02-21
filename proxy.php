<?php
session_start();

// Authentication
// - Browser use: a session is set by index.php
// - Non-browser / programmatic use: set PROXY_TOKEN in the environment and pass ?token=... to proxy.php
function proxy_expected_token() {
    $t = getenv('PROXY_TOKEN');
    return is_string($t) ? $t : '';
}

function proxy_has_valid_token() {
    $expected = proxy_expected_token();
    if ($expected === '') {
        return false;
    }
    $token = $_GET['token'] ?? '';
    return is_string($token) && hash_equals($expected, $token);
}

$session_ok = !empty($_SESSION['user_active']);
$token_ok = proxy_has_valid_token();
if (!$session_ok && !$token_ok) {
    http_response_code(403);
    echo 'Session or token required';
    exit;
}

// Configuration
define('CACHE_TTL', 300); // 5 minutes
define('MAX_DOWNLOAD_BYTES', 3670016); // 3.5 MB
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

if (isset($_SESSION['proxy_cache'][$key]) && $_SESSION['proxy_cache'][$key]['time'] + CACHE_TTL > time()) {
    $entry = $_SESSION['proxy_cache'][$key];
    $data = $entry['data'];
    $type = $entry['type'];
} else {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_USERAGENT => 'IPTV-Proxy',
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
    ]);
    $buffer = '';
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) use (&$buffer) {
        $buffer .= $chunk;
        if (strlen($buffer) > MAX_DOWNLOAD_BYTES) {
            return 0; // abort
        }
        return strlen($chunk);
    });
    curl_exec($ch);
    $primary = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
    if ($primary && filter_var($primary, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        http_response_code(400);
        echo 'Refusing private address';
        curl_close($ch);
        exit;
    }
    $http = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($http >= 300 && $http < 400) {
        http_response_code(502);
        echo 'Remote redirect not allowed';
        curl_close($ch);
        exit;
    }
    if (curl_errno($ch) === CURLE_WRITE_ERROR && strlen($buffer) > MAX_DOWNLOAD_BYTES) {
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
    $data = $buffer;
    $type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'text/plain';
    curl_close($ch);
    $_SESSION['proxy_cache'][$key] = [
        'time' => time(),
        'data' => $data,
        'type' => $type,
    ];
}

header('Content-Type: ' . $type);
echo $data;
