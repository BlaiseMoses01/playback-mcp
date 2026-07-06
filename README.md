<p align="center">
  <img src="https://raw.githubusercontent.com/BlaiseMoses01/playback-mcp/main/assets/social-preview.png" alt="Playback MCP — YouTube control for AI agents" width="720">
</p>

<h1 align="center">Playback MCP</h1>

<p align="center"><strong>YouTube control for AI agents.</strong></p>

<p align="center">
  Loop, seek, sequence clips, and search transcripts in your real browser —
  driven by <a href="https://claude.com/claude-code">Claude Code</a> or any
  <a href="https://modelcontextprotocol.io">MCP</a> client.<br>Local-first, free, MIT.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/playback-mcp"><img src="https://img.shields.io/npm/v/playback-mcp?color=cb3837&logo=npm" alt="npm"></a>
  <a href="https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/ci.yml"><img src="https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/codeql.yml"><img src="https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/gitleaks.yml"><img src="https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/gitleaks.yml/badge.svg" alt="Secret Scanning"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

---

## Demo

<p align="center">
  <a href="https://youtu.be/WP4xh5uPnIc?si=3NNepGxws2-b8iq_"><img src="https://img.youtube.com/vi/WP4xh5uPnIc/maxresdefault.jpg" alt="Playback MCP demo" width="600"></a>
</p>

## What you can do with it

|                          |                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------- |
| 🎸 **Music practice**    | Loop a passage and ramp the speed up pass by pass, hands-free.                  |
| 🗣️ **Language learning** | Slow a sentence down and jump to every place a phrase is spoken.                |
| 📝 **Study & notes**     | Summarize a lecture from its transcript and save timestamps to revisit.         |
| 🍳 **Cooking & how-tos** | Turn a recipe or tutorial into written steps — or a clip reel of the key parts. |
| ✂️ **Shorts & clips**    | Mine a long video for short-form ideas and pull the exact clips.                |
| ⏭️ **Skip the filler**   | Find the sponsor reads in a long podcast and jump past them.                    |

## How it works

One broker owns the localhost port and routes each session to its own tab. Every
`playback-mcp` server shares a single library on disk.

<p align="center">
  <img src="https://raw.githubusercontent.com/BlaiseMoses01/playback-mcp/main/assets/diagram-system-simple.png" alt="Agent → playback-mcp → broker → extension → browser tab, with a shared SQLite library" width="900">
</p>

Run several sessions at once and each drives its own YouTube tab in parallel. The broker
auto-starts on first use and idles out ~a minute after the last session closes.

<details>
<summary><strong>Full multi-session architecture</strong></summary>

<p align="center">
  <img src="https://raw.githubusercontent.com/BlaiseMoses01/playback-mcp/main/assets/diagram-system-full.png" alt="Multiple agent sessions multiplexed through one broker onto the extension, each with its own tab" width="960">
</p>

Each session gets a unique `sessionId`. The broker tags commands with it, multiplexes every
server onto the one extension connection, and routes events back only to the owning session.
Saved videos and timestamps live in a single WAL-mode SQLite database (`node:sqlite`) shared
across all servers. A WebSocket Origin allow-list at the handshake means only the extension
and local Node clients can connect — arbitrary web pages can't drive playback.

</details>

## Install

The released way — no clone, no build. Requires **Node 24 LTS** (≥ 23.4; uses the built-in
`node:sqlite`) and **Chrome**.

1. **Install the server** — the [`playback-mcp`](https://www.npmjs.com/package/playback-mcp) package.

   ```sh
   npm i -g playback-mcp
   ```

2. **Load the extension.** Download `playback-mcp-extension-vX.Y.Z.zip` from the
   [latest release](https://github.com/BlaiseMoses01/playback-mcp/releases/latest) and unzip
   it. In `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and pick
   the unzipped folder.

3. **Register it with your MCP client.** Any MCP client works — for Claude Code:

   ```sh
   claude mcp add playback-mcp -- playback-mcp
   ```

   Or project-scoped (committed, shared with anyone who opens the repo) via a `.mcp.json` at
   the repo root:

   ```json
   { "mcpServers": { "playback-mcp": { "command": "playback-mcp" } } }
   ```

4. **Open a YouTube video and ask** — _"pause it," "loop the chorus twice at 0.75×," "find
   where they mention hooks."_

## Tools

| Tool                                                      | What it does                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `play` / `pause`                                          | Resume (optionally from a time/label) or pause                                                                                     |
| `seek`                                                    | Jump to a time (`"1:30"`, `"90"`, `"1m30s"`) or a saved timestamp label                                                            |
| `set_speed`                                               | 0.25×–2× playback rate                                                                                                             |
| `set_volume`                                              | Absolute 0–100 or relative `"+10"`/`"-10"`                                                                                         |
| `loop_section`                                            | Loop a section N times, optionally with per-pass speeds (e.g. 0.5 → 0.75 → 1.0). Returns immediately; the loop runs in the browser |
| `stop_loop`                                               | Cancel the active loop                                                                                                             |
| `play_sequence`                                           | Play a list of clips back-to-back, skipping the gaps between them. Returns immediately; runs in the browser                        |
| `stop_sequence`                                           | Cancel the active clip sequence                                                                                                    |
| `save_video` / `find_videos` / `open_video`               | Build and search a library of saved videos; open them in a managed tab                                                             |
| `save_timestamp` / `list_timestamps` / `delete_timestamp` | Named positions and loopable sections per video                                                                                    |
| `get_transcript`                                          | Caption transcript of the open video as `[m:ss] text` lines; optional `start`/`end` window and `lang`                              |
| `search_transcript`                                       | Find a word/phrase in the transcript; returns timestamps with context — pair with `seek` to jump to a topic                        |
| `get_state`                                               | Full player state; works even when the extension is disconnected                                                                   |

Time inputs are forgiving: `"90"`, `"1:30"`, `"1m30s"`, `"1:02:03"`; speeds accept `"0.75x"`.

## Safe by design

The extension only reads and writes the `<video>` element's own properties — `currentTime`,
`playbackRate`, `volume`, play/pause. It never clicks UI, never scrapes, and never automates
navigation beyond opening a watch URL. Everything runs on `127.0.0.1`; your library lives in
a local SQLite file and nothing is sent to any external server.

## Configuration

| Env var                 | Default            | What                                                                                                                                                                         |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YT_BRIDGE_PORT`        | `8765`             | WebSocket port between server and extension. The extension bundle captures this at build time, so if you change it you must rebuild the extension with the same env var set. |
| `PLAYBACK_MCP_DATA_DIR` | platform data dir¹ | Where the SQLite library lives (`library.db`)                                                                                                                                |

¹ Linux: `~/.local/share/playback-mcp` (respects `XDG_DATA_HOME`) · macOS: `~/Library/Application Support/playback-mcp` · Windows: `%APPDATA%\playback-mcp`

## Build from source

For development, or to run a custom `YT_BRIDGE_PORT` (the released extension bakes in port
8765 at build time):

```sh
npm ci
npm run build
```

1. Open `chrome://extensions`, enable **Developer mode**
2. Click **Load unpacked** and pick `extension/dist`
3. Register the server: `claude mcp add playback-mcp -- node /abs/path/server/dist/index.js`

## Troubleshooting

- **"Chrome extension is not connected"** — make sure the extension is loaded and Chrome is
  running; it reconnects automatically within a few seconds.
- **Tools work but nothing happens on screen** — confirm this session's managed YouTube tab
  still exists; `open_video` creates one. Each session controls only its own tab.
- **Multiple sessions** — supported: each runs its own `playback-mcp` and drives its own tab.
  They share a background broker daemon (`playback-mcp-broker`) that starts automatically on
  first use and shuts down ~a minute after the last session closes.
- **"This video has no captions available" / transcript errors** — `get_transcript` and
  `search_transcript` fetch captions straight from YouTube for the open video; some videos
  genuinely have no captions, and `lang` must match an available track.

## Development

```sh
npm run build
node scripts/mcp-poke.mjs       # full smoke test over real MCP stdio, no browser needed
node scripts/fake-extension.mjs # mock extension that acks all commands (for manual poking)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, and
[SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE) © 2026 Blaise Moses
