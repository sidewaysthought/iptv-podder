<header class="bg-gray-200 dark:bg-gray-800">
    <div class="container mx-auto max-w-6xl flex justify-between items-center p-4">
        <div class="font-semibold">View-IPTV.stream</div>
        <nav class="space-x-4 flex items-center">
            <a href="index.php" class="text-blue-600 hover:underline">Home</a>
            <button id="settingsBtn" class="text-blue-600 p-1" aria-haspopup="dialog">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-5 h-5" aria-hidden="true" fill="currentColor">
                    <path d="M11.983 1a2 2 0 011.993 1.829l.007.171v1.084a7.958 7.958 0 012.26.936l.77-.77a2 2 0 012.829 2.828l-.77.77a7.959 7.959 0 01.936 2.26h1.085a2 2 0 011.995 1.829l.005.171a2 2 0 01-1.829 1.995l-.171.005h-1.084a7.959 7.959 0 01-.937 2.26l.77.77a2 2 0 01-2.828 2.828l-.77-.77a7.959 7.959 0 01-2.26.936v1.085a2 2 0 01-1.829 1.995l-.171.005a2 2 0 01-1.995-1.829L10 22.017v-1.084a7.958 7.958 0 01-2.26-.937l-.77.77a2 2 0 01-2.828-2.828l.77-.77a7.958 7.958 0 01-.936-2.26H2.793a2 2 0 01-1.993-1.829L.793 11.983a2 2 0 011.829-1.995l.171-.005h1.084a7.958 7.958 0 01.937-2.26l-.77-.77a2 2 0 012.828-2.828l.77.77a7.958 7.958 0 012.26-.936V3a2 2 0 011.829-1.995L11.983 1zm0 6a4 4 0 100 8 4 4 0 000-8z"/>
                </svg>
                <span class="sr-only">Settings</span>
            </button>
        </nav>
    </div>
</header>
<div id="settingsModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
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
