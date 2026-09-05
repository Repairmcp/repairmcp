import { describe, expect, test } from 'bun:test';
import { parseDirTitle8Html } from '../src/parse-dir.js';

const CHROME =
  '<html><body><div class="t8_content"><div style="border:1px"><div>This information is provided free of charge by the Department of Industrial Relations.</div></div>' +
  '<span id="start-main-content">&nbsp;</span>';

/** The old markup generation (8 CCR 5446 as fetched 2026-09-04). */
const OLD_PAGE =
  CHROME +
  '<div class="chapter-article">Subchapter 7. General Industry Safety Orders<br> Group 20. Flammable Liquids, Gases and Vapors <BR> Article 137. Spray Coating Operations </div>' +
  '<table style="width:80%;"><TR><TD><a href="/title8/index/T8index.asp">Return to index</a><br><a href="/samples/search/query.htm">New query</a></TD></TR></TABLE><hr />' +
  '<h1> &#167;5446. Spray Booths. </h1><hr />' +
  '<P> (a) Spray booths and connected ductwork shall be substantially constructed of steel.' +
  '<P> (h) Spray booths shall be so installed that all portions are readily accessible for cleaning. A clear space of not less than three feet on all sides shall be kept free from storage or combustible construction.' +
  '<P>NOTE: This does not preclude the installation of a spray booth against a partition or wall having a one hour fire resistance rating.' +
  '<P>NOTE: Authority cited: Section 142.3, Labor Code. Reference: Section 142.3, Labor Code. <P> HISTORY' +
  '<P>1. Amendment filed 7-16-76; effective thirtieth day thereafter (Register 76, No. 29).' +
  '<P>2. Amendment of subsection (h) filed 12-5-86; effective thirtieth day thereafter (Register 86, No. 51).' +
  '<p><A HREF="sb7g20a137.html"><IMG SRC="/Images/arrow_marble_left.gif" alt="Go Back">Go Back to Article 137 Table of Contents</A><br><br><table><tr><td></td></tr></table></div></body></html>';

/** The new markup generation (8 CCR 5144 as fetched 2026-09-04). */
const NEW_PAGE =
  CHROME +
  '<div class="chapter-article">Subchapter 7. General Industry Safety Orders <br /> Group 16. Control of Hazardous Substances <br /> Article 107. Dusts, Fumes, Mists, Vapors and Gases </div>' +
  '<p><a href="/title8/index/T8index.asp">Return to index</a> <br /> <a href="/samples/search/query.htm">New query</a></p><hr />' +
  '<h1>&#167;5144. Respiratory Protection.</h1>' +
  '<div style="margin:-4px 0 18px 12px;"><a href="/DOSH/x.pdf">Guide to Respiratory Protection at Work</a></div><hr />' +
  '<div class="co_contentBlock co_section"><div class="co_paragraph"><div class="co_paragraphText">(a) Permissible practice.</div></div>' +
  '<div class="co_paragraph"><div class="co_paragraphText co_indentLeft2">(1) In the control of those occupational diseases caused by breathing air contaminated with harmful dusts, the primary objective shall be to prevent atmospheric contamination.</div></div>' +
  '<div class="co_paragraph"><div class="co_paragraphText co_indentFirstLine1">Note: Authority cited: Section 142.3, Labor Code. Reference: <input type="hidden" id="co_docMarker_12">Section 142.3, Labor Code.</div></div>' +
  '<div class="co_headtext co_hAlign2">HISTORY</div>' +
  '<div class="co_paragraph"><div class="co_paragraphText">1. Repealer and new section filed 7-12-74; effective thirtieth day thereafter (Register 74, No. 28).</div></div>' +
  '<div class="co_paragraph"><div class="co_paragraphText">17. Amendment of subsection (i)(4)(A) filed 1-18-2012; operative 1-18-2012 pursuant to Labor Code section 142.3(a)(4)(C). Submitted to OAL for printing only (Register 2012, No. 3).</div></div></div>' +
  '<br /><p class="style1"><A HREF="sb7g16a107.html"><IMG SRC="../../Images/arrow_marble_left.gif" alt="Go Back" />Go Back to Article 107 Table of Contents</A></p></div></body></html>';

describe('parseDirTitle8Html', () => {
  test('old generation: heading, hierarchy, body with its explanatory NOTE, authority, history, filed+30 date', () => {
    const page = parseDirTitle8Html(OLD_PAGE, { cite: '5446' });
    expect(page.cite).toBe('5446');
    expect(page.heading).toBe('Spray Booths');
    expect(page.hierarchy).toEqual([
      'Subchapter 7. General Industry Safety Orders',
      'Group 20. Flammable Liquids, Gases and Vapors',
      'Article 137. Spray Coating Operations',
    ]);
    expect(page.text.split('\n')).toEqual([
      '(a) Spray booths and connected ductwork shall be substantially constructed of steel.',
      '(h) Spray booths shall be so installed that all portions are readily accessible for cleaning. A clear space of not less than three feet on all sides shall be kept free from storage or combustible construction.',
      'NOTE: This does not preclude the installation of a spray booth against a partition or wall having a one hour fire resistance rating.',
    ]);
    expect(page.authorityNote).toBe('NOTE: Authority cited: Section 142.3, Labor Code. Reference: Section 142.3, Labor Code.');
    expect(page.historyNote?.split('\n')).toHaveLength(2);
    expect(page.effectiveDate).toBe('1987-01-04');
    expect(page.text).not.toContain('Go Back');
    expect(page.text).not.toContain('Return to index');
  });

  test('new generation: the guide link under the h1 is chrome, the HISTORY headtext splits body from history', () => {
    const page = parseDirTitle8Html(NEW_PAGE, { cite: '5144' });
    expect(page.heading).toBe('Respiratory Protection');
    expect(page.hierarchy[2]).toBe('Article 107. Dusts, Fumes, Mists, Vapors and Gases');
    expect(page.text.split('\n')).toEqual([
      '(a) Permissible practice.',
      '(1) In the control of those occupational diseases caused by breathing air contaminated with harmful dusts, the primary objective shall be to prevent atmospheric contamination.',
    ]);
    expect(page.text).not.toContain('Guide to Respiratory Protection');
    expect(page.authorityNote).toBe('Note: Authority cited: Section 142.3, Labor Code. Reference: Section 142.3, Labor Code.');
    expect(page.effectiveDate).toBe('2012-01-18');
  });

  test('a page for a different section than requested, or with no § heading, throws', () => {
    expect(() => parseDirTitle8Html(OLD_PAGE, { cite: '5144' })).toThrow(/different section/);
    expect(() => parseDirTitle8Html(CHROME + '<p>Not Found</p></div></body></html>', { cite: '5446' })).toThrow(/does not exist/);
  });
});
