import { describe, it, expect } from 'vitest';
import { parseTime, formatTime, parseRate, parseVolume } from './timeparse.js';

describe('parseTime', () => {
  it('parses bare seconds, numbers, and @-prefixed values', () => {
    expect(parseTime('90')).toBe(90);
    expect(parseTime(90)).toBe(90);
    expect(parseTime('@90')).toBe(90);
  });

  it('parses colon clock forms', () => {
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime('0:15')).toBe(15);
    expect(parseTime('1:02:03')).toBe(3723);
  });

  it('parses unit forms', () => {
    expect(parseTime('1m30s')).toBe(90);
    expect(parseTime('2m')).toBe(120);
    expect(parseTime('1h')).toBe(3600);
  });

  it('rejects negative numbers and unparseable strings', () => {
    expect(() => parseTime(-1)).toThrow();
    expect(() => parseTime('soon')).toThrow();
  });
});

describe('formatTime', () => {
  it('formats with and without an hours component', () => {
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(15)).toBe('0:15');
    expect(formatTime(3723)).toBe('1:02:03');
  });
});

describe('parseRate', () => {
  it('parses and clamps to YouTube’s 0.25–2 range', () => {
    expect(parseRate('0.75x')).toBe(0.75);
    expect(parseRate(0.75)).toBe(0.75);
    expect(parseRate('5')).toBe(2);
    expect(parseRate('0.1')).toBe(0.25);
  });
});

describe('parseVolume', () => {
  it('reads absolute values on a 0–100 scale', () => {
    expect(parseVolume('50')).toEqual({ volume: 0.5 });
  });

  it('reads relative deltas', () => {
    expect(parseVolume('+10')).toEqual({ delta: 0.1 });
    expect(parseVolume('-10')).toEqual({ delta: -0.1 });
  });
});
