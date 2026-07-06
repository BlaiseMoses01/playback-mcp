# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first system for controlling browser video playback from MCP clients. Many Claude
sessions can run at once: each `playback-mcp` process connects to a shared **broker daemon**
that owns the localhost port, and each session (identified by a `sessionId`) drives its own
YouTube tab, so sessions play different videos in parallel.

```
Claude A ──stdio──▶ playback-mcp(sess A) ─┐                              ┌─ tab A ──▶ <video X>
Claude B ──stdio──▶ playback-mcp(sess B) ─┼─▶ broker (ws://127.0.0.1:8765) ─▶ extension ─┼─ tab B ──▶ <video Y>
Claude C ──stdio──▶ playback-mcp(sess C) ─┘                              └─ tab C ──▶ <video Z>
```

It's a pnpm **workspace monorepo** (`server` + `extension`); ESM throughout. Run all
tooling from the repo root.

- `server/` — the MCP server workspace (package name: `playback-mcp`). Node ≥ 23.4
  (uses the built-in `node:sqlite`).
- `extension/` — the Chrome extension workspace, bundled with esbuild and loaded
  unpacked from `extension/dist` during development.

## Commands

```sh
pnpm install           # install both workspaces (husky hooks install via prepare)
pnpm run build         # build server (tsc) + extension (esbuild) across workspaces
pnpm run lint          # eslint over the whole repo
pnpm run format        # prettier --write (format:check for the CI-style check)
pnpm run typecheck     # tsc --noEmit for server + extension tsconfigs
pnpm test              # vitest run (server pure-logic tests)
pnpm run smoke         # E2E over real MCP stdio, no browser needed
```

## Architecture

```
server/src/
  index.ts        # MCP server entry (bin: playback-mcp) — registers tools over stdio
  broker.ts       # standalone daemon (bin: playback-mcp-broker) that owns the localhost port
                  #   and multiplexes many servers onto the one extension, routing by sessionId
  bridge.ts       # session-tagged WebSocket client to the broker (auto-spawns it if not running)
  db.ts           # saved-video library on top of node:sqlite (shared WAL DB across servers)
  timeparse.ts    # pure: parse/format times, rates, volumes from agent-supplied strings
  transcript.ts   # pure: normalize/format/search caption payloads (unit-tested)
  captions.ts     # fetches captions from YouTube (innertube ANDROID /player → timedtext json3)
  tools/          # MCP tool implementations (playback, library, loop, sequence, transcript, util)
extension/src/
  background.ts   # service worker: WS client to the broker; keeps a managed tab per sessionId
  content.ts      # content script: drives the page's <video> element (one instance per tab)
  esbuild.mjs     # bundles to IIFE for Chrome; reads __WS_PORT__ at build time
scripts/
  mcp-poke.mjs    # smoke test: spawns the broker + two servers + a fake extension over stdio
  fake-extension.mjs
```

- `timeparse.ts`, `transcript.ts`, and `pickTrack` in `captions.ts` are pure and have
  unit tests. The bridge, db, and extension code are not unit-tested (they need real
  sockets / Chrome / the page); use `pnpm run smoke` for the server path.
- Transcripts are fetched by the server directly, not by the extension: the web
  client's caption URLs are POT-gated (200 with an empty body) and innertube's
  `get_transcript` endpoint is dead (FAILED_PRECONDITION for every client), but
  `/player` with an ANDROID client context still returns POT-exempt caption URLs.
  The extension only supplies the current videoId via `get_state`. The smoke test
  skips the transcript tools so it stays offline-safe.
- One **broker** daemon owns the localhost port; every `playback-mcp` server connects to it
  as a client and auto-spawns it if it isn't running (a duplicate broker exits on
  `EADDRINUSE`). The broker idle-exits ~60s after its last client disconnects. Each server
  has a unique `sessionId`; the broker tags commands with it and the extension keeps one
  managed tab per session, so sessions drive different videos in parallel. Events are routed
  back only to the owning session.

## Gotchas

- Test files (`*.test.ts`) are excluded from the server build via `server/tsconfig.json`
  so they never ship in `dist/`. Vitest runs them directly from `server/src/`.
- CI runs Node 24 only — older LTS can't run `node:sqlite`. Don't add an older-Node matrix.
- The extension bundle captures port 8765 by default; changing `YT_BRIDGE_PORT`
  requires rebuilding the extension with the same env var.
- TypeScript is NodeNext ESM in `server/` — intra-repo imports use explicit `.js` extensions.
- The broker enforces an Origin allow-list at the WS handshake (`broker.ts`, issue #18):
  only the extension's `chrome-extension://` origin and origin-less Node clients (the MCP
  bridge) may connect. A web page's http/https Origin is rejected with a 403, so arbitrary
  pages can't drive playback.
