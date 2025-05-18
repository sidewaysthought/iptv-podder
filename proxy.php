<?php
session_start();

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

cleanup_cache();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo 'Method Not Allowed';
    exit;
}

// ensure requests come over HTTPS/443
if ((empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') && ($_SERVER['SERVER_PORT'] ?? 0) != 443) {
    http_response_code(403);
    echo 'HTTPS required';
    exit;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$referer = $_SERVER['HTTP_REFERER'] ?? '';
$host = $_SERVER['HTTP_HOST'];

function same_host($url, $host) {
    $h = parse_url($url, PHP_URL_HOST);
    return $h === $host;
}

$allowed = false;
if ($origin && same_host($origin, $host)) {
    header("Access-Control-Allow-Origin: $origin");
    $allowed = true;
} elseif ($referer && same_host($referer, $host)) {
    $allowed = true;
}

if (!$allowed) {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

rate_limit();

$url = $_GET['url'] ?? '';
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo "Invalid url";
    exit;
}

$parts = parse_url($url);
if (($parts['scheme'] ?? '') !== 'https') {
    http_response_code(400);
    echo "Invalid scheme";
    exit;
}

$path = strtolower($parts['path'] ?? '');
if (!preg_match('/\.m3u8?$/', $path)) {
    http_response_code(400);
    echo 'Invalid playlist extension';
    exit;
}

$resolved = gethostbyname($parts['host']);
if (filter_var($resolved, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
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
