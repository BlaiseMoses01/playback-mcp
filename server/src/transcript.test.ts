import { describe, it, expect } from 'vitest';
import {
  parseTranscript,
  formatTranscript,
  searchTranscript,
  buildOutline,
  MAX_TRANSCRIPT_CHARS,
} from './transcript.js';

const json3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'welcome ' }, { utf8: 'back' }] },
    { tStartMs: 1000 }, // timing-only event, no segs — dropped
    { tStartMs: 2000, dDurationMs: 1500, segs: [{ utf8: '\n' }] }, // whitespace-only — dropped
    { tStartMs: 3500, dDurationMs: 2500, segs: [{ utf8: "today we'll cover  modes" }] },
  ],
};

describe('parseTranscript', () => {
  it('parses timedtext json3 events, joining segs and dropping empties', () => {
    expect(parseTranscript(json3)).toEqual([
      { start: 0, dur: 2, text: 'welcome back' },
      { start: 3.5, dur: 2.5, text: "today we'll cover modes" },
    ]);
  });

  it('rejects unrecognized payloads', () => {
    expect(() => parseTranscript({ nope: true })).toThrow(/Unrecognized/);
    expect(() => parseTranscript('text')).toThrow(/Unrecognized/);
  });
});

describe('formatTranscript', () => {
  const segments = parseTranscript(json3);

  it('renders [m:ss] lines', () => {
    expect(formatTranscript(segments)).toBe("[0:00] welcome back\n[0:04] today we'll cover modes");
  });

  it('windows to a [start, end) range', () => {
    expect(formatTranscript(segments, { start: 1, end: 10 })).toBe(
      "[0:04] today we'll cover modes",
    );
    expect(formatTranscript(segments, { start: 100 })).toMatch(/No transcript segments/);
  });

  it('truncates long transcripts on a segment boundary with a notice', () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({
      start: i * 5,
      dur: 5,
      text: `segment number ${i} with some filler words`,
    }));
    const out = formatTranscript(long);
    expect(out.length).toBeLessThan(MAX_TRANSCRIPT_CHARS + 200);
    expect(out).toMatch(/transcript truncated at .* more segments/);
    expect(out).toMatch(/search_transcript/);
  });
});

describe('searchTranscript', () => {
  const segments = [
    { start: 0, dur: 5, text: 'welcome back everyone' },
    { start: 5, dur: 5, text: 'today we cover the dorian mode' },
    { start: 10, dur: 5, text: 'it starts on the second degree' },
  ];

  it('finds case-insensitive matches with neighbor context', () => {
    const hits = searchTranscript(segments, 'DORIAN');
    expect(hits).toHaveLength(1);
    expect(hits[0].start).toBe(5);
    expect(hits[0].context).toBe(
      'welcome back everyone today we cover the dorian mode it starts on the second degree',
    );
  });

  it('returns nothing for misses and blank queries', () => {
    expect(searchTranscript(segments, 'phrygian')).toEqual([]);
    expect(searchTranscript(segments, '  ')).toEqual([]);
  });

  it('caps the number of matches', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      start: i,
      dur: 1,
      text: `repeated word ${i}`,
    }));
    expect(searchTranscript(many, 'repeated', 20)).toHaveLength(20);
  });
});

describe('buildOutline', () => {
  const segs = [
    { start: 0, dur: 5, text: 'intro words here' },
    { start: 10, dur: 5, text: 'still the intro' },
    { start: 30, dur: 5, text: 'second section begins' },
    { start: 90, dur: 5, text: 'third and final section' },
  ];

  it('pairs each chapter with the segments inside it and bounds each section', () => {
    const outline = buildOutline(
      [
        { title: 'Intro', start: 0 },
        { title: 'Middle', start: 30 },
        { title: 'End', start: 60 },
      ],
      segs,
    );
    expect(outline).toEqual([
      {
        title: 'Intro',
        start: 0,
        end: 30,
        preview: 'intro words here still the intro',
        wordCount: 6,
      },
      { title: 'Middle', start: 30, end: 60, preview: 'second section begins', wordCount: 3 },
      { title: 'End', start: 60, end: null, preview: 'third and final section', wordCount: 4 },
    ]);
  });

  it('truncates a long preview but still counts every word', () => {
    const long = [{ start: 0, dur: 1, text: 'word '.repeat(200).trim() }];
    const [section] = buildOutline([{ title: 'A', start: 0 }], long, 20);
    expect(section.preview.endsWith('…')).toBe(true);
    expect(section.preview.length).toBeLessThanOrEqual(21);
    expect(section.wordCount).toBe(200);
  });

  it('sorts chapters by start so section bounds are never inverted', () => {
    const outline = buildOutline(
      [
        { title: 'Later', start: 30 },
        { title: 'Earlier', start: 0 },
      ],
      segs,
    );
    expect(outline.map((s) => [s.title, s.start, s.end])).toEqual([
      ['Earlier', 0, 30],
      ['Later', 30, null],
    ]);
  });

  it('gives an empty preview for a chapter with no transcript under it', () => {
    const [section] = buildOutline([{ title: 'Silent', start: 500 }], segs);
    expect(section).toEqual({
      title: 'Silent',
      start: 500,
      end: null,
      preview: '',
      wordCount: 0,
    });
  });

  it('returns nothing when there are no chapters', () => {
    expect(buildOutline([], segs)).toEqual([]);
  });
});
