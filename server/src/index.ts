#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bridge } from './bridge.js';
import { registerLibraryTools } from './tools/library.js';
import { registerPlaybackTools } from './tools/playback.js';
import { registerLoopTools } from './tools/loop.js';
import { registerSequenceTools } from './tools/sequence.js';
import { registerTranscriptTools } from './tools/transcript.js';

// IMPORTANT: stdout belongs to the MCP stdio transport — all logging goes to stderr.

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const args = process.argv.slice(2);

if (args.includes('-v') || args.includes('--version')) {
  console.log(pkg.version);
  process.exit(0);
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`playback-mcp v${pkg.version} — control YouTube playback from MCP clients.

This is an MCP server that speaks over stdio; a client (Claude Code, Codex, …)
spawns it — you don't normally run it by hand. Register it with your client:

  claude mcp add playback-mcp -- playback-mcp

or add to .mcp.json:  { "mcpServers": { "playback-mcp": { "command": "playback-mcp" } } }

Flags:
  --serve         Run the server even in an interactive terminal (debugging)
  -v, --version   Print the version
  -h, --help      Show this help

Environment:
  YT_BRIDGE_PORT         Browser-bridge WebSocket port (default 8765)
  PLAYBACK_MCP_DATA_DIR  Where the saved-video library (SQLite) lives

https://github.com/BlaiseMoses01/playback-mcp`);
  process.exit(0);
}

// A client spawns us with a piped stdin; a human at an interactive terminal gets a
// hint instead of a silent hang. `--serve`/`--run` forces server mode anyway.
if (process.stdin.isTTY && !args.includes('--serve') && !args.includes('--run')) {
  console.error(
    'playback-mcp is an MCP stdio server — register it with your client, or run `playback-mcp --help`.',
  );
  process.exit(0);
}

const server = new McpServer({ name: 'playback-mcp', version: pkg.version });
const bridge = new Bridge();
bridge.start(Number(process.env.YT_BRIDGE_PORT ?? 8765));

registerLibraryTools(server, bridge);
registerPlaybackTools(server, bridge);
registerLoopTools(server, bridge);
registerSequenceTools(server, bridge);
registerTranscriptTools(server, bridge);

await server.connect(new StdioServerTransport());
console.error('[playback-mcp] MCP server ready (stdio)');
