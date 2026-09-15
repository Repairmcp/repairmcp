import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureOhio } from '../src/capture-codes.js';
import { OH_CONST_CITE, OH_SOURCES, chapterUrl, sectionUrl } from '../src/sources.js';
import { chapterPage, constSectionPage, numberNotFoundPage, oacRulePage, orcSectionPage } from './parse-codes.test.js';

/** One synthetic page per fetch unit in the manifest, in the real markup. 4513.60 and 4513.61 carry the veto note (the real shape). */
export function buildOhIo(overrides: { pages?: Record<string, string> } = {}): CaptureIo & { fetched: Array<{ url: string; minDelayMs?: number; rawName?: string }> } {
  const pages = new Map<string, string>();
  const veto = "[Governor's veto not reflected; see H.B. 434 status report] ";
  for (const src of OH_SOURCES) {
    if (src.kind === 'chapter') {
      pages.set(chapterUrl(src.code, src.chapter), chapterPage({
        code: src.code, chapter: src.chapter, title: `Title of ${src.chapter}`,
        entries: src.sections.map((x) => ({
          cite: x.cite, catchline: `${x.cite === '4513.60' || x.cite === '4513.61' ? veto : ''}Heading ${x.cite}.`, effective: 'March 20, 2019',
          legislation: 'House Bill 494 - 132nd General Assembly', paragraphs: [`(A) Body of ${x.cite}.`, `(B) More of ${x.cite}.`],
          ...(src.code === 'OAC' ? { fiveYear: '1/1/2030', prior: '1/1/2000, 2/2/2010' } : {}),
        })),
      }));
    } else if (src.code === 'ORC') {
      pages.set(sectionUrl('ORC', src.cite), orcSectionPage({ cite: src.cite, catchline: `Heading ${src.cite}.`, effective: 'July 11, 2001', legislation: 'House Bill 75 - 124th General Assembly', chapter: src.chapter, chapterTitle: `Title of ${src.chapter}`, paragraphs: [`(A) Body of ${src.cite}.`] }));
    } else if (src.code === 'OAC') {
      pages.set(sectionUrl('OAC', src.cite), oacRulePage({ cite: src.cite, catchline: `Heading ${src.cite}.`, effective: 'March 11, 2023', chapter: src.chapter, chapterTitle: `Title of ${src.chapter}`, paragraphs: [`(A) Body of ${src.cite}.`], fiveYear: '3/11/2028', prior: '1/1/2003' }));
    } else {
      pages.set(sectionUrl('Ohio Const.', src.cite), constSectionPage({ paragraphs: ['Except as provided in this section, every employer shall pay.'] }));
    }
  }
  for (const [u, h] of Object.entries(overrides.pages ?? {})) pages.set(u, h);
  const fetched: Array<{ url: string; minDelayMs?: number; rawName?: string }> = [];
  return {
    fetched,
    async fetchText(url, o) {
      fetched.push({ url, ...(o?.minDelayMs !== undefined ? { minDelayMs: o.minDelayMs } : {}), ...(o?.rawName ? { rawName: o.rawName } : {}) });
      const html = pages.get(url);
      if (html === undefined) throw new Error(`fixture missing for ${url}`);
      return html;
    },
    async fetchJson() { throw new Error('not used'); },
    log() {},
  };
}

describe('captureOhio', () => {
  test('25 fetches at the 10 s floor with raw names; 51 sections; sourceUrl is always the section page; captureSource records the unit', async () => {
    const io = buildOhIo();
    const r = await captureOhio(io, OH_SOURCES);
    expect(io.fetched.length).toBe(25);
    for (const f of io.fetched) { expect(f.minDelayMs).toBe(10_000); expect(f.rawName).toMatch(/^oh-(orc|oac|const)-(ch|s|r)[^:]+\.html$/); }
    expect(r.sections.length).toBe(51);
    const s101 = r.sections.find((s) => s.cite === '4505.101')!;
    expect(s101.code).toBe('ORC');
    expect(s101.captureSource).toBe('chapter');
    expect(s101.sourceUrl).toBe('https://codes.ohio.gov/ohio-revised-code/section-4505.101');
    expect(s101.chapter).toBe('4505');
    expect(s101.chapterTitle).toBe('Title of 4505');
    expect(s101.domain).toBe('repair_law');
    expect(s101.effectiveDate).toBe('2019-03-20');
    expect(s101.latestLegislation).toBe('House Bill 494 - 132nd General Assembly');
    expect(s101.text).toBe('(A) Body of 4505.101.\n(B) More of 4505.101.');
    const s11 = r.sections.find((s) => s.cite === '4505.11')!;
    expect(s11.domain).toBe('insurance');
    const single = r.sections.find((s) => s.cite === '4121.47')!;
    expect(single.captureSource).toBe('section');
    expect(single.chapter).toBe('4121');
    expect(single.domain).toBe('safety');
    const rule = r.sections.find((s) => s.cite === '3901-1-54')!;
    expect(rule.code).toBe('OAC');
    expect(rule.captureSource).toBe('section');
    expect(rule.chapterTitle).toBe('Title of 3901-1');
    expect(rule.priorEffectiveDates).toEqual(['2003-01-01']);
    expect(rule.latestLegislation).toBeUndefined();
    expect(rule.sourceUrl).toBe('https://codes.ohio.gov/ohio-administrative-code/rule-3901-1-54');
    const k = r.sections.find((s) => s.code === 'Ohio Const.')!;
    expect(k.cite).toBe(OH_CONST_CITE);
    expect(k.chapter).toBe('art. II');
    expect(k.sourceUrl).toBe('https://codes.ohio.gov/ohio-constitution/section-2.34a');
  });
  test('status notes are kept per section and reported', async () => {
    const r = await captureOhio(buildOhIo(), OH_SOURCES);
    expect(r.sections.find((s) => s.cite === '4513.60')!.statusNote).toBe("Governor's veto not reflected; see H.B. 434 status report");
    expect(r.sections.find((s) => s.cite === '4513.62')!.statusNote).toBeUndefined();
    expect(r.report.statusNotes).toEqual([
      "ORC 4513.60: Governor's veto not reflected; see H.B. 434 status report",
      "ORC 4513.61: Governor's veto not reflected; see H.B. 434 status report",
    ]);
  });
  test('a manifest cite absent from its chapter page fails by name', async () => {
    const io = buildOhIo({ pages: { [chapterUrl('ORC', '4113')]: chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', catchline: 'x.', effective: 'March 20, 2019', paragraphs: ['y'] }] }) } });
    await expect(captureOhio(io, OH_SOURCES)).rejects.toThrow(/ORC 4113\.19 was requested by name but is absent from the chapter 4113 page/);
  });
  test('a Repealed status note on a named cite fails; an empty body on a named cite fails', async () => {
    const repealed = buildOhIo({ pages: { [chapterUrl('ORC', '4113')]: chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', catchline: '[Repealed effective 10/06/2026 by H.B. 433, 136th General Assembly] x.', effective: 'March 20, 2019', paragraphs: ['y'] }, { cite: '4113.19', catchline: 'z.', effective: 'October 1, 1953', paragraphs: ['w'] }] }) } });
    await expect(captureOhio(repealed, OH_SOURCES)).rejects.toThrow(/ORC 4113\.15 .*Repealed effective 10\/06\/2026/);
    const empty = buildOhIo({ pages: { [chapterUrl('ORC', '4113')]: chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', catchline: 'x.', effective: 'March 20, 2019', paragraphs: [] }, { cite: '4113.19', catchline: 'z.', effective: 'October 1, 1953', paragraphs: ['w'] }] }) } });
    await expect(captureOhio(empty, OH_SOURCES)).rejects.toThrow(/ORC 4113\.15 captured no body text/);
  });
  test('a singleton that answers Number Not Found fails by name', async () => {
    const io = buildOhIo({ pages: { [sectionUrl('ORC', '1343.03')]: numberNotFoundPage('1343.03') } });
    await expect(captureOhio(io, OH_SOURCES)).rejects.toThrow(/ORC 1343\.03: codes\.ohio\.gov answers "Number Not Found"/);
  });
  test('a PDF-filed named cite fails by name with the PDF reason; an unrequested PDF-filed cite on the same chapter page is skipped and warned about, not fatal', async () => {
    const pdfNamed = buildOhIo({ pages: { [chapterUrl('ORC', '4113')]: chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', catchline: 'x.', effective: 'March 20, 2019', paragraphs: [], pdfFiled: true }, { cite: '4113.19', catchline: 'z.', effective: 'October 1, 1953', paragraphs: ['w'] }] }) } });
    await expect(captureOhio(pdfNamed, OH_SOURCES)).rejects.toThrow(/ORC 4113\.15 .*PDF format/);

    const pdfUnrequested = buildOhIo({ pages: { [chapterUrl('ORC', '4113')]: chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', catchline: 'x.', effective: 'March 20, 2019', paragraphs: ['y'] }, { cite: '4113.19', catchline: 'z.', effective: 'October 1, 1953', paragraphs: ['w'] }, { cite: '4113.99', effective: 'October 6, 2026', paragraphs: [], pdfFiled: true }] }) } });
    const r = await captureOhio(pdfUnrequested, OH_SOURCES);
    expect(r.sections.length).toBe(51);
    expect(r.report.warnings).toEqual([expect.stringContaining('ORC 4113.99')]);
  });
  test('a named cite with no catchline (an unassigned heading) fails by name', async () => {
    const noCatchline = buildOhIo({ pages: { [chapterUrl('ORC', '4113')]: chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', effective: 'March 20, 2019', paragraphs: ['y'] }, { cite: '4113.19', catchline: 'z.', effective: 'October 1, 1953', paragraphs: ['w'] }] }) } });
    await expect(captureOhio(noCatchline, OH_SOURCES)).rejects.toThrow(/ORC 4113\.15 prints no catchline on the page/);
  });
});
