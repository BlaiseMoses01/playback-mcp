# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MCP server (`yt-controller-mcp`) controlling YouTube playback in the browser via a
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

[Unreleased]: https://github.com/BlaiseMoses01/yt-controller/commits/main
