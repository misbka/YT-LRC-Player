/* Servidor web do Player YouTube + Letras (LRCLIB)
 * Sem dependências externas — usa apenas módulos nativos do Node.
 * Uso: node server.js  →  http://localhost:3000
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

// Instâncias Piped usadas para buscar vídeos do YouTube (CORS livre via proxy).
const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.drgns.space",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.ducks.party",
  "https://piped-api.lunar.icu",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function fetchJSON(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ytb1-player/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

/** Busca vídeos do YouTube nas instâncias Piped, com fallback automático. */
async function searchYouTube(query) {
  const url = `https://?/search?q=${encodeURIComponent(query)}&filter=videos`;
  const erros = [];
  for (const base of PIPED_INSTANCES) {
    try {
      const data = await fetchJSON(url.replace("https://?", base));
      const items = (data.items || [])
        .filter((i) => i.type === "stream" && i.url && i.url.includes("v="))
        .map((i) => ({
          id: new URLSearchParams(i.url.split("?")[1]).get("v"),
          title: i.title,
          uploader: i.uploaderName || "",
          duration: i.duration || 0,
          views: i.views || 0,
          thumbnail: i.thumbnail
            ? `https://i.ytimg.com/vi/${new URLSearchParams(i.url.split("?")[1]).get("v")}/mqdefault.jpg`
            : "",
        }))
        .filter((v) => v.id && v.duration > 0);
      if (items.length) return { source: base, items };
    } catch (e) {
      erros.push(`${base}: ${e.message}`);
    }
  }
  throw new Error("Nenhuma instância de busca respondeu. " + erros.join(" | "));
}

/** Busca letras sincronizadas (ou texto puro) no LRCLIB. */
async function getLyrics({ query, trackName, artistName, albumName, duration }) {
  // 1) tentativa direta por combinação exata
  if (trackName && artistName) {
    try {
      const exact = await fetchJSON(
        "https://lrclib.net/api/get?" +
          new URLSearchParams({ track_name: trackName, artist_name: artistName, ...(albumName ? { album_name: albumName } : {}), duration: Math.round(duration || 0) })
      );
      return normalizeLRCLIB(exact);
    } catch {
      /* segue para busca */
    }
  }
  // 2) busca por texto livre
  const q = query || `${artistName} ${trackName}`.trim();
  if (!q) return null;
  const results = await fetchJSON("https://lrclib.net/api/search?" + new URLSearchParams({ q }));
  if (!Array.isArray(results) || !results.length) return null;
  const d = Number(duration) || 0;
  const scored = results
    .map((r) => {
      let score = 0;
      if (r.syncedLyrics) score += 100;
      if (artistName && r.artistName && norm(r.artistName) === norm(artistName)) score += 30;
      if (trackName && r.trackName && norm(r.trackName) === norm(trackName)) score += 30;
      if (d > 0 && r.duration) score -= Math.min(Math.abs(r.duration - d), 15);
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);
  return normalizeLRCLIB(scored[0].r);
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeLRCLIB(r) {
  if (!r) return null;
  return {
    trackName: r.trackName || "",
    artistName: r.artistName || "",
    albumName: r.albumName || "",
    duration: r.duration || 0,
    instrumental: !!r.instrumental,
    synced: !!r.syncedLyrics,
    syncedLyrics: r.syncedLyrics || null,
    plainLyrics: r.plainLyrics || null,
    source: "LRCLIB",
  };
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/search") {
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) return sendJSON(res, 400, { error: "Informe q=" });
    try {
      return sendJSON(res, 200, await searchYouTube(q));
    } catch (e) {
      return sendJSON(res, 502, { error: e.message });
    }
  }

  if (url.pathname === "/api/lyrics") {
    try {
      const data = await getLyrics(Object.fromEntries(url.searchParams));
      return sendJSON(res, 200, data || { synced: false, syncedLyrics: null, plainLyrics: null });
    } catch (e) {
      return sendJSON(res, 502, { error: e.message });
    }
  }

  // Arquivos estáticos
  let filePath = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
  if (!filePath.startsWith(PUBLIC)) return sendJSON(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJSON(res, 404, { error: "Não encontrado" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

/** Inicia o servidor na porta indicada (ou PORT/3000). */
function start(port = Number(process.env.PORT) || PORT) {
  server.listen(port, () => {
    console.log(`▶ Player rodando em http://localhost:${server.address().port}`);
  });
  return server;
}

// Só inicia automaticamente quando executado diretamente (node server.js),
// permitindo que o app Electron importe este módulo e escolha a porta.
if (require.main === module) start();

module.exports = { start };
