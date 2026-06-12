import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from '../bridge.js';
import * as db from '../db.js';
import { parseTime, formatTime } from '../timeparse.js';
import { ok, handler, currentVideoRow, resolveVideoParam, getPlayerState } from './util.js';

export function registerLibraryTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'save_video',
    {
      description:
        'Save a YouTube video to the library under a memorable title. Accepts any YouTube URL form. ' +
        'Upserts: saving the same video again just updates its title.',
      inputSchema: {
        url: z.string().describe('YouTube URL (watch, youtu.be, shorts, embed) or bare 11-char video id'),
        title: z.string().describe('Memorable title/alias, e.g. "stairway backing track"'),
      },
    },
    handler(async ({ url, title }) => {
      const ytId = db.parseYoutubeId(url);
      if (!ytId) throw new Error(`"${url}" does not look like a YouTube URL or video id.`);
      const row = db.upsertVideo(ytId, url, title);
      return ok(`Saved "${row.title}" (${row.youtube_id}).`);
    }),
  );

  server.registerTool(
    'find_videos',
    {
      description:
        'Search the video library by title (case-insensitive substring). Omit query to list the 10 most recent videos.',
      inputSchema: { query: z.string().optional().describe('Title fragment, e.g. "stairway"') },
    },
    handler(async ({ query }) => {
      const rows = db.findVideos(query);
      if (rows.length === 0) return ok(query ? `No videos match "${query}".` : 'Library is empty — save one with save_video.');
      return ok(rows.map((v) => ({ title: v.title, youtube_id: v.youtube_id, last_played_at: v.last_played_at })));
    }),
  );

  server.registerTool(
    'open_video',
    {
      description:
        'Open a video in the managed YouTube tab (reuses the existing tab). Accepts a saved title (fuzzy matched) or a raw YouTube URL. ' +
        'If multiple library entries match, returns the candidates instead of guessing.',
      inputSchema: { query: z.string().describe('Saved title fragment or YouTube URL') },
    },
    handler(async ({ query }) => {
      let ytId = db.parseYoutubeId(query);
      let row = ytId ? db.getVideoByYoutubeId(ytId) : undefined;
      if (!ytId) {
        const matches = db.findVideos(query);
        if (matches.length === 0) {
          const recent = db.findVideos();
          return ok(
            `No saved video matches "${query}". Recent: ${recent.map((v) => v.title).join(', ') || '(library is empty)'}. ` +
              'Pass a URL to open an unsaved video.',
          );
        }
        if (matches.length > 1) {
          return ok(`Multiple matches — which one? ${matches.map((v) => `"${v.title}"`).join(', ')}`);
        }
        row = matches[0];
        ytId = row.youtube_id;
      }
      await bridge.send('load_video', { videoId: ytId });
      if (row) db.touchLastPlayed(row.id);
      return ok(`Opening "${row?.title ?? ytId}" in the YouTube tab.`);
    }),
  );

  server.registerTool(
    'save_timestamp',
    {
      description:
        'Save a named timestamp on a video. Omit `time` to capture the CURRENT playback position ("save this spot as ..."). ' +
        'Provide `end_time` to make it a loopable section. Defaults to the currently open video; saving the same label overwrites it.',
      inputSchema: {
        label: z.string().describe('Name, e.g. "intro solo start"'),
        time: z.string().optional().describe('Time like "0:15", "15", "1m30s" — omit to use the current playback position'),
        end_time: z.string().optional().describe('Optional end time — makes this a loopable section'),
        video: z.string().optional().describe('Saved video title — omit for the currently open video'),
      },
    },
    handler(async ({ label, time, end_time, video }) => {
      let seconds: number;
      let row: db.VideoRow;
      if (video) {
        row = await resolveVideoParam(bridge, video);
        if (time === undefined) throw new Error('`time` is required when targeting a video that is not currently open.');
        seconds = parseTime(time);
      } else {
        const cur = await currentVideoRow(bridge);
        row = cur.row;
        seconds = time === undefined ? cur.state.currentTime : parseTime(time);
      }
      const endSeconds = end_time === undefined ? undefined : parseTime(end_time);
      if (endSeconds !== undefined && endSeconds <= seconds) {
        throw new Error(`end_time (${formatTime(endSeconds)}) must be after time (${formatTime(seconds)})`);
      }
      const saved = db.upsertTimestamp(row.id, label, seconds, endSeconds);
      const range = saved.end_seconds != null ? ` → ${formatTime(saved.end_seconds)}` : '';
      return ok(`Saved "${saved.label}" at ${formatTime(saved.seconds)}${range} on "${row.title}".`);
    }),
  );

  server.registerTool(
    'list_timestamps',
    {
      description: 'List all saved timestamps/sections for a video. Defaults to the currently open video.',
      inputSchema: { video: z.string().optional().describe('Saved video title — omit for the currently open video') },
    },
    handler(async ({ video }) => {
      const row = await resolveVideoParam(bridge, video);
      const rows = db.listTimestamps(row.id);
      if (rows.length === 0) return ok(`No timestamps saved for "${row.title}" yet.`);
      return ok({
        video: row.title,
        timestamps: rows.map((t) => ({
          label: t.label,
          time: formatTime(t.seconds),
          end: t.end_seconds != null ? formatTime(t.end_seconds) : undefined,
        })),
      });
    }),
  );

  server.registerTool(
    'delete_timestamp',
    {
      description: 'Delete a saved timestamp by label. Defaults to the currently open video.',
      inputSchema: {
        label: z.string(),
        video: z.string().optional().describe('Saved video title — omit for the currently open video'),
      },
    },
    handler(async ({ label, video }) => {
      const row = await resolveVideoParam(bridge, video);
      if (!db.deleteTimestamp(row.id, label)) {
        const all = db.listTimestamps(row.id);
        throw new Error(
          `No unambiguous timestamp "${label}" on "${row.title}". Saved labels: ${all.map((t) => t.label).join(', ') || '(none)'}`,
        );
      }
      return ok(`Deleted "${label}" from "${row.title}".`);
    }),
  );

  server.registerTool(
    'get_state',
    {
      description:
        'Get the full current player state: video, position, speed, volume, pause, active loop, ad status. ' +
        'Works even when the extension is disconnected (reports that instead of failing).',
      inputSchema: {},
    },
    handler(async () => {
      if (!bridge.connected) {
        return ok({ extension: 'disconnected' });
      }
      const state = await getPlayerState(bridge);
      const saved = state.videoId ? db.getVideoByYoutubeId(state.videoId) : undefined;
      return ok({
        extension: 'connected',
        player: { ...state, currentTime: formatTime(state.currentTime), savedTitle: saved?.title },
        lastLoopEvent: bridge.loopStatus,
      });
    }),
  );
}
