import { describe, expect, test } from 'bun:test';
import { linearizeLiiText, parseLiiCcrHtml } from '../src/parse-ccr-lii.js';

/** The verified mirror shape (kickoff §3.2), reduced to its load-bearing parts. */
function liiPage(opts: {
  title: string;
  cite: string;
  heading: string;
  crumbs?: string[];
  text?: string;
  history?: string[];
  compareHistory?: string[];
}): string {
  const crumbs = opts.crumbs ?? [
    'Title 16 - Professional and Vocational Regulations',
    'Division 33 - Bureau of Automotive Repair',
    'Chapter 1 - Automotive Repair Dealers and Official Stations and Adjusters',
    'Article 7 - Disclosure Requirements for Automotive Repair Dealers',
  ];
  const text =
    opts.text ??
    '<p>An estimate shall be provided to and authorized by the\n\t\t\t\t  customer before any work commences.</p>' +
      '<div class="subsect indent0"><span class="designator">(a)</span> An automotive repair dealer shall provide the customer an estimate.' +
      '<div class="subsect indent1"><span class="designator">(1)</span> Each part listed shall be new unless identified otherwise.</div></div>' +
      '<div class="subsect indent0"><span class="designator">(b)</span> Sublet repairs shall be disclosed; see section <span class="codecitation"><a href="/regulations/california/16-CCR-3356">3356</a></span>.</div>';
  const history = opts.history ?? [
    '1. Amendment filed 6-26-74; designated effective 8-1-74 (Register 74, No. 26).',
    '11. Amendment of section and Note filed 5-29-2025; operative <operationaldate>7/1/2025</operationaldate> (<span class="regcitation">Register 2025, No. 22</span>).',
  ];
  const notes = (entries: string[]): string =>
    '<div class="statereg-notes"> <h2 class="statereg-notes-heading">Notes</h2>' +
    `<div class="statereg-note"><note>Cal. Code Regs. Tit. <primaryidcodenumber>${opts.title}</primaryidcodenumber>, § <span class="codesec">${opts.cite}</span></note></div>` +
    '<div class="statereg-note"><note><p>Note: Authority cited: Sections 9882 and 9884.9, Business and Professions Code. Reference: Section 9884.9, Business and Professions Code.</p></note></div>' +
    `<div class="statereg-note"><note>${entries.join('<br/>')}</note></div></div>`;
  return (
    '<html><body><ol class="breadcrumb"><li><a href="/">LII</a></li><li>State Regulations</li><li>California Code of Regulations</li>' +
    crumbs.map((c) => `<li>${c}</li>`).join('') +
    `<li>Cal. Code Regs. Tit. ${opts.title}, § ${opts.cite} - ${opts.heading}</li></ol>` +
    `<h1 class="title" id="page_title"> Cal. Code Regs. Tit. ${opts.title}, &#167; ${opts.cite} - ${opts.heading} </h1>` +
    '<div class="tab-content"><div class="tab-pane active" id="tab_default_1">' +
    `<div class="statereg-text">${text}</div>${notes(history)}</div>` +
    `<div class="tab-pane" id="tab_default_2"><div class="statereg-text"><p>an older copy</p></div>${notes(opts.compareHistory ?? [history[0]!])}</div></div>` +
    '<ul class="nav"><li>Compare</li><li>Accessibility</li><li>Terms of use</li></ul></body></html>'
  );
}

/** Absence: HTTP 200, a generic page, no page_title. */
const MISSING = '<html><head><title>California Code of Regulations | LII</title></head><body><h2>California Code of Regulations</h2></body></html>';

describe('parseLiiCcrHtml', () => {
  test('identity, breadcrumb hierarchy, linearized text, authority and history notes, newest date', () => {
    const page = parseLiiCcrHtml(liiPage({ title: '16', cite: '3353', heading: 'Estimate/Work Order Requirements' }), {
      title: '16',
      cite: '3353',
    });
    expect(page.title).toBe('16');
    expect(page.cite).toBe('3353');
    expect(page.heading).toBe('Estimate/Work Order Requirements');
    expect(page.hierarchy).toEqual([
      'Title 16 - Professional and Vocational Regulations',
      'Division 33 - Bureau of Automotive Repair',
      'Chapter 1 - Automotive Repair Dealers and Official Stations and Adjusters',
      'Article 7 - Disclosure Requirements for Automotive Repair Dealers',
    ]);
    expect(page.text).toBe(
      'An estimate shall be provided to and authorized by the customer before any work commences.\n' +
        '(a) An automotive repair dealer shall provide the customer an estimate.\n' +
        '(1) Each part listed shall be new unless identified otherwise.\n' +
        '(b) Sublet repairs shall be disclosed; see section 3356 .',
    );
    expect(page.authorityNote).toBe(
      'Note: Authority cited: Sections 9882 and 9884.9, Business and Professions Code. Reference: Section 9884.9, Business and Professions Code.',
    );
    expect(page.historyNote?.split('\n')).toHaveLength(2);
    expect(page.effectiveDate).toBe('2025-07-01');
    expect(page.repealed).toBe(false);
  });

  test('the Compare tab\'s older history never wins — the active tab is the regulation', () => {
    const page = parseLiiCcrHtml(
      liiPage({
        title: '16',
        cite: '3353',
        heading: 'Estimate/Work Order Requirements',
        compareHistory: ['9. Amendment filed 9-13-2018; operative 9/13/2018 (Register 2018, No. 37).'],
      }),
      { title: '16', cite: '3353' },
    );
    expect(page.effectiveDate).toBe('2025-07-01');
    expect(page.text).not.toContain('an older copy');
  });

  test('a repealed heading is flagged', () => {
    const page = parseLiiCcrHtml(liiPage({ title: '16', cite: '3359', heading: 'Sublet Disclosure. [Repealed]' }), {
      title: '16',
      cite: '3359',
    });
    expect(page.repealed).toBe(true);
  });

  test('absence (a generic page with no title) throws; a different section than requested throws', () => {
    expect(() => parseLiiCcrHtml(MISSING, { title: '16', cite: '9999' })).toThrow(/does not exist/);
    expect(() =>
      parseLiiCcrHtml(liiPage({ title: '10', cite: '2695.8', heading: 'Additional Standards' }), { title: '16', cite: '2695.8' }),
    ).toThrow(/different section/);
  });

  test('linearizeLiiText: designators stay attached, source line wraps collapse', () => {
    expect(
      linearizeLiiText(
        '<div class="subsect indent0"><span class="designator">1.</span> Applicability of Order This order shall apply to all\n\t\t persons.<div class="subsect indent1"><span class="designator">(A)</span> Provisions of Sections 3 through <span class="codecitation"><a href="/x">12</a></span> of this order.</div></div>',
      ),
    ).toEqual([
      '1. Applicability of Order This order shall apply to all persons.',
      '(A) Provisions of Sections 3 through 12 of this order.',
    ]);
  });
});
