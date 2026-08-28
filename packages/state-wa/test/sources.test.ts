import { describe, expect, test } from 'bun:test';
import type { ParsedWaSection } from '../src/parse.js';
import { WA_CAPTURE_SOURCES, applyFilter, chapterUrl, sectionUrl } from '../src/sources.js';
import { WA_DOMAINS } from '../src/schema.js';

const sec = (cite: string): ParsedWaSection => ({
  cite,
  heading: `Heading ${cite}`,
  text: `Text ${cite}`,
});

const PARSED = [sec('296-62-07001'), sec('296-62-08003'), sec('296-62-08005'), sec('296-62-11019')];

describe('applyFilter', () => {
  test('chapter keeps everything', () => {
    expect(applyFilter(PARSED, { kind: 'chapter' }).map((s) => s.cite)).toEqual(
      PARSED.map((s) => s.cite),
    );
  });

  test('prefix keeps only matching cite families', () => {
    expect(
      applyFilter(PARSED, { kind: 'prefix', prefixes: ['296-62-080'] }).map((s) => s.cite),
    ).toEqual(['296-62-08003', '296-62-08005']);
  });

  test('a prefix matching nothing throws', () => {
    expect(() => applyFilter(PARSED, { kind: 'prefix', prefixes: ['296-62-999'] })).toThrow();
  });

  test('explicit sections resolve exactly', () => {
    expect(
      applyFilter(PARSED, { kind: 'sections', cites: ['296-62-11019'] }).map((s) => s.cite),
    ).toEqual(['296-62-11019']);
  });

  test('an explicit section that is absent hard-fails — silence would hide a renumbering', () => {
    expect(() => applyFilter(PARSED, { kind: 'sections', cites: ['296-62-99999'] })).toThrow(
      /296-62-99999/,
    );
  });
});

describe('WA_CAPTURE_SOURCES manifest', () => {
  test('covers all four domains', () => {
    const domains = new Set(WA_CAPTURE_SOURCES.map((s) => s.domain));
    for (const domain of WA_DOMAINS) expect(domains.has(domain)).toBe(true);
  });

  test('296-62 is never captured whole — the parent chapter is ~3.5 MB', () => {
    const entries = WA_CAPTURE_SOURCES.filter((s) => s.chapter === '296-62');
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.filter.kind).not.toBe('chapter');
  });

  test('50A.04 (decodified) is not in the manifest', () => {
    expect(WA_CAPTURE_SOURCES.some((s) => s.chapter === '50A.04')).toBe(false);
  });

  test('URL builders produce the verified templates', () => {
    expect(chapterUrl('WAC', '284-30')).toBe(
      'https://app.leg.wa.gov/WAC/default.aspx?cite=284-30&full=true',
    );
    expect(sectionUrl('RCW', '46.71.025')).toBe(
      'https://app.leg.wa.gov/RCW/default.aspx?cite=46.71.025',
    );
  });
});
