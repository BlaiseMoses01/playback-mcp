import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import * as db from '../db.js';
import { parseTime, parseRate, parseVolume, formatTime } from '../timeparse.js';
import { ok, handler, currentVideoRow } from './util.js';

/** Resolve "1:30" as a time, or fall back to a saved timestamp label on the current video. */
export async function resolveTimeOrLabel(bridge: Bridge, input: string): Promise<number> {
  try {
    return parseTime(input);
  } catch {
    // not a time — try label lookup below
  }
  const { row } = await currentVideoRow(bridge);
  const matches = db.findTimestamps(row.id, input);
  if (matches.length === 1) return matches[0].seconds;
  const all = db.listTimestamps(row.id);
  if (matches.length === 0) {
    throw new Error(
      `"${input}" is neither a time nor a saved timestamp on "${row.title}". Saved labels: ${all.map((t) => t.label).join(', ') || '(none)'}`,
    );
  }
  throw new Error(
    `"${input}" is ambiguous: ${matches.map((t) => t.label).join(', ')} — be more specific.`,
  );
}

export function registerPlaybackTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'play',
    {
      description:
        'Resume playback, optionally from a position. `from` accepts a time ("1:30", "90", "1m30s") or a saved timestamp label ("intro solo start").',
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe('Time or saved timestamp label — omit to resume in place'),
      },
    },
    handler(async ({ from }) => {
      if (from !== undefined) {
        const seconds = await resolveTimeOrLabel(bridge, from);
        await bridge.send('seek', { seconds });
      }
      const state = await bridge.send('play');
      return ok(`Playing from ${formatTime(state.currentTime)} at ${state.rate}x.`);
    }),
  );

  server.registerTool(
    'pause',
    { description: 'Pause video playback.', inputSchema: {} },
    handler(async () => {
      const state = await bridge.send('pause');
      return ok(`Paused at ${formatTime(state.currentTime)}.`);
    }),
  );

  server.registerTool(
    'seek',
    {
      description:
        'Jump to a position without changing play/pause state. Accepts a time or a saved timestamp label.',
      inputSchema: {
        to: z.string().describe('Time ("1:30", "90", "1m30s") or saved timestamp label'),
      },
    },
    handler(async ({ to }) => {
      const seconds = await resolveTimeOrLabel(bridge, to);
      const state = await bridge.send('seek', { seconds });
      return ok(
        `Now at ${formatTime(state.currentTime)} (${state.paused ? 'paused' : 'playing'}).`,
      );
    }),
  );

  server.registerTool(
    'set_speed',
    {
      description:
        'Set playback speed. Accepts 0.25–2.0, with or without an "x" suffix (e.g. "0.75x").',
      inputSchema: { rate: z.union([z.string(), z.number()]).describe('Playback rate, 0.25–2.0') },
    },
    handler(async ({ rate }) => {
      const parsed = parseRate(rate);
      const state = await bridge.send('set_rate', { rate: parsed });
      return ok(`Playback speed is now ${state.rate}x.`);
    }),
  );

  server.registerTool(
    'set_volume',
    {
      description:
        'Set the video volume (the player element only, not system volume). Absolute 0–100, or relative "+10"/"-10".',
      inputSchema: {
        level: z
          .union([z.string(), z.number()])
          .describe('0–100, or "+10"/"-10" for relative change'),
      },
    },
    handler(async ({ level }) => {
      const parsed = parseVolume(level);
      const state = await bridge.send('set_volume', parsed);
      return ok(`Volume is now ${Math.round(state.volume * 100)}%.`);
    }),
  );
}
