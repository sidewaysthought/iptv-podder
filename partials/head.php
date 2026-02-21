<?php
// Set the page title logic
if (empty($pageTitle)) {
    $pageTitle = 'View-IPTV.stream';
} else {
    $pageTitle = $pageTitle . ' | View-IPTV.stream';
}
?>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?php echo htmlspecialchars($pageTitle); ?></title>

    <!-- Theme: default to system preference; allow user override.
         We set the HTML class *before* CSS loads to avoid a flash of wrong theme. -->
    <script>
      (function () {
        const KEY = 'vip_theme'; // 'system' | 'light' | 'dark'

        function apply(theme) {
          const root = document.documentElement;
          const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
          const isDark = theme === 'dark' || (theme === 'system' && systemDark);
          root.classList.toggle('dark', !!isDark);
        }

        function getTheme() {
          try {
            return localStorage.getItem(KEY) || 'system';
          } catch {
            return 'system';
          }
        }

        function setTheme(theme) {
          try { localStorage.setItem(KEY, theme); } catch {}
          apply(theme);
          // Notify any UI toggles
          window.dispatchEvent(new CustomEvent('vip:theme', { detail: { theme } }));
        }

        window.__vip_getTheme = getTheme;
        window.__vip_setTheme = setTheme;

        // Apply immediately
        apply(getTheme());

        // If following system preference, update live
        if (window.matchMedia) {
          const mq = window.matchMedia('(prefers-color-scheme: dark)');
          const onChange = () => {
            if (getTheme() === 'system') apply('system');
          };
          try {
            mq.addEventListener('change', onChange);
          } catch {
            // Safari fallback
            mq.addListener(onChange);
          }
        }
      })();
    </script>

    <!-- Tailwind CSS (built locally; pinned version; supports darkMode='class') -->
    <link rel="stylesheet" href="assets/tailwind.css" />

    <!-- Layout safety: prevent large playlists from inflating document height.
         Tailwind classes should already do this, but we add a small CSS fallback
         so long lists reliably scroll in the sidebar even if a class is missing/not applied. -->
    <style>
      #playlistContainer { max-height: 70vh; min-height: 0; }
      #listWrapper { min-height: 0; overflow-y: auto; }
      @media (min-width: 1024px) {
        #playlistContainer { max-height: calc(100vh - 14rem); }
      }
    </style>
    <!-- hls.js -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <!-- dash.js -->
    <script src="https://cdn.dashjs.org/latest/dash.all.min.js"></script>
    <?php include 'partials/analytics.php'; ?>
</head>
