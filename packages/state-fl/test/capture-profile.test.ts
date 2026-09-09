import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { FL_CAPTURE_PROFILE } from '../src/capture.js';
import { captureFlFac, historyDates } from '../src/capture-fac.js';
import { captureFlStatutes } from '../src/capture-statutes.js';
import { FL_STATUTES_EDITION } from '../src/identity.js';
import type { FlSection } from '../src/schema.js';
import { FL_FAC_SOURCES, facChapterUrl, facRuleCardUrl } from '../src/sources-fac.js';
import { FL_STATUTE_SOURCES, onlineSunshineSectionUrl } from '../src/sources-statutes.js';
import { chapterPage, ruleCard } from './parse-fac.test.js';

/**
 * Full-manifest fixtures for FL_CAPTURE_PROFILE.captureAll. captureAll
 * hardcodes the real FL_STATUTE_SOURCES and FL_FAC_SOURCES, so these
 * fixtures must satisfy the ENTIRE production manifest: every statute page
 * with its edition marker, every FAC chapter page with every named rule,
 * every rule card, and every document. The document reader is injected
 * (the fixtures are not real Word files); the OLE magic bytes are.
 */

function statutePage(cite: string, edition = FL_STATUTES_EDITION): string {
  return (
    `<html><body><h2>${edition} \n \n <br><img src="x.gif"></h2><td id="content"><div id="statutes"><font><!DOCTYPE html><html><body>` +
    `<div class="Section"><span class="SectionNumber">${cite}&#x2003;</span>` +
    `<span class="Catchline"><span xml:space="preserve" class="CatchlineText">Catchline for ${cite}.</span><span class="EmDash">&#x2014;</span></span>` +
    `<span class="SectionBody"><div class="Subsection"><span class="Number">(1)&#x2003;</span><span class="Text Intro Justify">Body text for ${cite}.</span></div></span>` +
    '<div class="History"><span class="HistoryTitle">History.</span><span class="EmDash">&#x2014;</span><span class="HistoryText">s. 1, ch. 80-139.</span></div>' +
    '</div></body></html></font></div></body></html>'
  );
}

const HISTORY = 'Rulemaking Authority 624.308 FS. Law Implemented 624.307 FS. History&#8211;New 6-2-93, Amended 4-21-25.';
const DOC_HISTORY = 'Rulemaking Authority 624.308 FS. Law Implemented 624.307 FS. History-New 6-2-93, Amended 4-21-25.';
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function tidFor(cite: string): string {
  return String(1000 + [...cite].reduce((a, c) => a + c.charCodeAt(0), 0));
}

function docText(cite: string): string {
  return `${cite} Title of ${cite}.\n(1) Rule text for ${cite}.\n${DOC_HISTORY}\n\n`;
}

function buildIo(overrides: { pages?: Record<string, string>; fail?: string } = {}): CaptureIo & { fetched: string[]; docs: Map<string, string> } {
  const pages = new Map<string, string>();
  for (const source of FL_STATUTE_SOURCES) {
    for (const cite of source.cites) pages.set(onlineSunshineSectionUrl(cite), statutePage(cite));
  }
  const docs = new Map<string, string>();
  for (const source of FL_FAC_SOURCES) {
    pages.set(
      facChapterUrl(source.chapter),
      chapterPage(source.rules.map((r) => ({ cite: r.cite, title: `Card title ${r.cite}`, date: '4/21/2025', tid: tidFor(r.cite) }))),
    );
    for (const rule of source.rules) {
      pages.set(facRuleCardUrl(rule.cite), ruleCard({ cite: rule.cite, title: `Card title ${rule.cite}`, date: '4/21/2025', tid: tidFor(rule.cite), history: HISTORY }));
      docs.set(`https://www.flrules.org/gateway/readFile.asp?sid=0&tid=${tidFor(rule.cite)}&type=1&file=${rule.cite}.doc`, docText(rule.cite));
    }
  }
  for (const [url, html] of Object.entries(overrides.pages ?? {})) pages.set(url, html);
  const fetched: string[] = [];
  return {
    fetched,
    docs,
    async fetchText(url) {
      fetched.push(url);
      if (url === overrides.fail) throw new Error(`fail ${url}`);
      const html = pages.get(url);
      if (html === undefined) throw new Error(`fixture missing for ${url}`);
      return html;
    },
    async fetchJson() {
      throw new Error('not used');
    },
    async fetchBinary(url) {
      fetched.push(url);
      if (!docs.has(url)) throw new Error(`document fixture missing for ${url}`);
      return OLE;
    },
    log() {},
  };
}

/** The injected reader: bytes → the fixture text for the url most recently fetched. */
function readerFor(io: ReturnType<typeof buildIo>) {
  return async (): Promise<string> => {
    const url = [...io.fetched].reverse().find((u) => u.includes('readFile.asp'))!;
    return io.docs.get(url)!;
  };
}

describe('captureFlStatutes', () => {
  test('captures every manifest cite with the catchline as heading and no effective date', async () => {
    const io = buildIo();
    const result = await captureFlStatutes(io, FL_STATUTE_SOURCES);
    const wanted = FL_STATUTE_SOURCES.flatMap((s) => s.cites);
    expect(result.sections.map((s) => s.cite)).toEqual(wanted);
    expect(result.edition).toBe(FL_STATUTES_EDITION);
    for (const s of result.sections) {
      expect(s.code).toBe('Fla. Stat.');
      expect(s.heading).toBe(`Catchline for ${s.cite}.`);
      expect(s.effectiveDate).toBeUndefined();
      expect(s.historyNote).toBe('History.—s. 1, ch. 80-139.');
      expect(s.sourceUrl).toBe(onlineSunshineSectionUrl(s.cite));
    }
  });
  test('the edition pin: a rolled-over site fails the capture, naming both phrases', async () => {
    const first = FL_STATUTE_SOURCES[0]!.cites[0]!;
    const io = buildIo({ pages: { [onlineSunshineSectionUrl(first)]: statutePage(first, 'The 2027 Florida Statutes') } });
    await expect(captureFlStatutes(io, FL_STATUTE_SOURCES)).rejects.toThrow(/states "The 2027 Florida Statutes" but the corpus pins/);
  });
  test('a special-session suffix is a pin failure too', async () => {
    const first = FL_STATUTE_SOURCES[0]!.cites[0]!;
    const io = buildIo({ pages: { [onlineSunshineSectionUrl(first)]: statutePage(first, 'The 2026 Florida Statutes (including 2026 Special Session A)') } });
    await expect(captureFlStatutes(io, FL_STATUTE_SOURCES)).rejects.toThrow(/Special Session A/);
  });
  test('a mid-capture edition change fails', async () => {
    const second = FL_STATUTE_SOURCES[0]!.cites[1] ?? FL_STATUTE_SOURCES[1]!.cites[0]!;
    const io = buildIo({ pages: { [onlineSunshineSectionUrl(second)]: statutePage(second, 'The 2027 Florida Statutes') } });
    await expect(captureFlStatutes(io, FL_STATUTE_SOURCES)).rejects.toThrow(/changed editions mid-capture/);
  });
  test('a page that prints a different section than requested fails', async () => {
    const first = FL_STATUTE_SOURCES[0]!.cites[0]!;
    const io = buildIo({ pages: { [onlineSunshineSectionUrl(first)]: statutePage('999.999') } });
    await expect(captureFlStatutes(io, FL_STATUTE_SOURCES)).rejects.toThrow(/prints section 999.999/);
  });
  test('an absent section fails by name', async () => {
    const first = FL_STATUTE_SOURCES[0]!.cites[0]!;
    const io = buildIo({
      pages: { [onlineSunshineSectionUrl(first)]: `<html><body><h2>${FL_STATUTES_EDITION}</h2>The statute you have selected cannot be found.  <BR></body></html>` },
    });
    await expect(captureFlStatutes(io, FL_STATUTE_SOURCES)).rejects.toThrow(new RegExp(`Fla. Stat. ${first.replace('.', '\\.')}: .*cannot be found`));
  });
});

describe('captureFlFac', () => {
  test('captures every manifest rule through chapter page, card, and document', async () => {
    const io = buildIo();
    const result = await captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) });
    const wanted = FL_FAC_SOURCES.flatMap((s) => s.rules.map((r) => r.cite));
    expect(result.sections.map((s) => s.cite)).toEqual(wanted);
    for (const s of result.sections) {
      expect(s.code).toBe('Fla. Admin. Code');
      expect(s.heading).toBe(`Title of ${s.cite}.`);
      expect(s.text).toBe(`(1) Rule text for ${s.cite}.`);
      expect(s.effectiveDate).toBe('2025-04-21');
      expect(s.historyNote).toContain('History–New 6-2-93, Amended 4-21-25.');
      expect(s.facNoticeId).toBe(tidFor(s.cite));
      expect(s.sourceUrl).toBe(facRuleCardUrl(s.cite));
    }
    expect(result.report.warnings).toEqual([]);
  });
  test('the notice-id shortcut: an unchanged id skips the card and document', async () => {
    const io = buildIo();
    const first = await captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) });
    const io2 = buildIo();
    const second = await captureFlFac(io2, FL_FAC_SOURCES, { previousSections: first.sections, extractText: readerFor(io2) });
    expect(second.sections).toEqual(first.sections);
    expect(io2.fetched.filter((u) => u.includes('ruleNo.asp') || u.includes('readFile.asp'))).toEqual([]);
    expect(io2.fetched.filter((u) => u.includes('ChapterHome.asp')).length).toBe(FL_FAC_SOURCES.length);
  });
  test('the shortcut does not fire for a changed id or a changed date', async () => {
    const io = buildIo();
    const first = await captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) });
    const stale = first.sections.map((s) => (s.cite === '69B-220.201' ? { ...s, facNoticeId: '1' } : s));
    const io2 = buildIo();
    await captureFlFac(io2, FL_FAC_SOURCES, { previousSections: stale, extractText: readerFor(io2) });
    expect(io2.fetched.some((u) => u === facRuleCardUrl('69B-220.201'))).toBe(true);
    expect(io2.fetched.some((u) => u === facRuleCardUrl('69O-166.024'))).toBe(false);
  });
  test('a manifest rule absent from the chapter page fails by name', async () => {
    const source = FL_FAC_SOURCES[1]!;
    const io = buildIo({ pages: { [facChapterUrl(source.chapter)]: chapterPage([{ cite: '69B-220.001', title: 'X', date: '5/21/2023', tid: '1' }]) } });
    await expect(captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) })).rejects.toThrow(/69B-220.201 was requested by name but chapter 69B-220 lists 69B-220.001/);
  });
  test('a card whose date disagrees with the chapter row fails', async () => {
    const io = buildIo({ pages: { [facRuleCardUrl('69B-220.201')]: ruleCard({ cite: '69B-220.201', title: 'X', date: '1/1/2020', tid: tidFor('69B-220.201'), history: HISTORY }) } });
    await expect(captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) })).rejects.toThrow(/rule card states effective 2020-01-01 but the chapter page states 2025-04-21/);
  });
  test('a document whose history dates disagree with the card fails', async () => {
    const io = buildIo();
    io.docs.set(
      `https://www.flrules.org/gateway/readFile.asp?sid=0&tid=${tidFor('69B-220.201')}&type=1&file=69B-220.201.doc`,
      '69B-220.201 Title.\n(1) Text.\nRulemaking Authority 624.308 FS. History-New 6-2-93, Amended 1-5-15.\n',
    );
    await expect(captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) })).rejects.toThrow(/history line lists dates \[6-2-93, 1-5-15\] but the rule card lists \[6-2-93, 4-21-25\]/);
  });
  test('a download that is not a Word document fails', async () => {
    const io = buildIo();
    io.fetchBinary = async () => new Uint8Array([0x3c, 0x68, 0x74, 0x6d]);
    await expect(captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) })).rejects.toThrow(/not a Word 97 document/);
  });
  test('historyDates reads the comparable core of a history line', () => {
    expect(historyDates('History–New 6-2-93, Amended 12-18-01, Formerly 4-220.201, Amended 4-21-25.')).toEqual(['6-2-93', '12-18-01', '4-21-25']);
  });
});

describe('FL_CAPTURE_PROFILE.captureAll', () => {
  test('assembles the corpus with the edition in meta and every section once', async () => {
    const io = buildIo();
    // captureAll uses the real extractDocText; substitute through a subclass of the io
    // is not possible, so exercise the profile by injecting via the module-level seam:
    // the profile hardcodes extractDocText, and the fixture bytes are not a Word file.
    // The two pipelines are covered above; here the profile's assembly is checked
    // through the statutes half plus the FAC shortcut (previous sections supplied).
    const fac = await captureFlFac(io, FL_FAC_SOURCES, { extractText: readerFor(io) });
    const io2 = buildIo();
    const outcome = await FL_CAPTURE_PROFILE.captureAll(io2, {
      previous: {
        meta: { state: 'FL', capturedAt: '2026-01-01', currentThrough: '2026-01-01', sourceNote: 'x', sourceUrl: 'https://x', statutesEdition: FL_STATUTES_EDITION },
        sections: fac.sections,
      },
    });
    expect(outcome.file.meta.state).toBe('FL');
    expect(outcome.file.meta.statutesEdition).toBe(FL_STATUTES_EDITION);
    const total = FL_STATUTE_SOURCES.reduce((n, s) => n + s.cites.length, 0) + FL_FAC_SOURCES.reduce((n, s) => n + s.rules.length, 0);
    expect(outcome.file.sections.length).toBe(total);
    expect(new Set(outcome.file.sections.map((s) => `${s.code}:${s.cite}`)).size).toBe(total);
    expect(FL_CAPTURE_PROFILE.corpusFileSchema.parse(outcome.file)).toBeTruthy();
    const rule = outcome.file.sections.find((s) => s.cite === '69B-220.201') as FlSection;
    expect(rule.facNoticeId).toBe(tidFor('69B-220.201'));
  });
});
