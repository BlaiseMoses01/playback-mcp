# Contributing

Thanks for your interest. `yt-controller` is a local-first, two-part system: an MCP
server workspace (`server/`) and a Chrome extension workspace (`extension/`). It's an
npm **workspace monorepo** — install and run tooling from the repo root.

## Development setup

```sh
npm ci            # install both workspaces; husky git hooks install via prepare
npm run build     # build server (tsc) and extension (esbuild)
```

The server requires Node ≥ 23.4 (Node 24 LTS recommended — it uses the built-in
`node:sqlite`).

## Trying your changes

```sh
npm run build
npm run smoke                     # full smoke test over real MCP stdio, no browser needed
node scripts/fake-extension.mjs   # mock extension that acks all commands, for manual poking
```

Load `extension/dist` unpacked in Chrome (`chrome://extensions` → Developer mode →
Load unpacked) and register the server with
`claude mcp add yt-controller -- node /abs/path/server/dist/index.js`.

## Before opening a PR

Run the same gate CI enforces (all from the repo root):

```sh
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

`npm run format` auto-fixes formatting. A pre-commit hook (husky + lint-staged) runs
ESLint + Prettier on staged files automatically.

- Run `npm run smoke` if you changed the server's MCP protocol or tool surface.
- Update `README.md` / `CHANGELOG.md` if behavior or configuration changed.
- Never commit secrets or local state (e.g. the SQLite `library.db`).

PRs target `main`. The [PR template](.github/pull_request_template.md) covers the checklist.
