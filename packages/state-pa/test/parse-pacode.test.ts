import { describe, expect, test } from 'bun:test';
import { PacodeParseError, parsePacodeChapterHtml } from '../src/parse-pacode.js';

const CURRENCY = '56 Pa.B. 4026 (July 4, 2026)';

/** A pacodeandbulletin.gov chapter page in the real markup: currency sentence, chapter TOC, chapter-level Source, one h4 per section, unclosed <p>, CENTER labels. */
export function pacodeChapterPage(opts: {
  title: number; chapter: number; currency?: string | null; chapterSource?: string[];
  sections: Array<{ cite: string; heading: string; body: string[]; authority?: string; source?: string; decisions?: string[]; crossRefs?: string[] }>;
}): string {
  const currency = opts.currency === undefined ? CURRENCY : opts.currency;
  let html = `<!DOCTYPE html><html><head><meta http-equiv="content-type" content="text/html; charset=UTF-8"><title>${opts.title} Pa. Code Chapter ${opts.chapter}. Title</title></head><body>`;
  if (currency) html += `<p class="leftpaneltextmobile">The <em><strong>Pennsylvania Code</strong></em> website reflects the <em>Pennsylvania Code</em> changes effective through ${currency}.</p>`;
  html += `<h2>CHAPTER ${opts.chapter}. TITLE</h2><p>Sec.`;
  for (const s of opts.sections) html += `<br/><A HREF="#${s.cite}.">${s.cite}.</A>&nbsp;&nbsp;&nbsp;&nbsp;${s.heading}`;
  if (opts.chapterSource) {
    html += `<p><CENTER><B>Source</B></CENTER></P>`;
    for (const line of opts.chapterSource) html += `<p>&nbsp;&nbsp;&nbsp;${line}<br/>`;
  }
  for (const s of opts.sections) {
    html += `<a name="${s.cite}."></a><h4 class="pacode-section-title"><FONT SIZE=+1>&#167;&nbsp;${s.cite}.&nbsp;</FONT>${s.heading}</H4>\n`;
    for (const line of s.body) html += `<p>&nbsp;${line}\n\n\n`;
    if (s.authority) html += `<p><CENTER><B>Authority</B></CENTER></P>\n<p>&nbsp;&nbsp;&nbsp;${s.authority}<br/>\n`;
    if (s.source) html += `<p><CENTER><B>Source</B></CENTER></P>\n<p>&nbsp;&nbsp;&nbsp;${s.source}<br/>\n`;
    if (s.decisions) { html += `<p><CENTER><B>Notes of Decisions</B></CENTER></P>\n`; for (const d of s.decisions) html += `<p>&nbsp;&nbsp;&nbsp;${d}<br/>\n`; }
    if (s.crossRefs) { html += `<p><CENTER><B>Cross References</B></CENTER></P>\n`; for (const c of s.crossRefs) html += `<p>&nbsp;&nbsp;&nbsp;${c}<br/>\n`; }
  }
  return `${html}</body></html>`;
}

const page = pacodeChapterPage({
  title: 31, chapter: 146,
  chapterSource: ['The provisions of this Chapter 146 issued under The Insurance Company Law of 1921, unless otherwise noted.', 'The provisions of this Chapter 146 adopted December 15, 1978, effective December 16, 1978, 8 Pa.B. 3575, unless otherwise noted.'],
  sections: [
    { cite: '146.1', heading: 'Scope.', body: ['This chapter defines certain minimum standards.'], source: 'The provisions of this § 146.1 adopted December 15, 1978, effective December 16, 1978, 8 Pa.B. 3575.', decisions: ['Plaintiffs claim was dismissed. Smith v. Nationwide, 935 F. Supp. 616 (W.D. Pa. 1996).'] },
    { cite: '146.7', heading: 'Standards for prompt, fair and equitable settlements applicable to insurers.', body: ['(a)&nbsp;&nbsp;Acceptance or denial of a claim shall comply with the following:', '&nbsp;&nbsp;(1)&nbsp;&nbsp;Within 15 working days after receipt by the insurer of properly executed proofs of loss, the first-party claimant shall be advised.'], authority: 'The provisions of this § 146.7 issued under the Unfair Insurance Practices Act (40 P. S. § § 1171.1&#151;1171.15).', source: 'The provisions of this § 146.7 adopted December 15, 1978, effective December 16, 1978, 8 Pa.B. 3575; amended May 21, 1982, effective May 22, 1982, 12 Pa.B. 1639. Immediately preceding text appears at serial pages (39830) and (48154).', crossRefs: ['This section cited in 31 Pa. Code § 146.2 (relating to definitions).'] },
    { cite: '146.11', heading: '[Reserved].', body: [] },
  ],
});

describe('parsePacodeChapterHtml', () => {
  test('currency sentence, chapter-level Source lines, one section per h4 with cite and heading', () => {
    const r = parsePacodeChapterHtml(page, { title: 31, chapter: 146 });
    expect(r.currency).toBe(CURRENCY);
    expect(r.chapterSourceLines).toEqual(['The provisions of this Chapter 146 issued under The Insurance Company Law of 1921, unless otherwise noted.', 'The provisions of this Chapter 146 adopted December 15, 1978, effective December 16, 1978, 8 Pa.B. 3575, unless otherwise noted.']);
    expect(r.sections.map((s) => s.cite)).toEqual(['146.1', '146.7', '146.11']);
    expect(r.sections[1]!.heading).toBe('Standards for prompt, fair and equitable settlements applicable to insurers.');
  });
  test('body is one paragraph per line with the leading indentation collapsed; labeled blocks are not text', () => {
    const r = parsePacodeChapterHtml(page, { title: 31, chapter: 146 });
    expect(r.sections[1]!.text).toBe('(a) Acceptance or denial of a claim shall comply with the following:\n(1) Within 15 working days after receipt by the insurer of properly executed proofs of loss, the first-party claimant shall be advised.');
    expect(r.sections[0]!.text).toBe('This chapter defines certain minimum standards.');
    expect(r.sections[0]!.text).not.toContain('Smith v. Nationwide');
    expect(r.sections[1]!.text).not.toContain('This section cited');
  });
  test('Source lines are kept per section (authority and history both), with cp1252 entities decoded', () => {
    const r = parsePacodeChapterHtml(page, { title: 31, chapter: 146 });
    expect(r.sections[1]!.sourceLines).toEqual([
      'The provisions of this § 146.7 issued under the Unfair Insurance Practices Act (40 P. S. § § 1171.1—1171.15).',
      'The provisions of this § 146.7 adopted December 15, 1978, effective December 16, 1978, 8 Pa.B. 3575; amended May 21, 1982, effective May 22, 1982, 12 Pa.B. 1639. Immediately preceding text appears at serial pages (39830) and (48154).',
    ]);
    expect(r.sections[0]!.sourceLines.length).toBe(1);
  });
  test('a [Reserved] section is flagged', () => {
    expect(parsePacodeChapterHtml(page, { title: 31, chapter: 146 }).sections[2]!.reserved).toBe(true);
  });
  test('a missing currency sentence refuses the page', () => {
    expect(() => parsePacodeChapterHtml(pacodeChapterPage({ title: 31, chapter: 146, currency: null, sections: [{ cite: '146.1', heading: 'Scope.', body: ['x'] }] }), { title: 31, chapter: 146 })).toThrow(/currency/);
  });
  test('absence (HTTP 200 + File not found) and a head outside the chapter fail by name', () => {
    expect(() => parsePacodeChapterHtml('<html><body><p class="leftpaneltextmobile">changes effective through 56 Pa.B. 4026 (July 4, 2026).</p><p>File not found. Please go back and try again.</p></body></html>', { title: 31, chapter: 999 })).toThrow(/File not found/);
    expect(() => parsePacodeChapterHtml(page, { title: 31, chapter: 62 })).toThrow(PacodeParseError);
  });
});
