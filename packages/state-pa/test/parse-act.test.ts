import { describe, expect, test } from 'bun:test';
import { ActParseError, parseActHtml } from '../src/parse-act.js';

const P = (inner: string): string => `<p style="text-align:left;margin-left:0.0000in;text-indent:0.3035in;line-height:0.1610in;">${inner}</p>\n`;

/**
 * A body line is either plain text, or `{ bold, rest }` for a paragraph
 * whose OPENING run is bold — rendered `<p ...><b>${bold}</b>${rest}</p>`
 * with nothing synthesized between them, matching the real pages (e.g. an
 * inline subsection marker `<b>(a)&nbsp;&nbsp;General rule.--</b>The
 * department…`, or a bold-quoted defined term). Only meaningful for lines
 * after the first — the first line is always folded into the section's
 * head/lead, which the parser reads as plain decoded text regardless of
 * markup.
 */
type BodyLine = string | { bold: string; rest: string };

/** A WU01 act page in the real markup: title, header, contents region, one `u{N}s` region per section. */
export function actPage(opts: {
  year: number; actNo: number; pl: number; date: string; cl: number; shortTitle: string;
  sections: Array<{ n: string; catchline?: string; body: BodyLine[]; notes?: string[]; compilerNote?: string }>;
}): string {
  const key = `${opts.year}${String(opts.actNo).padStart(4, '0')}`;
  let html = `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Act of ${opts.date},P.L. ${opts.pl}, No. ${opts.actNo} Cl. ${opts.cl} - ${opts.shortTitle.toUpperCase()} </title></head><body>`;
  html += `<div class="Comment">${key}ua</div>\n<div id="Header"><h1>${opts.shortTitle.toUpperCase()}</h1><table><tr><td class="EnactDate">Act of ${opts.date},</td></tr><tr><td class="EnactDate">P.L. ${opts.pl},</td></tr><tr><td class="EnactDate">No. ${opts.actNo}</td></tr><tr><td class="Classification">Cl. ${opts.cl}</td></tr></table></div>`;
  html += P('AN ACT') + P('Relating to things.');
  html += `<div class="Comment">${key}uc</div>\n` + P('TABLE OF CONTENTS');
  for (const s of opts.sections) html += P(`Section&nbsp;&nbsp;${s.n}.&nbsp;&nbsp;${s.catchline ?? 'Untitled.'}`);
  html += `<div class="Comment">${key}uh</div>\n` + P('The General Assembly hereby enacts as follows:');
  for (const s of opts.sections) {
    html += `<div class="Comment">${key}u${s.n}s</div>\n`;
    const leadBody = typeof s.body[0] === 'string' ? s.body[0] : '';
    const lead = s.catchline ? `Section ${s.n}.&nbsp;&nbsp;${s.catchline}--${leadBody}` : `Section ${s.n}. &nbsp;${leadBody}`;
    html += P(lead);
    for (const line of s.body.slice(1)) html += P(typeof line === 'string' ? line : `<b>${line.bold}</b>${line.rest}`);
    for (const n of s.notes ?? []) html += P(n);
    if (s.compilerNote) html += P(`<b>Compiler's Note:</b> &nbsp;${s.compilerNote}`);
  }
  return `${html}</body></html>`;
}

const wpcl = actPage({
  year: 1961, actNo: 329, pl: 637, date: 'Jul. 14, 1961', cl: 43, shortTitle: 'Wage Payment and Collection Law',
  sections: [
    { n: '2', catchline: 'Definitions.', body: ['(2 repealed July 14, 1977, P.L.82, No.30)'] },
    { n: '2.1', catchline: 'Definitions.', body: ['The following words and phrases when used in this act shall have the\n            following meanings:', '"Employer." Includes every person, firm, partnership, association.'], notes: ['(2.1 added July 14, 1977, P.L.82, No.30)'] },
    { n: '5', catchline: 'Employes Who Are Separated from Payroll before Paydays.', body: ['(a)&nbsp;&nbsp;Separated Employes. Whenever an employer separates an employe from the payroll, the wages\n            earned shall become due and payable not later than the next regular payday. ((a) amended July 14, 1977, P.L.82,\n            No.30)', '(b)&nbsp;&nbsp;Deceased Employes. Wages of a deceased employe are payable to the estate.'], compilerNote: 'Section 9 of Act 112 of 2012 provided that subsec. (a) applies.' },
    { n: '10', catchline: 'Liquidated Damages.', body: ['Where wages remain unpaid for thirty days beyond the regularly scheduled payday, the employe may claim twenty-five percent.'], notes: ['(10 amended July 14, 1977, P.L.82, No.30)'] },
  ],
});

const wca = actPage({
  year: 1915, actNo: 338, pl: 736, date: 'Jun. 2, 1915', cl: 77, shortTitle: "Workers' Compensation Act",
  sections: [
    { n: '104', body: ['The term "employe," as used in this act is declared to be synonymous with servant.'], notes: ['(104 amended June 18, 2019, P.L.115, No.16)'] },
    { n: '305', body: ['(a)&nbsp;&nbsp;(1)&nbsp;&nbsp;Every employer liable under this act to pay compensation shall insure the payment.'] },
  ],
});

/** The real WCA §318 history note, verbatim — two clauses joined by "; ". */
const WCA_318_NOTE = '(318 amended Dec. 28, 1959, P.L.2034, No.747; repealed in part Apr. 28, 1978, P.L.202, No.53)';
/** A single-clause note padded well past any length a cap could safely use. */
const LONG_SINGLE_CLAUSE_NOTE = '(123456789012 reenacted and amended September 28, 1999, P.L.12345678901234567890, No.12345678901234567890)';

const notesAndBold = actPage({
  year: 1999, actNo: 1, pl: 1, date: 'Jan. 1, 1999', cl: 99, shortTitle: 'Note and Bold Rules Test Act',
  sections: [
    { n: '1', catchline: 'Compound Note.', body: ['Lead text for section one.'], notes: [WCA_318_NOTE] },
    { n: '2', catchline: 'Long Single Clause.', body: ['Lead text for section two.'], notes: [LONG_SINGLE_CLAUSE_NOTE] },
    { n: '3', catchline: 'Prose With Inline Note.', body: [
      'Lead text for section three.',
      '(a) This subsection contains substantial prose that runs on for a while before ending with an inline amendment note about a wholly separate matter. ((a) amended July 14, 1977, P.L.82, No.30)',
    ] },
    { n: '4', catchline: 'Blank PL Note.', body: ['Lead text for section four.'], notes: ['((b) repealed July 15, 2024, P.L. , No.62).'] },
    { n: '5', catchline: 'Bold Rules.', body: [
      'Lead text for section five.',
      { bold: '(a)&nbsp;&nbsp;General rule.--', rest: 'The department shall enforce this act.' },
      { bold: '"Employer."', rest: '&nbsp;Includes every person, firm, partnership, association.' },
    ], compilerNote: 'This explanatory note must not appear in text.' },
    /**
     * The real UIPA §5 shape: a body paragraph that is TWO adjacent
     * top-level parenthesized groups — the subsection marker "(b)" followed
     * by its own repeal note — with no prose between them. The standalone
     * form of the very same note (section 4 above) IS a history note; this
     * one must stay body, because the paragraph as a whole is not one pair
     * of parentheses around note clauses.
     */
    { n: '6', catchline: 'Adjacent Groups.', body: [
      'Lead text for section six.',
      '(b) ((b) repealed July 15, 2024, P.L. , No.62).',
    ] },
  ],
});

describe('parseActHtml', () => {
  test('reads the title line and short title', () => {
    const r = parseActHtml(wpcl);
    expect(r.title).toEqual({ actDate: '1961-07-14', pl: '637', actNo: '329', shortTitle: 'WAGE PAYMENT AND COLLECTION LAW' });
  });
  test('one section per u{N}s region, in order, with catchline and body; the contents region is not a section', () => {
    const r = parseActHtml(wpcl);
    expect(r.sections.map((s) => s.actSection)).toEqual(['2', '2.1', '5', '10']);
    const s5 = r.sections[2]!;
    expect(s5.catchline).toBe('Employes Who Are Separated from Payroll before Paydays.');
    expect(s5.text.split('\n')[0]).toBe('(a) Separated Employes. Whenever an employer separates an employe from the payroll, the wages earned shall become due and payable not later than the next regular payday. ((a) amended July 14, 1977, P.L.82, No.30)');
    expect(s5.text.split('\n').length).toBe(2);
    expect(s5.text).not.toContain("Compiler's Note");
    expect(s5.repealed).toBe(false);
  });
  test('a standalone history note is kept apart from the text; an inline note stays in the text', () => {
    const r = parseActHtml(wpcl);
    expect(r.sections[3]!.historyNotes).toEqual(['(10 amended July 14, 1977, P.L.82, No.30)']);
    expect(r.sections[3]!.text).toBe('Where wages remain unpaid for thirty days beyond the regularly scheduled payday, the employe may claim twenty-five percent.');
    expect(r.sections[1]!.historyNotes).toEqual(['(2.1 added July 14, 1977, P.L.82, No.30)']);
  });
  test('a repealed section is flagged', () => {
    expect(parseActHtml(wpcl).sections[0]!.repealed).toBe(true);
  });
  test('the 1915 act prints no catchline', () => {
    const r = parseActHtml(wca);
    expect(r.sections[0]!.catchline).toBeUndefined();
    expect(r.sections[0]!.text).toBe('The term "employe," as used in this act is declared to be synonymous with servant.');
    expect(r.sections[1]!.text).toBe('(a) (1) Every employer liable under this act to pay compensation shall insure the payment.');
  });
  test('a region whose head number disagrees with its marker is template drift', () => {
    expect(() => parseActHtml(wpcl.replace('u10s', 'u11s'))).toThrow(ActParseError);
  });
  test('a page with no section regions or no title fails by name', () => {
    expect(() => parseActHtml('<html><head><title>x</title></head><body><p>Section 1. Foo.--bar</p></body></html>')).toThrow(/title line/);
    expect(() => parseActHtml(wpcl.replace(/<div class="Comment">1961\d+u[0-9.]+s<\/div>/g, ''))).toThrow(/no section regions/);
  });
});

describe('the standalone-note structural rule', () => {
  test('a compound note (multiple "; "-joined clauses, WCA 318 verbatim) is a standalone history note', () => {
    const r = parseActHtml(notesAndBold);
    const s1 = r.sections[0]!;
    expect(s1.historyNotes).toEqual([WCA_318_NOTE]);
    expect(s1.text).toBe('Lead text for section one.');
    expect(s1.text).not.toContain('P.L.2034');
  });
  test('a single-clause note far longer than any length cap is still a standalone history note', () => {
    expect(LONG_SINGLE_CLAUSE_NOTE.length).toBeGreaterThan(90);
    const r = parseActHtml(notesAndBold);
    const s2 = r.sections[1]!;
    expect(s2.historyNotes).toEqual([LONG_SINGLE_CLAUSE_NOTE]);
    expect(s2.text).toBe('Lead text for section two.');
  });
  test('a body subsection that merely ends with an inline note stays entirely in text', () => {
    const r = parseActHtml(notesAndBold);
    const s3 = r.sections[2]!;
    expect(s3.historyNotes).toEqual([]);
    expect(s3.text).toContain('This subsection contains substantial prose');
    expect(s3.text).toContain('((a) amended July 14, 1977, P.L.82, No.30)');
  });
  test('the blank-P.L.-number shape is a standalone history note', () => {
    const r = parseActHtml(notesAndBold);
    const s4 = r.sections[3]!;
    expect(s4.historyNotes).toEqual(['((b) repealed July 15, 2024, P.L. , No.62).']);
    expect(s4.text).toBe('Lead text for section four.');
  });
  test('the same note preceded by its own subsection marker (two adjacent groups, the real UIPA §5 shape) stays BODY text', () => {
    const r = parseActHtml(notesAndBold);
    const s6 = r.sections[5]!;
    expect(s6.historyNotes).toEqual([]);
    expect(s6.text).toBe('Lead text for section six.\n(b) ((b) repealed July 15, 2024, P.L. , No.62).');
    // Same note text, opposite verdict, decided only by what precedes it.
    expect(r.sections[3]!.historyNotes[0]).toContain('repealed July 15, 2024, P.L. , No.62');
  });
});

describe('the bold-paragraph rule', () => {
  test('a bold run opening with "(" is body text, label kept verbatim, no synthetic space at the </b> boundary', () => {
    const r = parseActHtml(notesAndBold);
    const s5 = r.sections[4]!;
    expect(s5.text).toContain('(a) General rule.--The department shall enforce this act.');
  });
  test('a bold run opening with a quotation mark is a defined term and stays body text', () => {
    const r = parseActHtml(notesAndBold);
    const s5 = r.sections[4]!;
    expect(s5.text).toContain('"Employer." Includes every person, firm, partnership, association.');
  });
  test("a bold-led Compiler's Note paragraph is dropped from text", () => {
    const r = parseActHtml(notesAndBold);
    const s5 = r.sections[4]!;
    expect(s5.text).not.toContain("Compiler's Note");
    expect(s5.text).not.toContain('must not appear in text');
  });
});
