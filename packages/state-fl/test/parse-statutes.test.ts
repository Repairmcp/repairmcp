import { describe, expect, test } from 'bun:test';
import { FlStatuteParseError, parseOnlineSunshineHtml } from '../src/parse-statutes.js';

/** The shape the first real capture found (2026-09-09), trimmed. */
function page(opts: { edition?: string; cite?: string; body?: string; history?: string; note?: string; absent?: boolean } = {}): string {
  const edition = opts.edition ?? 'The 2026 Florida Statutes';
  const head =
    '<html><body><table><tr><td><h2>' + edition + ' \n   \n  \n  <br><img src="x.gif"></h2></td></tr>' +
    '<tr><td id="content">';
  if (opts.absent) {
    return head + 'The statute you have selected cannot be found.  <BR></td></tr></table></body></html>';
  }
  const cite = opts.cite ?? '559.905';
  const body =
    opts.body ??
    '<div class="Subsection"><span class="Number">(1)&#x2003;</span><span xml:space="preserve" class="Text Intro Justify">When any customer requests a shop to perform repair work, the shop shall prepare a written repair estimate as required in s. <a href="index.cfm?x">559.909</a>(1). The estimate must include:</span>' +
    '<div class="Paragraph"><span class="Number">(a)&#x2003;</span><span xml:space="preserve" class="Text Intro Justify">The name of the shop.</span></div>' +
    '<div class="Paragraph"><span class="Number">(b)&#x2003;</span><span xml:space="preserve" class="Text Intro Justify">A statement:</span>' +
    '<p xml:space="preserve" class="BlockFlush SpaceAbove Justify">&#x201C;This charge represents costs and profits.&#x201D;</p>' +
    '<p xml:space="preserve" class="Indent SpaceAbove Justify"><span class="HorizontalRule TypeFixed">&#xA0;</span> I REQUEST A WRITTEN ESTIMATE.</p></div></div>' +
    '<div class="Subsection"><span class="Number">(2)&#x2003;</span><span xml:space="preserve" class="Text Intro Justify">Nothing in this section requires an estimate.</span></div>';
  const history = opts.history ?? 's. 1, ch. 80-139; s. 29, ch. 2024-137.';
  const note = opts.note
    ? `<div class="Note"><span class="NoteTitle">Note.</span><span class="EmDash">&#x2014;</span><span xml:space="preserve" class="Text Intro Justify">${opts.note}</span></div>`
    : '';
  return (
    head +
    '<div id="statutes"><font face="Verdana" size="-1"><!DOCTYPE html PUBLIC "x"><html><head><title>F.S. ' + cite + '</title></head><body>' +
    `<div class="Section"><span class="SectionNumber">${cite}&#x2003;</span>` +
    '<span class="Catchline"><span xml:space="preserve" class="CatchlineText">Written motor vehicle repair estimate and disclosure statement required.</span><span class="EmDash">&#x2014;</span></span>' +
    `<span class="SectionBody">${body}</span>` +
    `<div class="History"><span class="HistoryTitle">History.</span><span class="EmDash">&#x2014;</span><span xml:space="preserve" class="HistoryText">${history}</span></div>` +
    note +
    '</div></body></html></font></div></td></tr></table>' +
    '<p>Copyright &copy; 1995-2026 The Florida Legislature</p></body></html>'
  );
}

describe('parseOnlineSunshineHtml', () => {
  test('reads the edition, cite, catchline, body lines, and history', () => {
    const parsed = parseOnlineSunshineHtml(page());
    expect(parsed.edition).toBe('The 2026 Florida Statutes');
    expect(parsed.cite).toBe('559.905');
    expect(parsed.heading).toBe('Written motor vehicle repair estimate and disclosure statement required.');
    expect(parsed.text.split('\n')).toEqual([
      '(1) When any customer requests a shop to perform repair work, the shop shall prepare a written repair estimate as required in s. 559.909(1). The estimate must include:',
      '(a) The name of the shop.',
      '(b) A statement:',
      '“This charge represents costs and profits.”',
      '______ I REQUEST A WRITTEN ESTIMATE.',
      '(2) Nothing in this section requires an estimate.',
    ]);
    expect(parsed.historyNote).toBe('History.—s. 1, ch. 80-139; s. 29, ch. 2024-137.');
  });
  test('an editor\'s note rides on the history note', () => {
    const parsed = parseOnlineSunshineHtml(page({ note: 'Former s. 559.923.' }));
    expect(parsed.historyNote).toBe('History.—s. 1, ch. 80-139; s. 29, ch. 2024-137.\nNote.—Former s. 559.923.');
  });
  test('a special-session suffix is part of the edition phrase', () => {
    const parsed = parseOnlineSunshineHtml(page({ edition: 'The 2026 Florida Statutes (including 2026 Special Session A)' }));
    expect(parsed.edition).toBe('The 2026 Florida Statutes (including 2026 Special Session A)');
  });
  test('the copyright line after the embedded document is not law', () => {
    expect(parseOnlineSunshineHtml(page()).text).not.toContain('Copyright');
  });
  test('absence is HTTP 200 with a sentence, and it throws', () => {
    expect(() => parseOnlineSunshineHtml(page({ absent: true }))).toThrow(FlStatuteParseError);
    expect(() => parseOnlineSunshineHtml(page({ absent: true }))).toThrow(/cannot be found/);
  });
  test('a page without the edition marker throws', () => {
    expect(() => parseOnlineSunshineHtml('<html><body><div class="Section"></div></body></html>')).toThrow(/edition marker/);
  });
  test('a section with no body text throws', () => {
    expect(() => parseOnlineSunshineHtml(page({ body: '' }))).toThrow(/no body text/);
  });
});
