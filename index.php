<?php $pageTitle = 'View IPTV | View-IPTV.stream'; ?>
<!DOCTYPE html>
<html lang="en">
<?php include 'partials/head.php'; ?>
<body class="min-h-screen bg-gray-100 text-gray-900">
    <nav class="sr-only focus-within:not-sr-only absolute left-2 top-2 bg-white p-2 rounded shadow space-y-2">
        <a href="#playlistForm" class="block">Skip to playlist</a>
        <a href="#videoPlayer" class="block">Skip to video player</a>
    </nav>
    <?php 
    $pageTitle = "Home";
    include 'partials/header.php'; 
    ?>
    <main class="container mx-auto p-6 max-w-6xl">
        <!-- Header -->
        <header class="mb-4">
            <h1 class="text-3xl font-bold">IPTV Stream Viewer</h1>
            <p class="text-gray-600">
                Paste an <code>.m3u</code> or <code>.m3u8</code> playlist/manifest URL. We’ll list the
                streams and play them on click.
            </p>
        </header>

        <!-- Controls -->
        <div id="playlistForm" tabindex="-1" class="flex flex-col sm:flex-row gap-2 mt-4">
            <input id="manifestUrl" type="url" placeholder="https://example.com/playlist.m3u8"
                class="flex-1 px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring" />
            <button id="loadBtn" class="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700">
                Load
            </button>
        </div>

        <!-- Two‑column layout -->
        <div class="flex flex-col lg:flex-row gap-4 mt-6">
            <!-- Sidebar: search + list -->
            <aside id="playlistContainer"
                class="lg:w-1/3 w-full flex flex-col border border-gray-300 rounded shadow-sm overflow-hidden bg-white">
                <!-- Search -->
                <div id="searchWrap" class="hidden p-2 border-b border-gray-200">
                    <input id="searchInput" type="text" placeholder="Filter channels..."
                        class="w-full px-3 py-2 border rounded shadow-sm focus:outline-none focus:ring" />
                </div>

                <!-- Streams list -->
                <div id="listWrapper" class="flex-1 overflow-y-auto">
                    <ul id="streamList" class="space-y-1 text-blue-700 p-2 pr-3"></ul>
                    <div class="border-t text-xs text-gray-700 p-2 space-x-4 mt-2" aria-label="Legend">
                        <span><span aria-hidden="true">▶</span> <span class="sr-only">Playing</span> = playing</span>
                        <span><span aria-hidden="true" class="text-red-500">🚫</span> <span class="sr-only">Error</span> = failed</span>
                    </div>
                </div>
            </aside>

            <!-- Player -->
            <section class="flex-1">
                <div id="playerWrapper" class="relative w-full aspect-video"> <!-- 16:9 Aspect Ratio -->
                    <video id="videoPlayer" class="absolute top-0 left-0 w-full h-full rounded shadow-lg bg-black" controls preload="metadata"></video>
                </div>
            </section>
        </div>
    </main>
    <?php include 'partials/footer.php'; ?>
    <script src="main.js"></script>
</body>
</html>
