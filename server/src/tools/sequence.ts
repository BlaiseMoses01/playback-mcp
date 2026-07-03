import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import { formatTime } from '../timeparse.js';
import { ok, handler } from './util.js';
import { resolveTimeOrLabel } from './playback.js';

export function registerSequenceTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'play_sequence',
    {
      description:
        'Play a list of clips back-to-back, jumping over the gaps between them — e.g. a ' +
        '"power user tour" of just the moments that matter, skipping the talk in between. ' +
        'Each clip is a start/end time or saved timestamp label. Returns IMMEDIATELY while ' +
        'playback continues in the background — do NOT wait, sleep, or poll for completion; ' +
        'just tell the user the ETA. Use stop_sequence to interrupt anytime.',
      inputSchema: {
        clips: z
          .array(
            z.object({
              start: z.string().describe('Start time or saved timestamp label'),
              end: z.string().describe('End time or saved timestamp label'),
              label: z.string().optional().describe('Optional label shown in progress updates'),
            }),
          )
          .min(1)
          .describe('Clips to play in order'),
      },
    },
    handler(async ({ clips }) => {
      const resolved: { start: number; end: number; label?: string }[] = [];
      for (const c of clips) {
        const start = await resolveTimeOrLabel(bridge, c.start);
        const end = await resolveTimeOrLabel(bridge, c.end);
        if (end <= start)
          throw new Error(
            `Clip end (${formatTime(end)}) must be after start (${formatTime(start)}).`,
          );
        resolved.push({ start, end, label: c.label });
      }

      await bridge.send('sequence', { clips: resolved });

      const totalSec = resolved.reduce((sum, c) => sum + (c.end - c.start), 0);
      return ok(
        `Playing ${resolved.length} clip${resolved.length > 1 ? 's' : ''} back-to-back — about ` +
          `${formatTime(totalSec)} total. Playback continues in the background; do not wait or poll. ` +
          `Use stop_sequence to interrupt or get_state to check progress.`,
      );
    }),
  );

  server.registerTool(
    'stop_sequence',
    {
      description: 'Cancel the active clip sequence (playback pauses).',
      inputSchema: {},
    },
    handler(async () => {
      const state = await bridge.send('sequence_cancel');
      return ok(`Sequence cancelled at ${formatTime(state.currentTime)}.`);
    }),
  );
}
