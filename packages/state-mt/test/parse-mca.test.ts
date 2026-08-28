import { describe, expect, test } from 'bun:test';
import { McaParseError, parseMcaIndexPage, parseMcaSectionPage } from '../src/parse-mca.js';

/**
 * Fixtures mirror the live mca.legmt.gov markup, verified against raw bytes
 * 2026-08-27 (saved copies in the capture scratchpad): the edition h1, the
 * classed section-header, section-content with line-indent paragraphs whose
 * first paragraph carries the catchline (citation span + em-space + heading
 * inline with the opening text), the sibling history-doc div, and the part
 * index's li.line rows including reserved and repealed slots.
 */

const SECTION_FIXTURE = `<html><head><title>33-18-201. Unfair claim settlement practices prohibited, MCA</title></head>
<body class="section-doc">
<nav class="navbar">nav here</nav>
<ol class="breadcrumb"><li><a href="../../../../index.html">MCA Contents</a></li></ol>
<div class="mca-content mca-toc">
  <h1>Montana Code Annotated 2025</h1>
  <div class="section-header">
    <h4 class="section-title-title">
      TITLE 33. INSURANCE AND INSURANCE COMPANIES
    </h4>
    <h3 class="section-chapter-title">
      CHAPTER 18. UNFAIR TRADE PRACTICES
    </h3>
    <h2 class="section-part-title">
      Part 2. Insurer's Relations With Insured and Claimant
    </h2>
    <h1 class="section-section-title">
      Unfair Claim Settlement Practices Prohibited
    </h1>
  </div>
  <div class="section-doc" id="mca_0330-0180-0020-0010">
        <div class="section-content">
            <p class="line-indent">
                <span class="catchline"><span class="citation">33-18-201</span>.&#8195;Unfair claim settlement practices prohibited.</span> A person may not, with such frequency as to indicate a general business practice, do any of the following:
            </p>
            <p class="line-indent">
                (1)\tmisrepresent pertinent facts or insurance policy provisions relating to coverages at issue;
            </p>
            <p class="line-indent">
                (2)\tfail to acknowledge and act reasonably promptly upon communications, as required by <a href="../../../chapter_0150/part_0110/section_0260/0330-0150-0110-0260.html"><span class="citation">33-15-1126</span></a>.
            </p>
        </div>
    </div><div class="history-doc" id="mca_0330-0180-0020-0010_hist">
    <div class="history-content">
      <p class="line-indent">
        <span class="header">History:</span>&#8195;En. 40-3502.1 by Sec. 1, Ch. 320, L. 1977; R.C.M. 1947, 40-3502.1; amd. Sec. 1206, Ch. 56, L. 2009; amd. Sec. 3, Ch. 229, L. 2025.</p>
    </div>
  </div>
</div>
<footer class="mca-footer"><p><span class="text-bold">Disclaimer:</span> The Internet version of the Montana Code Annotated is provided as a research tool. In case of inconsistencies the printed version will prevail.</p></footer>
</body></html>`;

const INDEX_FIXTURE = `<html><body class="sections-index">
<div class="mca-content"><h1>Montana Code Annotated 2025</h1>
<ul class="section-list">
      <li class="line">
        <a href="./section_0010/0330-0180-0020-0010.html"><span class="citation">33-18-201</span>&nbsp;Unfair claim settlement practices prohibited</a>
      </li>
      <li class="line">
        <a href="./section_0200/0330-0180-0020-0200.html"><span class="citation">33-18-220</span>&nbsp;reserved</a>
      </li>
      <li class="line">
        <a href="./section_0210/0330-0180-0020-0210.html"><span class="citation">33-18-221</span>&nbsp;Designation of specific repair shops prohibited -- lists allowed</a>
      </li>
      <li class="line">
        <a href="./section_0240/0330-0180-0020-0240.html"><span class="citation">33-18-224</span>&nbsp;Designation of specific automobile body repair businesses prohibited</a>
      </li>
      <li class="line">
        <a href="./section_0260/0330-0180-0020-0260.html"><span class="citation">33-18-226</span>&nbsp;through 33-18-230 reserved</a>
      </li>
      <li class="line">
        <a href="./section_0300/0330-0180-0020-0300.html"><span class="citation">33-18-234</span>&nbsp;Repealed</a>
      </li>
</ul></div></body></html>`;

describe('parseMcaSectionPage', () => {
  const parsed = () => parseMcaSectionPage(SECTION_FIXTURE, { expectedCite: '33-18-201' });

  test('extracts cite, heading, and the edition marker', () => {
    const section = parsed();
    expect(section.cite).toBe('33-18-201');
    expect(section.heading).toBe('Unfair claim settlement practices prohibited.');
    expect(section.edition).toBe('Montana Code Annotated 2025');
  });

  test('text is verbatim, one paragraph per line, catchline inline as printed', () => {
    const lines = parsed().text.split('\n');
    expect(lines[0]).toBe(
      '33-18-201. Unfair claim settlement practices prohibited. A person may not, with such frequency as to indicate a general business practice, do any of the following:',
    );
    expect(lines[1]).toBe(
      '(1) misrepresent pertinent facts or insurance policy provisions relating to coverages at issue;',
    );
    // Cross-reference link text survives tag stripping.
    expect(lines[2]).toContain('as required by 33-15-1126.');
    // Neither the history line nor the footer leaks into the text.
    expect(parsed().text).not.toContain('History:');
    expect(parsed().text).not.toContain('printed version');
  });

  test('history note is stored verbatim; the chapter title is read from the page', () => {
    const section = parsed();
    expect(section.historyNote).toBe(
      'History: En. 40-3502.1 by Sec. 1, Ch. 320, L. 1977; R.C.M. 1947, 40-3502.1; amd. Sec. 1206, Ch. 56, L. 2009; amd. Sec. 3, Ch. 229, L. 2025.',
    );
    expect(section.pageChapterTitle).toBe('UNFAIR TRADE PRACTICES');
  });

  test('a cite mismatch throws — the slot-URL race tripwire', () => {
    expect(() => parseMcaSectionPage(SECTION_FIXTURE, { expectedCite: '33-18-202' })).toThrow(
      McaParseError,
    );
  });

  test('a page without the edition marker throws — the currency tripwire', () => {
    const stripped = SECTION_FIXTURE.replace('<h1>Montana Code Annotated 2025</h1>', '');
    expect(() => parseMcaSectionPage(stripped, { expectedCite: '33-18-201' })).toThrow(
      /edition/i,
    );
  });

  test('a repealed catchline is flagged', () => {
    const repealed = SECTION_FIXTURE.replace(
      '.&#8195;Unfair claim settlement practices prohibited.</span> A person may not, with such frequency as to indicate a general business practice, do any of the following:',
      '.&#8195;Repealed.</span> Sec. 5, Ch. 100, L. 2021.',
    );
    expect(parseMcaSectionPage(repealed, { expectedCite: '33-18-201' }).repealed).toBe(true);
  });
});

describe('parseMcaIndexPage', () => {
  test('maps live cites to their slot URLs and skips reserved and repealed rows', () => {
    const { entries, skipped } = parseMcaIndexPage(INDEX_FIXTURE);
    expect(entries.map((e) => e.cite)).toEqual(['33-18-201', '33-18-221', '33-18-224']);
    expect(entries[0]!.href).toBe('./section_0010/0330-0180-0020-0010.html');
    expect(entries[2]!.title).toBe(
      'Designation of specific automobile body repair businesses prohibited',
    );
    expect(skipped).toEqual(['33-18-220', '33-18-226', '33-18-234']);
  });

  test('a page with no rows throws', () => {
    expect(() => parseMcaIndexPage('<html><body>nothing</body></html>')).toThrow(McaParseError);
  });
});
