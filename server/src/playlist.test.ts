import { describe, it, expect } from 'vitest';
import {
  parsePlaylistPage,
  parsePlaylistTitle,
  parsePlaylistId,
  parsePlaylistTotal,
} from './playlist.js';

const row = (videoId: string, title: string, lengthSeconds?: string) => ({
  playlistVideoRenderer: {
    videoId,
    title: { runs: [{ text: title }] },
    ...(lengthSeconds === undefined ? {} : { lengthSeconds }),
  },
});

// Mirrors the ANDROID browse shape: rows nested deep, continuation in the legacy style.
const pageWith = (rows: unknown[], continuation?: string) => ({
  contents: {
    singleColumnBrowseResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    playlistVideoListRenderer: {
                      contents: rows,
                      ...(continuation
                        ? { continuations: [{ nextContinuationData: { continuation } }] }
                        : {}),
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  },
});

describe('parsePlaylistPage', () => {
  it('reads rows in order with numeric durations', () => {
    const json = pageWith([
      row('aaaaaaaaaaa', 'Chapter 1', '592'),
      row('bbbbbbbbbbb', 'Chapter 2', '743'),
    ]);
    expect(parsePlaylistPage(json).entries).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'Chapter 1', duration: 592 },
      { videoId: 'bbbbbbbbbbb', title: 'Chapter 2', duration: 743 },
    ]);
  });

  it('returns the continuation token when there are more pages', () => {
    expect(parsePlaylistPage(pageWith([row('a', 'x')], 'TOKEN123')).continuation).toBe('TOKEN123');
    expect(parsePlaylistPage(pageWith([row('a', 'x')])).continuation).toBeNull();
  });

  it('uses a null duration when the length is missing or unusable', () => {
    const json = pageWith([row('aaaaaaaaaaa', 'No length'), row('bbbbbbbbbbb', 'Bad', 'nonsense')]);
    expect(parsePlaylistPage(json).entries.map((e) => e.duration)).toEqual([null, null]);
  });

  it('falls back to the videoId when a row has no usable title', () => {
    const json = { playlistVideoRenderer: { videoId: 'ccccccccccc', title: {} } };
    expect(parsePlaylistPage(json).entries).toEqual([
      { videoId: 'ccccccccccc', title: 'ccccccccccc', duration: null },
    ]);
  });

  it('skips rows with no videoId and returns empty for an unrecognized payload', () => {
    expect(parsePlaylistPage(pageWith([{ playlistVideoRenderer: { title: {} } }])).entries).toEqual(
      [],
    );
    expect(parsePlaylistPage({}).entries).toEqual([]);
    expect(parsePlaylistPage(null).entries).toEqual([]);
  });
});

describe('parsePlaylistId', () => {
  it('accepts bare ids across playlist kinds', () => {
    expect(parsePlaylistId('PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab')).toBe(
      'PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab',
    );
    expect(parsePlaylistId('UUYO_jab_esuFRV4b17AJtAw')).toBe('UUYO_jab_esuFRV4b17AJtAw');
  });

  it('pulls list= out of a playlist or watch URL', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLabcdefghij123')).toBe(
      'PLabcdefghij123',
    );
    expect(
      parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghij123'),
    ).toBe('PLabcdefghij123');
  });

  it('rejects non-YouTube hosts, plain video URLs, and video ids', () => {
    expect(parsePlaylistId('https://evil.com/playlist?list=PLabcdefghij123')).toBeNull();
    expect(parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parsePlaylistId('dQw4w9WgXcQ')).toBeNull();
    expect(parsePlaylistId('not a url')).toBeNull();
  });
});

describe('parsePlaylistTotal', () => {
  // The real count sits ~12 levels deep in a viewModel tree; nesting depth must not matter.
  const headerWith = (...texts: string[]) => ({
    header: {
      pageHeaderRenderer: {
        content: {
          viewModel: {
            metadata: {
              metadataRows: [{ metadataParts: texts.map((t) => ({ text: { content: t } })) }],
            },
          },
        },
      },
    },
  });

  it('reads the video count from the header metadata', () => {
    expect(parsePlaylistTotal(headerWith('3Blue1Brown', '241 videos'))).toBe(241);
  });

  it('handles a singular count and thousands separators', () => {
    expect(parsePlaylistTotal(headerWith('1 video'))).toBe(1);
    expect(parsePlaylistTotal(headerWith('1,204 videos'))).toBe(1204);
  });

  it('returns null when the header does not report a count', () => {
    expect(parsePlaylistTotal(headerWith('Updated yesterday', '12,000 views'))).toBeNull();
    expect(parsePlaylistTotal({ header: {} })).toBeNull();
    expect(parsePlaylistTotal({})).toBeNull();
  });
});

describe('parsePlaylistTitle', () => {
  it('reads the page header title', () => {
    expect(parsePlaylistTitle({ header: { pageHeaderRenderer: { pageTitle: 'Essence' } } })).toBe(
      'Essence',
    );
  });

  it('returns an empty string when absent', () => {
    expect(parsePlaylistTitle({})).toBe('');
  });
});
