import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureIllinois } from '../src/capture-ilga.js';
import { IL_SOURCES, iacCite, ilcsCite, manifestCites, unitUrl, type IlSource } from '../src/sources.js';
import { iacPartPage, type IacFixtureSubpart } from './parse-iac.test.js';
import { emptyIlcsPage, ilcsDualTable, ilcsPage, ilcsSectionTable } from './parse-ilcs.test.js';

/**
 * One synthetic page per fetch unit in the manifest, in the real markup.
 * 115/9 is dual-printed before/after (the real shape), 105/3 is a "from"
 * pair, 155.29 and 770 ILCS 45/1 print no catchline, 210.440 and 219.103
 * print no Source line (the inheritance case). Article pages carry an
 * article heading table first and a former cite on every section.
 */
export function buildIlIo(overrides: { pages?: Record<string, string> } = {}): CaptureIo & { fetched: Array<{ url: string; minDelayMs?: number; rawName?: string }> } {
  const pages = new Map<string, string>();
  for (const src of IL_SOURCES) pages.set(unitUrl(src), fixturePage(src));
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

const NO_CATCHLINE = new Set(['215 ILCS 5/155.29', '770 ILCS 45/1', '820 ILCS 105/4a']);

export function fixturePage(src: IlSource): string {
  if (src.kind === 'part') {
    const subparts: IacFixtureSubpart[] = [{ code: src.part === '919' ? undefined : 'A', heading: 'GENERAL', sections: src.sections.map((e) => {
      const omitSource = e.section === '210.440' || e.section === '219.103';
      return { num: e.section, heading: e.section.endsWith('EXHIBIT A') ? 'Total Loss Automobile Claims' : `Heading ${e.section}`, paragraphs: [`a)&nbsp;&nbsp;&nbsp;&nbsp; Body of ${e.section}.`, `b)&nbsp;&nbsp;&nbsp;&nbsp; More of ${e.section}.`], ...(omitSource ? {} : { source: `Amended at 26 Ill.\nReg. 11915, effective July 22, 2002` }) };
    }) }];
    return iacPartPage({ title: src.title, part: src.part, partTitle: src.partTitle, authority: 'Implementing X.', source: 'Adopted at 19 Ill. Reg. 6576, effective May 2, 1995; amended at 46 Ill. Reg. 14051, effective July 19, 2022.', subparts });
  }
  const former = src.kind === 'article' ? (e: string) => `from Ch. 73, par. ${e}` : () => undefined;
  const tables: string[] = [];
  if (src.kind === 'article') tables.push(`<table align="center" border="0" cellspacing="0" cellpadding="0" width="500"><tr><td><div align="justify"><code><font size="2" face="Courier New">(${src.chapter}/Art. IX heading)</font></code><center><code><font size="2" face="Courier New">ARTICLE IX. HEADING</font></code></center></div></td></tr></table>`);
  for (const e of src.sections) {
    const cite = ilcsCite(src.chapter, e.section);
    if (cite === '820 ILCS 115/9') {
      tables.push(ilcsDualTable({ cite, formerCite: 'from Ch. 48, par. 39m-9', versions: [
        { label: 'before amendment by P.A. 104-457', lines: [['Sec. 9. ', 'Except as hereinafter provided, deductions by employers from wages or final compensation are prohibited unless such deductions are (1) required by law; this is the old text of Section 9.']], source: 'P.A. 97-120, eff. 1-1-12.' },
        { label: 'after amendment by P.A. 104-457', lines: [['Sec. 9. ', 'Except as hereinafter provided, deductions by employers from wages or final compensation are prohibited unless made with the express written consent of the employee; this is the new text of Section 9.']], source: 'P.A. 104-457, eff. 6-1-26.' },
      ] }));
      continue;
    }
    if (cite === '820 ILCS 105/3') {
      tables.push(ilcsDualTable({ cite, formerCite: 'from Ch. 48, par. 1003', versions: [
        { label: 'from P.A. 104-480', lines: [['Sec. 3. ', 'As used in this Act: '], ['(a) Director means X (480 text).']], source: 'P.A. 104-480, eff. 7-1-26.' },
        { label: 'from P.A. 104-525', lines: [['Sec. 3. ', 'As used in this Act: '], ['(a) Director means X (525 text).']], source: 'P.A. 104-525, eff. 6-26-26.' },
      ] }));
      continue;
    }
    const secRun = `Sec. ${e.section}. `;
    const lines = NO_CATCHLINE.has(cite)
      ? [[secRun, `(a) Body of ${e.section} without a catchline.`], [`(b) More of ${e.section}.`]]
      : [[secRun, `Heading ${e.section}. `], [`(a) Body of ${e.section}.`], [`(b) More of ${e.section}.`]];
    const source = cite === '215 ILCS 5/154.5' || cite === '770 ILCS 50/2' ? 'P.A. 80-926.' : 'P.A. 93-565, eff. 1-1-04.';
    tables.push(ilcsSectionTable({ cite, formerCite: former(e.section), lines, source }));
  }
  return ilcsPage(tables);
}

describe('captureIllinois', () => {
  test('23 fetches at the 10 s floor with raw names; 88 sections; captureSource, chapter, and sourceUrl per unit', async () => {
    const io = buildIlIo();
    const r = await captureIllinois(io, IL_SOURCES, '2026-09-15');
    expect(io.fetched.length).toBe(23);
    for (const f of io.fetched) { expect(f.minDelayMs).toBe(10_000); expect(f.rawName).toMatch(/^il-(act|art|part)-[\w-]+\.html$/); }
    expect(r.sections.length).toBe(88);
    const s15 = r.sections.find((s) => s.cite === '815 ILCS 308/15')!;
    expect(s15.code).toBe('ILCS');
    expect(s15.captureSource).toBe('act');
    expect(s15.chapter).toBe('815 ILCS 308');
    expect(s15.chapterTitle).toBe('Automotive Collision Repair Act');
    expect(s15.heading).toBe('Heading 15.');
    expect(s15.headingSource).toBe('section');
    expect(s15.text).toBe('(a) Body of 15.\n(b) More of 15.');
    expect(s15.effectiveDate).toBe('2004-01-01');
    expect(s15.publicActs).toEqual(['P.A. 93-565']);
    expect(s15.sourceNote).toBe('P.A. 93-565, eff. 1-1-04.');
    expect(s15.sourceUrl).toBe('https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2500&ChapterID=67');
    expect(s15.formerCite).toBeUndefined();
    expect(s15.dateSource).toBeUndefined();
    const s1546 = r.sections.find((s) => s.cite === '215 ILCS 5/154.6')!;
    expect(s1546.captureSource).toBe('article');
    expect(s1546.formerCite).toBe('from Ch. 73, par. 154.6');
    expect(s1546.sourceUrl).toBe('https://www.ilga.gov/legislation/ILCS/details?ActID=1249&ChapterID=22&SeqStart=51000000&SeqEnd=67200000');
    expect(s1546.chapterTitle).toBe('Illinois Insurance Code');
    const s1545 = r.sections.find((s) => s.cite === '215 ILCS 5/154.5')!;
    expect(s1545.effectiveDate).toBeUndefined();
    expect(s1545.publicActs).toEqual(['P.A. 80-926']);
  });
  test('no printed catchline → the manifest heading, recorded as such and listed in the report', async () => {
    const r = await captureIllinois(buildIlIo(), IL_SOURCES, '2026-09-15');
    const s = r.sections.find((x) => x.cite === '215 ILCS 5/155.29')!;
    expect(s.heading).toBe('Aftermarket crash parts');
    expect(s.headingSource).toBe('manifest');
    expect(s.text.startsWith('(a) Body of 155.29 without a catchline.')).toBe(true);
    expect(r.report.manifestHeadings.sort()).toEqual(['215 ILCS 5/155.29', '770 ILCS 45/1', '820 ILCS 105/3', '820 ILCS 105/4a', '820 ILCS 115/9'].sort());
  });
  test('dual-printed sections: the after-text (115/9) and the newest in-force "from" version (105/3), with every printed version recorded', async () => {
    const r = await captureIllinois(buildIlIo(), IL_SOURCES, '2026-09-15');
    const s9 = r.sections.find((x) => x.cite === '820 ILCS 115/9')!;
    expect(s9.text).toBe('Except as hereinafter provided, deductions by employers from wages or final compensation are prohibited unless made with the express written consent of the employee; this is the new text of Section 9.');
    expect(s9.effectiveDate).toBe('2026-06-01');
    expect(s9.printedVersions?.map((v) => v.label)).toEqual(['before amendment by P.A. 104-457', 'after amendment by P.A. 104-457']);
    expect(s9.versionNote).toContain('this corpus carries "after amendment by P.A. 104-457"');
    expect(s9.futureEffective).toBeUndefined();
    const s3 = r.sections.find((x) => x.cite === '820 ILCS 105/3')!;
    expect(s3.text).toBe('As used in this Act:\n(a) Director means X (480 text).');
    expect(s3.heading).toBe('Definitions');
    expect(r.report.dualPrinted).toEqual([
      { cite: '820 ILCS 115/9', chosen: 'after amendment by P.A. 104-457', printed: ['before amendment by P.A. 104-457', 'after amendment by P.A. 104-457'] },
      { cite: '820 ILCS 105/3', chosen: 'from P.A. 104-480', printed: ['from P.A. 104-480', 'from P.A. 104-525'] },
    ]);
    const early = await captureIllinois(buildIlIo(), IL_SOURCES, '2026-05-01');
    const e9 = early.sections.find((x) => x.cite === '820 ILCS 115/9')!;
    expect(e9.text).toBe('Except as hereinafter provided, deductions by employers from wages or final compensation are prohibited unless such deductions are (1) required by law; this is the old text of Section 9.');
    const e3 = early.sections.find((x) => x.cite === '820 ILCS 105/3')!;
    expect(e3.futureEffective).toBe(true);
    expect(early.report.warnings.some((w) => w.startsWith('820 ILCS 105/3:'))).toBe(true);
  });
  test('Administrative Code sections: the Part chapter, the per-section landing page, the Source line or the inherited Part date', async () => {
    const r = await captureIllinois(buildIlIo(), IL_SOURCES, '2026-09-15');
    const s80 = r.sections.find((x) => x.cite === '50 Ill. Adm. Code 919.80')!;
    expect(s80.code).toBe('Ill. Adm. Code');
    expect(s80.captureSource).toBe('part');
    expect(s80.chapter).toBe('50 Ill. Adm. Code 919');
    expect(s80.chapterTitle).toBe('Improper Claims Practice');
    expect(s80.sourceUrl).toBe('https://www.ilga.gov/commission/jcar/admincode/050/050009190000800R.html');
    expect(s80.effectiveDate).toBe('2002-07-22');
    expect(s80.dateSource).toBe('section');
    expect(s80.illRegCite).toBe('26 Ill. Reg. 11915');
    expect(s80.text).toBe('a) Body of 919.80.\nb) More of 919.80.');
    expect(s80.publicActs).toBeUndefined();
    const s440 = r.sections.find((x) => x.cite === '56 Ill. Adm. Code 210.440')!;
    expect(s440.effectiveDate).toBe('1995-05-02');
    expect(s440.dateSource).toBe('part');
    expect(s440.sourceNote.startsWith('Adopted at 19 Ill. Reg. 6576')).toBe(true);
    expect(s440.illRegCite).toBeUndefined();
    expect(s440.sourceUrl).toBe('https://www.ilga.gov/commission/jcar/admincode/056/056002100A04400R.html');
    const ex = r.sections.find((x) => x.cite === '50 Ill. Adm. Code 919.EXHIBIT A')!;
    expect(ex.heading).toBe('Total Loss Automobile Claims');
    expect(ex.sourceUrl).toBe('https://www.ilga.gov/commission/jcar/admincode/050/05000919ZZ9999aR.html');
  });
  test('a named cite absent from its page, an empty act page, and a Repealed named rule all hard-fail by name', async () => {
    const act = IL_SOURCES.find((s) => s.kind === 'act' && s.chapter === '815 ILCS 308')!;
    const missing = ilcsPage([ilcsSectionTable({ cite: '815 ILCS 308/5', lines: [['Sec. 5. ', 'Purpose. '], ['Body of 5.']], source: 'P.A. 93-565, eff. 1-1-04.' })]);
    await expect(captureIllinois(buildIlIo({ pages: { [unitUrl(act)]: missing } }), IL_SOURCES, '2026-09-15')).rejects.toThrow(/815 ILCS 308\/10 was requested by name but is absent/);
    await expect(captureIllinois(buildIlIo({ pages: { [unitUrl(act)]: emptyIlcsPage() } }), IL_SOURCES, '2026-09-15')).rejects.toThrow(/EMPTY/);
    const part = IL_SOURCES.find((s) => s.kind === 'part' && s.part === '210')!;
    const repealed = iacPartPage({ title: '56', part: '210', partTitle: 'Minimum Wage Law', authority: 'x', source: 'Adopted at 19 Ill. Reg. 6576, effective May 2, 1995.', subparts: [{ code: 'D', sections: [{ num: '210.440', heading: 'Overtime – General (Repealed)', paragraphs: [], source: 'Repealed at 1 Ill. Reg. 1, effective January 1, 2030' }] }] });
    await expect(captureIllinois(buildIlIo({ pages: { [unitUrl(part)]: repealed } }), IL_SOURCES, '2026-09-15')).rejects.toThrow(/56 Ill\. Adm\. Code 210\.440 was requested by name but the Part marks it/);
  });
  test('every manifest cite is captured exactly once with its manifest domain', async () => {
    const r = await captureIllinois(buildIlIo(), IL_SOURCES, '2026-09-15');
    const byCite = new Map(r.sections.map((s) => [s.cite, s]));
    for (const c of manifestCites()) {
      expect(byCite.get(c.cite)?.domain, c.cite).toBe(c.domain);
      expect(byCite.get(c.cite)?.captureSource, c.cite).toBe(c.captureSource);
    }
    expect(iacCite('56', '300.720')).toBe('56 Ill. Adm. Code 300.720');
  });
});
