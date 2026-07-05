---
name: pr
description: Open a pull request from dev into main for this repo, following the repo's checklist and template. Use when asked to open/create a PR, or as part of the release flow.
disable-model-invocation: false
---

# Opening a PR (playback-mcp)

This repo works on `dev` day-to-day; `main` is the release branch. PRs go `dev` → `main`.

## 1. Run the local CI gate first

From the repo root, before opening the PR:

```sh
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
```

Run `npm run smoke` too if the change touched the server's MCP protocol or tool surface
(`server/src/tools/`, `bridge.ts`, `extension/src/content.ts`). Note in the PR body if it
wasn't run (e.g. port 8765 already held by a live session) and why.

Fix anything red before opening the PR — don't rely on CI to catch it first.

## 2. Draft the PR body from the template

Use `.github/pull_request_template.md`'s structure (Summary / Changes / Type of change /
Testing / Checklist). Write it to a scratch file, then pass with `--body-file` — heredocs
in `--body` mangle markdown checkboxes.

- **Summary**: why, in 1-3 sentences.
- **Changes**: bullet the actual diff, grouped by concern (features, docs, unrelated
  fixups if any snuck in from the branch).
- **Testing**: which of the gate commands above were run, and note anything skipped.
- **Checklist**: check off what's actually true — don't rubber-stamp.

## 3. Open it

```sh
gh pr create --repo BlaiseMoses01/playback-mcp --base main --head dev \
  --title "<type>: <short summary>" \
  --body-file /path/to/pr-body.md
```

## 4. Check CI, then merge

```sh
gh pr checks <number>
```

Wait for the required checks (quality, audit, CodeQL, Secret Scanning) to go green.
This repo merges with a real merge commit (see `git log --merges`, e.g. `e608bdf Merge
pull request #11 from ...`) — not squash, not rebase:

```sh
gh pr merge <number> --merge
```

Confirm with the user before merging — it's the point where `dev`'s changes actually
land on the release branch.
