# Security Policy

## Supported versions

This project is pre-1.0. Security fixes land on `main`; there are no separately
maintained release branches or published artifacts yet.

## Reporting a vulnerability

Please report serious security issues **privately** — do not open a public issue.

- Preferred: open a [GitHub Security Advisory](https://github.com/BlaiseMoses01/playback-mcp/security/advisories/new).

For bugs and smaller issues feel free to open an issue and I will remediate as soon as possible

Please include steps to reproduce and the affected component (the MCP server in
`server/`, the WebSocket bridge, or the Chrome extension in `extension/`). Expect an
initial response within about a week.

## Scope notes

The servers and extension talk over a **localhost-only** WebSocket broker
(`ws://127.0.0.1:8765` by default) that accepts no remote connections. The broker
multiplexes multiple local `playback-mcp` servers onto the one extension; as before, any
local process could connect to that loopback port (it is unauthenticated), but there is no
network exposure. The extension is deliberately narrow: it only reads/writes the
`<video>` element's properties (currentTime, playbackRate, volume, play/pause) and
never clicks YouTube's UI, scrapes, or automates navigation beyond opening a watch URL.
The saved-video library lives in a local SQLite file. Risks introduced by other
software sharing the bridge port or data dir are outside this project's control.
