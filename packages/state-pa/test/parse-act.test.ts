import { describe, expect, test } from 'bun:test';
import { ActParseError, parseActHtml } from '../src/parse-act.js';

const P = (inner: string): string => `<p style="text-align:left;margin-left:0.0000in;text-indent:0.3035in;line-height:0.1610in;">${inner}</p>\n`;

/** A WU01 act page in the real markup: title, header, contents region, one `u{N}s` region per section. */
export function actPage(opts: {
  year: number; actNo: number; pl: number; date: string; cl: number; shortTitle: string;
  sections: Array<{ n: string; catchline?: string; body: string[]; notes?: string[]; compilerNote?: string }>;
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
    const lead = s.catchline ? `Section ${s.n}.&nbsp;&nbsp;${s.catchline}--${s.body[0] ?? ''}` : `Section ${s.n}. &nbsp;${s.body[0] ?? ''}`;
    html += P(lead);
    for (const line of s.body.slice(1)) html += P(line);
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
