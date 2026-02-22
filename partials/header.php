<header class="fixed inset-x-0 top-0 bg-gradient-to-r from-white via-sky-50 to-blue-100 dark:bg-black border-b border-sky-200 shadow-[0_1px_0_rgba(148,163,184,0.35)] dark:border-gray-500 z-50">
    <div class="container mx-auto max-w-6xl flex justify-between items-center p-4">
        <h1 class="m-0 text-lg font-semibold text-gray-900 dark:text-gray-100"><a href="index.php" class="hover:underline focus:underline">View-IPTV.stream</a></h1>
        <nav class="space-x-4 flex items-center">
            <a href="index.php" class="text-slate-700 hover:underline dark:text-blue-300">Home</a>

            <!-- Settings: theme selector (system default + explicit user choice) -->
            <div class="relative">
              <button
                id="settingsBtn"
                type="button"
                class="px-2 py-1 rounded border border-sky-200 bg-gradient-to-r from-white via-sky-50 to-blue-100 text-slate-700 hover:from-sky-50 hover:to-blue-200 focus:outline-none focus:ring dark:border-gray-500 dark:bg-black dark:text-gray-100 dark:hover:bg-gray-900"
                aria-haspopup="menu"
                aria-controls="settingsMenu"
                aria-expanded="false"
              >
                <span aria-hidden="true">⚙</span>
                <span class="sr-only">Settings</span>
              </button>

              <div
                id="settingsMenu"
                role="menu"
                aria-label="Settings"
                class="absolute right-0 top-full mt-2 w-56 bg-gradient-to-b from-white via-sky-50 to-blue-100 border border-sky-200 rounded shadow hidden z-50 max-h-[60vh] overflow-y-auto overscroll-contain dark:bg-gray-950 dark:border-gray-500"
              >
                <div class="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-gray-300">Theme</div>
                <button role="menuitemradio" aria-checked="false" data-theme="system" class="block w-full text-left px-3 py-2 text-slate-800 hover:bg-blue-100/60 focus:outline-none focus:ring dark:text-gray-100 dark:hover:bg-gray-900">System</button>
                <button role="menuitemradio" aria-checked="false" data-theme="dark" class="block w-full text-left px-3 py-2 text-slate-800 hover:bg-blue-100/60 focus:outline-none focus:ring dark:text-gray-100 dark:hover:bg-gray-900">Dark</button>
                <button role="menuitemradio" aria-checked="false" data-theme="light" class="block w-full text-left px-3 py-2 text-slate-800 hover:bg-blue-100/60 focus:outline-none focus:ring dark:text-gray-100 dark:hover:bg-gray-900">Light</button>
              </div>
            </div>
        </nav>
    </div>
</header>

<script>
(function () {
  const btn = document.getElementById('settingsBtn');
  const menu = document.getElementById('settingsMenu');

  if (!btn || !menu || typeof window.__vip_getTheme !== 'function' || typeof window.__vip_setTheme !== 'function') return;

  const items = Array.from(menu.querySelectorAll('[data-theme]'));

  function positionDropdown(btn, menu) {
    if (!btn || !menu) return;

    menu.classList.add('top-full', 'mt-2');
    menu.classList.remove('bottom-full', 'mb-2');

    const prevVis = menu.style.visibility;
    menu.style.visibility = 'hidden';

    const menuRect = menu.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const overflowBottom = menuRect.bottom > window.innerHeight;

    if (overflowBottom && btnRect.top > menuRect.height) {
      menu.classList.remove('top-full', 'mt-2');
      menu.classList.add('bottom-full', 'mb-2');
    }

    menu.style.visibility = prevVis;
  }

  function openMenu() {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    positionDropdown(btn, menu);
    // focus current selection
    const cur = window.__vip_getTheme();
    const el = items.find(i => i.dataset.theme === cur) || items[0];
    el?.focus();
  }

  function closeMenu() {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }

  function isOpen() {
    return !menu.classList.contains('hidden');
  }

  function render() {
    const cur = window.__vip_getTheme();
    items.forEach((el) => {
      const checked = el.dataset.theme === cur;
      el.setAttribute('aria-checked', checked ? 'true' : 'false');
      el.classList.toggle('font-semibold', checked);
    });

    const effectiveDark = document.documentElement.classList.contains('dark');
    const label = cur === 'system'
      ? `Settings. Theme: system (${effectiveDark ? 'dark' : 'light'}).`
      : `Settings. Theme: ${cur}.`;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // Prevent the document-level click handler from immediately closing the menu
    e.stopPropagation();
    if (isOpen()) closeMenu(); else openMenu();
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen()) openMenu();
    }
  });

  items.forEach((el) => {
    el.addEventListener('click', () => {
      const theme = el.dataset.theme;
      window.__vip_setTheme(theme);
      render();
      closeMenu();
      btn.focus();
    });

    el.addEventListener('keydown', (e) => {
      const idx = items.indexOf(el);
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        btn.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        (items[idx + 1] || items[0]).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (items[idx - 1] || items[items.length - 1]).focus();
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    // Close when clicking outside the menu *and* outside the button (including its children).
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      btn.focus();
    }
  });

  window.addEventListener('vip:theme', render);
  render();
})();
</script>
