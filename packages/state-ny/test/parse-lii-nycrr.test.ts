import { describe, expect, test } from 'bun:test';
import { NyLiiParseError, parseLiiNycrrHtml, parseLiiNycrrPartIndex } from '../src/parse-lii-nycrr.js';

export function liiPage(opts: { title?: string; cite?: string; heading?: string; notes?: string; absent?: boolean; text?: string } = {}): string {
  if (opts.absent) return '<html><body><h1 id="page-title", class="title">New York Codes, Rules, and Regulations</h1><p>nothing here</p></body></html>';
  const title = opts.title ?? '11';
  const cite = opts.cite ?? '216.7';
  const heading = opts.heading ?? 'Standards for prompt, fair and equitable settlement of motor vehicle physical damage claims';
  const notes = opts.notes ?? '<div class="statereg-note"><note>Amended\n <span class="regcitation">New\n York State Register February 1, 2017/Volume XXXIX, Issue 05</span>, eff.\n <effectivedate>2/1/2017</effectivedate>\n</note><note>Amended <span class="regcitation">New York State Register June 9, 2021/Volume XLIII, Issue 23</span>, eff. <effectivedate>6/9/2021</effectivedate></note></div>';
  const text = opts.text ?? '<p>Insurers shall make every effort to inspect a damaged vehicle.</p><div class="subsect indent0"><span class="designator">(a)</span> Every insurer shall, within six business days.<div class="subsect indent1"><span class="designator">(1)</span> nested.</div></div>';
  return (
    '<html><body><ul class="breadcrumb"><li><a href="/">LII</a></li><li><a href="/regulations">State Regulations</a></li><li><a href="/regulations/new-york">New York Codes,Rules,and Regulations</a></li>' +
    `<li><a href="/regulations/new-york/title-${title}">N.Y. Comp. Codes R. &amp; Regs. tit. ${title} - INSURANCE</a></li>` +
    '<li><a href="/regulations/new-york/title-11/chapter-IX">Chapter IX - Unfair Trade Practices</a></li>' +
    '<li><a href="/regulations/new-york/title-11/chapter-IX/part-216">N.Y. Comp. Codes R. &amp; Regs. tit. 11, ch. IX, pt. 216 - Unfair Claims Settlement Practices And Claim Cost Control Measures</a></li></ul>' +
    `<h1 class="title" id="page_title"> N.Y. Comp. Codes R. &amp; Regs. Tit. ${title} § ${cite} - ${heading} </h1>` +
    `<div class="tab-pane active" id="tab_default_1"><div class="statereg-text">${text}</div>` +
    `<div class="statereg-notes"><h2 class="statereg-notes-heading">Notes</h2><div class="statereg-note"><note>N.Y. Comp. Codes R. &amp; Regs. Tit. <primaryidcodenumber>${title}</primaryidcodenumber> § <span class="codesec">${cite}</span></note></div>${notes}</div></div>` +
    '<div class="tab-pane" id="tab_default_2"><div class="statereg-text"><p>OLD COPY</p></div><div class="statereg-notes"><note>Amended <span class="regcitation">x</span>, eff. <effectivedate>1/1/2001</effectivedate></note></div></div></body></html>'
  );
}

describe('parseLiiNycrrHtml', () => {
  test('reads title, cite, heading, hierarchy, text lines, and the NEWEST eff. date', () => {
    const p = parseLiiNycrrHtml(liiPage(), { title: '11', cite: '216.7' });
    expect(p.title).toBe('11');
    expect(p.cite).toBe('216.7');
    expect(p.heading).toBe('Standards for prompt, fair and equitable settlement of motor vehicle physical damage claims');
    expect(p.hierarchy).toEqual(['N.Y. Comp. Codes R. & Regs. tit. 11 - INSURANCE', 'Chapter IX - Unfair Trade Practices', 'N.Y. Comp. Codes R. & Regs. tit. 11, ch. IX, pt. 216 - Unfair Claims Settlement Practices And Claim Cost Control Measures']);
    expect(p.text).toBe('Insurers shall make every effort to inspect a damaged vehicle.\n(a) Every insurer shall, within six business days.\n(1) nested.');
    expect(p.effectiveDate).toBe('2021-06-09');
    expect(p.historyNote).toBe('Amended New York State Register February 1, 2017/Volume XXXIX, Issue 05, eff. 2/1/2017\nAmended New York State Register June 9, 2021/Volume XLIII, Issue 23, eff. 6/9/2021');
    expect(p.text).not.toContain('OLD COPY');
    expect(p.repealed).toBe(false);
  });
  test('no history → no date, no history note', () => {
    const p = parseLiiNycrrHtml(liiPage({ notes: '<div class="statereg-note"><note>No prior version found.</note></div>' }), { title: '11', cite: '216.7' });
    expect(p.effectiveDate).toBeUndefined();
    expect(p.historyNote).toBeUndefined();
  });
  test('absence is a generic page: throws by name', () => {
    expect(() => parseLiiNycrrHtml(liiPage({ absent: true }), { title: '11', cite: '216.99' })).toThrow(NyLiiParseError);
    expect(() => parseLiiNycrrHtml(liiPage({ absent: true }), { title: '11', cite: '216.99' })).toThrow(/no section title/);
  });
  test('a page for a different section is refused', () => {
    expect(() => parseLiiNycrrHtml(liiPage({ cite: '216.6' }), { title: '11', cite: '216.7' })).toThrow(/Asked for 11 NYCRR 216\.7 but the page is 11 NYCRR 216\.6/);
  });
  test('(Repealed) in the heading is flagged', () => {
    expect(parseLiiNycrrHtml(liiPage({ cite: '216.13', heading: 'Mediation (Repealed)' }), { title: '11', cite: '216.13' }).repealed).toBe(true);
  });
  test('a genuine source space before punctuation survives — clean() only closes the tag-boundary gap, not real prose spacing', () => {
    const p = parseLiiNycrrHtml(liiPage({ text: '<p>paragraph one , with a spaced comma</p>' }), { title: '11', cite: '216.7' });
    expect(p.text).toBe('paragraph one , with a spaced comma');
  });
});

describe('parseLiiNycrrPartIndex', () => {
  test('lists every tocitem with its cite and title', () => {
    const html = '<ul><li class="tocitem"><a href="/regulations/new-york/11-NYCRR-216.0">§ 216.0 - Preamble</a></li><li class="tocitem"><a href="/regulations/new-york/11-NYCRR-216.13">§ 216.13 - Mediation (Repealed)</a></li></ul>';
    expect(parseLiiNycrrPartIndex(html)).toEqual([{ cite: '216.0', title: 'Preamble' }, { cite: '216.13', title: 'Mediation (Repealed)' }]);
  });
});
