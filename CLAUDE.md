# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first, two-part system for controlling YouTube playback from MCP clients:

```
Claude Code ──stdio──▶ playback-mcp ──ws://127.0.0.1:8765──▶ Playback MCP extension ──▶ <video>
```

It's an npm **workspace monorepo** (`server` + `extension`); ESM throughout. Run all
tooling from the repo root.

- `server/` — the MCP server workspace (package name: `playback-mcp`). Node ≥ 23.4
  (uses the built-in `node:sqlite`).
- `extension/` — the Chrome extension workspace, bundled with esbuild and loaded
  unpacked from `extension/dist` during development.

## Commands

```sh
npm ci                 # install both workspaces (husky hooks install via prepare)
npm run build          # build server (tsc) + extension (esbuild) across workspaces
npm run lint           # eslint over the whole repo
npm run format         # prettier --write (format:check for the CI-style check)
npm run typecheck      # tsc --noEmit for server + extension tsconfigs
npm test               # vitest run (server pure-logic tests)
npm run smoke          # E2E over real MCP stdio, no browser needed
```

## Architecture

```
server/src/
  index.ts        # MCP server entry (bin: playback-mcp) — registers tools over stdio
  bridge.ts       # localhost WebSocket bridge to the extension; owns the exclusive port
  db.ts           # saved-video library on top of node:sqlite
  timeparse.ts    # pure: parse/format times, rates, volumes from agent-supplied strings
  tools/          # MCP tool implementations (playback, library, loop, util)
extension/src/
  background.ts   # service worker: WebSocket client to the server
  content.ts      # content script: drives the page's <video> element
  esbuild.mjs     # bundles to IIFE for Chrome; reads __WS_PORT__ at build time
scripts/
  mcp-poke.mjs    # smoke test: spawns the server + a fake extension over stdio
  fake-extension.mjs
```

- `timeparse.ts` is pure and has unit tests (`timeparse.test.ts`). The bridge, db, and
  extension code are not unit-tested (they need real sockets / Chrome / the page); use
  `npm run smoke` for the server path.
- The bridge binds an exclusive localhost port — only one server runs at a time.

## Gotchas

- Test files (`*.test.ts`) are excluded from the server build via `server/tsconfig.json`
  so they never ship in `dist/`. Vitest runs them directly from `server/src/`.
- CI runs Node 24 only — older LTS can't run `node:sqlite`. Don't add an older-Node matrix.
- The extension bundle captures port 8765 by default; changing `YT_BRIDGE_PORT`
  requires rebuilding the extension with the same env var.
- TypeScript is NodeNext ESM in `server/` — intra-repo imports use explicit `.js` extensions.
