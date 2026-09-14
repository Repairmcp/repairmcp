import { describe, expect, test } from 'bun:test';
import { PacodeParseError, parsePacodeChapterHtml } from '../src/parse-pacode.js';

const CURRENCY = '56 Pa.B. 4026 (July 4, 2026)';

type PacodeSectionEntry =
  | { cite: string; heading: string; body: string[]; authority?: string; source?: string; decisions?: string[]; crossRefs?: string[] }
  /**
   * A whole-RANGE reserved block ("§ § 231.91—231.99. {Reserved}.") — real
   * chapter 231 markup, line ~1495 of pacode-034-231-toc.html, mirrored
   * exactly: double §, hyphen-joined cite pair passed pre-encoded by the
   * caller (e.g. "231.91&#151;231.99"), curly-brace "{Reserved}". Added for
   * review round 1, Finding 3.
   */
  | { rangeReserved: string };

function isRangeReserved(s: PacodeSectionEntry): s is { rangeReserved: string } {
  return 'rangeReserved' in s;
}

/** A pacodeandbulletin.gov chapter page in the real markup: currency sentence, chapter TOC, chapter-level Source, one h4 per section, unclosed <p>, CENTER labels. */
export function pacodeChapterPage(opts: {
  title: number; chapter: number; currency?: string | null; chapterSource?: string[];
  sections: PacodeSectionEntry[];
}): string {
  const currency = opts.currency === undefined ? CURRENCY : opts.currency;
  let html = `<!DOCTYPE html><html><head><meta http-equiv="content-type" content="text/html; charset=UTF-8"><title>${opts.title} Pa. Code Chapter ${opts.chapter}. Title</title></head><body>`;
  if (currency) html += `<p class="leftpaneltextmobile">The <em><strong>Pennsylvania Code</strong></em> website reflects the <em>Pennsylvania Code</em> changes effective through ${currency}.</p>`;
  html += `<h2>CHAPTER ${opts.chapter}. TITLE</h2><p>Sec.`;
  for (const s of opts.sections) {
    if (isRangeReserved(s)) continue;
    html += `<br/><A HREF="#${s.cite}.">${s.cite}.</A>&nbsp;&nbsp;&nbsp;&nbsp;${s.heading}`;
  }
  if (opts.chapterSource) {
    html += `<p><CENTER><B>Source</B></CENTER></P>`;
    for (const line of opts.chapterSource) html += `<p>&nbsp;&nbsp;&nbsp;${line}<br/>`;
  }
  for (const s of opts.sections) {
    if (isRangeReserved(s)) {
      html += `<a name="${s.rangeReserved}."></a><h4 class="pacode-section-title"><FONT SIZE=+1>&#167;&nbsp;&#167;&nbsp;${s.rangeReserved}.&nbsp;</FONT>&#123;Reserved&#125;.</H4><br/>\n`;
      continue;
    }
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
  test('absence is tested BEFORE currency: a File-not-found page with no currency sentence still names the absence', () => {
    expect(() => parsePacodeChapterHtml('<html><body><p>File not found. Please go back and try again.</p></body></html>', { title: 31, chapter: 999 }))
      .toThrow(/Chapter 999 of Title 31: the site answers "File not found"/);
  });
});

describe('parsePacodeChapterHtml — review round 1 fixes', () => {
  test('the preamble fallback also fires on a Subchapter-named adoption line, not only "Chapter N"', () => {
    const html = pacodeChapterPage({
      title: 34, chapter: 9,
      chapterSource: [
        'The provisions of this Subchapter A issued under section 3 of the act of July 14, 1961 (P. L. 637, No. 329) Wage Payment and Collection Law(43 P. S. § 260.3), unless otherwise noted.',
        'The provisions of this Subchapter A adopted August 26, 1961; amended through September 1, 1969, unless otherwise noted.',
      ],
      sections: [{ cite: '9.1', heading: 'Authorized deductions.', body: ['x'] }],
    });
    const r = parsePacodeChapterHtml(html, { title: 34, chapter: 9 });
    expect(r.chapterSourceLines).toEqual([
      'The provisions of this Subchapter A issued under section 3 of the act of July 14, 1961 (P. L. 637, No. 329) Wage Payment and Collection Law(43 P. S. § 260.3), unless otherwise noted.',
      'The provisions of this Subchapter A adopted August 26, 1961; amended through September 1, 1969, unless otherwise noted.',
    ]);
  });

  test("a section's own Source line does not absorb the NEXT subchapter's own Authority/Source block sitting in the same chunk", () => {
    // Mirrors the real chapter 9 page: 9.4 is Subchapter A's last section; its
    // own Source note is followed, still ahead of the 9.11 head, by
    // Subchapter B's Authority + Source lines (real lines ~758, ~764).
    const html = `<!DOCTYPE html><html><head><meta http-equiv="content-type" content="text/html; charset=UTF-8"></head><body>`
      + `<p class="leftpaneltextmobile">changes effective through ${CURRENCY}.</p>`
      + `<a name="9.4."></a><h4 class="pacode-section-title"><FONT SIZE=+1>&#167;&nbsp;9.4.&nbsp;</FONT>Common carriers by railroad.</H4>\n`
      + `<p>&nbsp;(a)&nbsp;&nbsp;Every common carrier by railroad shall furnish the listing.\n\n\n`
      + `<p><CENTER><B>Source</B></CENTER></P>\n`
      + `<p>&nbsp;&nbsp;&nbsp;The provisions of this &#167;&nbsp;&nbsp;9.4 adopted November 24, 1978, 8 Pa.B. 3337.<br/>\n`
      + `<p><CENTER><B>Cross References</B></CENTER></P>\n`
      + `<p>&nbsp;&nbsp;&nbsp;This section cited in 34 Pa. Code &#167;&nbsp;&nbsp;31.52 (relating to administration&#151;general).\n`
      + `<p><CENTER><B>Authority</B></CENTER></P>\n`
      + `<p>&nbsp;&nbsp;&nbsp;The provisions of this Subchapter B issued under section 27 of the act of July 31, 1941 (P. L. 616, No. 261) (43 P. S. &#167;&nbsp;&nbsp;561), unless otherwise noted.<br/>\n`
      + `<p><CENTER><B>Source</B></CENTER></P>\n`
      + `<p>&nbsp;&nbsp;&nbsp;The provisions of this Subchapter B adopted July 1, 1968; amended April 19, 1974, 4&nbsp;Pa. B. 763, unless otherwise noted.\n`
      + `<a name="9.11."></a><h4 class="pacode-section-title"><FONT SIZE=+1>&#167;&nbsp;9.11.&nbsp;</FONT>Definitions.</H4>\n`
      + `<p>&nbsp;(a)&nbsp;&nbsp;The following words and terms have the following meanings.\n\n\n`
      + `</body></html>`;
    const r = parsePacodeChapterHtml(html, { title: 34, chapter: 9 });
    const s9_4 = r.sections.find((s) => s.cite === '9.4')!;
    expect(s9_4.sourceLines).toEqual(['The provisions of this § 9.4 adopted November 24, 1978, 8 Pa.B. 3337.']);
    expect(s9_4.sourceLines.join(' ')).not.toContain('Subchapter B');
    const s9_11 = r.sections.find((s) => s.cite === '9.11')!;
    expect(s9_11.text).toBe('(a) The following words and terms have the following meanings.');
  });

  test('exact-cite scoping: a "this § 9.41" line inside 9.4\'s own chunk is not attributed to 9.4', () => {
    const html = `<!DOCTYPE html><html><head><meta http-equiv="content-type" content="text/html; charset=UTF-8"></head><body>`
      + `<p class="leftpaneltextmobile">changes effective through ${CURRENCY}.</p>`
      + `<a name="9.4."></a><h4 class="pacode-section-title"><FONT SIZE=+1>&#167;&nbsp;9.4.&nbsp;</FONT>Common carriers by railroad.</H4>\n`
      + `<p>&nbsp;(a)&nbsp;&nbsp;Every common carrier by railroad shall furnish the listing.\n\n\n`
      + `<p><CENTER><B>Source</B></CENTER></P>\n`
      + `<p>&nbsp;&nbsp;&nbsp;The provisions of this &#167;&nbsp;&nbsp;9.4 adopted November 24, 1978, 8 Pa.B. 3337.<br/>\n`
      + `<p><CENTER><B>Authority</B></CENTER></P>\n`
      + `<p>&nbsp;&nbsp;&nbsp;The provisions of this &#167;&nbsp;&nbsp;9.41 adopted January 1, 2000, effective January 2, 2000, 30 Pa.B. 1.<br/>\n`
      + `<a name="9.11."></a><h4 class="pacode-section-title"><FONT SIZE=+1>&#167;&nbsp;9.11.&nbsp;</FONT>Definitions.</H4>\n`
      + `<p>&nbsp;x\n\n\n`
      + `</body></html>`;
    const r = parsePacodeChapterHtml(html, { title: 34, chapter: 9 });
    const s9_4 = r.sections.find((s) => s.cite === '9.4')!;
    expect(s9_4.sourceLines).toEqual(['The provisions of this § 9.4 adopted November 24, 1978, 8 Pa.B. 3337.']);
  });

  test('a whole-range reserved head ("§ § 231.91—231.99. {Reserved}.") produces no section and does not break its neighbors', () => {
    const page231 = pacodeChapterPage({
      title: 34, chapter: 231,
      sections: [
        { cite: '231.85', heading: 'Outside salesman.', body: ['An outside salesman is exempt from this subchapter.'] },
        { rangeReserved: '231.91&#151;231.99' },
        { cite: '231.101a', heading: 'Minimum wage increase.', body: ['The minimum wage rate is increased as follows.'] },
      ],
    });
    const r = parsePacodeChapterHtml(page231, { title: 34, chapter: 231 });
    expect(r.sections.map((s) => s.cite)).toEqual(['231.85', '231.101a']);
    expect(r.sections[0]!.text).toBe('An outside salesman is exempt from this subchapter.');
    expect(r.sections[1]!.text).toBe('The minimum wage rate is increased as follows.');
  });
});
