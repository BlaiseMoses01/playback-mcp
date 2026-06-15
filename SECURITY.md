# Security Policy

## Supported versions

This project is pre-1.0. Security fixes land on `main`; there are no separately
maintained release branches or published artifacts yet.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- Preferred: open a [GitHub Security Advisory](https://github.com/BlaiseMoses01/yt-controller/security/advisories/new).
- Or email: bamoses2001@gmail.com

Please include steps to reproduce and the affected component (the MCP server in
`server/`, the WebSocket bridge, or the Chrome extension in `extension/`). Expect an
initial response within about a week.

## Scope notes

The server and extension talk over a **localhost-only** WebSocket bridge
(`ws://127.0.0.1:8765` by default); it binds an exclusive local port and accepts no
remote connections. The extension is deliberately narrow: it only reads/writes the
`<video>` element's properties (currentTime, playbackRate, volume, play/pause) and
never clicks YouTube's UI, scrapes, or automates navigation beyond opening a watch URL.
The saved-video library lives in a local SQLite file. Risks introduced by other
software sharing the bridge port or data dir are outside this project's control.
