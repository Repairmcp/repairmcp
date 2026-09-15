import { describe, expect, test } from 'bun:test';
import {
  OhParseError, htmlToText, isNumberNotFound, parseLongDate, parseOhChapterPage, parseOhSectionPage, parseSlashDate, splitCatchline,
} from '../src/parse-codes.js';

const CHROME_TOP = `<!DOCTYPE html><html lang="en"><head><title>x</title><meta charset="utf-8" /></head><body><main><div class="section-banner no-print">The Legislative Service Commission staff updates the Revised Code on an ongoing basis.</div>`;
const CHROME_BOTTOM = `</main><footer><p class=" no-print"><a href="/legal/disclaimer">Disclaimer</a></p></footer></body></html>`;

function crumbs(nodes: Array<[string, string]>): string {
  return `<div class="breadcrumbs">${nodes.map(([h, t]) => `<div class="breadcrumbs-node"><a href="${h}">${t}</a></div>`).join('<div class="breadcrumbs-separator">/</div>')}</div>`;
}
function info(rows: Array<[string, string]>): string {
  return `<div class="laws-section-info">${rows.map(([l, v]) => `<div class="laws-section-info-module"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('')}<div class="laws-section-info-module no-print"><div class="label">PDF:</div><div class="value"><a target="_blank" href="/assets/x.pdf">Download Authenticated PDF</a></div></div>&nbsp;</div>`;
}
function body(paragraphs: string[], opts: { tag?: 'section' | 'div'; notice?: string } = {}): string {
  const tag = opts.tag ?? 'section';
  const notice = opts.notice ? `<div class="laws-notice"><p>${opts.notice}</p></div>` : '';
  return `<${tag} class="laws-body"><span>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</span>${notice}</${tag}>`;
}
function headLine(word: string, cite: string, catchline: string | undefined): string {
  return catchline === undefined ? `${word} ${cite}` : `${word} ${cite} <span class='codes-separator'>|</span> ${catchline}`;
}
function supplemental(fields: Array<[string, string]>, fiveYear?: string, prior?: string): string {
  return `<section class="laws-history"><h2>Supplemental Information</h2><div class="laws-additional-information">${fields.map(([l, v]) => `<strong>${l}</strong>\n<span>${v}</span>\n<br>`).join('')}<!--\t\t\t<strong>Current Five Year Review Date:</strong>-->\n<!--\t\t\t<span th:utext="*{mostRecentFiveYearReviewDate.slashesDateFormat}"></span>-->\n<!--\t\t\t<br>-->\n${fiveYear ? `<strong>Five Year Review Date:</strong>\n<span>${fiveYear}</span>\n<br>` : ''}${prior ? `<strong>Prior Effective Dates:</strong>\n<span>${prior}</span>\n<br>` : ''}</div></section>`;
}
const nav = `<div class="profile-navigator no-print"><div class="previous"><a href="/x"><img src="/p.png" alt="Previous"></a></div></div>`;

/** An ORC section page in the real markup, including the "Available Versions" history block and the pager. */
export function orcSectionPage(opts: { cite: string; catchline: string; effective: string; legislation: string; paragraphs: string[]; chapter?: string; chapterTitle?: string; notice?: string }): string {
  const chapter = opts.chapter ?? opts.cite.split('.')[0]!;
  return `${CHROME_TOP}<div class="laws-header"><section><h1>Section ${opts.cite} <span class='codes-separator'>|</span> ${opts.catchline}</h1>${crumbs([['/ohio-revised-code', 'Ohio Revised Code'], ['/ohio-revised-code/title-39', 'Title 39 Insurance'], [`/ohio-revised-code/chapter-${chapter}`, `Chapter ${chapter} ${opts.chapterTitle ?? 'Superintendent Of Insurance'}`]])}${nav}</section></div><div class="clear">&nbsp;</div>${info([['Effective:', opts.effective], ['Latest Legislation: ', opts.legislation]])}${body(opts.paragraphs, { notice: opts.notice })}<section class="laws-history"><h2>Available Versions of this Section</h2><ul><li><span>${opts.effective} &ndash; Amended by ${opts.legislation}</span></li></ul></section>${nav}${CHROME_BOTTOM}`;
}
/** An OAC rule page in the real markup, with the Supplemental Information block. */
export function oacRulePage(opts: { cite: string; catchline: string; effective: string; paragraphs: string[]; chapter?: string; chapterTitle?: string; authorizedBy?: string; amplifies?: string; fiveYear?: string; prior?: string; notice?: string }): string {
  const chapter = opts.chapter ?? opts.cite.replace(/-\d+$/, '');
  return `${CHROME_TOP}<div class="laws-header"><section><h1>Rule ${opts.cite} <span class='codes-separator'>|</span> ${opts.catchline}</h1>${crumbs([['/ohio-administrative-code', 'Ohio Administrative Code'], ['/ohio-administrative-code/3901', '3901 '], [`/ohio-administrative-code/chapter-${chapter}`, `Chapter ${chapter} | ${opts.chapterTitle ?? 'General Provisions'}`]])}${nav}</section></div>${info([['Effective:', opts.effective], ['Promulgated Under:', `<a class='section-link' href='/ohio-revised-code/section-119.03'>119.03</a>`]])}<div><div>${body(opts.paragraphs, { notice: opts.notice ?? `Last updated ${opts.effective} at 8:55 AM` })}${supplemental([['Authorized By:', opts.authorizedBy ?? `<a class='section-link' href='/ohio-revised-code/section-3901.041'>3901.041</a>`], ['Amplifies:', opts.amplifies ?? `<a class='section-link' href='/ohio-revised-code/section-3901.19'>3901.19</a> to <a class='section-link' href='/ohio-revised-code/section-3901.26'>3901.26</a>`]], opts.fiveYear, opts.prior)}</div></div>${nav}${CHROME_BOTTOM}`;
}
/** The Constitution page: h1 "Article II, Section 34a | Minimum Wage", a DIV laws-body, no history block. */
export function constSectionPage(opts: { paragraphs: string[]; effective?: string }): string {
  return `${CHROME_TOP}<div class="laws-header"><section><h1>Article II, Section 34a <span class='codes-separator'>|</span> Minimum Wage</h1>${crumbs([['/ohio-constitution', 'Ohio Constitution'], ['/ohio-constitution/article-2', 'Article II Legislative']])}${nav}</section></div><div class="clear">&nbsp;</div>${info([['Effective:', opts.effective ?? 'December 8, 2006']])}${body(opts.paragraphs, { tag: 'div' })}${nav}${CHROME_BOTTOM}`;
}
/** A chapter page: h1 "Chapter N | Title", then one content-head/content-body pair per section, each carrying the same block a section page carries. */
export function chapterPage(opts: { code: 'ORC' | 'OAC'; chapter: string; title: string; entries: Array<{ cite: string; catchline?: string; effective: string; legislation?: string; paragraphs: string[]; fiveYear?: string; prior?: string; notice?: string; pdfFiled?: boolean }> }): string {
  const word = opts.code === 'ORC' ? 'Section' : 'Rule';
  const href = (cite: string) => (opts.code === 'ORC' ? `section-${cite}` : `/ohio-administrative-code/rule-${cite}`);
  const rows = opts.entries.map((e, i) => {
    const block = e.pdfFiled
      ? `<div class="laws-section-info"><div class="laws-section-info-module"><div class="label">Effective:</div><div class="value">${e.effective}</div></div></div><p>This rule was filed with the Legislative Service Commission in PDF format and is presented here as filed.</p><p><a href="/assets/x.pdf">View Rule Text</a></p>`
      : opts.code === 'ORC'
        ? `${info([['Effective:', e.effective], ['Latest Legislation: ', e.legislation ?? 'House Bill 1 - 100th General Assembly']])}${body(e.paragraphs, { notice: e.notice })}`
        : `<div><div>${info([['Effective:', e.effective], ['Promulgated Under:', `<a class='section-link' href='/ohio-revised-code/section-119.03'>119.03</a>`]])}${body(e.paragraphs, { notice: e.notice ?? `Last updated ${e.effective} at 9:00 AM` })}${supplemental([['Authorized By:', '4121.13'], ['Amplifies:', '4121.47']], e.fiveYear, e.prior)}</div></div>`;
    return `<tr><td class="name-cell"><div class="list-content"><span id="content-head-${i + 1}" class="content-head"><span class="content-head-text"><a href="${href(e.cite)}">${headLine(word, e.cite, e.catchline)}</a></span></span><div class="clear">&nbsp;</div><div id="content-body-${i + 1}" class="content-body">${block}</div></div></td></tr>`;
  }).join('');
  return `${CHROME_TOP}<div class="laws-header"><h1>Chapter ${opts.chapter} <span class='codes-separator'>|</span> ${opts.title}</h1>${crumbs([['/x', 'Ohio Revised Code']])}</div><div class="global-content-controls"><a id="expand-all-button">Expand All</a></div><table class="data-grid laws-table"><tr><th>${word}</th></tr>${rows}</table>${CHROME_BOTTOM}`;
}
export function numberNotFoundPage(number: string): string {
  return `${CHROME_TOP}<div class="laws-header"><h1>Number Not Found</h1></div><p>No Ohio Revised Code section number corresponds to '${number}'.</p><form><input name="q"></form>${CHROME_BOTTOM}`;
}
export function pdfFiledRulePage(cite: string): string {
  return `${CHROME_TOP}<div class="laws-header"><section><h1>Rule ${cite} <span class='codes-separator'>|</span> Flammable finishes.</h1>${crumbs([['/ohio-administrative-code', 'Ohio Administrative Code'], ['/x', '1301:7 '], ['/ohio-administrative-code/chapter-1301:7-7', 'Chapter 1301:7-7 | Ohio Fire Code']])}</section></div>${info([['Effective:', 'November 20, 2025']])}<p>This rule was filed with the Legislative Service Commission in PDF format and is presented here as filed.</p><p><a href="/assets/laws/administrative-code/rules/1301/7/1301$7-7-24_eff_11_20_25.pdf">View Rule Text</a></p>${CHROME_BOTTOM}`;
}

describe('helpers', () => {
  test('dates', () => {
    expect(parseLongDate('October 24, 2024')).toBe('2024-10-24');
    expect(parseLongDate('June 30, 2023')).toBe('2023-06-30');
    expect(parseLongDate('nonsense')).toBeUndefined();
    expect(parseSlashDate('2/27/2027')).toBe('2027-02-27');
    expect(parseSlashDate('11/12/2004')).toBe('2004-11-12');
    expect(parseSlashDate('x')).toBeUndefined();
  });
  test('splitCatchline', () => {
    expect(splitCatchline("[Governor's veto not reflected; see H.B. 434 status report] Vehicle left on private property.")).toEqual({ heading: 'Vehicle left on private property.', statusNote: "Governor's veto not reflected; see H.B. 434 status report" });
    expect(splitCatchline('[Repealed effective 10/06/2026 by H.B. 433, 136th General Assembly] Ethanol blended.')).toEqual({ heading: 'Ethanol blended.', statusNote: 'Repealed effective 10/06/2026 by H.B. 433, 136th General Assembly' });
    expect(splitCatchline('Overtime.')).toEqual({ heading: 'Overtime.' });
  });
  test('htmlToText: one paragraph per line, whitespace collapsed, entities decoded, links kept as text, laws-notice cut', () => {
    expect(htmlToText(`<span><p>(A) Making,\n\t\t  issuing</p><p> (B) See section <a class='section-link' href='/x'>3901.213</a> &amp; use &quot;free&quot;.</p></span><div class="laws-notice"><p>Last updated August 27, 2024 at 4:01 PM</p></div>`))
      .toBe('(A) Making, issuing\n(B) See section 3901.213 & use "free".');
  });
  test('isNumberNotFound', () => {
    expect(isNumberNotFound(numberNotFoundPage('3901.9999'))).toBe(true);
    expect(isNumberNotFound(orcSectionPage({ cite: '3901.20', catchline: 'x.', effective: 'January 5, 1988', legislation: 'House Bill 1 - 117th General Assembly', paragraphs: ['y'] }))).toBe(false);
  });
});

describe('parseOhSectionPage', () => {
  test('an ORC section page: cite, catchline, effective date, Latest Legislation, chapter and title from the breadcrumb, text without the notice', () => {
    const html = orcSectionPage({ cite: '4505.104', catchline: 'Obtaining certificate of title to unclaimed motor vehicle.', effective: 'October 24, 2024', legislation: 'Senate Bill 94 - 135th General Assembly', chapter: '4505', chapterTitle: 'Certificate Of Motor Vehicle Title Law', paragraphs: ['(A) A towing service or storage facility that is in possession of a motor vehicle may obtain a certificate of title.', '(B) The clerk of court shall issue a certificate of title.'], notice: 'Last updated August 27, 2024 at 4:01 PM' });
    const r = parseOhSectionPage(html, { code: 'ORC', cite: '4505.104' });
    expect(r.cite).toBe('4505.104');
    expect(r.heading).toBe('Obtaining certificate of title to unclaimed motor vehicle.');
    expect(r.effectiveDate).toBe('2024-10-24');
    expect(r.latestLegislation).toBe('Senate Bill 94 - 135th General Assembly');
    expect(r.chapter).toBe('4505');
    expect(r.chapterTitle).toBe('Certificate Of Motor Vehicle Title Law');
    expect(r.text).toBe('(A) A towing service or storage facility that is in possession of a motor vehicle may obtain a certificate of title.\n(B) The clerk of court shall issue a certificate of title.');
    expect(r.text).not.toContain('Last updated');
    expect(r.statusNote).toBeUndefined();
    expect(r.priorEffectiveDates).toBeUndefined();
  });
  test('a bracketed catchline prefix becomes statusNote', () => {
    const html = orcSectionPage({ cite: '4513.60', catchline: "[Governor's veto not reflected; see H.B. 434 status report] Vehicle left on private residential property.", effective: 'November 25, 2025', legislation: 'House Bill 434 - 136th General Assembly', chapter: '4513', chapterTitle: 'Traffic Laws - Equipment; Loads', paragraphs: ['(A)(1) The sheriff of a county may order into storage any motor vehicle.'] });
    const r = parseOhSectionPage(html, { code: 'ORC', cite: '4513.60' });
    expect(r.heading).toBe('Vehicle left on private residential property.');
    expect(r.statusNote).toBe("Governor's veto not reflected; see H.B. 434 status report");
  });
  test('an OAC rule page: the Supplemental Information block, links flattened, comments ignored', () => {
    const html = oacRulePage({ cite: '3901-1-54', catchline: 'Unfair property/casualty claims settlement practices.', effective: 'February 14, 2022', chapter: '3901-1', chapterTitle: 'General Provisions', paragraphs: ['(A) Purpose', 'The purpose of this rule is to set forth minimum standards.'], fiveYear: '2/27/2027', prior: '9/1/1993, 11/12/2004, 4/5/2007, 11/3/2016' });
    const r = parseOhSectionPage(html, { code: 'OAC', cite: '3901-1-54' });
    expect(r.effectiveDate).toBe('2022-02-14');
    expect(r.latestLegislation).toBeUndefined();
    expect(r.chapter).toBe('3901-1');
    expect(r.chapterTitle).toBe('General Provisions');
    expect(r.authorizedBy).toBe('3901.041');
    expect(r.amplifies).toBe('3901.19 to 3901.26');
    expect(r.fiveYearReviewDate).toBe('2027-02-27');
    expect(r.priorEffectiveDates).toEqual(['1993-09-01', '2004-11-12', '2007-04-05', '2016-11-03']);
    expect(r.text).toBe('(A) Purpose\nThe purpose of this rule is to set forth minimum standards.');
  });
  test('a Prior Effective Date carrying a trailing "(Emer.)" annotation parses to its plain ISO date (OAC 3745-31-30, live 2026-09-14)', () => {
    const r = parseOhSectionPage(oacRulePage({ cite: '3745-31-30', catchline: 'Auto body and frame refinishing.', effective: 'May 1, 2016', chapter: '3745-31', chapterTitle: 'Permit-by-rule', paragraphs: ['(A) Applicability.'], prior: '6/30/2008, 6/7/2010 (Emer.), 8/26/2010' }), { code: 'OAC', cite: '3745-31-30' });
    expect(r.priorEffectiveDates).toEqual(['2008-06-30', '2010-06-07', '2010-08-26']);
  });
  test('an OAC rule with no Five Year Review Date or Prior Effective Dates leaves them undefined', () => {
    const r = parseOhSectionPage(oacRulePage({ cite: '3745-21-18', catchline: 'Commercial motor vehicle and mobile equipment refinishing operations.', effective: 'March 27, 2022', chapter: '3745-21', chapterTitle: 'Carbon Monoxide, Photochemically Reactive Materials', paragraphs: ['(A) Applicability.'] }), { code: 'OAC', cite: '3745-21-18' });
    expect(r.fiveYearReviewDate).toBeUndefined();
    expect(r.priorEffectiveDates).toBeUndefined();
    expect(r.authorizedBy).toBe('3901.041');
  });
  test('the Constitution page: a div body, the article cite, chapter "art. II", title "Legislative"', () => {
    const r = parseOhSectionPage(constSectionPage({ paragraphs: ['Except as provided in this section, every employer shall pay their employees a wage rate.'] }), { code: 'Ohio Const.', cite: 'art. II, § 34a' });
    expect(r.cite).toBe('art. II, § 34a');
    expect(r.heading).toBe('Minimum Wage');
    expect(r.effectiveDate).toBe('2006-12-08');
    expect(r.chapter).toBe('art. II');
    expect(r.chapterTitle).toBe('Legislative');
    expect(r.text).toBe('Except as provided in this section, every employer shall pay their employees a wage rate.');
    expect(r.latestLegislation).toBeUndefined();
  });
  test('absence, a PDF-filed rule, a cite mismatch, and a missing Effective date all fail by name', () => {
    expect(() => parseOhSectionPage(numberNotFoundPage('3901.9999'), { code: 'ORC', cite: '3901.9999' })).toThrow(/ORC 3901\.9999: codes\.ohio\.gov answers "Number Not Found"/);
    expect(() => parseOhSectionPage(pdfFiledRulePage('1301:7-7-24'), { code: 'OAC', cite: '1301:7-7-24' })).toThrow(/filed .* in PDF format/);
    expect(() => parseOhSectionPage(orcSectionPage({ cite: '3901.20', catchline: 'x.', effective: 'January 5, 1988', legislation: 'House Bill 1 - 117th General Assembly', paragraphs: ['y'] }), { code: 'ORC', cite: '3901.21' })).toThrow(/expected ORC 3901\.21 but the page is headed Section 3901\.20/);
    const noDate = orcSectionPage({ cite: '3901.20', catchline: 'x.', effective: 'January 5, 1988', legislation: 'House Bill 1 - 117th General Assembly', paragraphs: ['y'] }).replace('<div class="label">Effective:</div>', '<div class="label">Effektiv:</div>');
    expect(() => parseOhSectionPage(noDate, { code: 'ORC', cite: '3901.20' })).toThrow(/no "Effective:" date/);
    expect(() => parseOhSectionPage('<html><body><h1>Something else</h1></body></html>', { code: 'ORC', cite: '3901.20' })).toThrow(OhParseError);
  });
});

describe('parseOhChapterPage', () => {
  const page = chapterPage({ code: 'ORC', chapter: '4113', title: 'Miscellaneous Labor Provisions', entries: [
    { cite: '4113.15', catchline: 'Semimonthly payment of wages.', effective: 'March 20, 2019', legislation: 'House Bill 494 - 132nd General Assembly', paragraphs: ['(A) Every employer doing business in this state shall pay.', '(B) Where wages remain unpaid for thirty days.'] },
    { cite: '4113.16', catchline: 'Other.', effective: 'October 1, 1953', paragraphs: ['x'], notice: 'Last updated January 1, 2020 at 1:00 PM' },
    { cite: '4113.19', catchline: 'Payment in scrip prohibited at higher prices - deductions from wages prohibited.', effective: 'October 1, 1953', legislation: 'House Bill 1 - 100th General Assembly', paragraphs: ['No person shall sell goods or supplies to his employee.'] },
  ] });
  test('every section on the page with its own date and legislation; the chapter title from the h1', () => {
    const r = parseOhChapterPage(page, { code: 'ORC', chapter: '4113' });
    expect(r.chapterTitle).toBe('Miscellaneous Labor Provisions');
    expect(r.sections.map((s) => s.cite)).toEqual(['4113.15', '4113.16', '4113.19']);
    expect(r.sections[0]!.effectiveDate).toBe('2019-03-20');
    expect(r.sections[0]!.latestLegislation).toBe('House Bill 494 - 132nd General Assembly');
    expect(r.sections[0]!.text).toBe('(A) Every employer doing business in this state shall pay.\n(B) Where wages remain unpaid for thirty days.');
    expect(r.sections[1]!.text).toBe('x');
    expect(r.sections[2]!.effectiveDate).toBe('1953-10-01');
  });
  test('an OAC chapter page carries each rule\'s Supplemental block', () => {
    const oac = chapterPage({ code: 'OAC', chapter: '4123:1-5', title: 'Workshops and Factories', entries: [
      { cite: '4123:1-5-01', catchline: 'Scope and definitions.', effective: 'June 30, 2023', paragraphs: ['(A) Scope.'], fiveYear: '6/30/2028', prior: '4/1/1964, 6/30/2023' },
      { cite: '4123:1-5-17', catchline: 'Personal protective equipment.', effective: 'February 1, 2024', paragraphs: ['(A) Scope.', '(v) All spray paint operations where the operator\'s eyes are exposed to paint mist in the atmosphere;'], fiveYear: '2/1/2029', prior: '4/1/1964' },
    ] });
    const r = parseOhChapterPage(oac, { code: 'OAC', chapter: '4123:1-5' });
    expect(r.sections.map((s) => s.cite)).toEqual(['4123:1-5-01', '4123:1-5-17']);
    expect(r.sections[1]!.priorEffectiveDates).toEqual(['1964-04-01']);
    expect(r.sections[1]!.fiveYearReviewDate).toBe('2029-02-01');
    expect(r.sections[1]!.authorizedBy).toBe('4121.13');
    expect(r.sections[1]!.text).toContain('All spray paint operations');
    expect(r.sections[1]!.latestLegislation).toBeUndefined();
  });
  test('a PDF-filed rule on a chapter page is skipped with its reason recorded, not fatal to the page; a wrong chapter fails; a duplicate cite fails', () => {
    const pdf = chapterPage({ code: 'OAC', chapter: '1301:7-7', title: 'Ohio Fire Code', entries: [{ cite: '1301:7-7-24', catchline: 'Flammable finishes.', effective: 'November 20, 2025', paragraphs: [], pdfFiled: true }, { cite: '1301:7-7-57', catchline: 'Liquids.', effective: 'November 20, 2025', paragraphs: ['x'] }] });
    const r = parseOhChapterPage(pdf, { code: 'OAC', chapter: '1301:7-7' });
    expect(r.sections.map((s) => s.cite)).toEqual(['1301:7-7-57']);
    expect(r.skipped.length).toBe(1);
    expect(r.skipped[0]!.cite).toBe('1301:7-7-24');
    expect(r.skipped[0]!.reason).toMatch(/OAC 1301:7-7-24 .*PDF format/);
    expect(() => parseOhChapterPage(page, { code: 'ORC', chapter: '4111' })).toThrow(/expected chapter 4111 but the page is headed Chapter 4113/);
    const dup = chapterPage({ code: 'ORC', chapter: '4113', title: 'T', entries: [{ cite: '4113.15', catchline: 'a.', effective: 'March 20, 2019', paragraphs: ['x'] }, { cite: '4113.15', catchline: 'b.', effective: 'March 20, 2019', paragraphs: ['y'] }] });
    expect(() => parseOhChapterPage(dup, { code: 'ORC', chapter: '4113' })).toThrow(/4113\.15 appears twice/);
  });
  test('a page with no section heads is refused', () => {
    expect(() => parseOhChapterPage(numberNotFoundPage('9999'), { code: 'ORC', chapter: '9999' })).toThrow(OhParseError);
  });
  test('a section too new to have a catchline yet ("Section N" with no separator) parses with an empty heading instead of failing the page (ORC 3901.93, live 2026-09-14)', () => {
    const withNewSection = chapterPage({ code: 'ORC', chapter: '3901', title: 'Superintendent Of Insurance', entries: [
      { cite: '3901.19', catchline: 'Unfair and deceptive practices definitions.', effective: 'March 20, 2019', paragraphs: ['(A) x.'] },
      { cite: '3901.93', effective: 'October 6, 2026', legislation: 'Senate Bill 315 - 136th General Assembly', paragraphs: ['(A) As used in this section:'] },
    ] });
    const r = parseOhChapterPage(withNewSection, { code: 'ORC', chapter: '3901' });
    expect(r.sections.map((s) => s.cite)).toEqual(['3901.19', '3901.93']);
    const s = r.sections.find((x) => x.cite === '3901.93')!;
    expect(s.heading).toBe('');
    expect(s.statusNote).toBeUndefined();
    expect(s.effectiveDate).toBe('2026-10-06');
  });
});
