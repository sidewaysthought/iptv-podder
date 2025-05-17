<header class="bg-gray-200">
    <div class="container mx-auto max-w-6xl flex justify-between items-center p-4">
        <div class="font-semibold">View-IPTV.stream</div>
        <nav class="space-x-4 flex items-center">
            <a href="index.php" class="text-blue-600 hover:underline">Home</a>
            <div class="relative">
                <button id="shareBtn" aria-haspopup="true" aria-expanded="false" class="text-blue-600">
                    <span aria-hidden="true">🔗</span>
                    <span class="sr-only">Share</span>
                </button>
                <div id="shareMenu" class="absolute right-0 mt-2 w-48 bg-white border rounded shadow hidden">
                    <button id="sharePlaylistBtn" class="block w-full text-left px-2 py-1 hover:bg-gray-100 disabled:opacity-50" disabled>Share playlist</button>
                    <button id="shareVideoBtn" class="block w-full text-left px-2 py-1 hover:bg-gray-100 disabled:opacity-50" disabled>Share playlist &amp; video</button>
                </div>
            </div>
        </nav>
    </div>
</header>
