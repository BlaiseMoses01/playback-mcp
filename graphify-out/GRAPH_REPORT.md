# Graph Report - . (2026-06-22)

## Corpus Check

- 29 files · ~13,011 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 244 nodes · 312 edges · 21 communities (20 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `4e848e80`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- [[_COMMUNITY_Extension Manifest|Extension Manifest]]
- [[_COMMUNITY_Extension Package Config|Extension Package Config]]
- [[_COMMUNITY_Background Service Worker|Background Service Worker]]
- [[_COMMUNITY_Content Script|Content Script]]
- [[_COMMUNITY_Extension TypeScript Config|Extension TypeScript Config]]
- [[_COMMUNITY_Root Workspace Config|Root Workspace Config]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_Test Helpers|Test Helpers]]
- [[_COMMUNITY_Development Scripts|Development Scripts]]
- [[_COMMUNITY_Server Build Config|Server Build Config]]
- [[_COMMUNITY_MCP Tool Handlers|MCP Tool Handlers]]
- [[_COMMUNITY_Video Database|Video Database]]
- [[_COMMUNITY_Server TypeScript Config|Server TypeScript Config]]
- [[_COMMUNITY_Contribution Guidelines|Contribution Guidelines]]
- [[_COMMUNITY_Project Setup Docs|Project Setup Docs]]
- [[_COMMUNITY_Changelog|Changelog]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_Security Policy|Security Policy]]

## God Nodes (most connected - your core abstractions)

1. `scripts` - 10 edges
2. `Bridge` - 10 edges
3. `compilerOptions` - 10 edges
4. `Playback MCP` - 9 edges
5. `compilerOptions` - 8 edges
6. `state()` - 7 edges
7. `startLoop()` - 7 edges
8. `handler()` - 7 edges
9. `currentVideoRow()` - 7 edges
10. `getVideo()` - 6 edges

## Surprising Connections (you probably didn't know these)

- `parseTime()` --calls--> `resolveTimeOrLabel()` [EXTRACTED]
  server/src/timeparse.ts → server/src/tools/playback.ts
- `registerLibraryTools()` --calls--> `handler()` [EXTRACTED]
  server/src/tools/library.ts → server/src/tools/util.ts
- `registerLoopTools()` --calls--> `handler()` [EXTRACTED]
  server/src/tools/loop.ts → server/src/tools/util.ts
- `resolveTimeOrLabel()` --calls--> `currentVideoRow()` [EXTRACTED]
  server/src/tools/playback.ts → server/src/tools/util.ts
- `registerPlaybackTools()` --calls--> `handler()` [EXTRACTED]
  server/src/tools/playback.ts → server/src/tools/util.ts

## Import Cycles

- None detected.

## Communities (21 total, 1 thin omitted)

### Community 3 - "Extension Manifest"

Cohesion: 0.10
Nodes (19): manifest_version, name, version, description, icons, 16, 48, 128 (+11 more)

### Community 9 - "Extension Package Config"

Cohesion: 0.20
Nodes (9): name, private, type, scripts, build, devDependencies, @types/chrome, esbuild (+1 more)

### Community 12 - "Background Service Worker"

Cohesion: 0.44
Nodes (8): wsSend(), connect(), scheduleReconnect(), handleMessage(), execute(), setManaged(), getManagedTab(), loadVideo()

### Community 5 - "Content Script"

Cohesion: 0.40
Nodes (13): LoopState, getVideo(), adShowing(), getVideoId(), cleanTitle(), emit(), state(), rateFor() (+5 more)

### Community 10 - "Extension TypeScript Config"

Cohesion: 0.20
Nodes (9): compilerOptions, target, module, moduleResolution, strict, noEmit, skipLibCheck, types (+1 more)

### Community 2 - "Root Workspace Config"

Cohesion: 0.08
Nodes (24): name, private, license, author, repository, type, url, homepage (+16 more)

### Community 8 - "Dev Dependencies"

Cohesion: 0.18
Nodes (11): devDependencies, @eslint/js, eslint, eslint-config-prettier, globals, husky, lint-staged, prettier (+3 more)

### Community 14 - "Development Scripts"

Cohesion: 0.33
Nodes (5): root, server, pending, rpc(), call()

### Community 1 - "Server Build Config"

Cohesion: 0.07
Nodes (29): name, version, description, license, author, repository, type, url (+21 more)

### Community 0 - "MCP Tool Handlers"

Cohesion: 0.15
Nodes (20): log(), BridgeOfflineError, Pending, Bridge, server, bridge, parseTime(), formatTime() (+12 more)

### Community 4 - "Video Database"

Cohesion: 0.14
Nodes (8): dataDir, db, VideoRow, TimestampRow, normalizeYoutubeId(), parseYoutubeId(), findTimestamps(), deleteTimestamp()

### Community 6 - "Server TypeScript Config"

Cohesion: 0.15
Nodes (12): compilerOptions, target, module, moduleResolution, outDir, rootDir, strict, skipLibCheck (+4 more)

### Community 7 - "Contribution Guidelines"

Cohesion: 0.18
Nodes (9): Summary, Changes, Type of change, Testing, Checklist, Contributing, Development setup, Trying your changes (+1 more)

### Community 13 - "Project Setup Docs"

Cohesion: 0.25
Nodes (4): What this is, Commands, Architecture, Gotchas

### Community 15 - "Changelog"

Cohesion: 0.40
Nodes (4): Changelog, [Unreleased], [0.1.0] - 2026-06-20, Added

### Community 11 - "Project Documentation"

Cohesion: 0.20
Nodes (9): Playback MCP, Install, Build from source, Tools, Configuration, Troubleshooting, Development, Example Use Cases (+1 more)

### Community 16 - "Security Policy"

Cohesion: 0.40
Nodes (4): Security Policy, Supported versions, Reporting a vulnerability, Scope notes

## Knowledge Gaps

- **134 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `16` (+129 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Dev Dependencies` to `Root Workspace Config`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Extension Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Root Workspace Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Server Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `MCP Tool Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.14795008912655971 - nodes in this community are weakly interconnected._
- **Should `Video Database` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._
