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

// Hls.js loader that routes all manifest/segment/key requests through the PHP proxy.
// This is necessary for providers that set restrictive CORS headers (e.g. Pluto).
class ProxyLoader extends Hls.DefaultConfig.loader {
  load(context, config, callbacks) {
    const origUrl = context.url;
    const nextContext = { ...context, url: proxifyUrl(origUrl) };

    const wrappedCallbacks = {
      ...callbacks,
      onSuccess: (response, stats, ctx, networkDetails) => {
        // Make hls.js treat the response as if it came from the original URL.
        // This preserves base URL resolution for relative URIs in playlists.
        if (response && typeof response === 'object') {
          response.url = origUrl;
        }
        callbacks.onSuccess(response, stats, { ...ctx, url: origUrl }, networkDetails);
      },
      onError: (error, ctx, networkDetails) => {
        callbacks.onError(error, { ...ctx, url: origUrl }, networkDetails);
      },
      onTimeout: (stats, ctx, networkDetails) => {
        callbacks.onTimeout(stats, { ...ctx, url: origUrl }, networkDetails);
      },
    };

    return super.load(nextContext, config, wrappedCallbacks);
  }
}

let dashPlayer = null;
let activeLi = null;
let activeUri = null;
let currentPlaylist = null;

// Track the last known status of each stream so we can show a persistent checkmark
// even after switching away.
// status: 'untested' | 'pending' | 'playing' | 'ok' | 'failed'
const streamStatusByUri = new Map();

// Enable verbose logging when ?debug is present in the URL
const DEBUG = new URLSearchParams(window.location.search).has("debug");
function debugLog(...args) {
  if (DEBUG) console.log("[DEBUG]", ...args);
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
            span.className = "block px-2 py-1 text-gray-500";
            span.role = "none";
            historyMenu.appendChild(span);
        } else {
            history.forEach((u) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.role = "menuitem";
                btn.className = "block w-full text-left px-2 py-1 hover:bg-gray-100 focus:outline-none focus:ring";
                btn.textContent = u;
                btn.addEventListener("click", () => {
                    manifestInput.value = u;
                    hideHistoryMenu();
                    manifestInput.focus();
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
if (historyBtn) {
    historyBtn.addEventListener("click", () => {
        populateHistory();
        const hidden = historyMenu.classList.toggle("hidden");
        historyBtn.setAttribute("aria-expanded", String(!hidden));
        // Don't move focus on mouse/touch open; keep it predictable.
    });

    historyBtn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            populateHistory();
            historyMenu.classList.remove("hidden");
            historyBtn.setAttribute("aria-expanded", "true");
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
  // Don't move focus on mouse/touch open; keep it predictable.
});

shareBtn.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      shareMenu.classList.remove("hidden");
      shareBtn.setAttribute("aria-expanded", "true");
      updateShareMenuState();
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

searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    debugLog("Filtering", term);
    [...streamList.children].forEach((li) => {
        li.classList.toggle("hidden", !li.dataset.label?.toLowerCase().includes(term));
    });
});

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
        const li = document.createElement("li");
        li.dataset.label = item.label;
        li.dataset.uri = item.uri;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "w-full text-left cursor-pointer hover:underline flex items-center focus:outline-none focus:ring";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = item.label || `Stream ${idx + 1}`;
        btn.appendChild(nameSpan);

        const pendingIcon = document.createElement("span");
        pendingIcon.className = "pendingIcon ml-1 hidden";
        pendingIcon.setAttribute("aria-hidden", "true");
        pendingIcon.textContent = "⏳";
        btn.appendChild(pendingIcon);

        const playIcon = document.createElement("span");
        playIcon.className = "playIcon ml-1 hidden";
        playIcon.setAttribute("aria-hidden", "true");
        playIcon.textContent = "▶";
        btn.appendChild(playIcon);

        const okIcon = document.createElement("span");
        okIcon.className = "okIcon ml-1 hidden text-green-700";
        okIcon.setAttribute("aria-hidden", "true");
        okIcon.textContent = "✓";
        btn.appendChild(okIcon);

        const errorIcon = document.createElement("span");
        errorIcon.className = "errorIcon ml-1 hidden text-red-600";
        errorIcon.setAttribute("aria-hidden", "true");
        errorIcon.textContent = "✕";
        btn.appendChild(errorIcon);

        const statusText = document.createElement("span");
        statusText.className = "statusText sr-only";
        statusText.textContent = "";
        btn.appendChild(statusText);

        li.title = item.group;

        // Apply any remembered status for this stream (e.g., show ✓ after switching away).
        const remembered = streamStatusByUri.get(item.uri);
        if (remembered) setStreamStatus(li, remembered);

        btn.addEventListener("click", () => play(item.uri, li));

        li.appendChild(btn);
        streamList.appendChild(li);
    });
}

function showPlaceholder() {
    debugLog("Showing placeholder");
    streamList.innerHTML = '<li class="text-gray-500">No playlist loaded. Paste a URL above and click <strong>Load</strong>.</li>';
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
        updateUrlParams({ program: url });
        video.removeEventListener("error", onError);
        announce(`Playing: ${li?.dataset.label || 'Stream'}`);
    };

    const onError = (err) => {
        debugLog("Playback failed", attempts[attemptIndex], err?.message || err);
        video.removeEventListener("loadedmetadata", onLoaded);
        attemptIndex++;
        if (attemptIndex < attempts.length) {
            startAttempt();
        } else {
            setStreamStatus(li, "failed");
            announce(`Playback error: ${li?.dataset.label || 'Stream'}`);
        }
    };

    const startAttempt = () => {
        resetPlayer();

        const kind = attempts[attemptIndex];
        debugLog("Attempting playback via", kind);

        video.addEventListener("loadedmetadata", onLoaded, { once: true });
        video.addEventListener("error", onError, { once: true });

        // Mark the stream as actually playing only once media playback really starts.
        // (We don't want to show ▶ while we're still cycling through attempts.)
        const onPlaying = () => {
            if (activeLi === li && activeUri === url) {
                setStreamStatus(li, "playing");

                // If playback stops later (paused/ended), keep a visible ✓ to show it worked.
                const onStopped = () => {
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
                return onError(new Error("HLS not supported"));
            }
            hls = new Hls({
                // hls.js uses different loaders for playlist vs fragments in some versions.
                // Set all of them to ensure *everything* goes through the PHP proxy.
                loader: ProxyLoader,
                pLoader: ProxyLoader,
                fLoader: ProxyLoader,
                // Belt-and-suspenders: force any XHR-based loads through the proxy,
                // even if a particular hls.js build bypasses custom loaders.
                xhrSetup: (xhr, u) => {
                    try { xhr.withCredentials = false; } catch {}
                    // Avoid double-proxying if a loader already rewrote the URL.
                    if (!isAlreadyProxied(u)) {
                        try { xhr.open('GET', proxifyUrl(u), true); } catch {}
                    }
                },
                // For fetch-loader paths in newer hls.js
                fetchSetup: (context, init) => {
                    const u = context?.url;
                    if (isAlreadyProxied(u)) {
                        return new Request(u, { ...init, credentials: 'omit' });
                    }
                    return new Request(proxifyUrl(u), {
                        ...init,
                        credentials: 'omit',
                    });
                },
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) onError(new Error(data.details || "HLS fatal error"));
            });
        } else if (kind === "dash") {
            if (!hasDash) {
                return onError(new Error("dash.js not available"));
            }
            dashPlayer = dashjs.MediaPlayer().create();
            let dashErrored = false;
            const handleDashError = (e) => {
                if (dashErrored) return;
                dashErrored = true;
                onError(new Error(e?.event?.message || e?.message || "DASH fatal error"));
            };
            dashPlayer.on(dashjs.MediaPlayer.events.ERROR, handleDashError);
            dashPlayer.initialize(video, proxifyUrl(url), true);
        } else {
            // Native playback attempt should also go through the proxy to avoid CORS.
            video.src = proxifyUrl(url);
        }

        video.play().catch(onError);
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

