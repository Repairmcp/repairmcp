import { describe, expect, test } from 'bun:test';
import {
  WaParseError,
  decodeEntities,
  parseHistoryNote,
  parseLegChapterHtml,
} from '../src/parse.js';

/**
 * Fixtures mirror the live app.leg.wa.gov chapter-page markup, verified on the
 * wire 2026-08-27 (saved copies in the capture scratchpad): anchors, PDF-button
 * number h3s (RCW nests the number in a link), heading h3s with em-dash spans,
 * indented body divs, the bracketed history div, RCW NOTES blocks, and the
 * pre-anchor prelude carrying the TOC and the repealed-section disposition
 * table. The prelude deliberately contains a repealed section with a full
 * filed/effective history — the parser must never emit it.
 */

const WAC_FIXTURE = `<html><body><div>nav</div>
<div id='contentWrapper' class='chapter-page'><div></div><div></div>WAC Sections<table style="max-width:768px;"><tr><td colspan="3"><div style="text-align:center;margin:0pt;padding:0pt;">THE UNFAIR CLAIMS SETTLEMENT PRACTICES</div></td></tr><tr><td>284-30-005</td><td>Which regulation applicable. [Order R-71-1, § 284-30-005, filed 6/15/71, effective 9/1/71.] Repealed by WSR 81-18-038 (Order R 81-4), filed 8/28/81. Statutory Authority: RCW 48.02.060.</td></tr></table>
<a name='284-30-330' ></a><div><h3><a class="btn btn-outline" style="margin-right:10px;" href="http://app.leg.wa.gov/WAC/default.aspx?cite=284-30-330&amp;pdf=true" target="_blank">PDF</a>284-30-330</h3></div><div><h3>Specific unfair claims settlement practices defined.</h3></div><div><div style="text-indent:0.5in;">The following are hereby defined as unfair methods of competition &amp; deceptive acts, per RCW <a href='http://app.leg.wa.gov/RCW/default.aspx?cite=48.30.010'>48.30.010</a>:</div><div style="text-indent:0.5in;">(1) Misrepresenting pertinent facts or insurance policy provisions.</div><div style="text-indent:0.5in;">(2) Failing to acknowledge and act reasonably promptly upon communications.</div></div><div style="margin-top:15pt;margin-bottom:0pt;">[Statutory Authority: RCW  <a href='http://app.leg.wa.gov/RCW/default.aspx?cite=48.02.060'>48.02.060</a> and  <a href='http://app.leg.wa.gov/RCW/default.aspx?cite=48.30.010'>48.30.010</a>. WSR 16-20-050 (Matter No. R 2016-12), § 284-30-330, filed 9/29/16, effective 10/30/16; WSR 09-11-129 (Matter No. R 2007-08), § 284-30-330, filed 5/20/09, effective 8/21/09. Statutory Authority: RCW 48.02.060. WSR 78-08-082 (Order R 78-3), § 284-30-330, filed 7/27/78, effective 9/1/78.]</div>
            </span><br /><span>
                <br>
                <hr>
<a name='284-30-350' ></a><div><h3><a class="btn btn-outline" style="margin-right:10px;" href="http://app.leg.wa.gov/WAC/default.aspx?cite=284-30-350&amp;pdf=true" target="_blank">PDF</a>284-30-350</h3></div><div><h3>Misrepresentation of policy provisions.</h3></div><div><div style="text-indent:0.5in;">No insurer shall misrepresent policy provisions.</div></div><div style="margin-top:15pt;margin-bottom:0pt;">[Statutory Authority: RCW 48.02.060. WSR 87-09-071 (Order R 87-5), § 284-30-350, filed 4/21/87; WSR 78-08-082 (Order R 78-3), § 284-30-350, filed 7/27/78, effective 9/1/78.]</div>
<a name='284-30-360' ></a><div><h3><a class="btn btn-outline" style="margin-right:10px;" href="#" target="_blank">PDF</a>284-30-360</h3></div><div><h3>Standards for acknowledgment.</h3></div><div><div style="text-indent:0.5in;">Every insurer must acknowledge communications promptly.</div></div><div style="margin-top:15pt;margin-bottom:0pt;">[Order R 78-3, § 284-30-360, filed 7/27/78, effective 9/1/78.]</div>
<a name='284-30-370' ></a><div><h3><a class="btn btn-outline" style="margin-right:10px;" href="#" target="_blank">PDF</a>284-30-370</h3></div><div><h3>Part heading with no body.</h3></div><div><div style="text-indent:0.5in;"></div></div><div style="margin-top:15pt;margin-bottom:0pt;">[Order R 78-3, § 284-30-370, filed 7/27/78, effective 9/1/78.]</div>
</div></body></html>`;

const RCW_FIXTURE = `<html><body>
<div id='contentWrapper' class='chapter-page'><div></div>RCW Sections<table><tr><td>dispositions here</td></tr></table>
<a name='46.71.025' ></a><div><h3><a class="btn btn-outline hidden-print" style="margin-right:10px;" href="http://app.leg.wa.gov/RCW/default.aspx?cite=46.71.025&amp;pdf=true" target="_blank">PDF</a>RCW  <a href='http://app.leg.wa.gov/RCW/default.aspx?cite=46.71.025'>46.71.025</a></h3></div><div><h3>Written estimate required<span style="font-family:times new roman;">—</span>Alternatives<span style="font-family:times new roman;">—</span>Exceptions.</h3></div><div><div style="text-indent:0.5in;">(1) Except as provided in subsections (3) and (4) of this section, a repair facility prior to providing parts or labor shall provide the customer with a written price estimate.</div><div style="text-indent:0pt;margin-top:4.5pt;">"YOU ARE ENTITLED TO A WRITTEN PRICE ESTIMATE FOR THE REPAIRS YOU HAVE AUTHORIZED."</div></div><div style="margin-top:15pt;margin-bottom:0pt;">[ <a href='https://lawfilesext.leg.wa.gov/biennium/2011-12/Pdf/Bills/Session%20Laws/Senate/6005-S.SL.pdf?cite=2012 c 27 s 1'>2012 c 27 s 1</a>;  <a href='https://lawfilesext.leg.wa.gov/biennium/1993-94/Pdf/Bills/Session%20Laws/House/1766-S.SL.pdf?cite=1993 c 424 s 5'>1993 c 424 s 5</a>.]</div><div style="margin-top:0.25in;margin-bottom:0.25in;"><h3>NOTES:</h3></div><div style="margin-bottom:0.2in;"><div style="text-indent:0.75in;"><span style="font-weight:bold;">Severability<span style="font-family:times new roman;">—</span>1993 c 424:</span> "If any provision of this act is declared unconstitutional the remainder is not affected."</div></div>
            </span><br /><span>
                <br>
                <hr>
</div>site footer text that must not leak</body></html>`;

const WAC_OPTS = { code: 'WAC', chapter: '284-30' } as const;
const RCW_OPTS = { code: 'RCW', chapter: '46.71' } as const;

describe('parseLegChapterHtml — WAC chapter page', () => {
  const parsed = () => parseLegChapterHtml(WAC_FIXTURE, WAC_OPTS);

  test('parses the anchored live sections and nothing from the prelude', () => {
    const { sections } = parsed();
    expect(sections.map((s) => s.cite)).toEqual(['284-30-330', '284-30-350', '284-30-360']);
    // The repealed 284-30-005 lives only in the disposition table and must not appear.
    expect(sections.some((s) => s.cite === '284-30-005')).toBe(false);
  });

  test('extracts heading and verbatim paragraph text, one paragraph per line', () => {
    const s330 = parsed().sections[0]!;
    expect(s330.heading).toBe('Specific unfair claims settlement practices defined.');
    const lines = s330.text.split('\n');
    expect(lines[0]).toBe(
      'The following are hereby defined as unfair methods of competition & deceptive acts, per RCW 48.30.010:',
    );
    expect(lines[1]).toBe('(1) Misrepresenting pertinent facts or insurance policy provisions.');
    expect(lines[2]).toBe('(2) Failing to acknowledge and act reasonably promptly upon communications.');
    // The history note is not part of the text.
    expect(s330.text).not.toContain('Statutory Authority');
  });

  test('effectiveDate is the NEWEST effective date in the history note', () => {
    // 2016 over 2009 over 1978 — history notes list amendments newest-first,
    // and the date of the CURRENT text is the first entry's.
    expect(parsed().sections[0]!.effectiveDate).toBe('2016-10-30');
  });

  test('newest entry filed without an effective date omits the date entirely', () => {
    // 284-30-350's newest entry (1987) has filed but no effective; falling back
    // to the 1978 entry would misdate newer text. Silence over a guess.
    expect(parsed().sections[1]!.effectiveDate).toBeUndefined();
  });

  test('two-digit years pivot to the right century', () => {
    expect(parsed().sections[2]!.effectiveDate).toBe('1978-09-01');
  });

  test('stores the history note verbatim for audit', () => {
    const s330 = parsed().sections[0]!;
    expect(s330.historyNote).toContain('WSR 16-20-050');
    expect(s330.historyNote).toContain('filed 9/29/16, effective 10/30/16');
  });

  test('empty-bodied part-heads are skipped and reported', () => {
    const { sections, skippedEmpty } = parsed();
    expect(sections.some((s) => s.cite === '284-30-370')).toBe(false);
    expect(skippedEmpty).toEqual(['284-30-370']);
  });
});

describe('parseLegChapterHtml — RCW chapter page', () => {
  const parsed = () => parseLegChapterHtml(RCW_FIXTURE, RCW_OPTS);

  test('parses the section despite the number living inside a nested link', () => {
    const { sections } = parsed();
    expect(sections).toHaveLength(1);
    expect(sections[0]!.cite).toBe('46.71.025');
  });

  test('heading keeps the em dashes the source renders through spans', () => {
    expect(parsed().sections[0]!.heading).toBe(
      'Written estimate required—Alternatives—Exceptions.',
    );
  });

  test('body text is verbatim and excludes NOTES block and page footer', () => {
    const text = parsed().sections[0]!.text;
    expect(text).toContain('a written price estimate');
    expect(text).toContain('"YOU ARE ENTITLED TO A WRITTEN PRICE ESTIMATE');
    expect(text).not.toContain('Severability');
    expect(text).not.toContain('site footer');
  });

  test('session-law history notes yield no effective date — the normal RCW case', () => {
    const s = parsed().sections[0]!;
    expect(s.effectiveDate).toBeUndefined();
    expect(s.historyNote).toContain('2012 c 27 s 1');
  });
});

describe('parseLegChapterHtml — hard failures and edge cases', () => {
  test('anchor/number mismatch throws — the template-drift tripwire', () => {
    const drifted = WAC_FIXTURE.replace(
      '>PDF</a>284-30-330</h3>',
      '>PDF</a>284-30-331</h3>',
    );
    expect(() => parseLegChapterHtml(drifted, WAC_OPTS)).toThrow(WaParseError);
  });

  test('an anchor outside the requested chapter throws', () => {
    const foreign = WAC_FIXTURE.replaceAll('284-30-360', '999-99-360');
    expect(() => parseLegChapterHtml(foreign, WAC_OPTS)).toThrow(WaParseError);
  });

  test('a page with no anchored sections throws', () => {
    expect(() =>
      parseLegChapterHtml("<div id='contentWrapper' class='chapter-page'>nothing</div>", WAC_OPTS),
    ).toThrow(WaParseError);
  });

  test('duplicate anchors keep the first version and report the cite', () => {
    const dupBlock = `<a name='284-30-350' ></a><div><h3><a href="#">PDF</a>284-30-350</h3></div><div><h3>Misrepresentation of policy provisions (pending amendment).</h3></div><div><div style="text-indent:0.5in;">Amended future text.</div></div><div style="margin-top:15pt;margin-bottom:0pt;">[Order X, § 284-30-350, filed 1/1/27, effective 1/1/27.]</div>`;
    const doubled = WAC_FIXTURE.replace("<a name='284-30-360'", `${dupBlock}<a name='284-30-360'`);
    const { sections, duplicates } = parseLegChapterHtml(doubled, WAC_OPTS);
    const s350 = sections.find((s) => s.cite === '284-30-350')!;
    expect(s350.heading).toBe('Misrepresentation of policy provisions.');
    expect(duplicates).toEqual(['284-30-350']);
  });
});

describe('parseHistoryNote', () => {
  test('newest effective wins across multiple entries', () => {
    expect(
      parseHistoryNote(
        '[Statutory Authority: RCW 48.02.060. WSR 16-20-050, § 284-30-330, filed 9/29/16, effective 10/30/16; WSR 09-11-129, § 284-30-330, filed 5/20/09, effective 8/21/09.]',
      ),
    ).toBe('2016-10-30');
  });

  test('four-digit years parse as-is', () => {
    expect(
      parseHistoryNote('[WSR 19-01-094, § 296-62-11019, filed 12/18/2018, effective 1/18/2019.]'),
    ).toBe('2019-01-18');
  });

  test('filed without effective yields undefined, never a fallback', () => {
    expect(
      parseHistoryNote(
        '[WSR 87-09-071, § 284-30-350, filed 4/21/87; WSR 78-08-082, § 284-30-350, filed 7/27/78, effective 9/1/78.]',
      ),
    ).toBeUndefined();
  });

  test('a session-law note has no dates at all', () => {
    expect(parseHistoryNote('[ 2012 c 27 s 1;  1993 c 424 s 5.]')).toBeUndefined();
  });
});

describe('decodeEntities', () => {
  test('decodes named, numeric, and ampersand-last', () => {
    expect(decodeEntities('&sect;&#167; parts &amp;amp; labor &mdash; &quot;quote&quot;')).toBe(
      '§§ parts &amp; labor — "quote"',
    );
  });
});
