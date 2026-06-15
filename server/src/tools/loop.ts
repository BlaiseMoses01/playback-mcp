import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import * as db from '../db.js';
import { formatTime, parseRate } from '../timeparse.js';
import { ok, handler, currentVideoRow } from './util.js';
import { resolveTimeOrLabel } from './playback.js';

export function registerLoopTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'loop_section',
    {
      description:
        'Loop a section of the current video N times, optionally at a different speed each pass (e.g. speeds=[0.5,0.75,1.0]). ' +
        'Give either `label` (a saved section, or a "...start"/"...end" timestamp pair) or explicit `start`+`end`. ' +
        'Returns IMMEDIATELY while looping continues in the background — do NOT wait, sleep, or poll for completion; ' +
        'just tell the user the ETA. The user can interrupt anytime with stop_loop.',
      inputSchema: {
        label: z.string().optional().describe('Saved section/timestamp name, e.g. "intro solo"'),
        start: z
          .string()
          .optional()
          .describe('Start time or timestamp label (alternative to label)'),
        end: z.string().optional().describe('End time or timestamp label (alternative to label)'),
        times: z.number().int().min(1).max(50).default(1).describe('Number of passes'),
        speeds: z
          .array(z.union([z.string(), z.number()]))
          .optional()
          .describe(
            'Per-pass playback rates, e.g. [0.5, 0.75, 1.0]; the last rate repeats if shorter than `times`',
          ),
      },
    },
    handler(async ({ label, start, end, times, speeds }) => {
      let startSec: number;
      let endSec: number;
      let sectionName = label ?? '';

      if (label) {
        const { row } = await currentVideoRow(bridge);
        const matches = db.findTimestamps(row.id, label);
        const section = matches.find((m) => m.end_seconds != null);
        if (section) {
          startSec = section.seconds;
          endSec = section.end_seconds!;
          sectionName = section.label;
        } else {
          const s = matches.find((m) => /start/i.test(m.label));
          const e = matches.find((m) => /end/i.test(m.label));
          if (!s || !e) {
            const all = db.listTimestamps(row.id);
            throw new Error(
              `Cannot resolve section "${label}" on "${row.title}" — need either a section with an end time, or a ` +
                `"...start"/"...end" label pair. Saved labels: ${all.map((t) => t.label).join(', ') || '(none)'}`,
            );
          }
          startSec = s.seconds;
          endSec = e.seconds;
        }
      } else if (start !== undefined && end !== undefined) {
        startSec = await resolveTimeOrLabel(bridge, start);
        endSec = await resolveTimeOrLabel(bridge, end);
        sectionName = `${formatTime(startSec)}–${formatTime(endSec)}`;
      } else {
        throw new Error('Provide either `label`, or both `start` and `end`.');
      }

      if (endSec <= startSec)
        throw new Error(
          `Loop end (${formatTime(endSec)}) must be after start (${formatTime(startSec)}).`,
        );

      const rates = (speeds ?? []).map(parseRate);
      const rateFor = (pass: number) => rates[pass] ?? rates.at(-1) ?? 1;
      let etaSec = 0;
      for (let p = 0; p < times; p++) etaSec += (endSec - startSec) / rateFor(p);

      await bridge.send('loop', { start: startSec, end: endSec, times, rates });

      const speedDesc = rates.length > 0 ? ` at ${rates.join('/')}x` : '';
      return ok(
        `Looping ${sectionName} (${formatTime(startSec)} → ${formatTime(endSec)}), ${times} pass${times > 1 ? 'es' : ''}${speedDesc} — ` +
          `about ${formatTime(etaSec)} total. Playback continues in the background; do not wait or poll. ` +
          `Use stop_loop to interrupt or get_state to check progress.`,
      );
    }),
  );

  server.registerTool(
    'stop_loop',
    {
      description: 'Cancel the active loop (playback pauses and the pre-loop speed is restored).',
      inputSchema: {},
    },
    handler(async () => {
      const state = await bridge.send('loop_cancel');
      return ok(`Loop cancelled at ${formatTime(state.currentTime)}.`);
    }),
  );
}
