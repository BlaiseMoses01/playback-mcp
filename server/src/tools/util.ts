import type { Bridge } from '../bridge.js';
import * as db from '../db.js';

export function ok(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Wrap a tool handler so thrown errors become readable tool errors instead of protocol failures. */
export function handler<A>(fn: (args: A) => Promise<ReturnType<typeof ok>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e: any) {
      return err(String(e?.message ?? e));
    }
  };
}

/** Player state as reported by the content script. */
export interface PlayerState {
  videoId: string | null;
  url: string;
  title: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
  volume: number;
  loop: Record<string, unknown> | null;
  adShowing: boolean;
}

export async function getPlayerState(bridge: Bridge): Promise<PlayerState> {
  return (await bridge.send('get_state')) as PlayerState;
}

/**
 * Resolve the library row for the video currently open in the managed tab,
 * auto-registering it under its page title if it isn't saved yet.
 */
export async function currentVideoRow(
  bridge: Bridge,
): Promise<{ row: db.VideoRow; state: PlayerState }> {
  const state = await getPlayerState(bridge);
  if (!state.videoId)
    throw new Error('No YouTube video is open in the managed tab — use open_video first.');
  let row = db.getVideoByYoutubeId(state.videoId);
  if (!row) {
    row = db.upsertVideo(
      state.videoId,
      `https://www.youtube.com/watch?v=${state.videoId}`,
      state.title || state.videoId,
    );
  }
  return { row, state };
}

/**
 * Resolve a `video` query param to a single library row; when omitted, use the
 * currently open video. Throws with candidates when the query is ambiguous.
 */
export async function resolveVideoParam(bridge: Bridge, video?: string): Promise<db.VideoRow> {
  if (!video || !video.trim()) return (await currentVideoRow(bridge)).row;
  const ytId = db.parseYoutubeId(video);
  if (ytId) {
    const row = db.getVideoByYoutubeId(ytId);
    if (row) return row;
    throw new Error(`Video ${ytId} is not in the library — save it first with save_video.`);
  }
  const matches = db.findVideos(video);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    const recent = db.findVideos();
    throw new Error(
      `No saved video matches "${video}". Recent videos: ${recent.map((v) => v.title).join(', ') || '(library is empty)'}`,
    );
  }
  throw new Error(
    `Multiple videos match "${video}": ${matches.map((v) => v.title).join(', ')} — be more specific.`,
  );
}
