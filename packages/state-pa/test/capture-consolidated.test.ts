import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureConsolidated } from '../src/capture-consolidated.js';
import { PA_CONSOLIDATED_SOURCES, consolidatedChapterUrl, consolidatedSectionUrl } from '../src/sources-consolidated.js';
import { chapterPage } from './parse-consolidated.test.js';

/** One synthetic chapter page per manifest chapter, every cite present, own notes on a few. */
export function buildConsolidatedIo(overrides: { pages?: Record<string, string> } = {}): CaptureIo & { fetched: Array<{ url: string; minDelayMs?: number }> } {
  const pages = new Map<string, string>();
  for (const src of PA_CONSOLIDATED_SOURCES) {
    pages.set(consolidatedChapterUrl(src.title, src.chapter), chapterPage({
      title: src.title, chapter: src.chapter,
      enactment: `Unless otherwise noted, Chapter ${src.chapter} was added June 17, 1976, P.L.162, No.81, effective July 1, 1977.`,
      subchapters: [{ letter: src.subchapter, name: 'NAME', enactment: `Subchapter ${src.subchapter} was added December 9, 2002, P.L.1278, No.152, effective in 60 days.`,
        sections: src.cites.map((cite, i) => ({ cite, heading: `Catchline ${cite}.`, body: [`Body of ${cite}.`], ...(i === 0 ? { notes: ['(Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)'] } : {}) })) }],
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

describe('captureConsolidated', () => {
  test('three fetches at the 5 s floor; every cite captured with the right date, inherited or own', async () => {
    const io = buildConsolidatedIo();
    const r = await captureConsolidated(io, PA_CONSOLIDATED_SOURCES);
    expect(io.fetched.length).toBe(3);
    for (const f of io.fetched) expect(f.minDelayMs).toBe(5_000);
    expect(r.sections.length).toBe(17);
    const s8371 = r.sections.find((s) => s.cite === '8371')!;
    expect(s8371.effectiveDate).toBe('2012-12-23');
    expect(s8371.historyNote).toBe('(Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)');
    const s1162 = r.sections.find((s) => s.cite === '1162')!;
    expect(s1162.effectiveDate).toBe('2003-02-07');
    expect(s1162.historyNote).toMatch(/^Enactment\. Subchapter D was added/);
    expect(s1162.chapter).toBe('ch. 11, subch. D');
    expect(s1162.sourceUrl).toBe(consolidatedSectionUrl(75, '1162'));
    expect(s1162.captureSource).toBe('legis');
    expect(s1162.headingSource).toBe('source');
    expect(s1162.actSection).toBeUndefined();
    expect(r.sections.find((s) => s.cite === '1165.1')!.sourceUrl).toMatch(/00\.011\.065\.001\.\.HTM$/);
  });
  test('an absent cite fails by name', async () => {
    const io = buildConsolidatedIo({ pages: { [consolidatedChapterUrl(42, 83)]: chapterPage({ title: 42, chapter: 83, subchapters: [{ letter: 'G', name: 'X', sections: [{ cite: '8372', heading: 'Other.', body: ['x'] }] }] }) } });
    await expect(captureConsolidated(io, PA_CONSOLIDATED_SOURCES)).rejects.toThrow(/42 Pa\.C\.S\. 8371 .*absent/);
  });
  test('a repealed cite fails by name', async () => {
    const io = buildConsolidatedIo({ pages: { [consolidatedChapterUrl(42, 83)]: chapterPage({ title: 42, chapter: 83, subchapters: [{ letter: 'G', name: 'X', sections: [{ cite: '8371', heading: 'Actions on insurance policies (Repealed).', body: [] }] }] }) } });
    await expect(captureConsolidated(io, PA_CONSOLIDATED_SOURCES)).rejects.toThrow(/8371 .*Repealed/);
  });
  test('a subchapter label that disagrees with the manifest fails by name', async () => {
    const io = buildConsolidatedIo({ pages: { [consolidatedChapterUrl(42, 83)]: chapterPage({ title: 42, chapter: 83, subchapters: [{ letter: 'H', name: 'X', sections: [{ cite: '8371', heading: 'Actions on insurance policies.', body: ['x'] }] }] }) } });
    await expect(captureConsolidated(io, PA_CONSOLIDATED_SOURCES)).rejects.toThrow(/8371 sits under SUBCHAPTER H .*expects G/);
  });
  test('a section with neither its own note nor an Enactment note carries no date', async () => {
    const io = buildConsolidatedIo({ pages: { [consolidatedChapterUrl(42, 83)]: chapterPage({ title: 42, chapter: 83, subchapters: [{ letter: 'G', name: 'X', sections: [{ cite: '8371', heading: 'Actions on insurance policies.', body: ['x'] }] }] }) } });
    const r = await captureConsolidated(io, PA_CONSOLIDATED_SOURCES);
    const s = r.sections.find((x) => x.cite === '8371')!;
    expect(s.effectiveDate).toBeUndefined();
    expect(s.historyNote).toBeUndefined();
  });
  test('a named cite that captures no body text fails by name', async () => {
    const io = buildConsolidatedIo({ pages: { [consolidatedChapterUrl(42, 83)]: chapterPage({ title: 42, chapter: 83, subchapters: [{ letter: 'G', name: 'X', sections: [{ cite: '8371', heading: 'Actions on insurance policies.', body: [] }] }] }) } });
    await expect(captureConsolidated(io, PA_CONSOLIDATED_SOURCES)).rejects.toThrow(/8371 captured no body text/);
  });
});
