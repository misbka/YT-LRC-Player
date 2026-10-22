/* Frontend do Player YouTube + Letras Sincronizadas */

const $ = (sel) => document.querySelector(sel);

const state = {
  searchResults: [],    // resultados da última busca (painel de busca)
  queue: [],            // fila de reprodução atual (pode vir da busca ou de uma playlist)
  queueSource: null,    // referência do array de origem da fila (para destacar o item ativo)
  queuePlaylistId: null,// id da playlist da fila atual (null se veio da busca)
  current: -1,          // índice da música tocando
  player: null,
  duration: 0,
  lyricsLines: [],      // [{time, text}] ordenado
  lyricsIndex: -1,
  videoLoadedId: null,
  playlists: [],        // [{id, name, songs: [...]}]
  activePlaylistId: null, // playlist aberta no painel
};

/* ---------------- Busca ---------------- */

$("#search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#search-input").value.trim();
  if (!q) return;
  switchTab("search");
  const box = $("#results");
  box.innerHTML = '<p class="hint">Buscando…</p>';
  try {
    const res = await fetch("/api/search?q=" + encodeURIComponent(q));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha na busca");
    state.searchResults = data.items;
    renderResults();
    if (!state.searchResults.length) box.innerHTML = '<p class="hint">Nada encontrado.</p>';
  } catch (err) {
    box.innerHTML = `<p class="hint">Erro: ${err.message}</p>`;
  }
});

/** Inicia a fila a partir de uma lista e toca o índice i. */
function playFrom(list, i, { playlistId = null } = {}) {
  state.queue = list;
  state.queueSource = list;
  state.queuePlaylistId = playlistId;
  playIndex(i);
}

function renderResults() {
  const box = $("#results");
  box.innerHTML = "";
  state.searchResults.forEach((v, i) => {
    const el = buildItem(v, i, {
      active: state.queueSource === state.searchResults && i === state.current,
      onClick: () => playFrom(state.searchResults, i),
    });
    addActionButton(el, "➕", "Adicionar a uma playlist", (e) => {
      e.stopPropagation();
      addToPlaylistFlow(v);
    });
    box.appendChild(el);
  });
}

/** Monta um item de música (usado na busca e nas playlists). */
function buildItem(v, i, { active, onClick, extraButtons = "" }) {
  const el = document.createElement("div");
  el.className = "item" + (active ? " active" : "");
  el.innerHTML = `
    <img src="${v.thumbnail}" alt="" loading="lazy" />
    <div class="info">
      <div class="title">${escapeHTML(v.title)}</div>
      <div class="sub">${escapeHTML(v.uploader)} · 👁 ${formatViews(v.views)}
        · <span class="dur">${fmtTime(v.duration)}</span></div>
    </div>
    <div class="item-actions">${extraButtons}</div>`;
  el.addEventListener("click", onClick);
  return el;
}

/* ---------------- Player YouTube ---------------- */

window.onYouTubeIframeAPIReady = () => {
  state.player = new YT.Player("yt-player", {
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onStateChange: onPlayerStateChange,
      onReady: () => setVolume($("#volume").value),
    },
  });
  setInterval(tick, 250);
};

function playIndex(i) {
  const v = state.queue[i];
  if (!v || !state.player) return;
  state.current = i;
  state.lyricsIndex = -1;
  refreshLists();
  $("#stage").classList.remove("hidden");
  $("#video-title").textContent = v.title;
  $("#video-channel").textContent = v.uploader;
  state.videoLoadedId = v.id;

  if (state.player.loadVideoById) {
    state.player.loadVideoById(v.id);
  } else {
    state.player.cueVideoById(v.id);
  }
  loadLyrics(v);
}

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) nextTrack();
  if (e.data === YT.PlayerState.PLAYING) {
    $("#btn-play").textContent = "⏸";
    state.duration = state.player.getDuration() || 0;
  } else if (e.data === YT.PlayerState.PAUSED) {
    $("#btn-play").textContent = "▶";
  }
}

function nextTrack() {
  if (state.current < state.queue.length - 1) playIndex(state.current + 1);
}
function prevTrack() {
  if (state.player && state.player.getCurrentTime() > 3) {
    state.player.seekTo(0, true);
  } else if (state.current > 0) {
    playIndex(state.current - 1);
  }
}

$("#btn-play").addEventListener("click", () => {
  if (!state.player || !state.player.getPlayerState) return;
  const s = state.player.getPlayerState();
  s === YT.PlayerState.PLAYING ? state.player.pauseVideo() : state.player.playVideo();
});
$("#btn-next").addEventListener("click", nextTrack);
$("#btn-prev").addEventListener("click", prevTrack);

$("#seek").addEventListener("input", (e) => {
  if (!state.duration) return;
  const t = (e.target.value / 1000) * state.duration;
  $("#time").textContent = `${fmtTime(t)} / ${fmtTime(state.duration)}`;
});
$("#seek").addEventListener("change", (e) => {
  if (!state.duration || !state.player?.seekTo) return;
  state.player.seekTo((e.target.value / 1000) * state.duration, true);
});

$("#volume").addEventListener("input", (e) => setVolume(e.target.value));
function setVolume(v) {
  if (state.player?.setVolume) state.player.setVolume(Number(v));
  $("#vol-icon").textContent = v == 0 ? "🔇" : "🔊";
}

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.code === "Space") { e.preventDefault(); $("#btn-play").click(); }
  if (e.code === "ArrowRight") state.player?.seekTo((state.player.getCurrentTime() || 0) + 5, true);
  if (e.code === "ArrowLeft") state.player?.seekTo((state.player.getCurrentTime() || 0) - 5, true);
});

/* ---------------- Sincronização do laço de tempo ---------------- */

function tick() {
  if (!state.player || !state.player.getCurrentTime) return;
  const cur = state.player.getCurrentTime() || 0;
  const dur = state.duration || state.player.getDuration() || 0;
  $("#time").textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
  if (dur) $("#seek").value = Math.round((cur / dur) * 1000);
  syncLyrics(cur);
}

/** Encontra a linha ativa e destaca (busca binária simples). */
function syncLyrics(t) {
  const lines = state.lyricsLines;
  if (!lines.length) return;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (t + 0.001 >= lines[i].time) idx = i;
    else break;
  }
  if (idx === state.lyricsIndex) return;
  state.lyricsIndex = idx;

  document.querySelectorAll(".lrc-line.current").forEach((n) => n.classList.remove("current"));
  const node = document.querySelector(`.lrc-line[data-i="${idx}"]`);
  if (node) {
    node.classList.add("current");
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

/* ---------------- Letras (LRCLIB) ---------------- */

async function loadLyrics(video) {
  const badge = $("#lyrics-badge");
  const box = $("#lyrics");
  $("#lyrics-title").textContent = "Letra";
  badge.textContent = "buscando…";
  badge.className = "badge";
  box.innerHTML = '<p class="hint">Procurando letra no LRCLIB…</p>';
  state.lyricsLines = [];

  const parsed = parseVideoTitle(video.title, video.uploader);
  const params = new URLSearchParams({
    query: `${parsed.artist} ${parsed.track}`.trim(),
    trackName: parsed.track,
    artistName: parsed.artist,
    duration: String(video.duration || state.duration || 0),
  });

  try {
    const res = await fetch("/api/lyrics?" + params.toString());
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha");

    if (data.syncedLyrics) {
      state.lyricsLines = parseLRC(data.syncedLyrics);
      renderLRC();
      badge.textContent = `sincronizada · ${data.artistName} — ${data.trackName}`;
      badge.className = "badge sync";
      $("#lyrics-title").textContent = `Letra — ${data.artistName} · ${data.trackName}${data.albumName ? " · " + data.albumName : ""}`;
    } else if (data.plainLyrics) {
      renderPlain(data.plainLyrics);
      badge.textContent = `texto puro · ${data.artistName} — ${data.trackName}`;
      badge.className = "badge plain";
    } else {
      renderEmpty();
      badge.textContent = "não encontrada";
      badge.className = "badge err";
    }
  } catch (err) {
    renderEmpty();
    badge.textContent = "erro ao buscar";
    badge.className = "badge err";
  }
}

function parseLRC(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const stamps = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const lyric = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) {
      const frac = m[3] ? Number("0." + m[3].padEnd(3, "0")) : 0;
      out.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text: lyric || "♪" });
    }
  }
  out.sort((a, b) => a.time - b.time);
  // remove duplicatas de timestamps iguais
  return out.filter((l, i) => i === 0 || l.time !== out[i - 1].time || l.text !== out[i - 1].text);
}

function renderLRC() {
  const box = $("#lyrics");
  box.innerHTML = "";
  state.lyricsLines.forEach((l, i) => {
    const el = document.createElement("div");
    el.className = "lrc-line";
    el.dataset.i = i;
    el.textContent = l.text;
    el.addEventListener("click", () => state.player?.seekTo(l.time, true));
    box.appendChild(el);
  });
  state.lyricsIndex = -1;
}

function renderPlain(text) {
  $("#lyrics").innerHTML = `<div class="plain-lyrics">${escapeHTML(text)}</div>`;
}
function renderEmpty() {
  $("#lyrics").innerHTML = '<p class="hint">Nenhuma letra encontrada para esta faixa no LRCLIB.</p>';
}

/* ---------------- Playlists ---------------- */

const LS_KEY = "ytplayer.playlists";

function loadPlaylists() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    state.playlists = Array.isArray(data) ? data : [];
  } catch {
    state.playlists = [];
  }
}
function savePlaylists() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.playlists)); } catch {}
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ----- Abas ----- */

function switchTab(name) {
  $("#tab-search").classList.toggle("active", name === "search");
  $("#tab-playlists").classList.toggle("active", name === "playlists");
  $("#results").classList.toggle("hidden", name !== "search");
  $("#playlists-panel").classList.toggle("hidden", name !== "playlists");
  $("#playlist-view").classList.toggle("hidden", name !== "playlist");
  if (name === "playlists") {
    state.activePlaylistId = null;
    renderPlaylistList();
  }
}

$("#tab-search").addEventListener("click", () => switchTab("search"));
$("#tab-playlists").addEventListener("click", () => switchTab("playlists"));
$("#btn-back-playlists").addEventListener("click", () => switchTab("playlists"));

/** Repinta as listas visíveis (busca e/ou playlist aberta). */
function refreshLists() {
  if (!$("#results").classList.contains("hidden")) renderResults();
  if (!$("#playlist-view").classList.contains("hidden")) renderPlaylistSongs();
}

/* ----- Lista de playlists ----- */

function renderPlaylistList() {
  const box = $("#playlist-list");
  box.innerHTML = "";
  if (!state.playlists.length) {
    box.innerHTML = '<p class="hint">Nenhuma playlist ainda.<br>Clique em "＋ Nova" para criar.</p>';
    return;
  }
  state.playlists.forEach((pl) => {
    const el = document.createElement("div");
    el.className = "pl-item";
    const cover = pl.songs[0]?.thumbnail;
    el.innerHTML = `
      <div class="pl-cover">${cover ? `<img src="${cover}" alt="" loading="lazy" />` : "🎵"}</div>
      <div class="info">
        <div class="title">${escapeHTML(pl.name)}</div>
        <div class="sub">${pl.songs.length} música${pl.songs.length === 1 ? "" : "s"}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="play" title="Tocar playlist">▶</button>
      </div>`;
    el.addEventListener("click", () => openPlaylist(pl.id));
    el.querySelector('[data-act="play"]').addEventListener("click", (e) => {
      e.stopPropagation();
      playPlaylist(pl.id);
    });
    box.appendChild(el);
  });
}

function openPlaylist(id) {
  const pl = state.playlists.find((p) => p.id === id);
  if (!pl) return;
  state.activePlaylistId = id;
  $("#playlist-view-title").textContent = pl.name;
  $("#playlist-view-title").title = pl.name;
  $("#playlists-panel").classList.add("hidden");
  $("#results").classList.add("hidden");
  $("#playlist-view").classList.remove("hidden");
  renderPlaylistSongs();
}

function renderPlaylistSongs() {
  const pl = state.playlists.find((p) => p.id === state.activePlaylistId);
  if (!pl) return;
  $("#playlist-view-title").textContent = pl.name;
  $("#playlist-view-title").title = pl.name;
  const box = $("#playlist-songs");
  box.innerHTML = "";
  if (!pl.songs.length) {
    box.innerHTML = '<p class="hint">Playlist vazia.<br>Use o botão ➕ nos resultados da busca para adicionar músicas.</p>';
    return;
  }
  pl.songs.forEach((v, i) => {
    const el = buildItem(v, i, {
      active: state.queuePlaylistId === pl.id && i === state.current,
      onClick: () => playFrom(pl.songs, i, { playlistId: pl.id }),
    });
    addActionButton(el, "⬆", "Subir", (e) => { e.stopPropagation(); moveSong(pl, i, -1); }, i === 0);
    addActionButton(el, "⬇", "Descer", (e) => { e.stopPropagation(); moveSong(pl, i, 1); }, i === pl.songs.length - 1);
    addActionButton(el, "✕", "Remover da playlist", (e) => { e.stopPropagation(); removeSong(pl, i); });
    box.appendChild(el);
  });
}

function moveSong(pl, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= pl.songs.length) return;
  [pl.songs[i], pl.songs[j]] = [pl.songs[j], pl.songs[i]];
  savePlaylists();
  renderPlaylistSongs();
}

function removeSong(pl, i) {
  const [rm] = pl.songs.splice(i, 1);
  savePlaylists();
  // Se a música removida estava tocando nessa playlist, corrige o índice.
  if (state.queuePlaylistId === pl.id) {
    if (i < state.current) state.current--;
    else if (i === state.current) {
      state.current = -1;
      $("#stage").classList.add("hidden");
      state.player?.stopVideo?.();
    }
    state.queue = pl.songs;
  }
  renderPlaylistSongs();
  renderPlaylistList();
  toast(`Removida: ${rm?.title || ""}`);
}

/* ----- Tocar / embaralhar ----- */

function playPlaylist(id, shuffle = false) {
  const pl = state.playlists.find((p) => p.id === id);
  if (!pl) return;
  if (!pl.songs.length) { toast("Playlist vazia"); return; }
  let start = 0;
  if (shuffle) {
    for (let i = pl.songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pl.songs[i], pl.songs[j]] = [pl.songs[j], pl.songs[i]];
    }
    savePlaylists();
    renderPlaylistSongs();
  }
  playFrom(pl.songs, start, { playlistId: pl.id });
}

$("#btn-play-playlist").addEventListener("click", () => playPlaylist(state.activePlaylistId));
$("#btn-shuffle-playlist").addEventListener("click", () => playPlaylist(state.activePlaylistId, true));

/* ----- Criar / renomear / excluir ----- */

$("#btn-new-playlist").addEventListener("click", async () => {
  const name = await promptModal("Nova playlist", "Nome da playlist");
  if (!name) return;
  const pl = { id: newId(), name, songs: [] };
  state.playlists.push(pl);
  savePlaylists();
  renderPlaylistList();
  toast(`Playlist "${name}" criada`);
});

$("#btn-rename-playlist").addEventListener("click", async () => {
  const pl = state.playlists.find((p) => p.id === state.activePlaylistId);
  if (!pl) return;
  const name = await promptModal("Renomear playlist", "Nome da playlist", pl.name);
  if (!name) return;
  pl.name = name;
  savePlaylists();
  renderPlaylistSongs();
  toast("Playlist renomeada");
});

$("#btn-delete-playlist").addEventListener("click", async () => {
  const pl = state.playlists.find((p) => p.id === state.activePlaylistId);
  if (!pl) return;
  const ok = await confirmModal("Excluir playlist", `Excluir "${pl.name}" (${pl.songs.length} música${pl.songs.length === 1 ? "" : "s"})? Esta ação não pode ser desfeita.`, "Excluir");
  if (!ok) return;
  state.playlists = state.playlists.filter((p) => p.id !== pl.id);
  savePlaylists();
  // Se a playlist excluída estava tocando, para a fila.
  if (state.queuePlaylistId === pl.id) {
    state.queue = [];
    state.queueSource = null;
    state.queuePlaylistId = null;
    state.current = -1;
    state.player?.stopVideo?.();
    $("#stage").classList.add("hidden");
  }
  switchTab("playlists");
  toast("Playlist excluída");
});

/* ----- Adicionar música a uma playlist ----- */

function addToPlaylistFlow(video) {
  const list = $("#picker-list");
  list.innerHTML = "";
  if (!state.playlists.length) {
    list.innerHTML = '<p class="picker-empty">Nenhuma playlist ainda — crie a primeira abaixo.</p>';
  } else {
    state.playlists.forEach((pl) => {
      const b = document.createElement("button");
      b.className = "picker-item";
      b.innerHTML = `🎵 <span>${escapeHTML(pl.name)}</span><span class="count">${pl.songs.length} música${pl.songs.length === 1 ? "" : "s"}</span>`;
      b.addEventListener("click", () => addSongToPlaylist(pl.id, video));
      list.appendChild(b);
    });
  }
  $("#picker-input").value = "";
  $("#picker").classList.remove("hidden");
  $("#picker-input").focus();

  $("#picker-create").onclick = async () => {
    const name = $("#picker-input").value.trim();
    if (!name) { $("#picker-input").focus(); return; }
    const pl = { id: newId(), name, songs: [] };
    state.playlists.push(pl);
    savePlaylists();
    addSongToPlaylist(pl.id, video);
    renderPlaylistList();
  };
  $("#picker-input").onkeydown = (e) => {
    if (e.key === "Enter") $("#picker-create").click();
  };
  $("#picker-cancel").onclick = () => $("#picker").classList.add("hidden");
}

function addSongToPlaylist(plId, video) {
  const pl = state.playlists.find((p) => p.id === plId);
  if (!pl) return;
  if (pl.songs.some((s) => s.id === video.id)) {
    toast("Música já está nesta playlist");
    return;
  }
  pl.songs.push({ ...video });
  savePlaylists();
  renderPlaylistList();
  if (state.activePlaylistId === plId && !$("#playlist-view").classList.contains("hidden")) {
    renderPlaylistSongs();
  }
  toast(`Adicionada a "${pl.name}"`);
}

/** Botão ➕ do player: adiciona a música atual tocando. */
$("#btn-add-current").addEventListener("click", () => {
  const v = state.queue[state.current];
  if (!v) { toast("Nenhuma música tocando"); return; }
  addToPlaylistFlow(v);
});

/** Anexa um botão de ícone na coluna de ações de um item. */
function addActionButton(itemEl, icon, title, onClick, disabled = false) {
  const actions = itemEl.querySelector(".item-actions");
  const b = document.createElement("button");
  b.className = "icon-btn";
  b.title = title;
  b.textContent = icon;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  actions.appendChild(b);
}

/* ----- Modal (prompt/confirm) e toast ----- */

let modalResolve = null;
let modalMode = "prompt";

function openModal({ title, message = "", placeholder = "", value = "", mode = "prompt", okLabel = "OK" }) {
  modalMode = mode;
  $("#modal-title").textContent = title;
  $("#modal-msg").textContent = message;
  $("#modal-msg").style.display = message ? "" : "none";
  $("#modal-input").style.display = mode === "prompt" ? "" : "none";
  $("#modal-input").placeholder = placeholder;
  $("#modal-input").value = value;
  $("#modal-ok").textContent = okLabel;
  $("#modal").classList.remove("hidden");
  if (mode === "prompt") {
    setTimeout(() => { $("#modal-input").focus(); $("#modal-input").select(); }, 0);
  }
  return new Promise((resolve) => { modalResolve = resolve; });
}

function closeModal(result) {
  $("#modal").classList.add("hidden");
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}

const promptModal = (title, placeholder, value = "") =>
  openModal({ title, placeholder, value, mode: "prompt" }).then((v) => (v ? String(v).trim() : null));

const confirmModal = (title, message = "", okLabel = "OK") =>
  openModal({ title, message, mode: "confirm", okLabel }).then((v) => v === true);

$("#modal-ok").addEventListener("click", () => {
  closeModal(modalMode === "prompt" ? $("#modal-input").value : true);
});
$("#modal-cancel").addEventListener("click", () => closeModal(null));
$("#modal-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#modal-ok").click();
  if (e.key === "Escape") $("#modal-cancel").click();
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) closeModal(null);
});
$("#picker").addEventListener("click", (e) => {
  if (e.target === $("#picker")) $("#picker").classList.add("hidden");
});

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

// Inicializa playlists persistidas.
loadPlaylists();

/* ---------------- Utilidades ---------------- */

/** Limpa o título do vídeo e tenta separar artista/título. */
function parseVideoTitle(title, uploader) {
  let t = title
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\b(official\s+)?(video|music\s+video|lyric\s+video|lyrics|audio|visualizer|hd|4k|remaster(ized)?|live|explicit|clean|clip|videoclipe|clipe|versão\s+oficial|sub\s?español)\b/gi, " ")
    .replace(/\b(officiel|offiziell|oficial|official)\b/gi, " ")
    .replace(/[-–—•|·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let artist = "";
  // título típico "Artista - Título" sobrevive à limpeza acima? tentamos antes:
  const origMatch = title.match(/^(.{2,40}?)\s+[-–—]\s+(.{2,80})$/);
  if (origMatch) {
    artist = cleanChunk(origMatch[1]);
    t = cleanChunk(origMatch[2]);
  } else if (t.split(" ").length >= 4) {
    // fallback: usa os canais com sufixo "- Topic" (auto-generated)
    const up = cleanChunk(uploader || "");
    if (/[-–—]\s*Topic$/i.test(uploader || "")) artist = up.replace(/\s*[-–—]\s*Topic$/i, "");
  }
  if (!artist) {
    const up = cleanChunk(uploader || "");
    if (up && !/vevo|official|music|records|topic/i.test(up)) artist = up;
  }
  return { artist, track: t || cleanChunk(title) };

  function cleanChunk(s) {
    return s
      .replace(/\s*(official|lyrics|audio|video|visualizer|hd|4k|mp3|mvid)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatViews(n) {
  if (!n) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function escapeHTML(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
