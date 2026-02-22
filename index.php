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
$_SESSION['user_active'] = true;
$pageTitle = 'View IPTV';
?>
<!DOCTYPE html>
<html lang="en">
<?php include 'partials/head.php'; ?>
<body class="min-h-screen bg-gray-100 text-gray-900 dark:bg-black dark:text-gray-100">
    <style>
        :root {
            --site-header-height: 4.5rem;
            --site-player-height: clamp(13rem, 49vw, 32rem);
            --site-footer-height: 5rem;
        }

        #fixedPlayerRow {
            top: var(--site-header-height);
            min-height: var(--site-player-height);
        }

        #appMain {
            padding-top: calc(var(--site-header-height) + var(--site-player-height));
            padding-bottom: calc(var(--site-footer-height) + 1rem);
        }

        @media (min-width: 640px) {
            #playerWrapper {
                padding-top: min(45%, 45vh) !important;
            }
        }
    </style>
    <div class="min-h-screen flex flex-col">
    <div>
    <nav class="sr-only focus-within:not-sr-only absolute left-2 top-2 bg-white p-2 rounded shadow space-y-2">
        <a href="#playerHeading" class="block">Skip to player</a>
        <a href="#playlistControlsHeading" class="block">Skip to playlist controls</a>
        <a href="#streamGridHeading" class="block">Skip to streams</a>
    </nav>
    <?php include 'partials/header.php'; ?>
    </div>
    <main id="appMain" class="w-full">

        <!-- Row: player -->
        <section id="fixedPlayerRow" class="fixed inset-x-0 z-40 w-full bg-gray-100 dark:bg-black">
            <div class="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
                <h2 id="playerHeading" class="sr-only">Video player</h2>
                <div class="max-w-5xl mx-auto">
                    <div id="playerWrapper" class="relative w-full" style="padding-top: 45%;">
                        <video id="videoPlayer" class="absolute top-0 left-0 w-full h-full rounded shadow-lg bg-black" controls preload="metadata"></video>
                    </div>
                </div>
            </div>
        </section>

        <!-- Row: controls bar (full width stripe, inset controls) -->
        <section class="w-full border-y border-gray-200 dark:border-gray-500 bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4">
                <h2 id="playlistControlsHeading" class="sr-only">Playlist controls</h2>
                <div id="playlistForm" tabindex="-1" class="max-w-5xl mx-auto flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <label for="manifestUrl" class="sr-only">Playlist URL</label>
                    <input id="manifestUrl" type="url" list="history" placeholder="https://example.com/playlist.m3u8"
                        class="flex-1 min-w-0 px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring dark:bg-gray-950 dark:text-gray-100 dark:border-gray-500" />
                    <datalist id="history"></datalist>
                    <button id="loadBtn" class="px-4 py-2 bg-blue-700 text-white rounded shadow hover:bg-blue-800 focus:outline-none focus:ring dark:bg-black dark:text-gray-100 dark:border dark:border-gray-500 dark:hover:bg-gray-900">
                        Load
                    </button>
                    <div class="relative flex items-center z-50 justify-center">
                        <button id="historyBtn" aria-haspopup="menu" aria-controls="historyMenu" aria-expanded="false" class="px-2 text-blue-700 hover:text-blue-900 focus:outline-none focus:ring rounded dark:text-blue-300 dark:hover:text-blue-200">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-5 h-5" stroke-width="2">
                                <path d="M3 12a9 9 0 1118 0 9 9 0 01-18 0z" stroke-linecap="round" stroke-linejoin="round" />
                                <path d="M12 7v5l3 3" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                            <span class="sr-only">History</span>
                        </button>
                        <div id="historyMenu" role="menu" aria-labelledby="historyBtn" class="absolute right-0 top-full mt-2 w-64 max-w-[80vw] bg-white border rounded shadow hidden z-50 overflow-hidden max-h-[60vh] overflow-y-auto overscroll-contain dark:bg-gray-950 dark:border-gray-500"></div>
                    </div>
                    <div class="relative flex items-center z-50 justify-center">
                        <button id="shareBtn" aria-haspopup="menu" aria-controls="shareMenu" aria-expanded="false" class="px-2 text-blue-700 hover:text-blue-900 focus:outline-none focus:ring rounded dark:text-blue-300 dark:hover:text-blue-200">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-5 h-5" stroke-width="2">
                                <path d="M12 5v12" stroke-linecap="round" stroke-linejoin="round" />
                                <path d="M9 8l3-3 3 3" stroke-linecap="round" stroke-linejoin="round" />
                                <rect x="5" y="14" width="14" height="6" rx="1" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                            <span class="sr-only">Share</span>
                        </button>
                        <div id="shareMenu" role="menu" aria-labelledby="shareBtn" class="absolute right-0 top-full mt-2 w-56 max-w-[80vw] bg-white border rounded shadow hidden z-50 overflow-hidden max-h-[60vh] overflow-y-auto overscroll-contain dark:bg-gray-950 dark:border-gray-500">
                            <button id="sharePlaylistBtn" role="menuitem" class="block w-full text-left px-2 py-1 hover:bg-gray-100 focus:outline-none focus:ring disabled:opacity-50 dark:hover:bg-gray-900 dark:text-gray-100" disabled>Share playlist</button>
                            <button id="shareVideoBtn" role="menuitem" class="block w-full text-left px-2 py-1 hover:bg-gray-100 focus:outline-none focus:ring disabled:opacity-50 dark:hover:bg-gray-900 dark:text-gray-100" disabled>Share playlist &amp; video</button>
                        </div>
                    </div>
                </div>
                <div class="max-w-5xl mx-auto mt-3 border-t text-xs text-gray-800 pt-3 dark:text-gray-100" aria-label="Stream status legend">
                    <p class="font-semibold">Status legend</p>
                    <ul class="mt-1 flex items-center gap-4 whitespace-nowrap overflow-x-auto" role="list">
                        <li class="inline-flex items-center gap-1"><span aria-hidden="true">⏳</span> Loading (trying to play)</li>
                        <li class="inline-flex items-center gap-1"><span aria-hidden="true">▶</span> Playing now</li>
                        <li class="inline-flex items-center gap-1"><span aria-hidden="true">✓</span> Works (played before)</li>
                        <li class="inline-flex items-center gap-1"><span aria-hidden="true">✕</span> Failed to play</li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- Row: playlist browsing (search + scrollable channel grid) -->
        <section id="playlistPanel" class="w-full dark:bg-gray-950">
            <div class="w-full px-4 sm:px-6 py-4">
                <h2 id="streamGridHeading" class="sr-only">Stream list</h2>
                <!-- Filter UI can be re-enabled later; keep DOM element for JS but hide it for now. -->
                <div id="searchWrap" class="hidden w-full" hidden>
                    <label for="searchInput" class="sr-only">Filter channels</label>
                    <input id="searchInput" type="text" placeholder="Filter channels..."
                        class="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" />
                </div>

                <div id="listWrapper" class="mt-6 pb-4">
                    <div id="streamList" class="grid gap-3 w-full mx-auto" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 220px)); justify-content: center; gap: 0.75rem; max-width: calc((220px * 6) + (0.75rem * 5));"></div>
                </div>
            </div>
        </section>
    </main>

    <!-- Screen reader announcements for dynamic updates -->
    <div id="srStatus" class="sr-only" aria-live="polite" aria-atomic="true"></div>

    <?php include 'partials/footer.php'; ?>
    </div>

    <script type="module" src="main.js"></script>
</body>
</html>
