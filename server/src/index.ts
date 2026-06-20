#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Bridge } from './bridge.js';
import { registerLibraryTools } from './tools/library.js';
import { registerPlaybackTools } from './tools/playback.js';
import { registerLoopTools } from './tools/loop.js';

// IMPORTANT: stdout belongs to the MCP stdio transport — all logging goes to stderr.

const server = new McpServer({ name: 'playback-mcp', version: '0.1.0' });
const bridge = new Bridge();
bridge.start(Number(process.env.YT_BRIDGE_PORT ?? 8765));

registerLibraryTools(server, bridge);
registerPlaybackTools(server, bridge);
registerLoopTools(server, bridge);

await server.connect(new StdioServerTransport());
console.error('[playback-mcp] MCP server ready (stdio)');
