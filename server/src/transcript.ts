import { formatTime } from './timeparse.js';

/** One caption cue, normalized from a timedtext json3 payload. */
export interface Segment {
  start: number;
  dur: number;
  text: string;
}

/** Formatted-transcript size cap — keeps a 2h lecture from flooding the agent's context. */
export const MAX_TRANSCRIPT_CHARS = 12_000;

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Normalize a raw timedtext json3 payload (`{events: [...]}`) into segments. */
export function parseTranscript(raw: unknown): Segment[] {
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).events)) {
    return ((raw as any).events as any[])
      .filter((e) => Array.isArray(e?.segs))
      .map((e) => ({
        start: Number(e.tStartMs ?? 0) / 1000,
        dur: Number(e.dDurationMs ?? 0) / 1000,
        text: cleanText(e.segs.map((s: any) => String(s?.utf8 ?? '')).join('')),
      }))
      .filter((s) => s.text.length > 0);
  }
  throw new Error('Unrecognized transcript payload.');
}

/**
 * Render segments as "[m:ss] text" lines, optionally windowed to [start, end) seconds.
 * Output is capped at MAX_TRANSCRIPT_CHARS (cut on a segment boundary, with a notice).
 */
export function formatTranscript(
  segments: Segment[],
  opts: { start?: number; end?: number } = {},
): string {
  const from = opts.start ?? 0;
  const to = opts.end ?? Infinity;
  const windowed = segments.filter((s) => s.start >= from && s.start < to);
  if (windowed.length === 0) {
    return opts.start !== undefined || opts.end !== undefined
      ? `No transcript segments between ${formatTime(from)} and ${to === Infinity ? 'the end' : formatTime(to)}.`
      : 'Transcript is empty.';
  }
  const lines = windowed.map((s) => `[${formatTime(s.start)}] ${s.text}`);
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : lines[i];
    if (next.length > MAX_TRANSCRIPT_CHARS) {
      const lastShown = windowed[i - 1];
      return (
        out +
        `\n[transcript truncated at ${formatTime(lastShown.start)} — ${lines.length - i} more segments; ` +
        'request a start/end range or use search_transcript]'
      );
    }
    out = next;
  }
  return out;
}

export interface OutlineSection {
  title: string;
  start: number;
  /** Where the section ends — the next chapter's start, or null for the last one. */
  end: number | null;
  /** Enough of the section's words to tell what it covers, without shipping the whole video. */
  preview: string;
  /** Words in the section, so a caller can tell a dense chapter from a throwaway one. */
  wordCount: number;
}

/**
 * Pair each chapter with the transcript that falls inside it. Previews are capped because the
 * point is an at-a-glance map of a long video — pull a section's full text with
 * formatTranscript once you know which one you want.
 */
export function buildOutline(
  chapters: { title: string; start: number }[],
  segments: Segment[],
  previewChars = 280,
): OutlineSection[] {
  const ordered = [...chapters].sort((a, b) => a.start - b.start);
  return ordered.map((c, i) => {
    const end = i + 1 < ordered.length ? ordered[i + 1].start : null;
    const words = segments
      .filter((s) => s.start >= c.start && (end === null || s.start < end))
      .map((s) => s.text)
      .join(' ')
      .trim();
    const preview =
      words.length > previewChars ? `${words.slice(0, previewChars).trimEnd()}…` : words;
    return {
      title: c.title,
      start: c.start,
      end,
      preview,
      wordCount: words ? words.split(/\s+/).length : 0,
    };
  });
}

export interface TranscriptMatch {
  start: number;
  text: string;
  /** The matching segment with one neighbor of context on each side. */
  context: string;
}

/** Case-insensitive substring search over segments, with ±1 segment of context per hit. */
export function searchTranscript(
  segments: Segment[],
  query: string,
  maxMatches = 20,
): TranscriptMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: TranscriptMatch[] = [];
  for (let i = 0; i < segments.length && matches.length < maxMatches; i++) {
    if (!segments[i].text.toLowerCase().includes(q)) continue;
    const context = segments
      .slice(Math.max(0, i - 1), i + 2)
      .map((s) => s.text)
      .join(' ');
    matches.push({ start: segments[i].start, text: segments[i].text, context });
  }
  return matches;
}
