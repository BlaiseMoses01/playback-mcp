# yt-controller

Control YouTube playback in your browser from [MCP](https://modelcontextprotocol.io) clients like Claude Code. Local-first, free, MIT.

Ask Claude things like:

> *"open the stairway lesson and loop 0:15–0:42 at 75% speed, three passes"*

and it happens in your actual Chrome tab — play, pause, seek, speed, volume, A-B section loops with per-pass speed ramps, named timestamps, and a searchable library of saved videos.

Two parts, both local:

```
Claude Code ──stdio──▶ yt-controller-mcp ──ws://127.0.0.1:8765──▶ YT Controller extension ──▶ <video>
```

**Bot-safe by design:** the extension only reads/writes the `<video>` element's properties (currentTime, playbackRate, volume, play/pause). It never clicks YouTube's UI, never scrapes, never automates navigation beyond opening a watch URL.

## Install

### 1. The MCP server

Requires Node ≥ 23.4 (Node 24 LTS recommended — uses the built-in `node:sqlite`):

```sh
claude mcp add yt-controller -- npx -y yt-controller-mcp
```

### 2. The Chrome extension

1. Download `yt-controller-extension.zip` from the [latest release](../../releases/latest) and unzip it
2. Open `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked** and pick the unzipped folder

That's it. Open a YouTube video and ask Claude to pause it.

### Building from source

```sh
npm install && npm run build
```

Then load `extension/dist` unpacked, and register the server with `claude mcp add yt-controller -- node /abs/path/server/dist/index.js`.

## Tools

| Tool | What it does |
|---|---|
| `play` / `pause` | Resume (optionally from a time/label) or pause |
| `seek` | Jump to a time (`"1:30"`, `"90"`, `"1m30s"`) or a saved timestamp label |
| `set_speed` | 0.25×–2× playback rate |
| `set_volume` | Absolute 0–100 or relative `"+10"`/`"-10"` |
| `loop_section` | Loop a section N times, optionally with per-pass speeds (e.g. 0.5 → 0.75 → 1.0). Returns immediately; the loop runs in the browser |
| `stop_loop` | Cancel the active loop |
| `save_video` / `find_videos` / `open_video` | Build and search a library of saved videos; open them in a managed tab |
| `save_timestamp` / `list_timestamps` / `delete_timestamp` | Named positions and loopable sections per video |
| `get_state` | Full player state; works even when the extension is disconnected |

Time inputs are forgiving: `"90"`, `"1:30"`, `"1m30s"`, `"1:02:03"`; speeds accept `"0.75x"`.

## Configuration

| Env var | Default | What |
|---|---|---|
| `YT_BRIDGE_PORT` | `8765` | WebSocket port between server and extension. The prebuilt extension zip is fixed to 8765; to change it, build the extension from source with the same env var set. |
| `YT_CONTROLLER_DATA_DIR` | platform data dir¹ | Where the SQLite library lives (`library.db`) |

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

## Migrating from guitar-practice-app

The schema is unchanged — copy your old `data/practice.db` to the data dir above as `library.db`.

## Example setups

Pairs nicely with a metronome MCP server for music practice — but it has no dependencies beyond Node + Chrome.

## License

MIT
