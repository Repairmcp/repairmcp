import { describe, expect, test } from 'bun:test';
import { newestStatuteEffectiveDate, parseLeginfoHtml } from '../src/parse-leginfo.js';

/** The verified text-view shape (kickoff §3.1), reduced to its load-bearing parts. */
function textViewSection(
  cite: string,
  opts: { body?: string[]; history?: string } = {},
): string {
  const body = opts.body ?? [`(a) Body text for ${cite}.`];
  const history = opts.history ?? '(Amended by Stats. 2018, Ch. 503, Sec. 3.   (AB 3141)   Effective January 1, 2019.)';
  const [first, ...rest] = body;
  return (
    `<div align="left"><p><h6 style="float:left;"><a href="javascript:submitCodesValues('${cite}.','5.37.3','2018','503','3', 'id_x')">${cite}.</a></h6>` +
    `  <p style="margin:0;display:inline;">${first}</p><p style="margin:0 0 0.5em 0;clear:both;"/>` +
    rest.map((line) => `<p style="margin:0 0 1em 0;margin-left: 1em;">${line}</p><p style="margin:0 0 0.5em 0;clear:both;"/>`).join('') +
    `<p style="margin:0 0 2em 0;font-size:0.9em;"><i>${history}</i></p></p></div>`
  );
}

function textView(inner: string): string {
  return (
    '<html><body><div id="manylawsections"><DIV align="left" style="text-transform: uppercase"><h3><b>Business and Professions Code - BPC</b></h3></DIV>' +
    '<div align="left" style="text-indent: 0.25in"><h4 style="display:inline;"><b>DIVISION 3. PROFESSIONS AND VOCATIONS GENERALLY [5000 - 9998.12]</b></h4>  <i>( Heading of Division 3 added by Stats. 1939, Ch. 30. )</i></div>' +
    '<div align="left" style="text-indent: 0.5in"><h4 style="display:inline;"><b>CHAPTER 20.3. Automotive Repair [9880 - 9889.68]</b></h4>  <i>( Chapter 20.3 added by Stats. 1971, Ch. 1578. )</i></div>' +
    '<div><font face="Times New Roman"><br/><div align="left"><h5 style="display:inline;"><b>ARTICLE 3. Registration Procedure [9884 - 9884.22]</b></h5>  <i>( Article 3 added by Stats. 1971, Ch. 1578. )</i></div><br/>' +
    inner +
    '</font></div></div></body></html>'
  );
}

/** The verified section-view shape: bold head, bare <i> note after the last </p>. */
const SECTION_VIEW =
  '<html><body><div id="single_law_section" class="displaycodeleftmargin"><div id="codeLawSectionNoHead">' +
  '<div align="left" style="text-transform: uppercase"><h4><b>Insurance Code - INS</b></h4></div>' +
  '<div style="float:left;text-indent: 0.25in;"><h4 style="display:inline;"><b>DIVISION 1. GENERAL RULES GOVERNING INSURANCE [100 - 1879.8]</b></h4><i>  ( Division 1 enacted by Stats. 1935, Ch. 145. )</i></div>' +
  '<div style="display:inline;"><h5 style="display:inline;"><b>ARTICLE 5.1. Unlawful Practices [755 - 758.7]</b></h5><i>  ( Heading renumbered. )</i></div>' +
  '<div><font face="Times New Roman"><h6 style="float:left;"><b>758.5.  </b></h6>' +
  '<p style="margin:0 0 0.5em 0;">(a) No insurer shall require that an automobile be repaired at a specific automotive repair dealer.</p>' +
  '<p style="margin:0 0 1em 0;margin-left: 2.5em;">(A) A referral is expressly requested by the\n\t\t\t\t  claimant.</p>' +
  '<i>(Amended by Stats. 2009, Ch. 387, Sec. 1.   (AB 1200)   Effective January 1, 2010.)</i></font></div></div></div></body></html>';

/** Absence: HTTP 200 with an EMPTY single_law_section div and no wrapper. */
const MISSING_VIEW =
  '<html><body><div id="single_law_section" class="displaycodeleftmargin"> </div><input type="hidden" name="javax.faces.ViewState"/></body></html>';

describe('parseLeginfoHtml', () => {
  test('text view: hierarchy headers, heads, bodies across paragraphs, and history notes', () => {
    const html = textView(
      textViewSection('9884.9', {
        body: ['(a) The automotive repair dealer shall give a written estimate.', '(1) more.', '(b) Additional authorization.'],
      }) + textViewSection('9884.10', { history: '(Added by Stats. 1971, Ch. 1578.)' }),
    );
    const page = parseLeginfoHtml(html);
    expect(page.codeTitle).toBe('Business and Professions Code - BPC');
    expect(page.hierarchy).toEqual([
      'DIVISION 3. PROFESSIONS AND VOCATIONS GENERALLY [5000 - 9998.12]',
      'CHAPTER 20.3. Automotive Repair [9880 - 9889.68]',
      'ARTICLE 3. Registration Procedure [9884 - 9884.22]',
    ]);
    expect(page.warnings).toEqual([]);
    expect(page.sections.map((s) => s.cite)).toEqual(['9884.9', '9884.10']);
    const first = page.sections[0]!;
    expect(first.text).toBe(
      '(a) The automotive repair dealer shall give a written estimate.\n(1) more.\n(b) Additional authorization.',
    );
    expect(first.historyNote).toBe('(Amended by Stats. 2018, Ch. 503, Sec. 3. (AB 3141) Effective January 1, 2019.)');
    expect(first.effectiveDate).toBe('2019-01-01');
    // A 1971 enactment states no date: silence, not a guess.
    expect(page.sections[1]!.historyNote).toBe('(Added by Stats. 1971, Ch. 1578.)');
    expect(page.sections[1]!.effectiveDate).toBeUndefined();
  });

  test('section view: bold head, wrapped whitespace collapsed, bare <i> note kept out of the text', () => {
    const page = parseLeginfoHtml(SECTION_VIEW);
    expect(page.hierarchy[0]).toBe('DIVISION 1. GENERAL RULES GOVERNING INSURANCE [100 - 1879.8]');
    const section = page.sections[0]!;
    expect(section.cite).toBe('758.5');
    expect(section.text).toBe(
      '(a) No insurer shall require that an automobile be repaired at a specific automotive repair dealer.\n(A) A referral is expressly requested by the claimant.',
    );
    expect(section.historyNote).toBe('(Amended by Stats. 2009, Ch. 387, Sec. 1. (AB 1200) Effective January 1, 2010.)');
    expect(section.effectiveDate).toBe('2010-01-01');
  });

  test('a cite printed twice is reported, not silently merged', () => {
    const page = parseLeginfoHtml(
      textView(
        textViewSection('226.7', { history: '(Amended by Stats. 2020, Ch. 343, Sec. 2.)' }) +
          textViewSection('226.7', {
            history: '(Repealed (in Sec. 2) and added by Stats. 2020, Ch. 343, Sec. 3. Section operative January 1, 2027, by its own provisions.)',
          }),
      ),
    );
    expect(page.sections.map((s) => s.cite)).toEqual(['226.7', '226.7']);
    expect(page.sections[1]!.effectiveDate).toBe('2027-01-01');
    expect(page.warnings[0]).toContain('226.7');
    expect(page.warnings[0]).toContain('more than once');
  });

  test('an article header between two sections, and the chrome after </BODY>, belong to no section', () => {
    const html =
      textView(
        textViewSection('9889.53') +
          '<div align="left"><h5 style="display:inline;"><b>ARTICLE 11. Auto Body Repair Study [9889.66 - 9889.68]</b></h5>  <i>( Article 11 added by Stats. 1992, Ch. 479, Sec. 3. )</i></div><br/>' +
          textViewSection('9889.66'),
      ).replace('</body></html>', '</BODY></HTML><div class="chrome">BPC Business and Professions Code - BPC</div></body></html>');
    const page = parseLeginfoHtml(html);
    expect(page.sections.map((s) => s.cite)).toEqual(['9889.53', '9889.66']);
    expect(page.sections[0]!.text).toBe('(a) Body text for 9889.53.');
    expect(page.sections[1]!.text).toBe('(a) Body text for 9889.66.');
    expect(page.hierarchy).toContain('ARTICLE 11. Auto Body Repair Study [9889.66 - 9889.68]');
  });

  test('absence (the empty single_law_section div) throws, naming the cause', () => {
    expect(() => parseLeginfoHtml(MISSING_VIEW)).toThrow(/does not exist/);
  });

  test('a wrapper with no heads is template drift, not an empty chapter', () => {
    expect(() => parseLeginfoHtml('<div id="manylawsections"><p>nothing</p></div>')).toThrow(/template drift/);
  });
});

describe('newestStatuteEffectiveDate', () => {
  test('newest of Effective and operative wins; an operative date later than Effective is the one that took hold', () => {
    expect(
      newestStatuteEffectiveDate(
        '(Repealed (in Sec. 4) and added by Stats. 2015, Ch. 754, Sec. 5. (AB 1513) Effective January 1, 2016. Section operative January 1, 2021, by its own provisions.)',
      ),
    ).toBe('2021-01-01');
    expect(newestStatuteEffectiveDate('(Added by Stats. 1989, Ch. 725, Sec. 3. Effective September 25, 1989.)')).toBe('1989-09-25');
    expect(newestStatuteEffectiveDate('(Enacted by Stats. 1937, Ch. 90.)')).toBeUndefined();
  });
});
