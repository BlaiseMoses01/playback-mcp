# Contributing

Thanks for your interest. `playback-mcp` is a local-first, two-part system: an MCP
server workspace (`server/`) and a Chrome extension workspace (`extension/`). It's a
pnpm **workspace monorepo** — install and run tooling from the repo root.

## Development setup

```sh
pnpm install      # install both workspaces; husky git hooks install via prepare
pnpm run build    # build server (tsc) and extension (esbuild)
```

The server requires Node ≥ 23.4 (Node 24 LTS recommended — it uses the built-in
`node:sqlite`).

## Trying your changes

```sh
pnpm run build
pnpm run smoke                    # full smoke test over real MCP stdio, no browser needed
node scripts/fake-extension.mjs   # mock extension that acks all commands, for manual poking
```

Load `extension/dist` unpacked in Chrome (`chrome://extensions` → Developer mode →
Load unpacked) and register the server with
`claude mcp add playback-mcp -- node /abs/path/server/dist/index.js`.

## Working on a change

Day-to-day work happens on `dev`; `main` is release-only. So:

1. Branch off `dev` (e.g. `feature/<short-desc>` or `fix/<short-desc>`).
2. Keep each PR focused on one logical change — smaller PRs review faster.
3. Open your PR against **`dev`**, not `main` (`main` only receives release PRs from `dev`).
4. Link any related issue in the description (e.g. `Fixes #123`).
5. **Assign the PR to @BlaiseMoses01.** Review is auto-requested from him via
   [CODEOWNERS](.github/CODEOWNERS), so you don't need to add a reviewer manually — but
   please still set him as the **assignee**.
6. Complete the PR template checklist honestly before marking it ready for review.

## Before opening a PR

Run the same gate CI enforces (all from the repo root):

```sh
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run build
pnpm test
```

`pnpm run format` auto-fixes formatting. A pre-commit hook (husky + lint-staged) runs
ESLint + Prettier on staged files automatically.

- Run `pnpm run smoke` if you changed the server's MCP protocol or tool surface.
- Update `README.md` / `CHANGELOG.md` if behavior or configuration changed.
- Never commit secrets or local state (e.g. the SQLite `library.db`).

PRs target `dev` (see [Working on a change](#working-on-a-change)). The
[PR template](.github/pull_request_template.md) covers the checklist.

## Releasing

Only `server/` is published to npm (as `playback-mcp`); the extension is built and
attached to the GitHub Release as a zip. `.github/workflows/publish.yml` does the
actual publishing — it triggers on a **published GitHub Release** and expects the
version to already be bumped and tagged on `main` beforehand.

`main` is where releases are tagged from, but day-to-day work happens on `dev` — get
the release ready there and merge it in.

1. On `dev`, make sure everything you want in the release is in and CI is green.
2. Bump the version everywhere it lives (semver; this project is pre-1.0, so
   backwards-compatible additions bump the minor version, e.g. `0.1.0` → `0.2.0`):
   `server/package.json` and `extension/manifest.json`. The `McpServer` version
   reported over MCP reads `pkg.version` from `server/package.json` at startup, so it
   tracks automatically, and `pnpm-lock.yaml` doesn't track the workspace version, so
   no lockfile refresh is needed. Grep for the old version string to confirm nothing
   was missed.
3. In `CHANGELOG.md`, rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD` (today's date),
   add a fresh empty `[Unreleased]` heading above it, and update the link references
   at the bottom of the file (`[Unreleased]` compares from the new tag; add a
   `[X.Y.Z]` link to the new release tag).
4. Commit the version and changelog files together, e.g. `release: playback-mcp vX.Y.Z`
   (see `9a1ca94` for the precedent), and push `dev`.
5. Open a PR from `dev` into `main` (see the `pr` skill) and merge it once it's green.
6. Cut the release from `main`, which also creates the tag:
   ```sh
   gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes "<paste the CHANGELOG section for this version>"
   ```
7. Publishing the release triggers `publish.yml`: it runs the test suite, then
   `pnpm --filter playback-mcp publish --provenance --access public` (needs the
   `NPM_TOKEN` repo secret), and separately builds the extension and uploads
   `playback-mcp-extension-vX.Y.Z.zip` to the release.
8. Verify: `npm view playback-mcp version` shows the new version, the release page
   has the extension zip attached, and a clean `npm i -g playback-mcp` in an empty
   directory installs and runs.
