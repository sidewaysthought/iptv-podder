<?php
session_start();

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

$url = $_GET['url'] ?? '';
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo "Invalid url";
    exit;
}

$parts = parse_url($url);
if (!in_array($parts['scheme'], ['http', 'https'])) {
    http_response_code(400);
    echo "Invalid scheme";
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

if (isset($_SESSION['proxy_cache'][$key]) && $_SESSION['proxy_cache'][$key]['time'] + 300 > time()) {
    $entry = $_SESSION['proxy_cache'][$key];
    $data = $entry['data'];
    $type = $entry['type'];
} else {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERAGENT => 'IPTV-Proxy',
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
    ]);
    $data = curl_exec($ch);
    if ($data === false) {
        http_response_code(502);
        echo "Failed to fetch";
        exit;
    }
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
