<?php
session_start();
$_SESSION['user_active'] = true;
$pageTitle = 'View IPTV';
?>
<!DOCTYPE html>
<html lang="en">
<?php include 'partials/head.php'; ?>
<body class="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <div class="min-h-screen flex flex-col">
    <div>
    <nav class="sr-only focus-within:not-sr-only absolute left-2 top-2 bg-white p-2 rounded shadow space-y-2">
        <a href="#playlistForm" class="block">Skip to playlist</a>
        <a href="#videoPlayer" class="block">Skip to video player</a>
    </nav>
    <?php include 'partials/header.php'; ?>
    </div>
    <main class="container mx-auto p-6 max-w-6xl flex-1">
        <!-- Header -->
        <header class="mb-4">
            <h1 class="text-3xl font-bold">IPTV Stream Viewer</h1>
            <p class="text-gray-600 dark:text-gray-300">
                Paste an <code>.m3u</code> or <code>.m3u8</code> playlist/manifest URL. We’ll list the
                streams and play them on click.
            </p>
        </header>

        <!-- Controls -->
        <div id="playlistForm" tabindex="-1" class="flex flex-col sm:flex-row gap-2 mt-4">
            <label for="manifestUrl" class="sr-only">Playlist URL</label>
            <input id="manifestUrl" type="url" list="history" placeholder="https://example.com/playlist.m3u8"
                class="flex-1 px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" />
            <datalist id="history"></datalist>
            <button id="loadBtn" class="px-4 py-2 bg-blue-700 text-white rounded shadow hover:bg-blue-800 focus:outline-none focus:ring">
                Load
            </button>
            <div class="relative flex items-center z-50">
                <button id="historyBtn" aria-haspopup="menu" aria-controls="historyMenu" aria-expanded="false" class="px-2 text-blue-700 hover:text-blue-900 focus:outline-none focus:ring rounded dark:text-blue-300 dark:hover:text-blue-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-5 h-5" stroke-width="2">
                        <path d="M3 12a9 9 0 1118 0 9 9 0 01-18 0z" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M12 7v5l3 3" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    <span class="sr-only">History</span>
                </button>
                <div id="historyMenu" role="menu" aria-labelledby="historyBtn" class="absolute right-0 top-full mt-2 w-64 max-w-[80vw] bg-white border rounded shadow hidden z-50 overflow-hidden max-h-[60vh] overflow-y-auto overscroll-contain dark:bg-gray-900 dark:border-gray-700"></div>
            </div>
            <div class="relative flex items-center z-50">
                <button id="shareBtn" aria-haspopup="menu" aria-controls="shareMenu" aria-expanded="false" class="px-2 text-blue-700 hover:text-blue-900 focus:outline-none focus:ring rounded dark:text-blue-300 dark:hover:text-blue-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-5 h-5" stroke-width="2">
                        <path d="M12 5v12" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M9 8l3-3 3 3" stroke-linecap="round" stroke-linejoin="round" />
                        <rect x="5" y="14" width="14" height="6" rx="1" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    <span class="sr-only">Share</span>
                </button>
                <div id="shareMenu" role="menu" aria-labelledby="shareBtn" class="absolute right-0 top-full mt-2 w-56 max-w-[80vw] bg-white border rounded shadow hidden z-50 overflow-hidden max-h-[60vh] overflow-y-auto overscroll-contain dark:bg-gray-900 dark:border-gray-700">
                    <button id="sharePlaylistBtn" role="menuitem" class="block w-full text-left px-2 py-1 hover:bg-gray-100 focus:outline-none focus:ring disabled:opacity-50 dark:hover:bg-gray-800 dark:text-gray-100" disabled>Share playlist</button>
                    <button id="shareVideoBtn" role="menuitem" class="block w-full text-left px-2 py-1 hover:bg-gray-100 focus:outline-none focus:ring disabled:opacity-50 dark:hover:bg-gray-800 dark:text-gray-100" disabled>Share playlist &amp; video</button>
                </div>
            </div>
        </div>

        <!-- Two‑column layout -->
        <div class="flex flex-col lg:flex-row gap-4 mt-6 min-h-0">
            <!-- Sidebar: search + list -->
            <aside id="playlistContainer"
                class="lg:w-1/3 w-full flex flex-col min-h-0 border border-gray-300 rounded shadow-sm overflow-hidden bg-white dark:bg-gray-900 dark:border-gray-700 max-h-[70vh] lg:max-h-[calc(100vh-14rem)]">
                <!-- Search -->
                <div id="searchWrap" class="hidden p-2 border-b border-gray-200">
                    <label for="searchInput" class="sr-only">Filter channels</label>
                    <input id="searchInput" type="text" placeholder="Filter channels..."
                        class="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" />
                </div>

                <!-- Streams list -->
                <div id="listWrapper" class="flex-1 min-h-0 overflow-y-auto">
                    <ul id="streamList" class="space-y-1 text-blue-700 p-2 pr-3 dark:text-blue-300"></ul>
                </div>
                <div class="border-t text-xs text-gray-800 p-2 dark:text-gray-100" aria-label="Stream status legend">
                    <p class="font-semibold">Status legend</p>
                    <ul class="mt-1 space-y-1">
                        <li><span aria-hidden="true">⏳</span> <span class="sr-only">Loading</span> Loading (trying to play)</li>
                        <li><span aria-hidden="true">▶</span> <span class="sr-only">Playing</span> Playing now</li>
                        <li><span aria-hidden="true">✓</span> <span class="sr-only">Works</span> Works (played before)</li>
                        <li><span aria-hidden="true">✕</span> <span class="sr-only">Failed</span> Failed to play</li>
                    </ul>
                </div>
            </aside>

            <!-- Player -->
            <section class="flex-1">
                <div id="playerWrapper" class="relative w-full" style="padding-top: 56.25%;"> <!-- 16:9 Aspect Ratio -->
                    <video id="videoPlayer" class="absolute top-0 left-0 w-full h-full rounded shadow-lg bg-black" controls preload="metadata"></video>
                </div>
            </section>
        </div>
    </main>

    <!-- Screen reader announcements for dynamic updates -->
    <div id="srStatus" class="sr-only" aria-live="polite" aria-atomic="true"></div>

    <?php include 'partials/footer.php'; ?>
    </div>

    <script type="module" src="main.js"></script>
</body>
</html>
