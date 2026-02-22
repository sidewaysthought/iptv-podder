let hls = null;

function isAlreadyProxied(url) {
  if (!url) return false;
  // handle relative and absolute proxy URLs
  if (url.startsWith('proxy.php?url=')) return true;
  if (url.includes('/proxy.php?url=')) return true;
  return false;
}

function proxifyUrl(url) {
  if (isAlreadyProxied(url)) return url;
  return `proxy.php?url=${encodeURIComponent(url)}`;
}

function isLikelyPlaylistUrl(url) {
  return /\.m3u8($|\?)/i.test(url);
}

// Hls.js loader that routes PLAYLIST requests through the PHP proxy.
// Important: we do NOT proxy media segments (bandwidth/cost). If a stream requires
// segment proxying to play due to CORS/mixed-content/byterange behavior, we fail fast.
class PlaylistProxyLoader extends Hls.DefaultConfig.loader {
  load(context, config, callbacks) {
    const origUrl = context.url;
    const ctxType = context?.type;

    // Only proxy manifest/playlist-like loads.
    // Hls.js context.type commonly includes: manifest, level, audioTrack, subtitleTrack, fragment, key.
    const shouldProxy =
      (ctxType === 'manifest' || ctxType === 'level' || ctxType === 'audioTrack' || ctxType === 'subtitleTrack') &&
      isLikelyPlaylistUrl(origUrl);

    const nextContext = shouldProxy
      ? { ...context, url: proxifyUrl(origUrl) }
      : context;

    const wrappedCallbacks = {
      ...callbacks,
      onSuccess: (response, stats, ctx, networkDetails) => {
        // Make hls.js treat the response as if it came from the original URL.
        // This preserves base URL resolution for relative URIs in playlists.
        if (shouldProxy && response && typeof response === 'object') {
          response.url = origUrl;
        }
        callbacks.onSuccess(response, stats, shouldProxy ? { ...ctx, url: origUrl } : ctx, networkDetails);
      },
      onError: (error, ctx, networkDetails) => {
        callbacks.onError(error, shouldProxy ? { ...ctx, url: origUrl } : ctx, networkDetails);
      },
      onTimeout: (stats, ctx, networkDetails) => {
        callbacks.onTimeout(stats, shouldProxy ? { ...ctx, url: origUrl } : ctx, networkDetails);
      },
    };

    return super.load(nextContext, config, wrappedCallbacks);
  }
}

let dashPlayer = null;
let activeLi = null;
let activeUri = null;
let currentPlaylist = null;
let playSessionId = 0;

let playbackNoticeEl = null;
function ensurePlaybackNotice() {
  if (playbackNoticeEl) return;
  playbackNoticeEl = document.createElement('div');
  playbackNoticeEl.id = 'playbackNotice';
  playbackNoticeEl.className = [
    'mt-2',
    'p-2',
    'rounded',
    'border',
    'text-sm',
    'hidden',
    'bg-yellow-50',
    'border-yellow-200',
    'text-yellow-900',
    'dark:bg-yellow-950',
    'dark:border-yellow-900',
    'dark:text-yellow-100',
  ].join(' ');

  const mount = document.getElementById('playerWrapper') || document.body;
  mount.appendChild(playbackNoticeEl);
}

function clearPlaybackNotice() {
  ensurePlaybackNotice();
  playbackNoticeEl.textContent = '';
  playbackNoticeEl.classList.add('hidden');
}

function showPlaybackNotice(msg) {
  ensurePlaybackNotice();
  playbackNoticeEl.textContent = msg;
  playbackNoticeEl.classList.remove('hidden');
}

// Track the last known status of each stream so we can show a persistent checkmark
// even after switching away.
// status: 'untested' | 'pending' | 'playing' | 'ok' | 'failed'
const streamStatusByUri = new Map();

// Enable debug UI/logging when ?debug is present in the URL
const DEBUG = new URLSearchParams(window.location.search).has("debug");
function debugLog(...args) {
  if (DEBUG) console.log("[DEBUG]", ...args);
}

let debugPanel = null;
let debugCopyBtn = null;
let debugTextEl = null;

function ensureDebugPanel() {
  if (!DEBUG) return;
  if (debugPanel) return;

  debugPanel = document.createElement('div');
  debugPanel.id = 'debugPanel';
  debugPanel.className = [
    'mt-2',
    'p-2',
    'rounded',
    'border',
    'text-xs',
    'bg-gradient-to-r',
    'from-white',
    'via-sky-50',
    'to-blue-100',
    'border-sky-200',
    'text-slate-700',
    'dark:bg-black',
    'dark:border-gray-500',
    'dark:text-gray-100',
  ].join(' ');

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-2';

  const title = document.createElement('div');
  title.className = 'font-semibold';
  title.textContent = 'Debug (client)';

  debugCopyBtn = document.createElement('button');
  debugCopyBtn.type = 'button';
  debugCopyBtn.className = 'px-2 py-1 rounded border border-sky-200 bg-gradient-to-r from-white via-sky-50 to-blue-100 text-slate-800 hover:from-sky-50 hover:to-blue-200 dark:border-gray-500 dark:bg-black dark:text-gray-100 dark:hover:bg-gray-900';
  debugCopyBtn.textContent = 'Copy';
  debugCopyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(debugTextEl?.textContent || '');
      debugCopyBtn.textContent = 'Copied';
      setTimeout(() => (debugCopyBtn.textContent = 'Copy'), 900);
    } catch {
      // Fallback
      prompt('Copy debug info:', debugTextEl?.textContent || '');
    }
  });

  header.appendChild(title);
  header.appendChild(debugCopyBtn);

  debugTextEl = document.createElement('pre');
  debugTextEl.className = 'mt-2 whitespace-pre-wrap break-words';
  debugTextEl.textContent = 'Playback: (not started)';

  debugPanel.appendChild(header);
  debugPanel.appendChild(debugTextEl);

  // Prefer to mount under the player wrapper if present.
  const mount = document.getElementById('playerWrapper') || document.body;
  mount.appendChild(debugPanel);
}

function setDebugInfo(info) {
  if (!DEBUG) return;
  ensureDebugPanel();

  const lines = [];
  for (const [k, v] of Object.entries(info || {})) {
    lines.push(`${k}: ${v}`);
  }
  debugTextEl.textContent = lines.join('\n');
}

const shareBtn = document.getElementById("shareBtn");
const shareMenu = document.getElementById("shareMenu");
const sharePlaylistBtn = document.getElementById("sharePlaylistBtn");
const shareVideoBtn = document.getElementById("shareVideoBtn");
const loadBtn = document.getElementById("loadBtn");
const manifestInput = document.getElementById("manifestUrl");
const historyList = document.getElementById("history");
const historyBtn = document.getElementById("historyBtn");
const historyMenu = document.getElementById("historyMenu");
const streamList = document.getElementById("streamList");
const searchWrap = document.getElementById("searchWrap");
const searchInput = document.getElementById("searchInput");
const srStatus = document.getElementById("srStatus");
const video = document.getElementById("videoPlayer");
const playlistContainer = document.getElementById("playlistContainer");
const playerWrapper = document.getElementById("playerWrapper");

const HISTORY_KEY = "history";

function loadHistory() {
    try {
        const arr = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveHistory(arr) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
}

function populateHistory() {
    const history = loadHistory();
    if (historyList) {
        historyList.innerHTML = "";
        history.forEach((u) => {
            const opt = document.createElement("option");
            opt.value = u;
            historyList.appendChild(opt);
        });
    }
    if (historyMenu) {
        historyMenu.innerHTML = "";
        if (!history.length) {
            const span = document.createElement("span");
            span.textContent = "No history";
            span.className = "block px-2 py-1 text-slate-500 dark:text-gray-400";
            span.role = "none";
            historyMenu.appendChild(span);
        } else {
            history.forEach((u) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.role = "menuitem";
                btn.className = "block w-full text-left px-2 py-1 text-slate-800 hover:bg-sky-50 focus:outline-none focus:ring dark:text-gray-100 dark:hover:bg-gray-800 break-all";
                btn.textContent = u;
                btn.addEventListener("click", () => {
                    manifestInput.value = u;
                    hideHistoryMenu();
                    fetchAndRender();
                });
                historyMenu.appendChild(btn);
            });
        }
    }
}

function announce(msg) {
    if (!srStatus) return;
    // Clear then set (helps some screen readers re-announce)
    srStatus.textContent = "";
    window.setTimeout(() => {
        srStatus.textContent = msg;
    }, 10);
}

function addToHistory(url) {
    let history = loadHistory();
    history = history.filter((h) => h !== url);
    history.unshift(url);
    if (history.length > 20) history = history.slice(0, 20);
    saveHistory(history);
    populateHistory();
}

loadBtn.addEventListener("click", fetchAndRender);
manifestInput.addEventListener("focus", populateHistory);

function positionDropdown(btn, menu) {
  if (!btn || !menu) return;

  // Ensure baseline classes exist (downward)
  menu.classList.add('top-full', 'mt-2');
  menu.classList.remove('bottom-full', 'mb-2');

  // If it's hidden, temporarily show it for measurement
  const wasHidden = menu.classList.contains('hidden');
  if (wasHidden) menu.classList.remove('hidden');

  const prevVis = menu.style.visibility;
  menu.style.visibility = 'hidden';

  const menuRect = menu.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();

  const overflowBottom = menuRect.bottom > window.innerHeight;
  const overflowTop = menuRect.top < 0;

  // If it would overflow the bottom and there's room above the button, flip upward.
  if (overflowBottom && btnRect.top > menuRect.height) {
    menu.classList.remove('top-full', 'mt-2');
    menu.classList.add('bottom-full', 'mb-2');
  } else if (overflowTop) {
    // If somehow we overflow the top, force downward.
    menu.classList.remove('bottom-full', 'mb-2');
    menu.classList.add('top-full', 'mt-2');
  }

  // Re-measure after class changes (optional safety)
  menu.style.visibility = prevVis;

  if (wasHidden) menu.classList.add('hidden');
}

if (historyBtn) {
    historyBtn.addEventListener("click", () => {
        populateHistory();
        const hidden = historyMenu.classList.toggle("hidden");
        historyBtn.setAttribute("aria-expanded", String(!hidden));
        if (!hidden) positionDropdown(historyBtn, historyMenu);
        // Don't move focus on mouse/touch open; keep it predictable.
    });

    historyBtn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            populateHistory();
            historyMenu.classList.remove("hidden");
            historyBtn.setAttribute("aria-expanded", "true");
            positionDropdown(historyBtn, historyMenu);
            const firstItem = historyMenu.querySelector("button[role='menuitem']");
            if (firstItem) firstItem.focus();
        }
    });
}

function hideHistoryMenu() {
    if (historyMenu && !historyMenu.classList.contains("hidden")) {
        const focusWasInside = historyMenu.contains(document.activeElement);
        historyMenu.classList.add("hidden");
        historyBtn.setAttribute("aria-expanded", "false");
        // Avoid unexpected focus jumps. Only move focus if we'd otherwise leave it on a now-hidden element.
        if (focusWasInside) historyBtn.focus();
    }
}

document.addEventListener("click", (e) => {
    if (historyBtn && historyMenu &&
        !historyBtn.contains(e.target) && !historyMenu.contains(e.target)) {
        if (!historyMenu.classList.contains("hidden")) {
            historyMenu.classList.add("hidden");
            historyBtn.setAttribute("aria-expanded", "false");
        }
    }
    if (shareBtn && shareMenu && !shareBtn.contains(e.target) && !shareMenu.contains(e.target)) {
        hideShareMenu();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        hideHistoryMenu();
        hideShareMenu();
    }
});

function focusNextMenuItem(menu, direction) {
    const items = [...menu.querySelectorAll("button[role='menuitem']:not([disabled])")];
    if (!items.length) return;

    const idx = items.indexOf(document.activeElement);
    const nextIdx = idx === -1
        ? 0
        : (idx + direction + items.length) % items.length;
    items[nextIdx].focus();
}

function menuKeydownHandler(e, menu, hideFn) {
    if (menu.classList.contains("hidden")) return;

    switch (e.key) {
        case "ArrowDown":
            e.preventDefault();
            focusNextMenuItem(menu, +1);
            break;
        case "ArrowUp":
            e.preventDefault();
            focusNextMenuItem(menu, -1);
            break;
        case "Home": {
            e.preventDefault();
            const first = menu.querySelector("button[role='menuitem']:not([disabled])");
            if (first) first.focus();
            break;
        }
        case "End": {
            e.preventDefault();
            const items = [...menu.querySelectorAll("button[role='menuitem']:not([disabled])")];
            if (items.length) items.at(-1).focus();
            break;
        }
        case "Escape":
            e.preventDefault();
            hideFn();
            break;
    }
}

if (historyMenu) {
    historyMenu.addEventListener("keydown", (e) => menuKeydownHandler(e, historyMenu, hideHistoryMenu));
}
if (shareMenu) {
    shareMenu.addEventListener("keydown", (e) => menuKeydownHandler(e, shareMenu, hideShareMenu));
}

function adjustPlaylistHeight() {
    if (!playlistContainer || !playerWrapper) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
        playlistContainer.style.height = playerWrapper.offsetHeight + "px";
    } else {
        playlistContainer.style.height = "";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    adjustPlaylistHeight();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            debugLog('SW registration failed', err);
        });
    }
    populateHistory();
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(adjustPlaylistHeight);
        ro.observe(playerWrapper);
    }
});
window.addEventListener("resize", adjustPlaylistHeight);


shareBtn.addEventListener("click", () => {
  debugLog("Toggling share menu");
  const hidden = shareMenu.classList.toggle("hidden");
  shareBtn.setAttribute("aria-expanded", String(!hidden));
  updateShareMenuState();
  if (!hidden) positionDropdown(shareBtn, shareMenu);
  // Don't move focus on mouse/touch open; keep it predictable.
});

shareBtn.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      shareMenu.classList.remove("hidden");
      shareBtn.setAttribute("aria-expanded", "true");
      updateShareMenuState();
      positionDropdown(shareBtn, shareMenu);
      const firstItem = shareMenu.querySelector("button[role='menuitem']:not([disabled])");
      if (firstItem) firstItem.focus();
  }
});

function hideShareMenu() {
  if (shareMenu && !shareMenu.classList.contains("hidden")) {
      debugLog("Hiding share menu");
      const focusWasInside = shareMenu.contains(document.activeElement);
      shareMenu.classList.add("hidden");
      shareBtn.setAttribute("aria-expanded", "false");
      // Avoid unexpected focus jumps. Only move focus if we'd otherwise leave it on a now-hidden element.
      if (focusWasInside) shareBtn.focus();
  }
}

sharePlaylistBtn.addEventListener("click", () => {
  if (sharePlaylistBtn.disabled) return;
  debugLog("Sharing playlist");
  const url = new URL(window.location);
  url.searchParams.delete("program");
  doShare(url.toString());
  hideShareMenu();
});

shareVideoBtn.addEventListener("click", () => {
  if (shareVideoBtn.disabled) return;
  debugLog("Sharing playlist + video");
  const url = new URL(window.location);
  doShare(url.toString());
  hideShareMenu();
});

if (searchInput) {
  searchInput.addEventListener("input", () => {
      const term = searchInput.value.trim().toLowerCase();
      debugLog("Filtering", term);
      [...streamList.children].forEach((el) => {
          el.classList.toggle("hidden", !el.dataset.label?.toLowerCase().includes(term));
      });
  });
}

// Show placeholder on first load
debugLog("Initial placeholder");
showPlaceholder();

async function fetchAndRender() {
    const url = manifestInput.value.trim();
    if (!url) return alert("Enter a playlist URL.");

    debugLog("Fetching playlist", url);
    announce("Loading playlist...");

    try {
        const text = await fetchWithProxy(url);
        const items = parsePlaylist(url, text);
        debugLog("Parsed", items.length, "items from", url);
        renderList(items);
        searchWrap.classList.toggle("hidden", items.length < 8);
        updateUrlParams({ playlist: url, program: null });
        currentPlaylist = items.length ? url : null;
        updateShareMenuState();
        if (items.length) {
            addToHistory(url);
            announce(`Loaded ${items.length} channels.`);
        } else {
            announce("Playlist is empty.");
        }
    } catch (err) {
        console.error(err);
        debugLog("Fetch failed", err.message);
        announce("Failed to load playlist.");
        alert(`Failed: ${err.message}. Server must allow CORS or try the proxy.`);
    }
}

async function fetchWithProxy(url) {
    try {
        debugLog("Fetching directly", url);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        debugLog("Direct fetch failed", err.message, "- trying proxy");
        const proxied = await fetch(`proxy.php?url=${encodeURIComponent(url)}`);
        if (!proxied.ok) throw new Error(`Proxy HTTP ${proxied.status}`);
        return await proxied.text();
    }
}

/** Parse .m3u or .m3u8 for IPTV (#EXTINF) or HLS master (#EXT-X-STREAM-INF). */
function parsePlaylist(baseUrl, text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const streams = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // IPTV channel list (#EXTINF)
        if (line.startsWith("#EXTINF")) {
            const attrsStr = line.substring(8).split(",")[0];
            const name = line.split(",").slice(1).join(",").trim() || "Channel";
            const attrs = Object.fromEntries(
                attrsStr
                    .split(/\s(?=\w+=)/) // space before key=
                    .map((kv) => kv.split("=").map((v) => v.replace(/^"|"$/g, "")))
            );
            if (lines[i + 1]) {
                const uri = resolveUrl(baseUrl, lines[i + 1]);
                streams.push({
                    uri,
                    label: attrs["tvg-name"] || attrs["tvg-id"] || name,
                    group: attrs["group-title"] || "",
                });
                i++; // consume URI
            } else {
                console.warn("Missing URI after", line);
            }
            continue;
        }

        // HLS master playlist variant (#EXT-X-STREAM-INF)
        if (line.startsWith("#EXT-X-STREAM-INF")) {
            const attrs = Object.fromEntries(
                line
                    .replace("#EXT-X-STREAM-INF:", "")
                    .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
                    .map((kv) => kv.split("=").map((v) => v.replace(/^"|"$/g, "")))
            );
            if (lines[i + 1]) {
                const uri = resolveUrl(baseUrl, lines[i + 1]);
                streams.push({
                    uri,
                    label: `${attrs.RESOLUTION || "Auto"} • ${attrs.BANDWIDTH ? attrs.BANDWIDTH / 1000 + " kbps" : ""}`.trim(),
                    group: "Variants",
                });
                i++;
            } else {
                console.warn("Missing URI after", line);
            }
        }
    }

    return streams;
}

function renderList(items) {
    streamList.innerHTML = "";
    activeLi = null;
    activeUri = null;

    if (!items.length) {
        showPlaceholder();
        return;
    }

    updateShareMenuState();

    items.forEach((item, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.label = item.label;
        btn.dataset.uri = item.uri;
        btn.title = item.group;
        btn.className = [
          'streamBtn',
          'w-full',
          'min-h-16',
          'px-3',
          'py-2',
          'text-left',
          'cursor-pointer',
          'rounded',
          'border',
          'border-sky-200',
          'bg-gradient-to-r',
          'from-white',
          'via-sky-50',
          'to-blue-100',
          // even sizing
          'h-16',

          'shadow-sm',
          'hover:from-sky-50',
          'hover:to-blue-200',
          'focus:outline-none',
          'focus:ring',
          'dark:bg-black',
          'dark:border-gray-500',
          'dark:hover:bg-gray-900',
        ].join(' ');

        const row = document.createElement('div');
        row.className = 'h-full flex items-center justify-between gap-2';

        const nameSpan = document.createElement("span");
        nameSpan.className = 'font-medium text-slate-700 dark:text-blue-300 break-words overflow-hidden';
        nameSpan.textContent = item.label || `Stream ${idx + 1}`;

        const icons = document.createElement('span');
        icons.className = 'flex items-center gap-1 flex-shrink-0';

        const pendingIcon = document.createElement("span");
        pendingIcon.className = "pendingIcon hidden";
        pendingIcon.setAttribute("aria-hidden", "true");
        pendingIcon.textContent = "⏳";

        const playIcon = document.createElement("span");
        playIcon.className = "playIcon hidden";
        playIcon.setAttribute("aria-hidden", "true");
        playIcon.textContent = "▶";

        const okIcon = document.createElement("span");
        okIcon.className = "okIcon hidden text-green-700";
        okIcon.setAttribute("aria-hidden", "true");
        okIcon.textContent = "✓";

        const errorIcon = document.createElement("span");
        errorIcon.className = "errorIcon hidden text-red-600";
        errorIcon.setAttribute("aria-hidden", "true");
        errorIcon.textContent = "✕";

        icons.appendChild(pendingIcon);
        icons.appendChild(playIcon);
        icons.appendChild(okIcon);
        icons.appendChild(errorIcon);

        row.appendChild(nameSpan);
        row.appendChild(icons);

        const statusText = document.createElement("span");
        statusText.className = "statusText sr-only";
        statusText.textContent = "";

        btn.appendChild(row);
        btn.appendChild(statusText);

        // Apply any remembered status for this stream (e.g., show ✓ after switching away).
        const remembered = streamStatusByUri.get(item.uri);
        if (remembered) setStreamStatus(btn, remembered);

        btn.addEventListener("click", () => play(item.uri, btn));

        streamList.appendChild(btn);
    });

    const bottomSpacerBtn = document.createElement("button");
    bottomSpacerBtn.type = "button";
    bottomSpacerBtn.disabled = true;
    bottomSpacerBtn.tabIndex = -1;
    bottomSpacerBtn.setAttribute("aria-hidden", "true");
    bottomSpacerBtn.className = [
      'w-full',
      'h-24',
      'rounded',
      'border',
      'border-transparent',
      'bg-transparent',
      'opacity-0',
      'pointer-events-none',
    ].join(' ');
    streamList.appendChild(bottomSpacerBtn);
}

function showPlaceholder() {
    debugLog("Showing placeholder");
    streamList.innerHTML = '<div class="text-slate-500">No playlist loaded. Paste a URL above and click <strong>Load</strong>.</div>';
    currentPlaylist = null;
    updateShareMenuState();
}

function hideStatusIcons(li) {
    if (!li) return;
    li.querySelector(".pendingIcon")?.classList.add("hidden");
    li.querySelector(".playIcon")?.classList.add("hidden");
    li.querySelector(".okIcon")?.classList.add("hidden");
    li.querySelector(".errorIcon")?.classList.add("hidden");
}

function setStreamStatus(li, status) {
    if (!li) return;
    hideStatusIcons(li);

    if (status === "pending") {
        li.querySelector(".pendingIcon")?.classList.remove("hidden");
    } else if (status === "playing") {
        li.querySelector(".playIcon")?.classList.remove("hidden");
    } else if (status === "ok") {
        li.querySelector(".okIcon")?.classList.remove("hidden");
    } else if (status === "failed") {
        li.querySelector(".errorIcon")?.classList.remove("hidden");
    }

    // Accessibility: keep a text equivalent attached to the button so icons aren't the only signal.
    const statusTextEl = li.querySelector(".statusText");
    if (statusTextEl) {
        const label = li.dataset.label || "Stream";
        const readable =
            status === "pending" ? "Loading" :
            status === "playing" ? "Playing" :
            status === "ok" ? "Works" :
            status === "failed" ? "Failed" :
            "";
        statusTextEl.textContent = readable ? ` — ${readable}` : "";

        // Make the button's accessible name include the status.
        const btn = li.querySelector("button");
        if (btn) {
            btn.setAttribute("aria-label", readable ? `${label} — ${readable}` : label);
        }
    }

    const uri = li.dataset.uri;
    if (uri) streamStatusByUri.set(uri, status);
}

async function play(url, li) {
    debugLog("Playing", url);
    const sessionId = ++playSessionId;

    const isCurrentSession = () => sessionId === playSessionId;

    // If switching streams, mark the previous one as "works" (✓) if it was playing.
    if (activeLi && activeLi !== li) {
        const prev = streamStatusByUri.get(activeUri);
        if (prev === "playing") {
            setStreamStatus(activeLi, "ok");
        } else {
            // Leave any existing remembered state (ok/failed/untested) as-is.
            hideStatusIcons(activeLi);
            const remembered = streamStatusByUri.get(activeUri);
            if (remembered) setStreamStatus(activeLi, remembered);
        }
    }

    const resetPlayer = () => {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        if (dashPlayer) {
            dashPlayer.reset();
            dashPlayer = null;
        }
        clearPlaybackNotice();
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.onerror = null;
    };

    const attempts = [];
    const isHls = /\.m3u8($|\?)/i.test(url);
    const isDash = /\.mpd($|\?)/i.test(url);
    const hasDash = typeof dashjs !== "undefined";

    // Keep the existing detection-based attempt first
    if (isHls && Hls.isSupported()) {
        attempts.push("hls");
    } else {
        attempts.push("native");
    }

    // Only try dash.js when the URL is actually a DASH manifest.
    // Trying dash.js on HLS URLs just causes extra direct network requests (and CORS failures on providers like Pluto).
    if (hasDash && isDash) {
        attempts.push("dash");
    }

    // Fallback: always try HLS.js once more if supported
    if (Hls.isSupported() && !attempts.includes("hls")) {
        attempts.push("hls");
    }

    // Final fallback: native video src
    if (!attempts.includes("native")) {
        attempts.push("native");
    }

    let attemptIndex = 0;

    const onLoaded = () => {
        if (!isCurrentSession()) return;
        updateUrlParams({ program: url });
        video.removeEventListener("error", onError);
        announce(`Playing: ${li?.dataset.label || 'Stream'}`);
    };

    const makePolicyError = (code, message) => {
        const e = new Error(message);
        e.__policy = true;
        e.__code = code;
        return e;
    };

    let activeAttemptId = 0;

    const onError = (err) => {
        if (!isCurrentSession()) return;

        const kind = attempts[attemptIndex];
        const msg = err?.message || String(err || 'Unknown error');

        debugLog("Playback failed", kind, msg);

        setDebugInfo({
          playback_engine: kind,
          proxy_policy: 'playlist-only',
          result: 'error',
          error: msg,
        });

        // If this is a hard policy restriction, show a user-visible explanation.
        if (err && err.__policy) {
          showPlaybackNotice(msg);
        }

        video.removeEventListener("loadedmetadata", onLoaded);
        attemptIndex++;
        if (attemptIndex < attempts.length) {
            setStreamStatus(li, "pending");
            startAttempt();
        } else {
            setStreamStatus(li, "failed");
            announce(`Playback error: ${li?.dataset.label || 'Stream'}`);
            if (!err?.__policy) {
              showPlaybackNotice('Playback failed. Try another stream or enable ?debug=1 for details.');
            }
        }
    };

    const startAttempt = () => {
        if (!isCurrentSession()) return;

        resetPlayer();

        const kind = attempts[attemptIndex];
        debugLog("Attempting playback via", kind);

        setDebugInfo({
          playback_engine: kind,
          proxy_policy: 'playlist-only',
          url: url,
          note: 'Proxy is allowed for .m3u8 retrieval only; media segments are never proxied.',
        });

        const attemptId = ++activeAttemptId;
        const handleAttemptError = (err) => {
            if (attemptId !== activeAttemptId) return;
            onError(err);
        };

        video.addEventListener("loadedmetadata", onLoaded, { once: true });
        video.addEventListener("error", handleAttemptError, { once: true });

        // Mark the stream as actually playing only once media playback really starts.
        // (We don't want to show ▶ while we're still cycling through attempts.)
        const onPlaying = () => {
            if (!isCurrentSession()) return;

            if (activeLi === li && activeUri === url) {
                setStreamStatus(li, "playing");

                // If playback stops later (paused/ended), keep a visible ✓ to show it worked.
                const onStopped = () => {
                    if (!isCurrentSession()) return;

                    if (activeLi === li && activeUri === url) {
                        setStreamStatus(li, "ok");
                    }
                };
                video.addEventListener("pause", onStopped, { once: true });
                video.addEventListener("ended", onStopped, { once: true });
            }
        };
        video.addEventListener("playing", onPlaying, { once: true });

        if (kind === "hls") {
            if (!Hls.isSupported()) {
                return handleAttemptError(new Error("HLS not supported"));
            }
            // Enforce playlist-only proxying. We proxy .m3u8 retrieval (manifest + level playlists)
            // but we never proxy fragments/keys/media bytes.
            hls = new Hls({
                loader: PlaylistProxyLoader,
                pLoader: PlaylistProxyLoader,
                // fLoader intentionally left as default (direct segment fetch)
            });

            hls.on(Hls.Events.MANIFEST_LOADED, (_evt, data) => {
              setDebugInfo({
                playback_engine: 'hls.js',
                proxy_policy: 'playlist-only',
                manifest: 'loaded',
                levels: data?.levels?.length ?? 'unknown',
              });
            });

            // Policy guards after we have a level playlist and resolved fragment URLs.
            hls.on(Hls.Events.LEVEL_LOADED, (_evt, data) => {
              const details = data?.details;
              const fragments = details?.fragments || [];

              // Byte-range streams (CMAF/fMP4 byterange) often require Range support to be reliable.
              const hasByteRange = fragments.some((f) => !!(f?.byteRange || f?.rawByteRange));
              if (hasByteRange) {
                return handleAttemptError(makePolicyError(
                  'HLS_BYTERANGE',
                  'This HLS stream uses byte-range segments (EXT-X-BYTERANGE). Playlist-only proxy mode is enforced, and we do not proxy media bytes. This stream is not supported here.'
                ));
              }

              // Mixed content: if any fragment URL is http:// while this page is https://, the browser will block it.
              const pageIsHttps = window.location.protocol === 'https:';
              const hasHttpFrag = pageIsHttps && fragments.some((f) => typeof f?.url === 'string' && f.url.startsWith('http://'));
              if (hasHttpFrag) {
                return handleAttemptError(makePolicyError(
                  'MIXED_CONTENT',
                  'This stream serves media over http://. Your browser blocks mixed content on https:// pages, and we do not proxy segments. This stream is not supported here.'
                ));
              }

              // Key fetches are also media-path; in playlist-only mode we don’t proxy them.
              const keyUris = fragments
                .map((f) => f?.decryptdata?.uri)
                .filter((u) => typeof u === 'string' && u.length);
              const hasKey = keyUris.length > 0;
              const hasHttpKey = pageIsHttps && keyUris.some((u) => u.startsWith('http://'));
              if (hasKey) {
                return handleAttemptError(makePolicyError(
                  'HLS_ENCRYPTED',
                  'This HLS stream appears to be encrypted (EXT-X-KEY). Playlist-only proxy mode is enforced and keys are not proxied, so playback may be blocked by CORS/security policy. This stream is not supported here.'
                ));
              }
              if (hasHttpKey) {
                return handleAttemptError(makePolicyError(
                  'HLS_KEY_HTTP',
                  'This HLS stream uses an http:// key URI. Mixed content is blocked on https:// pages and we do not proxy media bytes. This stream is not supported here.'
                ));
              }
            });

            hls.loadSource(url);
            hls.attachMedia(video);

            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!isCurrentSession()) return;

                // If segment/key loads fail, it’s often due to CORS or mixed content.
                // We intentionally do NOT fall back to segment proxying; we fail with a clear reason.
                const details = data?.details || '';
                if (details === Hls.ErrorDetails.FRAG_LOAD_ERROR || details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT) {
                  return handleAttemptError(makePolicyError(
                    'SEGMENT_BLOCKED',
                    'This stream’s media segment requests are failing (often due to CORS or mixed content). This site proxies playlists only (not segments) to control bandwidth cost, so this stream cannot be played here.'
                  ));
                }
                if (details === Hls.ErrorDetails.KEY_LOAD_ERROR || details === Hls.ErrorDetails.KEY_LOAD_TIMEOUT) {
                  return handleAttemptError(makePolicyError(
                    'KEY_BLOCKED',
                    'This stream requires fetching encryption keys, but key requests are failing (often due to CORS). This site proxies playlists only (not keys/segments), so this stream cannot be played here.'
                  ));
                }
                if (data?.fatal) {
                  handleAttemptError(new Error(details || 'HLS fatal error'));
                }
            });
        } else if (kind === "dash") {
            if (!hasDash) {
                return handleAttemptError(new Error("dash.js not available"));
            }
            dashPlayer = dashjs.MediaPlayer().create();
            let dashErrored = false;
            const handleDashError = (e) => {
                if (dashErrored) return;
                dashErrored = true;
                handleAttemptError(new Error(e?.event?.message || e?.message || "DASH fatal error"));
            };
            dashPlayer.on(dashjs.MediaPlayer.events.ERROR, handleDashError);
            // Do not proxy DASH manifests: relative segment URLs would resolve against proxy.php,
            // and we do not proxy media bytes.
            dashPlayer.initialize(video, url, true);
        } else {
            // Native playback attempt is direct. If the URL is http:// on an https:// page,
            // the browser will block it (mixed content) and we do not proxy segments.
            if (window.location.protocol === 'https:' && /^http:\/\//i.test(url)) {
              return handleAttemptError(makePolicyError(
                'MIXED_CONTENT',
                'This stream is http://. Browsers block mixed content on https:// pages, and this site does not proxy media segments. This stream is not supported here.'
              ));
            }
            video.src = url;
        }

        video.play().catch(handleAttemptError);
    };

    // Make status immediately obvious while we cycle through methods.
    setStreamStatus(li, "pending");
    activeLi = li;
    activeUri = url;
    updateShareMenuState();

    // Skip preflight existence checks: they trigger CORS errors on many providers.
    startAttempt();
}


function resolveUrl(base, path) {
    try {
        return new URL(path, base).href;
    } catch {
        return path;
    }
}

function updateUrlParams(params) {
    const url = new URL(window.location);
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    }
    history.replaceState(null, "", url);
}

// Auto-load playlist and program from URL parameters
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const playlist = params.get("playlist");
    const program = params.get("program");

    if (playlist) {
        manifestInput.value = playlist;
        fetchAndRender().then(() => {
            if (program) {
                const li = [...streamList.children].find(
                    (el) => el.dataset.uri === program
                );
                play(program, li);
            }
        });
    }
});

function updateShareMenuState() {
  if (!sharePlaylistBtn || !shareVideoBtn) {
    debugLog("Share buttons missing - skipping update");
    return;
  }
  sharePlaylistBtn.disabled = !currentPlaylist;
  shareVideoBtn.disabled = !activeLi;
}

function doShare(url) {
  if (navigator.share) {
    navigator.share({ url }).catch(() => {});
  } else {
    prompt("Copy this link:", url);
  }
}
