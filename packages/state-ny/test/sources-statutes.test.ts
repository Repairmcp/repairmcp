import { describe, expect, test } from 'bun:test';
import { NY_LAW_IDS, NY_STATUTE_SOURCES, senateSectionUrl } from '../src/sources-statutes.js';

describe('the statute manifest', () => {
  test('33 cites, unique per code, every entry titled', () => {
    const all = NY_STATUTE_SOURCES.flatMap((s) => s.cites.map((c) => `${s.code} ${c}`));
    expect(all.length).toBe(33);
    expect(new Set(all).size).toBe(33);
    for (const s of NY_STATUTE_SOURCES) expect(s.chapterTitle.length).toBeGreaterThan(3);
  });
  test('URL shape upper-cases the cite and uses the Senate law id', () => {
    expect(senateSectionUrl('VAT', '398-d')).toBe('https://www.nysenate.gov/legislation/laws/VAT/398-D');
    expect(NY_LAW_IDS['N.Y. Gen. Bus. Law']).toBe('GBS');
    expect(NY_LAW_IDS["N.Y. Workers' Comp. Law"]).toBe('WKC');
  });
});
