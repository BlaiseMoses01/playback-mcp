import { describe, it, expect } from 'vitest';
import { pickTrack } from './captions.js';

const enAuto = { baseUrl: 'u-en-auto', languageCode: 'en', kind: 'asr' };
const enManual = { baseUrl: 'u-en', languageCode: 'en' };
const enGB = { baseUrl: 'u-en-gb', languageCode: 'en-GB' };
const esManual = { baseUrl: 'u-es', languageCode: 'es' };

describe('pickTrack', () => {
  it('prefers a manual English track by default', () => {
    expect(pickTrack([esManual, enAuto, enManual])).toBe(enManual);
  });

  it('falls back to any manual track, then auto-generated', () => {
    expect(pickTrack([enAuto, esManual])).toBe(esManual); // any manual beats english auto
    expect(pickTrack([{ ...esManual, kind: 'asr' }, enAuto])).toBe(enAuto);
  });

  it('matches a requested lang exactly or by prefix, preferring manual', () => {
    expect(pickTrack([enAuto, enManual], 'en')).toBe(enManual);
    expect(pickTrack([esManual, enGB], 'en')).toBe(enGB);
  });

  it('lists available tracks when the requested lang is missing', () => {
    expect(() => pickTrack([enAuto, esManual], 'fr')).toThrow(
      /No "fr" caption track.*en \(auto\), es/,
    );
  });
});
