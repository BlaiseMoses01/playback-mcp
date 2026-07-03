# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/BlaiseMoses01/playback-mcp/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.2
[0.2.1]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/v0.1.0
