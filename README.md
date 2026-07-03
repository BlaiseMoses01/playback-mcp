<p align="center">
  <img src="https://raw.githubusercontent.com/BlaiseMoses01/playback-mcp/main/assets/social-preview.png" alt="playback-mcp — control YouTube playback from your editor" width="720">
</p>

# Playback MCP

[![CI](https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/codeql.yml)
[![Secret Scanning](https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/BlaiseMoses01/playback-mcp/actions/workflows/gitleaks.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Control playback in your browser from [MCP](https://modelcontextprotocol.io) clients like Claude Code. Local-first, free, MIT.

Ask Claude things like:

> _"open the stairway lesson and loop 0:15–0:42 at 75% speed, three passes"_

and it happens in your actual Chrome tab — play, pause, seek, speed, volume, A-B section loops with per-pass speed ramps, clip sequences, named timestamps, transcript search, and a searchable library of saved videos.

Local, and multi-session: run several Claude sessions at once and each drives its own
YouTube tab in parallel. Every `playback-mcp` connects to a shared broker (auto-started on
first use) that owns the localhost port and routes each session to its own tab:

```
Claude A ──stdio──▶ playback-mcp ─┐                              ┌─ tab A ──▶ <video X>
Claude B ──stdio──▶ playback-mcp ─┼─▶ broker (127.0.0.1:8765) ─▶ extension ─┼─ tab B ──▶ <video Y>
```

**Bot-safe by design:** the extension only reads/writes the `<video>` element's properties (currentTime, playbackRate, volume, play/pause). It never clicks UI, never scrapes, never automates navigation beyond opening a watch URL. This is meant to minimize any malicious user flagging or bot detection issues.

## Install

The released way — no clone, no build. Requires Node ≥ 23.4 (Node 24 LTS recommended
— uses the built-in `node:sqlite`) and Chrome.

1. Install the server: `npm i -g playback-mcp`
2. Download `playback-mcp-extension-vX.Y.Z.zip` from the
   [latest release](https://github.com/BlaiseMoses01/playback-mcp/releases/latest) and
   unzip it
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
   pick the unzipped folder
4. Register the server with Claude Code. Pick one:
   - **Private to you (default scope):** `claude mcp add playback-mcp -- playback-mcp`
   - **Project-scoped (committed, shared with anyone who opens the repo):** add a
     `.mcp.json` at the repo root:
     ```json
     { "mcpServers": { "playback-mcp": { "command": "playback-mcp" } } }
     ```

Navigate to a YouTube video and ask Claude to pause it.

## Build from source

For development, or to run a custom `YT_BRIDGE_PORT` (the released extension bakes in
port 8765 at build time):

```sh
npm ci
npm run build
```

1. Open `chrome://extensions`, enable **Developer mode**
2. Click **Load unpacked** and pick `extension/dist`
3. Register the server: `claude mcp add playback-mcp -- node /abs/path/server/dist/index.js`

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

## Configuration

| Env var                 | Default            | What                                                                                                                                                                         |
| ----------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YT_BRIDGE_PORT`        | `8765`             | WebSocket port between server and extension. The extension bundle captures this at build time, so if you change it you must rebuild the extension with the same env var set. |
| `PLAYBACK_MCP_DATA_DIR` | platform data dir¹ | Where the SQLite library lives (`library.db`)                                                                                                                                |

¹ Linux: `~/.local/share/playback-mcp` (respects `XDG_DATA_HOME`) · macOS: `~/Library/Application Support/playback-mcp` · Windows: `%APPDATA%\playback-mcp`

## Troubleshooting

- **"Chrome extension is not connected"** — make sure the extension is loaded and Chrome is running; it reconnects automatically within a few seconds.
- **Multiple Claude sessions** — supported: each runs its own `playback-mcp` and drives its own YouTube tab. They share a background broker daemon (`playback-mcp-broker`) that starts automatically on first use and shuts down ~a minute after the last session closes.
- **Tools work but nothing happens on screen** — confirm this session's managed YouTube tab still exists; `open_video` creates one. Each session controls only its own tab.
- **"This video has no captions available" / transcript errors** — `get_transcript` and `search_transcript` fetch captions straight from YouTube for the currently open video; some videos genuinely have no captions, and `lang` must match an available track.

## Development

```sh
npm run build
node scripts/mcp-poke.mjs      # full smoke test over real MCP stdio, no browser needed
node scripts/fake-extension.mjs # mock extension that acks all commands (for manual poking)
```

## Example Use Cases

I built playback MCP for saving , looping ,and marking backing track videos for guitar practice. I connect Claude Code and tell it to "play the solo 3 times" or "play the verse at half speed" and it coordinates that based on saved timestamps I mark or have it mark for
on my behalf.

I also have been using it a good bit when studying/ learning new things from videos , I have it save them to my notes, mark timestamps along key points , etc so that when I review I can tell it " play the section on XYZ" or "give me as study guide for this topic , and play clips relevant to that".

## License

MIT
