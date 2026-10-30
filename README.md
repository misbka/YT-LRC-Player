# 🎵 YT Player — YouTube + Synchronized Lyrics

![YT Player Screenshot 1](https://i.ibb.co/pjGZyXz7/img1.png)

![YT Player Screenshot 2](https://i.ibb.co/PyMVg0n/img2.png)

A web-based music player that searches for tracks on YouTube and plays them with **real-time synchronized lyrics** (karaoke-style), using lyrics from [LRCLIB](https://lrclib.net/).

Works as either a **desktop app (Electron)** or directly in your **web browser**. The backend uses pure Node.js — no database or API key required.

## ✨ Features

- 🔍 **Search for music** on YouTube (title, channel, duration, views, and thumbnail).
- ▶️ **Built-in player** with custom controls: play/pause, previous/next, progress bar, and volume.
- 📜 **LRCLIB synchronized lyrics** — the current line is highlighted as the song plays, with automatic scrolling.
- 🖱️ **Click any lyric line** to jump directly to that moment in the song.
- 🎵 **Playlists** — create, rename, and delete playlists; add songs using the ➕ button in search results or the player; reorder tracks (⬆⬇), remove tracks (✕), and play in sequence or **shuffle** (🔀).
- 💾 **Persistent playlists** stored in `localStorage` — they remain available after closing the app or refreshing the page.
- 🧠 **Smart lyrics matching** — cleans up video titles ("Official Video", "Lyrics", "[4K]", etc.), separates artist and track names, recognizes "* - Topic" channels as artists, and prioritizes results with matching durations.
- ↩️ **Fallback to plain lyrics** when LRCLIB doesn't have synchronized timestamps.
- ⏭️ Automatically plays the next song in the queue when the current track ends.
- ⌨️ Keyboard shortcuts.
- 📱 Responsive layout (panels stack vertically on narrower windows).

## 🚀 Getting Started

Requirements: [Node.js](https://nodejs.org) 18+ (uses native `fetch`).

### 🖥️ Desktop App (Electron) — Recommended

```bash
npm install
npm start
```

Opens a native window with the player. The app automatically starts the local server on an available port — no need to run `node server.js` separately.

**Build an installer:**

```bash
npm run dist    # Generates installers (Windows .exe, Linux .AppImage, macOS .dmg)
npm run pack    # Packages the app folder without an installer
```

### 🌐 Web Version (Browser)

```bash
npm run web
```

Open **http://localhost:3000** in your browser. To use a different port: `PORT=8080 npm run web`.

> ⚠️ Access the app through `localhost` (not `file://`): the YouTube player requires a valid HTTP referrer.

### ✨ Electron Version Differences

- Native window with a hidden menu (press `Alt` to show it), plus `F5` (reload) and `Ctrl+Shift+I` (DevTools) shortcuts.
- Chrome User-Agent applied to help avoid YouTube embed restrictions.
- Single-instance lock (launching the app again focuses the existing window).
- External links open in the system's default browser.

## 🎹 Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `→` | Forward 5 seconds |
| `←` | Rewind 5 seconds |

## 🏗️ How It Works

```text
Electron Window or Browser ──▶ Node (server.js) ──▶ Piped Instances (YouTube video search)
                                      │
                                      └────────────▶ lrclib.net (synchronized lyrics)
```

- **Search:** The browser does not communicate directly with YouTube. The server queries public [Piped](https://github.com/TeamPiped/Piped) API instances, automatically falling back between multiple instances, and returns the results as JSON.
- **Playback:** Uses the official [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), loaded on the client side.
- **Lyrics:** The server queries the public [LRCLIB](https://lrclib.net/) API — first using an exact match (artist + track + duration), then performing a scored search that prioritizes synchronized lyrics and similar durations.
- **Synchronization:** The client parses the [LRC format](https://www.lyrics.com/lyrics-formats.asp) (`[mm:ss.xx] line`) and checks the player's current position every 250 ms to highlight the active lyric line.

The server-side proxy avoids CORS issues and keeps the list of API instances hidden from the client.

## 📁 Project Structure

```text
├── server.js          # HTTP server (pure Node.js, no dependencies)
│                      #   /api/search → YouTube search (Piped)
│                      #   /api/lyrics → Lyrics (LRCLIB)
│                      #   + static files from public/
├── package.json       # npm scripts (start, web, dist) and electron-builder config
├── electron/
│   ├── main.js        # Main process: window, Chrome UA, available port
│   └── preload.js     # Exposes minimal information (platform/version) to the renderer
└── public/
    ├── index.html     # Layout: Search/Playlists tabs, player, lyrics, and modals
    ├── style.css      # Dark theme
    └── app.js         # Player, music queue, playlists (localStorage), and lyric synchronization
```

## 🔌 API Endpoints

| Route | Parameters | Description |
|---|---|---|
| `GET /api/search` | `q` | Searches YouTube videos; returns `{ source, items[] }` containing `id`, `title`, `uploader`, `duration`, `views`, and `thumbnail`. |
| `GET /api/lyrics` | `query`, `trackName`, `artistName`, `albumName`, `duration` | Queries LRCLIB; returns `{ trackName, artistName, synced, syncedLyrics, plainLyrics, ... }`. |

**Playlists** are stored in the browser/app's `localStorage` (key: `ytplayer.playlists`) — entirely client-side, with no API endpoint required.

## ⚠️ Notes

- If a song has no lyrics, LRCLIB does not have that track in its database. The video will continue playing normally, and the lyrics panel will display "Not found".
- Piped instances are community-maintained and may occasionally go offline. The server automatically tries the next instance. If all instances fail, you can update the `PIPED_INSTANCES` list in `server.js`.
- This project is intended for personal/educational use only and does not host any content — all media is played directly from YouTube.

## 📄 License

MIT
