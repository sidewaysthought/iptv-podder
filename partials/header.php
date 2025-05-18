<header class="bg-gray-200 dark:bg-gray-800">
    <div class="container mx-auto max-w-6xl flex justify-between items-center p-4">
        <div class="font-semibold">View-IPTV.stream</div>
        <nav class="space-x-4 flex items-center">
            <a href="index.php" class="text-blue-600 hover:underline">Home</a>
            <button id="settingsBtn" class="text-blue-600 p-1" aria-haspopup="dialog">
                <i class="fa-solid fa-gear w-5 h-5" aria-hidden="true"></i>
                <span class="sr-only">Settings</span>
            </button>
        </nav>
    </div>
</header>
<div id="settingsModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden">
    <div class="bg-white dark:bg-gray-800 p-4 rounded shadow w-80" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <h2 id="settingsTitle" class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Settings</h2>
        <label class="block">
            <span class="text-gray-700 dark:text-gray-300">Theme</span>
            <select id="themeSelect" class="mt-1 block w-full border rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100">
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </select>
        </label>
        <div class="flex justify-end mt-4">
            <button id="closeSettingsBtn" class="px-4 py-2 bg-blue-600 text-white rounded">Close</button>
        </div>
    </div>
</div>
