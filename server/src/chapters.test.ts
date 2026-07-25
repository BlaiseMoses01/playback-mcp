import { describe, it, expect } from 'vitest';
import {
  parseChapters,
  parseDescriptionChapters,
  extractDescription,
  extractTitle,
  parseQuizMoments,
} from './chapters.js';

const chapter = (ms: number, title: unknown) => ({
  chapterRenderer: { timeRangeStartMillis: ms, title },
});

const nextWith = (markersMap: unknown) => ({
  playerOverlays: {
    playerOverlayRenderer: {
      decoratedPlayerBarRenderer: {
        decoratedPlayerBarRenderer: {
          playerBar: { multiMarkersPlayerBarRenderer: { markersMap } },
        },
      },
    },
  },
});

describe('parseChapters', () => {
  it('reads the DESCRIPTION_CHAPTERS track and converts millis to seconds', () => {
    const json = nextWith([
      { key: 'QUIZ_MARKERS', value: {} },
      {
        key: 'DESCRIPTION_CHAPTERS',
        value: {
          chapters: [
            chapter(0, { simpleText: 'Introduction' }),
            chapter(30000, { simpleText: 'What You Can Do' }),
            chapter(75000, { simpleText: 'First Program' }),
          ],
        },
      },
    ]);
    expect(parseChapters(json)).toEqual([
      { title: 'Introduction', start: 0 },
      { title: 'What You Can Do', start: 30 },
      { title: 'First Program', start: 75 },
    ]);
  });

  it('reads titles given as runs instead of simpleText', () => {
    const json = nextWith([
      {
        key: 'DESCRIPTION_CHAPTERS',
        value: { chapters: [chapter(0, { runs: [{ text: 'Intro' }, { text: ' & setup' }] })] },
      },
    ]);
    expect(parseChapters(json)).toEqual([{ title: 'Intro & setup', start: 0 }]);
  });

  it('falls back to another marker track when DESCRIPTION_CHAPTERS is absent', () => {
    const json = nextWith([
      { key: 'QUIZ_MARKERS', value: { chapters: [] } },
      { key: 'AUTO_CHAPTERS', value: { chapters: [chapter(12000, { simpleText: 'Auto' })] } },
    ]);
    expect(parseChapters(json)).toEqual([{ title: 'Auto', start: 12 }]);
  });

  it('orders chapters by start time and drops malformed entries', () => {
    const json = nextWith([
      {
        key: 'DESCRIPTION_CHAPTERS',
        value: {
          chapters: [
            chapter(60000, { simpleText: 'Second' }),
            chapter(0, { simpleText: 'First' }),
            chapter(90000, { simpleText: '   ' }), // blank title
            { chapterRenderer: { title: { simpleText: 'No timestamp' } } },
          ],
        },
      },
    ]);
    expect(parseChapters(json)).toEqual([
      { title: 'First', start: 0 },
      { title: 'Second', start: 60 },
    ]);
  });

  it('returns an empty list rather than throwing when there are no chapters', () => {
    expect(parseChapters(nextWith([]))).toEqual([]);
    expect(parseChapters(nextWith([{ key: 'QUIZ_MARKERS', value: { chapters: [] } }]))).toEqual([]);
    expect(parseChapters({})).toEqual([]);
    expect(parseChapters(null)).toEqual([]);
  });
});

describe('parseDescriptionChapters', () => {
  it('reads timestamped lines, tolerating separators after the time', () => {
    const desc = [
      'Some intro blurb',
      '0:00 Introduction',
      '1:30 - Getting started',
      '10:05 — Deep dive',
      '1:02:03 | Wrap up',
      'follow me at example.com',
    ].join('\n');
    expect(parseDescriptionChapters(desc)).toEqual([
      { title: 'Introduction', start: 0 },
      { title: 'Getting started', start: 90 },
      { title: 'Deep dive', start: 605 },
      { title: 'Wrap up', start: 3723 },
    ]);
  });

  it('rejects a list that does not start at 0:00', () => {
    const desc = ['1:30 Getting started', '4:00 Middle', '9:00 End'].join('\n');
    expect(parseDescriptionChapters(desc)).toEqual([]);
  });

  it('rejects fewer than three timestamps, which are usually incidental mentions', () => {
    const desc = ['0:00 Start', '2:00 A passing reference'].join('\n');
    expect(parseDescriptionChapters(desc)).toEqual([]);
  });

  it('returns empty for a description with no timestamps', () => {
    expect(parseDescriptionChapters('Subscribe for more!\nLinks below.')).toEqual([]);
    expect(parseDescriptionChapters('')).toEqual([]);
  });
});

describe('extractDescription', () => {
  const wrap = (secondary: unknown) => ({
    contents: {
      twoColumnWatchNextResults: {
        results: { results: { contents: [{ somethingElse: {} }, secondary] } },
      },
    },
  });

  it('reads the attributed description', () => {
    const json = wrap({
      videoSecondaryInfoRenderer: { attributedDescription: { content: 'hello' } },
    });
    expect(extractDescription(json)).toBe('hello');
  });

  it('falls back to a legacy runs-shaped description', () => {
    const json = wrap({
      videoSecondaryInfoRenderer: { description: { runs: [{ text: 'a' }, { text: 'b' }] } },
    });
    expect(extractDescription(json)).toBe('ab');
  });

  it('returns an empty string when the shape is unrecognized', () => {
    expect(extractDescription({})).toBe('');
  });
});

describe('parseQuizMoments', () => {
  const quizWith = (markers: unknown[]) => nextWith([{ key: 'QUIZ_MARKERS', value: { markers } }]);
  const marker = (ms: number) => ({ markerRenderer: { timeRangeStartMillis: ms, title: {} } });

  it('returns marker positions in seconds, in order', () => {
    expect(parseQuizMoments(quizWith([marker(45360), marker(9010)]))).toEqual([9.01, 45.36]);
  });

  it('collapses markers that land on the same second', () => {
    expect(parseQuizMoments(quizWith([marker(312100), marker(312500), marker(312900)]))).toEqual([
      312.1,
    ]);
  });

  it('returns empty when the video has no quiz markers', () => {
    expect(parseQuizMoments(quizWith([]))).toEqual([]);
    expect(
      parseQuizMoments(nextWith([{ key: 'DESCRIPTION_CHAPTERS', value: { chapters: [] } }])),
    ).toEqual([]);
    expect(parseQuizMoments({})).toEqual([]);
  });
});

describe('extractTitle', () => {
  it('reads the runs-shaped primary title', () => {
    const json = {
      contents: {
        twoColumnWatchNextResults: {
          results: {
            results: {
              contents: [
                { videoPrimaryInfoRenderer: { title: { runs: [{ text: 'Me at the zoo' }] } } },
              ],
            },
          },
        },
      },
    };
    expect(extractTitle(json)).toBe('Me at the zoo');
  });

  it('returns an empty string when the shape is unrecognized', () => {
    expect(extractTitle({})).toBe('');
  });
});
