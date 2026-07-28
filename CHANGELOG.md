# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Dev toolchain: TypeScript 7 (native compiler) replaces tsc 6 for typecheck and the
  published build, and oxlint with type-aware linting (oxlint-tsgolint) replaces
  ESLint + typescript-eslint. No runtime behavior change for package consumers.

## [0.2.7] - 2026-08-30

### Changed

- Dependency maintenance only — no behavior change, and the shipped `dist/` is
  unchanged from 0.2.6 apart from two Prettier reflows.
- Raised the floors on both runtime dependencies so the published package can no longer
  resolve to versions with open high-severity advisories:
  - `@modelcontextprotocol/sdk` `^1.12.0` → `^1.30.0`. The old floor admitted 1.12.0–1.25.3,
    which are affected by a cross-client data leak via a shared server/transport, a ReDoS,
    and (below 1.24.0) missing DNS-rebinding protection. `playback-mcp` runs one stdio
    server per client, so the shared-transport leak did not apply to this architecture.
  - `ws` `^8.18.0` → `^8.21.3`. The old floor admitted 8.18.0–8.20.x, affected by a
    memory-exhaustion DoS from tiny fragments (< 8.21.0) and an uninitialized memory
    disclosure (< 8.20.1). The broker's socket is localhost-only behind the Origin
    allow-list, so reaching it required an already-permitted local origin.

  A fresh install of 0.2.6 already resolved to patched versions through the caret ranges;
  this release closes the floors for anyone pinned by an older lockfile.

- Development toolchain bumps (not shipped): `eslint` 10.8.0, `typescript-eslint` 8.68.0,
  `globals` 17.11.0, `esbuild` 0.28.2, `@types/chrome` 0.2.6, `@types/node` 26.1.2,
  `lint-staged` 17.3.0, `prettier` 3.9.6, and CI action pins for `github/codeql-action`
  (v4.37.7) and `pnpm/action-setup` (v6.0.10).

## [0.2.6] - 2026-07-06

### Changed

- The npm package homepage now points to the docs/landing site
  (`https://blaisemoses01.github.io/playback-mcp/`) instead of the GitHub readme.
- README, docs site, and Chrome Web Store promo copy updates.

### Added

- Repository governance: a CODEOWNERS file, a pull request template, and expanded
  contributing guidelines.

## [0.2.5] - 2026-07-05

### Changed

- README and docs site copy updates.

## [0.2.4] - 2026-07-05

### Added

- `playback-mcp --version` / `-v` and `--help` / `-h`. Running the binary in an
  interactive terminal (rather than being spawned by an MCP client) now prints a
  short hint instead of hanging silently on stdin; `--serve` forces server mode.

### Changed

- The server version reported over MCP is now read from `package.json` at startup
  instead of being hardcoded, so it can no longer drift out of sync on release.
- README and the docs site gain an npm version badge, links to the published
  `playback-mcp` package, and GitHub/npm icons in the nav and footer.

## [0.2.3] - 2026-07-04

### Changed

- Extension documentation and user-facing verbiage updates.
- Broadened the ad-skip button detection: the query is no longer scoped to
  `#movie_player` (newer player variants render the skip button outside it) and
  visibility is now checked via `getBoundingClientRect` so a skip button under a
  `position: fixed` ancestor is still recognized. The button is still only clicked
  once it's actually visible to the user.

## [0.2.2] - 2026-07-03

### Security

- The broker now enforces an Origin allow-list at the WebSocket handshake: only the
  companion extension's `chrome-extension://` origin and origin-less Node clients
  (the MCP bridge) may connect. Web-page origins are rejected with a 403, so
  arbitrary pages can no longer connect to the localhost port and drive playback
  ([#18](https://github.com/BlaiseMoses01/playback-mcp/issues/18)).
- The extension validates wire-sourced `sessionId`s as UUIDs before using them as
  tab-map keys (closes a CodeQL remote-property-injection alert).
- The smoke-test fake extension sanitizes logged wire values with `JSON.stringify`
  (closes a CodeQL log-injection alert).

## [0.2.1] - 2026-07-03

### Added

- A standalone **broker daemon** (`playback-mcp-broker`) that owns the localhost port
  and multiplexes many `playback-mcp` servers onto the one extension. Each server
  connects as a session-tagged client (auto-spawning the broker if it isn't running),
  so multiple concurrent Claude sessions can each drive their own YouTube tab in
  parallel. The broker routes commands and events by `sessionId` and idle-exits after
  its last client disconnects.

## [0.2.0] - 2026-07-03

### Added

- `play_sequence` / `stop_sequence`: play a list of clips back-to-back, skipping the
  gaps between them (e.g. a "power user tour" of just the moments that matter).
  Returns immediately and runs in the browser, like `loop_section`; progress is
  surfaced via `get_state`.
- `get_transcript` / `search_transcript`: fetch and search the caption transcript of
  the currently open video. Transcripts are fetched by the server directly from
  YouTube (an ANDROID innertube client context, not the extension), formatted as
  `[m:ss] text` lines with an optional time window, and are case-insensitively
  searchable with surrounding context.

### Changed

- `get_state` / player state now reports `sequence` alongside `loop`, and the last
  sequence progress/done event alongside the last loop event.

## [0.1.0] - 2026-06-20

### Added

- MCP server (`playback-mcp`) controlling YouTube playback in the browser via a
  companion Chrome extension over a localhost WebSocket bridge: `play`/`pause`, `seek`,
  `set_speed`, `set_volume`, `loop_section` (with per-pass speed ramps) / `stop_loop`,
  `save_video`/`find_videos`/`open_video`, `save_timestamp`/`list_timestamps`/
  `delete_timestamp`, and `get_state`.
- Bot-safe extension that only reads/writes the `<video>` element — no UI automation
  or scraping.
- Forgiving time/rate/volume parsing for agent-supplied values (`server/src/timeparse.ts`).
- Searchable saved-video library backed by the built-in `node:sqlite`.
- CI (ESLint, Prettier, tsc typecheck, build, Vitest, npm audit), CodeQL, and gitleaks
  workflows; Dependabot for GitHub Actions and npm; husky + lint-staged pre-commit hooks.
- Project docs: README, CONTRIBUTING, SECURITY, AGENTS/CLAUDE guidance, and a PR template.

[Unreleased]: https://github.com/BlaiseMoses01/playback-mcp/compare/v0.2.7...HEAD
[0.2.7]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.7
[0.2.6]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.6
[0.2.5]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.5
[0.2.4]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.4
[0.2.3]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.3
[0.2.2]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.2
[0.2.1]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.1.0
