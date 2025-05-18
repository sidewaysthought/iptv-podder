let hls = null;
let activeLi = null;
let currentPlaylist = null;

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
            historyMenu.appendChild(span);
        } else {
            history.forEach((u) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "block w-full text-left px-2 py-1 hover:bg-gray-100";
                btn.textContent = u;
                btn.addEventListener("click", () => {
                    manifestInput.value = u;
                    historyMenu.classList.add("hidden");
                    historyBtn.setAttribute("aria-expanded", "false");
                    manifestInput.focus();
                });
                historyMenu.appendChild(btn);
            });
        }
    }
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
    });
}
document.addEventListener("click", (e) => {
    if (historyBtn && historyMenu &&
        !historyBtn.contains(e.target) && !historyMenu.contains(e.target)) {
        historyMenu.classList.add("hidden");
        historyBtn.setAttribute("aria-expanded", "false");
    }
});

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
});

document.addEventListener("click", (e) => {
  if (!shareBtn.contains(e.target) && !shareMenu.contains(e.target)) {
    hideShareMenu();
  }
});

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

    try {
        const text = await fetchWithProxy(url);
        const items = parsePlaylist(url, text);
        debugLog("Parsed", items.length, "items from", url);
        renderList(items);
        searchWrap.classList.toggle("hidden", items.length < 8);
        updateUrlParams({ playlist: url, program: null });
        currentPlaylist = items.length ? url : null;
        updateShareMenuState();
        if (items.length) addToHistory(url);
    } catch (err) {
        console.error(err);
        debugLog("Fetch failed", err.message);
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

    if (!items.length) {
        showPlaceholder();
        return;
    }

    updateShareMenuState();

    items.forEach((item, idx) => {
        const li = document.createElement("li");
        li.dataset.label = item.label;
        li.dataset.uri = item.uri;
        li.className = "cursor-pointer hover:underline flex items-center";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = item.label || `Stream ${idx + 1}`;
        li.appendChild(nameSpan);

        const playIcon = document.createElement("span");
        playIcon.className = "playIcon ml-1 hidden";
        playIcon.setAttribute("aria-label", "playing");
        playIcon.textContent = "▶";
        li.appendChild(playIcon);

        const errorIcon = document.createElement("span");
        errorIcon.className = "errorIcon ml-1 hidden text-red-500";
        errorIcon.setAttribute("aria-label", "error");
        errorIcon.textContent = "🚫";
        li.appendChild(errorIcon);

        li.title = item.group;
        li.addEventListener("click", () => play(item.uri, li));
        streamList.appendChild(li);
    });
}

function showPlaceholder() {
    debugLog("Showing placeholder");
    streamList.innerHTML = '<li class="text-gray-500">No playlist loaded. Paste a URL above and click <strong>Load</strong>.</li>';
    currentPlaylist = null;
    updateShareMenuState();
}

function play(url, li) {
    debugLog("Playing", url);
    // Reset icons on previous active entry
    if (activeLi) {
        activeLi.querySelector(".playIcon").classList.add("hidden");
        activeLi.querySelector(".errorIcon").classList.add("hidden");
    }

    // --- CLEAN UP PREVIOUS PLAYBACK ---
    if (hls) {
        hls.destroy();
        hls = null;
    }
    // Pause & reset the video element to abort any ongoing network activity
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.onerror = null; // clear previous handler

    const isHls = /\.m3u8($|\?)/i.test(url);

    const onLoaded = () => {
        updateUrlParams({ program: url });
        video.removeEventListener("error", onError);
    };

    const onError = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        setErrorIcon(li);
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });

    if (isHls && Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) onError();
        });
    } else {
        video.src = url;
    }

    video.play().catch(onError);

    setPlayIcon(li);
    activeLi = li;
    updateShareMenuState();
}

function setPlayIcon(li) {
    if (!li) return;
    li.querySelector(".errorIcon").classList.add("hidden");
    li.querySelector(".playIcon").classList.remove("hidden");
}

function setErrorIcon(li) {
    if (!li) return;
    li.querySelector(".playIcon").classList.add("hidden");
    li.querySelector(".errorIcon").classList.remove("hidden");
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

function hideShareMenu() {
  debugLog("Hiding share menu");
  shareMenu.classList.add("hidden");
  shareBtn.setAttribute("aria-expanded", "false");
}

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

// ------- Theme settings -------
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const themeSelect = document.getElementById("themeSelect");

function applyTheme(value) {
  if (value === "dark") {
    document.documentElement.classList.add("dark");
  } else if (value === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "system";
  if (themeSelect) themeSelect.value = saved;
  applyTheme(saved);
}

function saveTheme(value) {
  localStorage.setItem("theme", value);
  applyTheme(value);
}

if (settingsBtn && settingsModal && closeSettingsBtn && themeSelect) {
  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
    themeSelect.focus();
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    settingsBtn.focus();
  });

  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add("hidden");
      settingsBtn.focus();
    }
  });

  themeSelect.addEventListener("change", () => {
    saveTheme(themeSelect.value);
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if ((localStorage.getItem("theme") || "system") === "system") {
        applyTheme("system");
      }
    });

  if (document.readyState !== "loading") {
    loadTheme();
  } else {
    document.addEventListener("DOMContentLoaded", loadTheme);
  }
}
