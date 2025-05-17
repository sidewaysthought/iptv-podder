let hls = null;
let activeLi = null;
let currentPlaylist = null;

const shareBtn = document.getElementById("shareBtn");
const shareMenu = document.getElementById("shareMenu");
const sharePlaylistBtn = document.getElementById("sharePlaylistBtn");
const shareVideoBtn = document.getElementById("shareVideoBtn");
const loadBtn = document.getElementById("loadBtn");
const manifestInput = document.getElementById("manifestUrl");
const streamList = document.getElementById("streamList");
const searchWrap = document.getElementById("searchWrap");
const searchInput = document.getElementById("searchInput");
const video = document.getElementById("videoPlayer");
const playlistContainer = document.getElementById("playlistContainer");
const playerWrapper = document.getElementById("playerWrapper");

loadBtn.addEventListener("click", fetchAndRender);

function adjustPlaylistHeight() {
    if (!playlistContainer || !playerWrapper) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
        playlistContainer.style.height = playerWrapper.offsetHeight + "px";
    } else {
        playlistContainer.style.height = "";
    }
}

document.addEventListener("DOMContentLoaded", adjustPlaylistHeight);
window.addEventListener("resize", adjustPlaylistHeight);


shareBtn.addEventListener("click", () => {
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
  const url = new URL(window.location);
  url.searchParams.delete("program");
  doShare(url.toString());
  hideShareMenu();
});

shareVideoBtn.addEventListener("click", () => {
  if (shareVideoBtn.disabled) return;
  const url = new URL(window.location);
  doShare(url.toString());
  hideShareMenu();
});

searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    [...streamList.children].forEach((li) => {
        li.classList.toggle("hidden", !li.dataset.label?.toLowerCase().includes(term));
    });
});

// Show placeholder on first load
showPlaceholder();

async function fetchAndRender() {
    const url = manifestInput.value.trim();
    if (!url) return alert("Enter a playlist URL.");

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const items = parsePlaylist(url, text);
        renderList(items);
        searchWrap.classList.toggle("hidden", items.length < 8);
        updateUrlParams({ playlist: url, program: null });
        currentPlaylist = items.length ? url : null;
        updateShareMenuState();
    } catch (err) {
        console.error(err);
        alert(`Failed: ${err.message}. Server must allow CORS.`);
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
            const uri = resolveUrl(baseUrl, lines[i + 1]);
            streams.push({
                uri,
                label: attrs["tvg-name"] || attrs["tvg-id"] || name,
                group: attrs["group-title"] || "",
            });
            i++; // consume URI
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
            const uri = resolveUrl(baseUrl, lines[i + 1]);
            streams.push({
                uri,
                label: `${attrs.RESOLUTION || "Auto"} • ${attrs.BANDWIDTH ? attrs.BANDWIDTH / 1000 + " kbps" : ""}`.trim(),
                group: "Variants",
            });
            i++;
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
        li.innerHTML = `
    <span>${item.label || `Stream ${idx + 1}`}</span>
    <span class="playIcon ml-1 hidden" aria-label="playing">▶️</span>
    <span class="errorIcon ml-1 hidden text-red-500" aria-label="error">🚫</span>
  `;
        li.title = item.group;
        li.addEventListener("click", () => play(item.uri, li));
        streamList.appendChild(li);
    });
}

function showPlaceholder() {
    streamList.innerHTML = '<li class="text-gray-500">No playlist loaded. Paste a URL above and click <strong>Load</strong>.</li>';
    currentPlaylist = null;
    updateShareMenuState();
}

function play(url, li) {
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
  shareMenu.classList.add("hidden");
  shareBtn.setAttribute("aria-expanded", "false");
}

function updateShareMenuState() {
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
