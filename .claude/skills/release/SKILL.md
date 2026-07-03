---
name: release
description: Cut a new playback-mcp release — version bump, changelog, dev-to-main PR, tag, and npm publish via CI. Use when asked to plan or ship a new release/version.
disable-model-invocation: true
---

# Releasing playback-mcp

Only `server/` is published to npm (as `playback-mcp`); the extension is built and
attached to the GitHub Release as a zip. `.github/workflows/publish.yml` does the actual
publishing — it triggers on a **published GitHub Release** and expects the version to
already be bumped and merged into `main` beforehand.

Full narrative version of this lives in `CONTRIBUTING.md`'s "Releasing" section — keep
both in sync if the process changes.

## 1. Pick the version

Semver. This project is pre-1.0, so treat it like `0.y.z`: backwards-compatible
additions bump the minor (`0.1.0` → `0.2.0`), fixes bump the patch.

## 2. Prep the release commit on `dev`

- Bump `"version"` in `server/package.json`.
- Run `npm install --package-lock-only` so `package-lock.json` picks up the new version
  (it tracks the workspace version in two places — grep `"version": "0.1.0"` to confirm
  both updated).
- In `CHANGELOG.md`: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh
  empty `## [Unreleased]` above it, and update the link refs at the bottom:
  ```
  [Unreleased]: https://github.com/BlaiseMoses01/playback-mcp/compare/vX.Y.Z...HEAD
  [X.Y.Z]: https://github.com/BlaiseMoses01/playback-mcp/releases/tag/vX.Y.Z
  ```
- Run the full gate: `npm run lint && npm run format:check && npm run typecheck && npm run build && npm test`.
- Commit as `release: playback-mcp vX.Y.Z` (see `9a1ca94`, `07ed42a` for precedent).
- `git push origin dev`.

## 3. PR dev into main

Use the `pr` skill. Wait for CI to go green, confirm with the user, then merge with
`gh pr merge <number> --merge`.

## 4. Tag and publish

From `main`, after the merge:

```sh
gh release create vX.Y.Z --target main --title "vX.Y.Z" \
  --notes "<paste the CHANGELOG section for this version>"
```

This creates the tag and triggers `publish.yml`:

- runs the test suite
- `npm publish --workspace server --provenance --access public` (needs `NPM_TOKEN` secret)
- builds the extension and uploads `playback-mcp-extension-vX.Y.Z.zip` to the release

Confirm with the user before this step — it's the point of no return (real npm publish).

## 5. Verify

- `npm view playback-mcp version` shows the new version.
- The release page has the extension zip attached.
- A clean `npm i -g playback-mcp` in an empty directory installs and runs.
