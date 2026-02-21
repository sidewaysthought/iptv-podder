<header class="bg-gray-200 dark:bg-gray-900">
    <div class="container mx-auto max-w-6xl flex justify-between items-center p-4">
        <div class="font-semibold text-gray-900 dark:text-gray-100">View-IPTV.stream</div>
        <nav class="space-x-4 flex items-center">
            <a href="index.php" class="text-blue-700 hover:underline dark:text-blue-300">Home</a>

            <!-- Theme toggle: defaults to system preference, but user can override -->
            <button
              id="themeToggle"
              type="button"
              class="px-2 py-1 rounded text-gray-800 hover:bg-gray-300 focus:outline-none focus:ring dark:text-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle dark mode"
            >
              <span id="themeIcon" aria-hidden="true">🌙</span>
              <span class="sr-only" id="themeText">Theme</span>
            </button>
        </nav>
    </div>
</header>

<script>
(function () {
  const btn = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  if (!btn || !icon || typeof window.__vip_getTheme !== 'function' || typeof window.__vip_setTheme !== 'function') return;

  function render() {
    const theme = window.__vip_getTheme();
    const isDark = document.documentElement.classList.contains('dark');

    // 3-state cycle: system -> dark -> light -> system
    // UI: show the *current effective* mode by icon.
    icon.textContent = isDark ? '☀' : '🌙';

    const label = theme === 'system'
      ? `Theme: system (${isDark ? 'dark' : 'light'}) — click to override`
      : `Theme: ${theme} — click to switch`;

    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  }

  function nextTheme(current) {
    if (current === 'system') return 'dark';
    if (current === 'dark') return 'light';
    return 'system';
  }

  btn.addEventListener('click', () => {
    const cur = window.__vip_getTheme();
    window.__vip_setTheme(nextTheme(cur));
    render();
  });

  window.addEventListener('vip:theme', render);
  render();
})();
</script>
