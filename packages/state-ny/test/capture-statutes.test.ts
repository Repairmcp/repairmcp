import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { articleFromLocation, captureNyStatutes } from '../src/capture-statutes.js';
import { NY_STATUTE_SOURCES, senateSectionUrl } from '../src/sources-statutes.js';
import { senatePage } from './parse-senate.test.js';

function locationFor(lawId: string, chapter: string): string {
  return `Some Law (${lawId}) CHAPTER 1, ${chapter.replace('art. ', 'ARTICLE ')}`;
}

export function buildStatuteIo(overrides: { pages?: Record<string, string>; failOnce?: string } = {}): CaptureIo & { fetched: string[] } {
  const pages = new Map<string, string>();
  for (const s of NY_STATUTE_SOURCES) {
    for (const cite of s.cites) {
      pages.set(senateSectionUrl(s.lawId, cite), senatePage({ cite: cite.toUpperCase(), heading: `Catchline ${cite}`, location: locationFor(s.lawId, s.chapter), body: `  &sect; ${cite}. Catchline ${cite}. Body of ${cite}.` }));
    }
  }
  for (const [u, h] of Object.entries(overrides.pages ?? {})) pages.set(u, h);
  const fetched: string[] = [];
  let failed = false;
  return {
    fetched,
    async fetchText(url) {
      fetched.push(url);
      if (url === overrides.failOnce && !failed) { failed = true; throw new Error('www.nysenate.gov responded 403 for ' + url + ' — not capturing.'); }
      const html = pages.get(url);
      if (html === undefined) throw new Error(`fixture missing for ${url}`);
      return html;
    },
    async fetchJson() { throw new Error('not used'); },
    log() {},
  };
}

describe('articleFromLocation', () => {
  test('reads the ARTICLE token, keeping letters', () => {
    expect(articleFromLocation('Insurance (ISC) CHAPTER 28, ARTICLE 26')).toBe('art. 26');
    expect(articleFromLocation('Vehicle & Traffic (VAT) CHAPTER 71, TITLE 3, ARTICLE 12-A')).toBe('art. 12-A');
    expect(() => articleFromLocation('Insurance (ISC) CHAPTER 28')).toThrow(/ARTICLE/);
  });
});

describe('captureNyStatutes', () => {
  test('captures every manifest cite with catchline, revision date, captureSource senate', async () => {
    const io = buildStatuteIo();
    const r = await captureNyStatutes(io, NY_STATUTE_SOURCES);
    const wanted = NY_STATUTE_SOURCES.flatMap((s) => s.cites.map((c) => c.toUpperCase()));
    expect(r.sections.map((s) => s.cite)).toEqual(wanted);
    for (const s of r.sections) {
      expect(s.captureSource).toBe('senate');
      expect(s.effectiveDate).toBe('2017-06-23');
      expect(s.heading).toMatch(/^Catchline /);
      expect(s.historyNote).toBe('Viewing most recent revision (from 2017-06-23)');
    }
    expect(r.sections.find((s) => s.cite === '398-D')?.sourceUrl).toBe(senateSectionUrl('VAT', '398-d'));
  });
  test('a location line whose article disagrees with the manifest fails by name', async () => {
    const io = buildStatuteIo({ pages: { [senateSectionUrl('ISC', '2610')]: senatePage({ location: 'Insurance (ISC) CHAPTER 28, ARTICLE 99', body: '  &sect; 2610. Collision or comprehensive coverage on motor vehicles; claims; repairs. x' }) } });
    await expect(captureNyStatutes(io, NY_STATUTE_SOURCES)).rejects.toThrow(/2610: the page sits in art\. 99/);
  });
  test('a 403 is retried once after the backoff, then succeeds', async () => {
    const io = buildStatuteIo({ failOnce: senateSectionUrl('ISC', '2601') });
    const r = await captureNyStatutes(io, NY_STATUTE_SOURCES, { retryDelayMs: 0 });
    expect(r.sections.length).toBe(33);
    expect(io.fetched.filter((u) => u.endsWith('/ISC/2601')).length).toBe(2);
    expect(r.report.warnings.some((w) => w.includes('2601') && w.includes('retried'))).toBe(true);
  });
  test('an absent section fails by name', async () => {
    const io = buildStatuteIo({ pages: { [senateSectionUrl('LAB', '191')]: senatePage({ absent: true }) } });
    await expect(captureNyStatutes(io, NY_STATUTE_SOURCES)).rejects.toThrow(/N\.Y\. Lab\. Law 191: .*could not be found/);
  });
});
