// packages/state-co/test/parse-crs.test.ts
import { describe, expect, test } from 'bun:test';
import { parseCrsIndexCurrency, parseCrsTitleHtml } from '../src/parse-crs.js';

/**
 * REAL SLICES from olls.info/crs/crs2026-title-42.htm and the OLLS download
 * index, saved by the first Colorado capture (2026-08-31). The task-4 fixtures
 * were an idealised `<p><b>42-9-104. Catchline.</b></p>` shape; the real files
 * are 7.6 MB of Word-filtered HTML and differ in three ways that each broke
 * the parser:
 *
 *  1. They are windows-1252 and declare it only in a meta tag. The NBSPs below
 *     (U+00A0, between the section number and its catchline) arrived as U+FFFD
 *     under the fetch spec's unconditional UTF-8 decode, and the splitter
 *     matched nothing at all. Fixed in makeCaptureIo; the fixtures here are
 *     what a correct decode produces.
 *  2. Every section number is printed TWICE — once in its article's table of
 *     contents and once as the section head — and the tables of contents are
 *     interleaved between articles. Both render identical text; only the head
 *     sets the number in bold.
 *  3. `(Repealed)` is usually appended to a surviving catchline
 *     ("Copies of law published. (Repealed)"), not the whole catchline.
 */

const NBSP = ' ';
const TIMES = `style='font-family:"Times New Roman",serif'`;

/** An article table-of-contents entry: number and catchline, no emphasis. */
const tocEntry = (cite: string, catchline: string): string =>
  `<p class=MsoNormal style='margin-left:1.25in;text-indent:-1.25in'><span\r\n${TIMES}>${cite}.</span>` +
  `${NBSP.repeat(11)} <span\r\n${TIMES}>${catchline}</span></p>`;

/** A section head: the number is bold, and so is the catchline. */
const sectionHead = (cite: string, catchline: string): string =>
  `<p class=MsoNormal style='text-indent:.15in;page-break-after:avoid'><b><span\r\n${TIMES}>${cite}.</span></b><span\r\n` +
  `${TIMES}>${NBSP.repeat(4)}<b>${catchline}</b>${NBSP.repeat(2)}</span></p>`;

const para = (text: string): string =>
  `<p class=MsoNormal style='text-align:justify;text-indent:.15in'><span ${TIMES}>${text}</span></p>`;

const TITLE_42 = `<html><head>
<meta http-equiv=Content-Type content="text/html; charset=windows-1252">
</head><body lang=EN-US>
${tocEntry('42-9-103', 'Applicability.')}
${tocEntry('42-9-104', 'When consent and estimate required\r\n- original transaction - disassembly.')}
${tocEntry('42-9-105', 'When consent and estimate required - additional repairs.')}
${tocEntry('42-1-209', 'Copies of law published. (Repealed)')}
${sectionHead('42-9-104', 'When consent and estimate\r\nrequired - original transaction - disassembly.')}
${para(`(1) (a)${NBSP.repeat(3)}\r\nNo repairs on a motor vehicle shall be performed by a motor vehicle repair facility unless the facility obtains the written consent of the customer.`)}
${para(`(b)${NBSP.repeat(4)}The required written consent is waived by the customer only when the motor vehicle has been towed.`)}
${para('Source: L. 94: Entire title amended with relocations, p. 2501, § 1, effective January 1, 1995.')}
${para("Editor's note: This section is similar to former section 42-9-104 as it existed prior to 1994.")}
${para('ANNOTATION')}
${para('Applied in People v. Smith, 620 P.2d 232 (Colo. 1980).')}
${sectionHead('42-1-209', 'Copies of law published. (Repealed)')}
${para('Source: L. 2005: Entire section repealed, p. 1174, § 6, effective August 8.')}
${sectionHead('42-9-108.5', 'Warranty completion date.')}
${para('Text of the point five section.')}
${para('Source: L. 91: Entire section added.')}
</body></html>`;

/**
 * The real currency sentence from the OLLS download index. It has no "The
 * statutes are" lead-in, opens with a capital C, and the page's masthead
 * carries a decoy "Second Regular Session | 75th General Assembly" that an
 * unbounded pattern could stitch into a false match.
 */
const INDEX = `
<html><body>
<div class="masthead">Second Regular Session | 75th General Assembly</div>
<p>Current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="https://olls.info/crs/crs2026-title-06.htm">Title 6</a>
<a href="https://olls.info/crs/crs2026-title-08.htm">Title 8</a>
<a href="https://olls.info/crs/crs2026-title-10.htm">Title 10</a>
<a href="https://olls.info/crs/crs2026-title-42.htm">Title 42</a>
<a href="https://olls.info/crs/crs2026-title-42.pdf">Title 42 (PDF)</a>
</body></html>`;

describe('parseCrsTitleHtml', () => {
  const parsed = parseCrsTitleHtml(TITLE_42, { title: 42 });

  test('table-of-contents entries are not sections — only the bold heads are', () => {
    expect(parsed.sections.map((s) => s.cite)).toEqual(['42-9-104', '42-1-209', '42-9-108.5']);
  });
  test('heading is the catchline as printed, rejoined across the source line break', () => {
    expect(parsed.sections[0]!.heading).toBe(
      'When consent and estimate required - original transaction - disassembly.',
    );
  });
  test('body keeps subsection numbering, one paragraph per line', () => {
    expect(parsed.sections[0]!.text).toBe(
      '(1) (a) No repairs on a motor vehicle shall be performed by a motor vehicle repair facility ' +
        'unless the facility obtains the written consent of the customer.\n' +
        '(b) The required written consent is waived by the customer only when the motor vehicle has been towed.',
    );
  });
  test('the Source line becomes historyNote; annotation blocks are dropped', () => {
    expect(parsed.sections[0]!.historyNote).toBe(
      'Source: L. 94: Entire title amended with relocations, p. 2501, § 1, effective January 1, 1995.',
    );
    expect(parsed.sections[0]!.text).not.toContain("Editor's note");
    expect(parsed.sections[0]!.text).not.toContain('620 P.2d 232');
  });
  test('the section sign survives — it is windows-1252 0xA7 in the real file', () => {
    expect(parsed.sections[0]!.historyNote).toContain('§ 1');
  });
  test('(Repealed) appended to a surviving catchline is still repealed', () => {
    expect(parsed.sections[1]!.cite).toBe('42-1-209');
    expect(parsed.sections[1]!.repealed).toBe(true);
    expect(parsed.sections[0]!.repealed).toBe(false);
  });
  test('point-five cites parse', () => {
    expect(parsed.sections[2]!.cite).toBe('42-9-108.5');
  });
  test('no warnings on the real shape — every live section has text and a Source line', () => {
    expect(parsed.warnings).toEqual([]);
  });
  test('a wrong-title cite hard-fails', () => {
    expect(() => parseCrsTitleHtml(TITLE_42, { title: 10 })).toThrow(/title/i);
  });
  test('an empty page hard-fails', () => {
    expect(() => parseCrsTitleHtml('<html><body></body></html>', { title: 42 })).toThrow();
  });
  test('a file where nothing reads as a table of contents hard-fails rather than doubling', () => {
    // If the bold convention ever goes away, every TOC line would be captured
    // as a section with no text. Recognising zero TOC entries is the tripwire.
    const headsOnly = `<html><body>${sectionHead('42-9-104', 'X.')}${para('Body.')}${para('Source: L. 94.')}</body></html>`;
    expect(() => parseCrsTitleHtml(headsOnly, { title: 42 })).toThrow(/table-of-contents/i);
  });
  test('a cite published twice as a head is reported, not silently collapsed', () => {
    const twice = `<html><body>
      ${tocEntry('6-1-1701', 'Definitions.')}
      ${sectionHead('6-1-1701', 'Definitions.')}${para('First text.')}
      ${sectionHead('6-1-1701', 'Definitions.')}${para('Second text.')}
    </body></html>`;
    const { warnings } = parseCrsTitleHtml(twice, { title: 6 });
    expect(warnings.some((w) => /more than once/i.test(w) && w.includes('6-1-1701'))).toBe(true);
  });
});

describe('parseCrsIndexCurrency', () => {
  const idx = parseCrsIndexCurrency(INDEX);

  test('reports the currency sentence the page actually prints', () => {
    expect(idx.currencyNote).toBe(
      'Current with the changes made by amendments, additions, and repeals to Colorado Revised ' +
        'Statutes by the Seventy-fifth General Assembly at its Second Regular Session in 2026.',
    );
    expect(idx.editionYear).toBe('2026');
  });
  test('the masthead is not mistaken for the currency sentence', () => {
    expect(idx.currencyNote).not.toContain('75th General Assembly');
  });
  test('title hrefs come from the index, zero padding and all — never derived', () => {
    expect(idx.titleHrefs.get(6)).toBe('https://olls.info/crs/crs2026-title-06.htm');
    expect(idx.titleHrefs.get(8)).toBe('https://olls.info/crs/crs2026-title-08.htm');
    expect(idx.titleHrefs.get(42)).toBe('https://olls.info/crs/crs2026-title-42.htm');
  });
  test('a page without the currency sentence hard-fails', () => {
    expect(() => parseCrsIndexCurrency('<html><body>nope</body></html>')).toThrow(/curren/i);
  });
});
