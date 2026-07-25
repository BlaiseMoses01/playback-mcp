// Fetches a video's chapter markers from YouTube. Unlike captions, chapters are NOT in the
// ANDROID /player response — that payload has no playerOverlays/markersMap at all. They live
// in the WEB /next response, which is unauthenticated and not POT-gated. That response also
// carries the description, so the description-timestamp fallback costs no extra round-trip.

import { parseTime } from './timeparse.js';

export interface Chapter {
  title: string;
  /** Chapter start in seconds — feed to seek/loop_section. */
  start: number;
}

const WEB_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20240401.00.00',
  hl: 'en',
  gl: 'US',
};
const FETCH_TIMEOUT_MS = 15_000;

/** Pull the text out of a YouTube text node, which is `simpleText` in some payloads and `runs` in others. */
function nodeText(node: any): string {
  if (typeof node?.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node?.runs)) return node.runs.map((r: any) => r?.text ?? '').join('');
  return '';
}

function findMarkersMap(nextJson: any): any[] {
  const bar =
    nextJson?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer
      ?.decoratedPlayerBarRenderer?.playerBar;
  const map = bar?.multiMarkersPlayerBarRenderer?.markersMap;
  return Array.isArray(map) ? map : [];
}

/**
 * Chapters from a WEB /next payload. Prefers the DESCRIPTION_CHAPTERS marker track, falling
 * back to any other track carrying chapters (auto-generated chapters use a different key).
 * Returns [] rather than throwing — most videos simply have no chapters.
 */
export function parseChapters(nextJson: unknown): Chapter[] {
  const map = findMarkersMap(nextJson);
  const withChapters = map.filter(
    (m: any) => Array.isArray(m?.value?.chapters) && m.value.chapters.length > 0,
  );
  const track = withChapters.find((m: any) => m.key === 'DESCRIPTION_CHAPTERS') ?? withChapters[0];
  if (!track) return [];
  return (track.value.chapters as any[])
    .map((c) => {
      const r = c?.chapterRenderer;
      const ms = r?.timeRangeStartMillis;
      if (typeof ms !== 'number') return null;
      const title = nodeText(r?.title).trim();
      return title ? { title, start: ms / 1000 } : null;
    })
    .filter((c): c is Chapter => c !== null)
    .sort((a, b) => a.start - b.start);
}

/**
 * Timestamps YouTube flagged as quiz moments. Only the positions are exposed — the marker's
 * `title` is an empty object and the question text isn't in this payload — so these say
 * *where* a comprehension check belongs, not what it asks.
 */
export function parseQuizMoments(nextJson: unknown): number[] {
  const track = findMarkersMap(nextJson).find((m: any) => m?.key === 'QUIZ_MARKERS');
  const markers = track?.value?.markers;
  if (!Array.isArray(markers)) return [];
  const seconds = markers
    .map((m: any) => m?.markerRenderer?.timeRangeStartMillis)
    .filter((ms: unknown): ms is number => typeof ms === 'number')
    .map((ms: number) => ms / 1000)
    .sort((a: number, b: number) => a - b);
  // YouTube repeats markers on the same moment; keep the first of any cluster inside a second
  // so the caller sees distinct places rather than the same one three times. Compared by
  // distance, not by rounding — rounding splits 312.1 from 312.5 despite them being 0.4s apart.
  const out: number[] = [];
  for (const s of seconds) {
    if (out.length === 0 || s - out[out.length - 1] >= 1) out.push(s);
  }
  return out;
}

function primaryContents(nextJson: any): any[] {
  const contents = nextJson?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
  return Array.isArray(contents) ? contents : [];
}

/** The video title, as carried by the same /next payload. Empty when the shape is unrecognized. */
export function extractTitle(nextJson: unknown): string {
  for (const c of primaryContents(nextJson)) {
    const title = nodeText(c?.videoPrimaryInfoRenderer?.title).trim();
    if (title) return title;
  }
  return '';
}

/** The video description, as carried by the same /next payload. */
export function extractDescription(nextJson: unknown): string {
  for (const c of primaryContents(nextJson)) {
    const secondary = c?.videoSecondaryInfoRenderer;
    if (!secondary) continue;
    const attributed = secondary.attributedDescription?.content;
    if (typeof attributed === 'string') return attributed;
    const legacy = nodeText(secondary.description);
    if (legacy) return legacy;
  }
  return '';
}

const DESC_LINE_RE = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—|:)\]]*\s+(.+?)\s*$/;

/**
 * Chapters from description timestamps, used when the marker track is absent. Applies
 * YouTube's own eligibility rules — the list must start at 0:00 and have at least three
 * entries — so that a description merely *mentioning* a couple of times isn't served as
 * an outline the video doesn't actually have.
 */
export function parseDescriptionChapters(description: string): Chapter[] {
  if (!description) return [];
  const found: Chapter[] = [];
  for (const line of description.split('\n')) {
    const m = DESC_LINE_RE.exec(line);
    if (!m) continue;
    const title = m[2].replace(/^[-–—|:]\s*/, '').trim();
    if (!title) continue;
    try {
      found.push({ title, start: parseTime(m[1]) });
    } catch {
      // not a usable timestamp — skip the line
    }
  }
  if (found.length < 3 || found[0].start !== 0) return [];
  return found;
}

export interface ChapterResult {
  /** Falls back to the videoId when /next doesn't carry a recognizable title. */
  title: string;
  chapters: Chapter[];
  /** Seconds at which YouTube placed quiz markers; positions only, no question text. */
  quizMoments: number[];
}

/**
 * A video's chapters, empty when it has none. One network round-trip: the marker track, the
 * description fallback, and the title all come out of the same /next response.
 */
export async function fetchChapters(videoId: string): Promise<ChapterResult> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context: { client: WEB_CLIENT }, videoId }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube chapter request failed: HTTP ${res.status}`);
  const data = await res.json();
  const fromMarkers = parseChapters(data);
  return {
    title: extractTitle(data) || videoId,
    chapters:
      fromMarkers.length > 0 ? fromMarkers : parseDescriptionChapters(extractDescription(data)),
    quizMoments: parseQuizMoments(data),
  };
}
