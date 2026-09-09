import { describe, expect, test } from 'bun:test';
import {
  FlFacParseError,
  parseFacChapterPage,
  parseFacDocumentText,
  parseFacRuleCard,
  usDateToIso,
} from '../src/parse-fac.js';

/** The chapter-page row shape flrules.org served 2026-09-09. */
export function chapterPage(rows: ReadonlyArray<{ cite: string; title: string; date: string; tid: string }>): string {
  return (
    '<html><body><table><tr class="header"><td>Rule</td></tr>' +
    rows
      .map(
        (r) =>
          `<tr class="results" bgcolor ="#eaeaff" ><td align="center"><a href = "/gateway/readFile.asp?sid=0&type=1&tid=${r.tid}&file=${r.cite}.doc" title="Rule file" ><img src="../images/view_word.png"></a></td>` +
          `<td nowrap align = center ><a class="FX_link_ID" href="/gateway/RuleNo.asp?title=ADJUSTERS&ID=${r.cite}"> ${r.cite} </a></td>` +
          `<td width=450 >${r.title}</td><td align="center">${r.date}</td></tr>`,
      )
      .join('') +
    '</table></body></html>'
  );
}

/** The rule-card shape flrules.org served 2026-09-09. */
export function ruleCard(opts: { cite: string; title: string; date: string; tid: string; history: string }): string {
  return (
    '<html><body><table class="tabHide"><tr><td colspan="3">Rule Title: ' + opts.title + ' </td></tr></table>' +
    '<p>Latest version of the final adopted rule presented in Florida Administrative Code (FAC): </p>' +
    '<table class="tabHide"><tr><td rowspan="3">' +
    `<a href="/gateway/readFile.asp?sid=0&amp;tid=${opts.tid}&amp;type=1&amp;file=${opts.cite}.doc"><img src="/images/VIEW_RULE.jpg"></a></td>` +
    `<td class="tdL">Effective Date:</td><td style="width: 50%;">${opts.date}  </td></tr>` +
    `<tr><td class="tdL">History Notes:</td><td> ${opts.history} </td></tr>` +
    '<tr><td class="tdL">References in this version: </td><td>No reference(s).</td></tr></table></body></html>'
  );
}

const HISTORY_HTML =
  'Rulemaking Authority <a href="/gateway/statute.asp?id=624.308" target=statute>624.308</a>, <a href="/gateway/statute.asp?id= 626.878" target=statute> 626.878</a> FS. Law Implemented <a href="/gateway/statute.asp?id=624.307" target=statute>624.307</a> FS. History&#8211;New 6-2-93, Amended 12-18-01, Formerly 4-220.201, Amended 4-21-25.';

describe('parseFacChapterPage', () => {
  test('reads cite, title, date, and the notice id from each row', () => {
    const rows = parseFacChapterPage(
      chapterPage([
        { cite: '69B-220.001', title: 'Licensure of Emergency Adjusters', date: '5/21/2023', tid: '27106473' },
        { cite: '69B-220.201', title: 'Ethical Requirements', date: '4/21/2025', tid: '29438547' },
      ]),
    );
    expect(rows).toEqual([
      { cite: '69B-220.001', title: 'Licensure of Emergency Adjusters', effectiveDate: '2023-05-21', docHref: '/gateway/readFile.asp?sid=0&type=1&tid=27106473&file=69B-220.001.doc', noticeId: '27106473' },
      { cite: '69B-220.201', title: 'Ethical Requirements', effectiveDate: '2025-04-21', docHref: '/gateway/readFile.asp?sid=0&type=1&tid=29438547&file=69B-220.201.doc', noticeId: '29438547' },
    ]);
  });
  test('a page with no rows throws', () => {
    expect(() => parseFacChapterPage('<html><body>System Message</body></html>')).toThrow(FlFacParseError);
  });
});

describe('parseFacRuleCard', () => {
  test('reads the title, date, history (anchors stripped cleanly), and the notice id', () => {
    const card = parseFacRuleCard(ruleCard({ cite: '69B-220.201', title: 'Ethical Requirements', date: '4/21/2025', tid: '29438547', history: HISTORY_HTML }));
    expect(card.title).toBe('Ethical Requirements');
    expect(card.effectiveDate).toBe('2025-04-21');
    expect(card.noticeId).toBe('29438547');
    expect(card.docHref).toBe('/gateway/readFile.asp?sid=0&tid=29438547&type=1&file=69B-220.201.doc');
    expect(card.historyNote).toBe(
      'Rulemaking Authority 624.308, 626.878 FS. Law Implemented 624.307 FS. History–New 6-2-93, Amended 12-18-01, Formerly 4-220.201, Amended 4-21-25.',
    );
  });
  test('a card missing the effective date throws', () => {
    expect(() => parseFacRuleCard('<html><body>Rule Title: X</body></html>')).toThrow(FlFacParseError);
  });
});

describe('parseFacDocumentText', () => {
  const BODY =
    '69B-220.201 Ethical Requirements for All Adjusters and Public Adjuster Apprentices.\n' +
    '(1) Definitions.\n' +
    '(a) "Adjuster,"  when   used without further specification, includes all types.\n' +
    '\n' +
    '(2) Violation.\n' +
    'Rulemaking Authority 624.308, 626.878 FS. Law Implemented 624.307 FS. History-New 6-2-93, Amended 12-18-01, Formerly 4-220.201, Amended 4-21-25.\n\n';
  test('splits the title, normalizes whitespace, and lifts the history line off the body', () => {
    const parsed = parseFacDocumentText(BODY, '69B-220.201');
    expect(parsed.title).toBe('Ethical Requirements for All Adjusters and Public Adjuster Apprentices.');
    expect(parsed.text).toBe('(1) Definitions.\n(a) "Adjuster," when used without further specification, includes all types.\n(2) Violation.');
    expect(parsed.historyLine).toMatch(/^Rulemaking Authority/);
  });
  test('a document that opens with a different rule number throws', () => {
    expect(() => parseFacDocumentText(BODY, '69B-220.051')).toThrow(/does not open with the requested rule number/);
  });
  test('a document with a title and history but no body throws', () => {
    expect(() => parseFacDocumentText('69B-220.201 Title.\nRulemaking Authority 1 FS.\n', '69B-220.201')).toThrow(/no body text/);
  });
});

describe('usDateToIso', () => {
  test('pads month and day', () => {
    expect(usDateToIso('4/21/2025')).toBe('2025-04-21');
    expect(usDateToIso('11/2/1992')).toBe('1992-11-02');
    expect(usDateToIso('2025-04-21')).toBeUndefined();
  });
});
