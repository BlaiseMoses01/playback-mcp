// Enumerates a playlist's videos straight from YouTube, so an agent can read a whole series
// without opening a tab. Uses the same unauthenticated innertube ANDROID client as captions.ts;
// the WEB client returns an empty shell for playlists and lazy-loads its rows.
//
// Paging is the legacy `nextContinuationData` style: the first page carries 20 entries and each
// continuation another 60.

export interface PlaylistEntry {
  videoId: string;
  title: string;
  /** Runtime in seconds; null for entries YouTube reports without a duration (e.g. private). */
  duration: number | null;
}

export interface Playlist {
  title: string;
  entries: PlaylistEntry[];
  /** Videos YouTube says the playlist holds; null when the header doesn't report it. */
  total: number | null;
  /** True when a `limit` cut the list short — callers must say so rather than imply completeness. */
  truncated: boolean;
}

// PL = user playlist, UU = a channel's uploads, OL/RD/FL/LL = auto-generated mixes and favorites.
const PLAYLIST_ID_RE = /^(PL|UU|OL|RD|FL|LL)[A-Za-z0-9_-]{10,}$/;

/**
 * Extract a playlist id from a playlist URL, a watch URL's `list=` param, or a bare id.
 * Kept separate from parseYoutubeId, which deliberately ignores `list=` so that opening a
 * video from a playlist URL still opens just that one video.
 */
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (PLAYLIST_ID_RE.test(s)) return s;
  try {
    const u = new URL(s);
    if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname)) return null;
    const list = u.searchParams.get('list')?.trim();
    return list && PLAYLIST_ID_RE.test(list) ? list : null;
  } catch {
    return null;
  }
}

const ANDROID_CLIENT = {
  clientName: 'ANDROID',
  clientVersion: '20.10.38',
  androidSdkVersion: 30,
  hl: 'en',
  gl: 'US',
};
const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip';
const FETCH_TIMEOUT_MS = 15_000;
/** Backstop so a malformed continuation chain can't loop forever. */
const MAX_PAGES = 40;

function* deepFind(node: any, key: string): Generator<any> {
  if (Array.isArray(node)) {
    for (const v of node) yield* deepFind(v, key);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) yield v;
      yield* deepFind(v, key);
    }
  }
}

function nodeText(node: any): string {
  if (typeof node?.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node?.runs)) return node.runs.map((r: any) => r?.text ?? '').join('');
  return '';
}

/** Playlist name from a browse payload; '' when the shape is unrecognized. */
export function parsePlaylistTitle(json: unknown): string {
  const header = (json as any)?.header?.pageHeaderRenderer?.pageTitle;
  return typeof header === 'string' ? header : '';
}

const COUNT_RE = /^([\d,.]+)\s+videos?$/i;

/**
 * How many videos the playlist header claims, so a caller can decide whether reading all of
 * them is reasonable *before* paging through them. Found by scanning the header's metadata
 * strings rather than by path: it sits about a dozen levels deep in a viewModel tree and is
 * missing entirely on some playlists, so null is a normal answer.
 */
export function parsePlaylistTotal(json: unknown): number | null {
  for (const text of deepFind((json as any)?.header, 'content')) {
    if (typeof text !== 'string') continue;
    const m = COUNT_RE.exec(text.trim());
    if (!m) continue;
    const n = Number(m[1].replace(/[,.]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * One page of playlist rows plus the token for the next page. Pure — the renderers are found
 * by key rather than by a fixed path, so a layout reshuffle doesn't break enumeration.
 */
export function parsePlaylistPage(json: unknown): {
  entries: PlaylistEntry[];
  continuation: string | null;
} {
  const entries: PlaylistEntry[] = [];
  for (const r of deepFind(json, 'playlistVideoRenderer')) {
    const videoId = r?.videoId;
    if (typeof videoId !== 'string' || !videoId) continue;
    const seconds = Number(r?.lengthSeconds);
    entries.push({
      videoId,
      title: nodeText(r?.title).trim() || videoId,
      duration: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    });
  }
  const token = [...deepFind(json, 'nextContinuationData')]
    .map((c) => c?.continuation)
    .find((t) => typeof t === 'string' && t);
  return { entries, continuation: token ?? null };
}

/**
 * Every video in a playlist, in order, up to `limit`. Duplicate ids across pages are dropped —
 * a continuation that repeats a page would otherwise inflate the list.
 */
export async function fetchPlaylist(playlistId: string, limit = 100): Promise<Playlist> {
  const entries: PlaylistEntry[] = [];
  const seen = new Set<string>();
  let title = '';
  let total: number | null = null;
  let continuation: string | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = continuation
      ? { context: { client: ANDROID_CLIENT }, continuation }
      : { context: { client: ANDROID_CLIENT }, browseId: `VL${playlistId}` };
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': ANDROID_UA },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`YouTube playlist request failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!title) title = parsePlaylistTitle(data);
    if (total === null) total = parsePlaylistTotal(data);

    const page1 = parsePlaylistPage(data);
    if (page === 0 && page1.entries.length === 0)
      throw new Error(
        `No videos found for playlist ${playlistId} — check the id, and note that private playlists aren't readable.`,
      );
    for (const e of page1.entries) {
      if (seen.has(e.videoId)) continue;
      if (entries.length >= limit) {
        truncated = true;
        break;
      }
      seen.add(e.videoId);
      entries.push(e);
    }
    continuation = page1.continuation;
    if (truncated || !continuation) break;
  }

  return { title: title || playlistId, entries, total, truncated };
}
