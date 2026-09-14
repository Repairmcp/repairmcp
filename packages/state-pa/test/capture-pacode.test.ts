import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { capturePacode } from '../src/capture-pacode.js';
import { PA_PACODE_SOURCES, pacodeChapterUrl, pacodeSectionUrl } from '../src/sources-pacode.js';
import { pacodeChapterPage } from './parse-pacode.test.js';

/** One synthetic chapter page per manifest chapter. Chapter 301 has no chapter-level adoption note and 301.5 no Source line (the real shape). */
export function buildPacodeIo(overrides: { pages?: Record<string, string> } = {}): CaptureIo & { fetched: Array<{ url: string; minDelayMs?: number }> } {
  const pages = new Map<string, string>();
  for (const src of PA_PACODE_SOURCES) {
    pages.set(pacodeChapterUrl(src.title, src.chapter), pacodeChapterPage({
      title: src.title, chapter: src.chapter,
      ...(src.chapter === 301 ? {} : { chapterSource: [`The provisions of this Chapter ${src.chapter} adopted March 18, 1977, effective March 19, 1977, 7 Pa.B. 750, unless otherwise noted.`] }),
      sections: src.cites.map((cite, i) => ({ cite, heading: `Heading ${cite}.`, body: [`Body of ${cite}.`], ...(i === 0 ? { source: `The provisions of this § ${cite} amended May 6, 2022, effective in 90 days, 52 Pa.B. 2701.` } : {}) })),
    }));
  }
  for (const [u, h] of Object.entries(overrides.pages ?? {})) pages.set(u, h);
  const fetched: Array<{ url: string; minDelayMs?: number }> = [];
  return {
    fetched,
    async fetchText(url, o) {
      fetched.push({ url, ...(o?.minDelayMs !== undefined ? { minDelayMs: o.minDelayMs } : {}) });
      const html = pages.get(url);
      if (html === undefined) throw new Error(`fixture missing for ${url}`);
      return html;
    },
    async fetchJson() { throw new Error('not used'); },
    log() {},
  };
}

describe('capturePacode', () => {
  test('five fetches at the 10 s floor; 31 sections; own date, inherited chapter date, or none', async () => {
    const io = buildPacodeIo();
    const r = await capturePacode(io, PA_PACODE_SOURCES);
    expect(io.fetched.length).toBe(5);
    for (const f of io.fetched) expect(f.minDelayMs).toBe(10_000);
    expect(r.sections.length).toBe(31);
    expect(r.currency).toBe('56 Pa.B. 4026 (July 4, 2026)');
    const s146_1 = r.sections.find((s) => s.cite === '146.1')!;
    expect(s146_1.effectiveDate).toBe('2022-08-04');
    expect(s146_1.historyNote).toMatch(/^The provisions of this § 146\.1 amended/);
    expect(s146_1.chapter).toBe('Chapter 146');
    expect(s146_1.sourceUrl).toBe(pacodeSectionUrl(31, 146, '146.1'));
    expect(s146_1.captureSource).toBe('pacode');
    expect(s146_1.headingSource).toBe('source');
    const s146_2 = r.sections.find((s) => s.cite === '146.2')!;
    expect(s146_2.effectiveDate).toBe('1977-03-19');
    expect(s146_2.historyNote).toMatch(/^The provisions of this Chapter 146 adopted/);
    const s301_5 = r.sections.find((s) => s.cite === '301.5')!;
    expect(s301_5.effectiveDate).toBeUndefined();
    expect(s301_5.historyNote).toBeUndefined();
  });
  test('pages that disagree about currency fail by name', async () => {
    const io = buildPacodeIo({ pages: { [pacodeChapterUrl(34, 9)]: pacodeChapterPage({ title: 34, chapter: 9, currency: '56 Pa.B. 4100 (July 11, 2026)', sections: [{ cite: '9.1', heading: 'A.', body: ['x'] }, { cite: '9.2', heading: 'B.', body: ['x'] }, { cite: '9.3', heading: 'C.', body: ['x'] }] }) } });
    await expect(capturePacode(io, PA_PACODE_SOURCES)).rejects.toThrow(/Chapter 9, Subchapter A states "56 Pa\.B\. 4100 \(July 11, 2026\)" but Chapter 146 stated "56 Pa\.B\. 4026/);
  });
  test('an absent cite and a reserved cite fail by name', async () => {
    const absent = buildPacodeIo({ pages: { [pacodeChapterUrl(31, 62)]: pacodeChapterPage({ title: 31, chapter: 62, sections: [{ cite: '62.1', heading: 'Definitions.', body: ['x'] }] }) } });
    await expect(capturePacode(absent, PA_PACODE_SOURCES)).rejects.toThrow(/31 Pa\. Code 62\.2 .*absent/);
    const reserved = buildPacodeIo({ pages: { [pacodeChapterUrl(31, 62)]: pacodeChapterPage({ title: 31, chapter: 62, sections: [{ cite: '62.1', heading: 'Definitions.', body: ['x'] }, { cite: '62.2', heading: '[Reserved].', body: [] }, { cite: '62.3', heading: 'Standards.', body: ['x'] }] }) } });
    await expect(capturePacode(reserved, PA_PACODE_SOURCES)).rejects.toThrow(/62\.2 .*Reserved/);
  });
  test('a named cite that captures no body text fails by name', async () => {
    const io = buildPacodeIo({ pages: { [pacodeChapterUrl(31, 62)]: pacodeChapterPage({ title: 31, chapter: 62, sections: [
      { cite: '62.1', heading: 'Definitions.', body: ['x'] },
      { cite: '62.2', heading: 'Licensure.', body: [] },
      { cite: '62.3', heading: 'Standards.', body: ['x'] },
    ] }) } });
    await expect(capturePacode(io, PA_PACODE_SOURCES)).rejects.toThrow(/31 Pa\. Code 62\.2 captured no body text from the Chapter 62 page/);
  });
  test('a Subchapter-named preamble adoption line (Chapter 9\'s real shape) is inherited by sections with no own Source line — review round 1, Finding 1', async () => {
    const io = buildPacodeIo({
      pages: {
        [pacodeChapterUrl(34, 9)]: pacodeChapterPage({
          title: 34, chapter: 9,
          chapterSource: ['The provisions of this Subchapter A adopted August 26, 1961; amended through September 1, 1969, unless otherwise noted.'],
          sections: [
            { cite: '9.1', heading: 'Authorized deductions.', body: ['x'] },
            { cite: '9.2', heading: 'Restrictions.', body: ['x'] },
            { cite: '9.3', heading: 'Penalty.', body: ['x'] },
          ],
        }),
      },
    });
    const r = await capturePacode(io, PA_PACODE_SOURCES);
    for (const cite of ['9.1', '9.2', '9.3']) {
      const s = r.sections.find((x) => x.cite === cite)!;
      expect(s.effectiveDate).toBe('1969-09-01');
      expect(s.historyNote).toBe('The provisions of this Subchapter A adopted August 26, 1961; amended through September 1, 1969, unless otherwise noted.');
    }
  });
});
