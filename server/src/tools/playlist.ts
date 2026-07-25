import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatTime } from '../timeparse.js';
import { fetchPlaylist, parsePlaylistId } from '../playlist.js';
import { ok, handler } from './util.js';

const DEFAULT_LIMIT = 100;

export function registerPlaylistTools(server: McpServer): void {
  server.registerTool(
    'list_playlist',
    {
      description:
        'List the videos in a YouTube playlist without opening anything. Pair with get_transcript ' +
        'or get_chapters on each returned id to study a whole series — creators often spread one ' +
        'topic across many videos. Accepts a playlist URL, a watch URL containing list=, or a bare ' +
        'playlist id.',
      inputSchema: {
        playlist: z
          .string()
          .describe('Playlist URL or id, e.g. "https://www.youtube.com/playlist?list=PL..."'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`Max videos to return (default ${DEFAULT_LIMIT})`),
      },
    },
    handler(async ({ playlist, limit }) => {
      const id = parsePlaylistId(playlist);
      if (!id)
        throw new Error(
          `"${playlist}" does not look like a YouTube playlist URL or id. A playlist URL contains "list=".`,
        );
      const result = await fetchPlaylist(id, limit ?? DEFAULT_LIMIT);
      return ok({
        playlist: result.title,
        count: result.entries.length,
        ...(result.truncated
          ? {
              truncated: `Stopped at ${result.entries.length} videos — the playlist has more. Raise limit to see the rest.`,
            }
          : {}),
        videos: result.entries.map((e) => ({
          videoId: e.videoId,
          title: e.title,
          ...(e.duration === null ? {} : { duration: formatTime(e.duration) }),
        })),
      });
    }),
  );
}
