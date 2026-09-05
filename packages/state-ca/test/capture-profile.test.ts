import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { CA_CAPTURE_PROFILE } from '../src/capture.js';
import { selectVersion } from '../src/capture-statutes.js';
import { dirChapterFromHierarchy } from '../src/capture-regs.js';
import { CA_DIR_SOURCES, CA_LII_SOURCES, dirSectionUrl, liiSectionUrl } from '../src/sources-regs.js';
import { CA_STATUTE_SOURCES, leginfoTextViewUrl } from '../src/sources-statutes.js';

/**
 * Full-manifest fixtures for CA_CAPTURE_PROFILE.captureAll. captureAll
 * hardcodes the real CA_STATUTE_SOURCES, CA_LII_SOURCES and CA_DIR_SOURCES,
 * so these fixtures must satisfy the ENTIRE production manifest: every text
 * view with every named cite and its expected header, every LII page with
 * its breadcrumb and heading, and every DIR page. Shapes are the ones the
 * first real capture found (2026-09-04).
 */

function statuteBlock(cite: string, history = '(Amended by Stats. 2018, Ch. 503, Sec. 3.   (AB 3141)   Effective January 1, 2019.)'): string {
  return (
    `<div align="left"><p><h6 style="float:left;"><a href="javascript:submitCodesValues('${cite}.','x','2018','503','3', 'id_x')">${cite}.</a></h6>` +
    `  <p style="margin:0;display:inline;">(a) Body text for ${cite}.</p><p style="margin:0 0 0.5em 0;clear:both;"/>` +
    `<p style="margin:0 0 2em 0;font-size:0.9em;"><i>${history}</i></p></p></div>`
  );
}

function textView(header: string, blocks: string): string {
  return (
    '<html><body><div id="manylawsections"><DIV align="left"><h3><b>A Code - X</b></h3></DIV>' +
    `<div align="left"><h4 style="display:inline;"><b>${header} [1 - 2]</b></h4></div>` +
    `<div><font face="Times New Roman">${blocks}</font></div></div></body></html>`
  );
}

function liiPage(title: string, cite: string, heading: string, crumbs: string[]): string {
  return (
    '<html><body><ol><li>LII</li><li>State Regulations</li><li>California Code of Regulations</li>' +
    crumbs.map((c) => `<li>${c}</li>`).join('') +
    `<li>Cal. Code Regs. Tit. ${title}, § ${cite} - ${heading}</li></ol>` +
    `<h1 class="title" id="page_title"> Cal. Code Regs. Tit. ${title}, § ${cite} - ${heading} </h1>` +
    '<div class="tab-pane active" id="tab_default_1">' +
    `<div class="statereg-text"><div class="subsect indent0"><span class="designator">(a)</span> Rule text for ${cite}.</div></div>` +
    '<div class="statereg-notes"><div class="statereg-note"><note>Cal. Code Regs.</note></div>' +
    '<div class="statereg-note"><note><p>Note: Authority cited: Section 1, Code.</p></note></div>' +
    '<div class="statereg-note"><note>1. New section filed 10-20-97; operative 11-19-97 (Register 97, No. 43).</note></div></div></div>' +
    '<div class="tab-pane" id="tab_default_2"></div></body></html>'
  );
}

function dirPage(cite: string, heading: string): string {
  return (
    '<html><body><div class="t8_content"><div class="chapter-article">Subchapter 7. General Industry Safety Orders <br /> Group 20. Flammable Liquids <br /> Article 137. Spray Coating Operations</div>' +
    `<h1>&#167;${cite}. ${heading}.</h1><P> (a) Order text for ${cite}.` +
    '<P>NOTE: Authority cited: Section 142.3, Labor Code. <P> HISTORY <P>1. Amendment filed 7-16-76; effective thirtieth day thereafter (Register 76, No. 29).' +
    '<p><A HREF="x.html">Go Back to Article 137 Table of Contents</A></div></body></html>'
  );
}

/** Headings the DIR fixtures must carry so the expectHeading tripwires pass. */
const DIR_HEADINGS: Record<string, string> = {
  '3203': 'Injury and Illness Prevention Program',
  '3380': 'Personal Protective Devices',
  '3400': 'Medical Services and First Aid',
  '5144': 'Respiratory Protection',
  '5155': 'Airborne Contaminants',
  '5162': 'Emergency Eyewash and Shower Equipment',
  '5194': 'Hazard Communication',
  '5446': 'Spray Booths',
  '6151': 'Portable Fire Extinguishers',
};

function buildIo(overrides: Record<string, string> = {}): CaptureIo & { fetched: string[] } {
  const pages = new Map<string, string>();
  for (const source of CA_STATUTE_SOURCES) {
    pages.set(
      leginfoTextViewUrl(source),
      textView(source.expectHeader, source.sections.map((s) => statuteBlock(s.cite)).join('')),
    );
  }
  for (const source of CA_LII_SOURCES) {
    pages.set(
      liiSectionUrl(source.title, source.cite),
      liiPage(source.title, source.cite, source.expectHeading ?? `Heading for ${source.cite}`, ['Title X - Y', source.expectHierarchy]),
    );
  }
  for (const source of CA_DIR_SOURCES) {
    pages.set(dirSectionUrl(source.cite), dirPage(source.cite, DIR_HEADINGS[source.cite] ?? `Order ${source.cite}`));
  }
  for (const [url, body] of Object.entries(overrides)) pages.set(url, body);

  const fetched: string[] = [];
  return {
    fetched,
    async fetchText(url) {
      fetched.push(url);
      const body = pages.get(url);
      if (body === undefined) throw new Error(`fake io: no fixture for ${url}`);
      return body;
    },
    async fetchJson() {
      throw new Error('fake io: no JSON surfaces in the California capture');
    },
    log() {},
  };
}

describe('CA_CAPTURE_PROFILE.captureAll', () => {
  test('captures the whole manifest: every statute, LII, and DIR section, with provenance and heading source', async () => {
    const io = buildIo();
    const outcome = await CA_CAPTURE_PROFILE.captureAll(io);
    const statuteCount = CA_STATUTE_SOURCES.reduce((n, s) => n + s.sections.length, 0);
    expect(outcome.file.sections).toHaveLength(statuteCount + CA_LII_SOURCES.length + CA_DIR_SOURCES.length);
    expect(outcome.file.meta.state).toBe('CA');
    expect(outcome.file.meta.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // One fetch per text view, one per regulation page — nothing fetched twice.
    expect(io.fetched).toHaveLength(CA_STATUTE_SOURCES.length + CA_LII_SOURCES.length + CA_DIR_SOURCES.length);
    expect(new Set(io.fetched).size).toBe(io.fetched.length);

    const s = outcome.file.sections.find((x) => x.cite === '758.5')!;
    expect(s.code).toBe('Cal. Ins. Code');
    expect(s.captureSource).toBe('leginfo');
    expect(s.headingSource).toBe('manifest');
    expect(s.heading).toContain('Choice of automotive repair dealer');
    expect(s.effectiveDate).toBe('2019-01-01');
    expect(s.sourceUrl).toContain('codes_displaySection.xhtml?lawCode=INS&sectionNum=758.5.');

    const r = outcome.file.sections.find((x) => x.cite === '3365')!;
    expect(r.code).toBe('16 CCR');
    expect(r.captureSource).toBe('lii');
    expect(r.headingSource).toBe('source');
    expect(r.heading).toBe('Auto Body and Frame Repairs');
    expect(r.chapter).toBe('1, art. 8 (Tit. 16, Div. 33)');
    expect(r.effectiveDate).toBe('1997-11-19');

    const d = outcome.file.sections.find((x) => x.cite === '5446')!;
    expect(d.code).toBe('8 CCR');
    expect(d.captureSource).toBe('dir');
    expect(d.chapter).toBe('art. 137 (Tit. 8, subch. 7, group 20)');
    expect(d.chapterTitle).toBe('Spray Coating Operations');
    expect(d.effectiveDate).toBe('1976-08-15');

    // The written file validates against the tightened schema.
    expect(() => CA_CAPTURE_PROFILE.corpusFileSchema.parse(outcome.file)).not.toThrow();
  });

  test('a view that no longer prints its expected header hard-fails', async () => {
    const source = CA_STATUTE_SOURCES[0]!;
    const io = buildIo({
      [leginfoTextViewUrl(source)]: textView('ARTICLE 99. Something Else', source.sections.map((s) => statuteBlock(s.cite)).join('')),
    });
    await expect(CA_CAPTURE_PROFILE.captureAll(io)).rejects.toThrow(/does not print the header/);
  });

  test('a named cite missing from its view hard-fails', async () => {
    const source = CA_STATUTE_SOURCES[0]!;
    const io = buildIo({
      [leginfoTextViewUrl(source)]: textView(source.expectHeader, statuteBlock(source.sections[0]!.cite)),
    });
    await expect(CA_CAPTURE_PROFILE.captureAll(io)).rejects.toThrow(/absent from the/);
  });

  test('a mirror page whose heading or breadcrumb no longer matches hard-fails', async () => {
    const source = CA_LII_SOURCES.find((s) => s.cite === '3365')!;
    const wrongHeading = buildIo({
      [liiSectionUrl(source.title, source.cite)]: liiPage('16', '3365', 'Something Else', ['Title X', source.expectHierarchy]),
    });
    await expect(CA_CAPTURE_PROFILE.captureAll(wrongHeading)).rejects.toThrow(/expected it to contain/);
    const wrongCrumb = buildIo({
      [liiSectionUrl(source.title, source.cite)]: liiPage('16', '3365', 'Auto Body and Frame Repairs', ['Title X', 'Article 99 - Elsewhere']),
    });
    await expect(CA_CAPTURE_PROFILE.captureAll(wrongCrumb)).rejects.toThrow(/breadcrumb/);
  });

  test('a repealed mirror section hard-fails', async () => {
    const source = CA_LII_SOURCES.find((s) => s.cite === '3360')!;
    const io = buildIo({
      [liiSectionUrl(source.title, source.cite)]: liiPage('16', '3360', 'Scope of Regulations. [Repealed]', ['Title X', source.expectHierarchy]),
    });
    await expect(CA_CAPTURE_PROFILE.captureAll(io)).rejects.toThrow(/Repealed/);
  });
});

describe('selectVersion', () => {
  const v = (effectiveDate?: string) => ({ cite: '226.7', text: `text ${effectiveDate ?? 'undated'}`, ...(effectiveDate ? { effectiveDate } : {}) });

  test('a single version needs no decision', () => {
    expect(selectVersion([v('2021-01-01')], '2026-09-04')).toEqual({ section: v('2021-01-01') });
  });
  test('the newest version in force on the capture date wins; a future-operative version does not', () => {
    const r = selectVersion([v('2021-01-01'), v('2027-01-01')], '2026-09-04');
    expect(r.section.effectiveDate).toBe('2021-01-01');
    expect(r.warning).toContain('kept the one effective 2021-01-01');
  });
  test('with no usable dates the last printed is kept, and the warning says to look', () => {
    const r = selectVersion([v(), v()], '2026-09-04');
    expect(r.section).toBe(r.section);
    expect(r.warning).toContain('verify by eye');
  });
});

describe('dirChapterFromHierarchy', () => {
  test('reads the Article line, decorates with subchapter and group', () => {
    expect(
      dirChapterFromHierarchy([
        'Subchapter 7. General Industry Safety Orders',
        'Group 16. Control of Hazardous Substances',
        'Article 107. Dusts, Fumes, Mists, Vapors and Gases',
      ]),
    ).toEqual({ chapter: 'art. 107 (Tit. 8, subch. 7, group 16)', chapterTitle: 'Dusts, Fumes, Mists, Vapors and Gases' });
  });
  test('an order directly under a Group (3203, the IIPP) uses the Group and its trailing label', () => {
    expect(
      dirChapterFromHierarchy([
        'Subchapter 7. General Industry Safety Orders',
        'Group 1. General Physical Conditions and Structures Orders',
        'Introduction',
      ]),
    ).toEqual({
      chapter: 'group 1 (Tit. 8, subch. 7)',
      chapterTitle: 'General Physical Conditions and Structures Orders: Introduction',
    });
  });
  test('neither an Article nor a Group line is template drift', () => {
    expect(() => dirChapterFromHierarchy(['Subchapter 7. General Industry Safety Orders'])).toThrow(/template drift/);
  });
});
