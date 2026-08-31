import { describe, expect, test } from 'bun:test';
import {
  findAgencyIds, findCurrentVersion, findRuleId, parseCcrPdfPages, stripPageFurniture,
} from '../src/parse-ccr.js';

/**
 * REAL SLICES, taken from the pages and documents saved by the first Colorado
 * capture (2026-08-31). Every fixture in this file is publisher output, not a
 * reconstruction — the task-9 synthetic shapes are gone because they agreed
 * with none of the three real ones. What changed, in order of how much it
 * mattered:
 *
 *  - The "Word document" download is `application/msword`, a legacy OLE .doc,
 *    so the DOCX/word-document.xml path could never have worked. The capture
 *    now reads the PDF, which the rule-info page itself calls the official
 *    version of the rule.
 *  - The rule-info page lists ~70 archived versions under the current one, and
 *    the FIRST archived row for 3 CCR 702-5 is version 12316 effective
 *    12/30/2026 — later dated and higher numbered than the current 12295. Any
 *    "first match", "highest id" or "latest date" rule picks a version that is
 *    not in force. The fixture keeps that row.
 *  - The department and document lists carry each row's identity in its own
 *    href, so the ±200/+300-character proximity windows are gone.
 *  - The three agencies do not typeset alike: DOI capitalises its catchlines,
 *    the PUC does not, and COMPS numbers an outline with no `Rule` prefix on
 *    the provisions the manifest actually cites.
 */

// ---------------------------------------------------------------- rule-info

/** 3 CCR 702-5's rule-info page: current version 12295, then archived 12316. */
const RULE_INFO_702_5 = `
<!-- BEGIN: New "Current version" table mimicking Archived versions table logic -->
<table style="width: 980;"><tr><td><p style="margin-left: 3em;">
<b>Current version</b>
</p></td></tr>
<tr><td><p style="margin-left: 3em;">The PDF document constitutes the official version of
the rule and shall govern in all cases. The Word document is provided as an accessible
alternative.</p></td></tr></table>
<table style="margin-left:3em;" class="noStripes"><thead><tr>
<th class="backgroundBlue"><b>Effective date <br>(PDF)</b></th>
<th class="backgroundBlue"><b>Filing Type</b></th>
<th class="backgroundBlue"><b>Adopted date</b></th>
<th class="backgroundBlue"><b>Colorado Register<br>publication date</b></th>
<th class="backgroundBlue"><b>Download Word version</b></th>
</tr></thead><tbody><tr>
<td style="text-align: center;"><a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; OpenRuleWindow('12295', '3 CCR 702-5' )" data-cf-modified-fbec94caefc83a8b6f1bd47a-="">12/30/2025 (PDF)</a></td>
<td>Permanent Rule</td>
<td style="text-align: center;">11/07/2025</td>
<td style="text-align: center;"><a href="/CCR/RegisterContents.do?publicationDay=12/10/2025&amp;Volume=48">12/10/2025</a></td>
<td style="text-align: center;"><a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; OpenRuleWordVersion('12295', '3 CCR 702-5' )" data-cf-modified-fbec94caefc83a8b6f1bd47a-="">12/30/2025 (DOCX)</a></td>
</tr></tbody></table>
<!-- END: New "Current version" table -->
<!-- "Archived version" table -->
<table style="width: 980;"><tr><td><p style="margin-left: 3em;">
<b>Archived versions</b>
</p></td></tr></table>
<table style="margin-left:3em;" class="noStripes"><thead><tr>
<th class="backgroundBlue"><b>Rule version by <br>effective date (PDF)</b></th>
</tr></thead><tbody>
<tr><td style="text-align: center;"><a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; OpenRuleWindow('12316', '3 CCR 702-5' )" data-cf-modified-fbec94caefc83a8b6f1bd47a-="">12/30/2026 (PDF) </a></td>
<td style="text-align: center;"><a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; OpenRuleWordVersion('12316', '3 CCR 702-5' )" data-cf-modified-fbec94caefc83a8b6f1bd47a-="">12/30/2026 (DOCX)</a></td></tr>
<tr><td style="text-align: center;"><a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; OpenRuleWindow('12250', '3 CCR 702-5' )" data-cf-modified-fbec94caefc83a8b6f1bd47a-="">11/30/2025 (PDF) </a></td></tr>
</tbody></table>`;

// ------------------------------------------------------------- browse lists

/** Three adjacent Division rows from the 273-row department list. */
const DEPT_LIST = `
<TR class="rowEven"><TD>&nbsp;&nbsp;&nbsp;&nbsp;701 &nbsp;<a href="/CCR/NumericalCCRDocList.do?deptID=18&deptName=700 Department of Regulatory Agencies&agencyID=13&agencyName=701 Division of Banking"> <u>Division of Banking</u></a></TD></TR>
<TR class="rowEven"><TD>&nbsp;&nbsp;&nbsp;&nbsp;702 &nbsp;<a href="/CCR/NumericalCCRDocList.do?deptID=18&deptName=700 Department of Regulatory Agencies&agencyID=57&agencyName=702 Division of Insurance"> <u>Division of Insurance</u></a></TD></TR>
<TR class="rowEven"><TD>&nbsp;&nbsp;&nbsp;&nbsp;723 &nbsp;<a href="/CCR/NumericalCCRDocList.do?deptID=18&deptName=700 Department of Regulatory Agencies&agencyID=96&agencyName=723 Public Utilities Commission"> <u>Public Utilities Commission</u></a></TD></TR>
<TR class="rowEven"><TD>&nbsp;&nbsp;&nbsp;&nbsp;1101 &nbsp;<a href="/CCR/NumericalCCRDocList.do?deptID=10&deptName=1100 Department of Labor and Employment&agencyID=29&agencyName=1101 Division of Unemployment Insurance"> <u>Division of Unemployment Insurance</u></a></TD></TR>
<TR class="rowEven"><TD>&nbsp;&nbsp;&nbsp;&nbsp;1101 &nbsp;<a href="/CCR/NumericalCCRDocList.do?deptID=10&deptName=1100 Department of Labor and Employment&agencyID=58&agencyName=1101 Division of Labor Standards and Statistics (Includes 1103 Series)"> <u>Division of Labor Standards and Statistics</u></a></TD></TR>`;

/** The prefix traps from the real Division of Insurance document list. */
const DOC_LIST = `
<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=2195&deptID=18&agencyID=57&deptName=Department of Regulatory Agencies&agencyName=Division of Insurance&seriesNum=3 CCR 702-1">3 CCR 702-1</a>
<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=2200&deptID=18&agencyID=57&deptName=Department of Regulatory Agencies&agencyName=Division of Insurance&seriesNum=3 CCR 702-4">3 CCR 702-4</a>
<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=3119&deptID=18&agencyID=57&deptName=Department of Regulatory Agencies&agencyName=Division of Insurance&seriesNum=3 CCR 702-4 Series 4-1">3 CCR 702-4 Series 4-1</a>
<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=2201&deptID=18&agencyID=57&deptName=Department of Regulatory Agencies&agencyName=Division of Insurance&seriesNum=3 CCR 702-5">3 CCR 702-5</a>
<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=2206&deptID=18&agencyID=57&deptName=Department of Regulatory Agencies&agencyName=Division of Insurance&seriesNum=3 CCR 702-10">3 CCR 702-10</a>`;

// ------------------------------------------------------------- PDF fixtures

const FURNITURE = 'CODE OF COLORADO REGULATIONS 3 CCR 702-5\nDivision of Insurance';

/**
 * Real lines from 3 CCR 702-5: a catchline that wrapped across two lines, the
 * Effective Date / History pair at the end of a regulation, and the history
 * sentences that the old "anything after the number" pattern read as headers.
 */
const DOI_PAGES = [
  `${FURNITURE}\n46\nRegulation 5-1-14 PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND
CASUALTY FIRST PARTY CLAIMS
Section 1 Authority
This regulation is promulgated and adopted by the Commissioner of Insurance pursuant to §§ 10-1-109
and 10-3-1110, C.R.S.
Section 7 Effective Date
Section 8 History`,
  `${FURNITURE}\n47\nSection 4 Rules
A. Timely Decisions and Payment of Benefits
Section 7 Effective Date
This regulation shall become effective on September 1, 2012.
Section 8 History
New regulation 78-14, effective 1978.
Amended regulation effective September 1, 2012.
Regulation 5-1-18 effective October 1, 2013.`,
  `${FURNITURE}\n48\nRegulation 5-1-19 [Repealed eff. 02/14/2025]
Regulation 5-1-20 RATE CAPPING AND TRANSITION PLAN PRACTICES FOR PROPERTY
Section 1 Authority
Regulation 5-3-1 and is certified with a Cost Containment Certificate by the Colorado Cost
Containment Board.
Regulation 5-2-16 eff. 03/17/2025.`,
];

/** Real lines from 4 CCR 723-6: the towing band, including its reserved slots. */
const PUC_PAGES = [
  `CODE OF COLORADO REGULATIONS 4 CCR 723-6\nPublic Utilities Commission\n71
6500. Applicability of Towing Carrier Rules.
Rules 6500 through 6514 apply to towing carriers.
6502. [Reserved].
6511. Rates and Charges.
(a) Drop Charge. A towing carrier is prohibited from assessing a drop charge for a Residential PPI.
(I) The maximum drop charge is as follows for each vehicle weight classification:
Rates set under 6511(a), (b), (c), (d), and (e). In the event rates are not set through a written
agreement, the maximum rates apply.
6515. - 6599. [Reserved].
MOVER RULES`,
];

/** Real lines from 7 CCR 1103-1 (COMPS Order #40). */
const COMPS_PAGES = [
  `CODE OF COLORADO REGULATIONS 7 CCR 1103-1\nDivision of Labor Standards and Statistics\n18
Rule 4. Overtime.
4.1 Overtime Wages.
4.1.1 Employees shall be paid time and one-half of the regular rate of pay for
any work in excess of any of the following, whichever results in the greater payment of wages.
4.1.2 Overtime is calculated on a workweek basis.
Rule 5. Meal and Rest Periods.
5.1 Meal Periods. Employees shall be entitled to an uninterrupted and duty-free meal
period of at least a 30-minute duration when the shift exceeds 5 consecutive
hours.
5.2 Rest Periods. Every employer shall authorize and permit a compensated 10-
minute rest period for each 4 hours of work, or major fractions thereof.
Rule 4 overtime rules do not apply to decision-making managers at`,
];

describe('stripPageFurniture', () => {
  test('removes the running header and the page number, and only at page edges', () => {
    const { lines, dropped } = stripPageFurniture(DOI_PAGES);
    expect(dropped).toBe(9); // three pages x (two header lines + one page number)
    expect(lines.some((l) => l.startsWith('CODE OF COLORADO REGULATIONS'))).toBe(false);
    expect(lines).not.toContain('46');
    // Nothing that is rule text was touched.
    expect(lines).toContain('Section 4 Rules');
    expect(lines).toContain('This regulation shall become effective on September 1, 2012.');
  });
  test('a bare number in the middle of a page is left alone', () => {
    const { lines } = stripPageFurniture(['a\nb\nc\n7\nd\ne\nf\ng']);
    expect(lines).toContain('7');
  });
});

describe('parseCcrPdfPages — Division of Insurance regulations', () => {
  const { regs } = parseCcrPdfPages(DOI_PAGES, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });

  test('history sentences are not mistaken for headers', () => {
    expect(regs.map((r) => r.regNumber)).toEqual(['5-1-14', '5-1-19', '5-1-20']);
  });
  test('a catchline that wrapped across two lines is rejoined', () => {
    expect(regs[0]!.heading).toBe(
      'PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS',
    );
  });
  test('the stated effective date comes from the Effective Date section, not the History list', () => {
    // The History list's last date is the same September 1, 2012, but it also
    // contains "effective 1978" and "October 1, 2013" — reading the tail of the
    // text picks one of those instead.
    expect(regs[0]!.statedEffectiveDate).toBe('2012-09-01');
  });
  test('a repealed slot is flagged as a placeholder rather than captured as a rule', () => {
    expect(regs[1]!.placeholder).toBe(true);
    expect(regs[0]!.placeholder).toBe(false);
  });
  test('the running header never lands inside the captured text', () => {
    for (const reg of regs) expect(reg.text).not.toContain('CODE OF COLORADO REGULATIONS');
  });
});

describe('parseCcrPdfPages — PUC towing rules', () => {
  const { regs } = parseCcrPdfPages(PUC_PAGES, { headerKind: 'puc-rule', seriesNum: '4 CCR 723-6' });

  test('title-case catchlines are headers and in-text cross references are not', () => {
    expect(regs.map((r) => r.regNumber)).toEqual(['6500', '6502', '6511', '6515']);
    expect(regs[2]!.text).toContain('Rates set under 6511(a), (b), (c), (d), and (e).');
  });
  test('reserved slots are placeholders', () => {
    expect(regs.filter((r) => r.placeholder).map((r) => r.regNumber)).toEqual(['6502', '6515']);
  });
  test('a complete heading does not swallow the part banner that follows it', () => {
    expect(regs[3]!.heading).toBe('- 6599. [Reserved].');
    expect(regs[3]!.text).toBe('MOVER RULES');
  });
});

describe('parseCcrPdfPages — COMPS outline', () => {
  const { regs } = parseCcrPdfPages(COMPS_PAGES, { headerKind: 'comps-rule', seriesNum: '7 CCR 1103-1' });

  test('provisions are numbered without a Rule prefix, and prose about a rule is not a header', () => {
    expect(regs.map((r) => r.regNumber)).toEqual(['4', '4.1', '4.1.1', '4.1.2', '5', '5.1', '5.2']);
  });
  test('a catchline sharing its line with the first sentence is split off', () => {
    const meal = regs.find((r) => r.regNumber === '5.1')!;
    expect(meal.heading).toBe('Meal Periods.');
    expect(meal.text.startsWith('Employees shall be entitled to an uninterrupted')).toBe(true);
  });
  test('a provision with no catchline inherits the enclosing one', () => {
    const overtime = regs.find((r) => r.regNumber === '4.1.1')!;
    expect(overtime.heading).toBe('Overtime Wages.');
    expect(overtime.text.startsWith('Employees shall be paid time and one-half')).toBe(true);
  });
  test('the sentence that begins "Rule 4 overtime rules do not apply" stays body text', () => {
    const rest = regs.find((r) => r.regNumber === '5.2')!;
    expect(rest.text).toContain('Rule 4 overtime rules do not apply');
  });
  test('a document with no headers hard-fails', () => {
    expect(() =>
      parseCcrPdfPages(['nothing here at all'], { headerKind: 'regulation', seriesNum: '3 CCR 702-5' }),
    ).toThrow(/no regulation headers/i);
  });
});

describe('SOS page discovery', () => {
  test('findAgencyIds reads each row’s own href parameters', () => {
    expect(findAgencyIds(DEPT_LIST, 'Department of Regulatory Agencies', 'Division of Insurance'))
      .toEqual({ deptID: 18, agencyID: 57 });
    expect(findAgencyIds(DEPT_LIST, 'Department of Regulatory Agencies', 'Public Utilities Commission'))
      .toEqual({ deptID: 18, agencyID: 96 });
    // The real name is "1101 Division of Labor Standards and Statistics
    // (Includes 1103 Series)" — the manifest names a substring of it.
    expect(findAgencyIds(DEPT_LIST, 'Department of Labor and Employment', 'Division of Labor Standards and Statistics'))
      .toEqual({ deptID: 10, agencyID: 58 });
  });
  test('a name that appears in the wrong department is not matched', () => {
    expect(() => findAgencyIds(DEPT_LIST, 'Department of Labor and Employment', 'Division of Insurance'))
      .toThrow(/not found/i);
  });
  test('an ambiguous name is a stop-and-look, not a first-wins guess', () => {
    expect(() => findAgencyIds(DEPT_LIST, 'Department of Regulatory Agencies', 'Division of'))
      .toThrow(/matches 2 rows/i);
  });
  test('findRuleId matches the series exactly — 702-1 is a prefix of 702-10', () => {
    expect(findRuleId(DOC_LIST, '3 CCR 702-5')).toBe(2201);
    expect(findRuleId(DOC_LIST, '3 CCR 702-1')).toBe(2195);
    expect(findRuleId(DOC_LIST, '3 CCR 702-10')).toBe(2206);
    expect(findRuleId(DOC_LIST, '3 CCR 702-4')).toBe(2200);
  });
  test('an absent series hard-fails', () => {
    expect(() => findRuleId(DOC_LIST, '3 CCR 702-99')).toThrow(/not found/i);
  });
});

describe('findCurrentVersion', () => {
  const version = findCurrentVersion(RULE_INFO_702_5);

  test('takes the current version, not the archived one printed right after it', () => {
    expect(version.ruleVersionId).toBe('12295');
    expect(version.effectiveDate).toBe('2025-12-30');
  });
  test('the archived row is both later-dated and higher-numbered — neither heuristic would work', () => {
    expect(RULE_INFO_702_5).toContain("OpenRuleWindow('12316'");
    expect(RULE_INFO_702_5).toContain('12/30/2026');
    expect(Number(version.ruleVersionId)).toBeLessThan(12316);
  });
  test('the download is the official PDF for that exact version', () => {
    expect(version.docDownload.url).toBe(
      'GenerateRulePdf.do?ruleVersionId=12295&fileName=3%20CCR%20702-5',
    );
  });
  test('the effective date is the version link’s own label, not the adopted or publication date', () => {
    expect(RULE_INFO_702_5).toContain('11/07/2025'); // adopted
    expect(RULE_INFO_702_5).toContain('12/10/2025'); // Colorado Register
    expect(version.effectiveDate).toBe('2025-12-30');
  });
  test('a page with no "Current version" heading hard-fails rather than scanning the archive', () => {
    const archivedOnly = RULE_INFO_702_5.replace('<b>Current version</b>', '<b>Something else</b>');
    expect(() => findCurrentVersion(archivedOnly)).toThrow(/Current version/i);
  });
  test('a current-version row showing "Imported" instead of a date hard-fails', () => {
    const undated = RULE_INFO_702_5.replace('>12/30/2025 (PDF)<', '>Imported<');
    expect(() => findCurrentVersion(undated)).toThrow(/Imported/i);
  });
});
