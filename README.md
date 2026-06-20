# Playback MCP

[![CI](https://github.com/BlaiseMoses01/yt-controller/actions/workflows/ci.yml/badge.svg)](https://github.com/BlaiseMoses01/yt-controller/actions/workflows/ci.yml)
[![CodeQL](https://github.com/BlaiseMoses01/yt-controller/actions/workflows/codeql.yml/badge.svg)](https://github.com/BlaiseMoses01/yt-controller/actions/workflows/codeql.yml)
[![Secret Scanning](https://github.com/BlaiseMoses01/yt-controller/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/BlaiseMoses01/yt-controller/actions/workflows/gitleaks.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Control playback in your browser from [MCP](https://modelcontextprotocol.io) clients like Claude Code. Local-first, free, MIT.

Ask Claude things like:

> _"open the stairway lesson and loop 0:15–0:42 at 75% speed, three passes"_

and it happens in your actual Chrome tab — play, pause, seek, speed, volume, A-B section loops with per-pass speed ramps, named timestamps, and a searchable library of saved videos.

Two parts, both local:

```
Claude Code ──stdio──▶ yt-controller-mcp ──ws://127.0.0.1:8765──▶ YT Controller extension ──▶ <video>
```

**Bot-safe by design:** the extension only reads/writes the `<video>` element's properties (currentTime, playbackRate, volume, play/pause). It never clicks UI, never scrapes, never automates navigation beyond opening a watch URL. This is meant to minimize any malicious user flagging or bot detection issues.

## Local Setup

Requires Node ≥ 23.4 (Node 24 LTS recommended — uses the built-in `node:sqlite`) and
Chrome.

```sh
npm ci
npm run build
```

1. Open `chrome://extensions`, enable **Developer mode**
2. Click **Load unpacked** and pick `extension/dist`
3. Register the server with `claude mcp add yt-controller -- node /abs/path/server/dist/index.js`

Open chrom , navigate to a YT video and ask Claude to pause it.

## Tools

| Tool                                                      | What it does                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `play` / `pause`                                          | Resume (optionally from a time/label) or pause                                                                                     |
| `seek`                                                    | Jump to a time (`"1:30"`, `"90"`, `"1m30s"`) or a saved timestamp label                                                            |
| `set_speed`                                               | 0.25×–2× playback rate                                                                                                             |
| `set_volume`                                              | Absolute 0–100 or relative `"+10"`/`"-10"`                                                                                         |
| `loop_section`                                            | Loop a section N times, optionally with per-pass speeds (e.g. 0.5 → 0.75 → 1.0). Returns immediately; the loop runs in the browser |
| `stop_loop`                                               | Cancel the active loop                                                                                                             |
| `save_video` / `find_videos` / `open_video`               | Build and search a library of saved videos; open them in a managed tab                                                             |
| `save_timestamp` / `list_timestamps` / `delete_timestamp` | Named positions and loopable sections per video                                                                                    |
| `get_state`                                               | Full player state; works even when the extension is disconnected                                                                   |

Time inputs are forgiving: `"90"`, `"1:30"`, `"1m30s"`, `"1:02:03"`; speeds accept `"0.75x"`.

## Configuration

| Env var                  | Default            | What                                                                                                                                                                         |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YT_BRIDGE_PORT`         | `8765`             | WebSocket port between server and extension. The extension bundle captures this at build time, so if you change it you must rebuild the extension with the same env var set. |
| `YT_CONTROLLER_DATA_DIR` | platform data dir¹ | Where the SQLite library lives (`library.db`)                                                                                                                                |

¹ Linux: `~/.local/share/yt-controller` (respects `XDG_DATA_HOME`) · macOS: `~/Library/Application Support/yt-controller` · Windows: `%APPDATA%\yt-controller`

## Troubleshooting

- **"Chrome extension is not connected"** — make sure the extension is loaded and Chrome is running; it reconnects automatically within a few seconds.
- **"port 8765 is already in use"** — only one yt-controller MCP server can run at a time (the extension speaks to one server). Close the other session.
- **Tools work but nothing happens on screen** — confirm the managed YouTube tab still exists; `open_video` creates one.

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
