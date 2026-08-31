// packages/state-co/test/capture-ccr.test.ts
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureCcr } from '../src/capture-ccr.js';
import type { CoSection } from '../src/schema.js';
import { CCR_BASE, type CcrCaptureSource } from '../src/sources-ccr.js';

/**
 * Fixtures are real slices of the pages and documents the first Colorado
 * capture saved (2026-08-31) — the same material parse-ccr.test.ts pins,
 * restated here because those consts are private to that file. The two shapes
 * that changed since task 7: the rule-info page's current/archived version
 * tables, and the document itself, which is the official PDF rather than the
 * legacy .doc the SOS serves under "Word document".
 *
 * Page text is carried inside the fake PDF bytes so the fixtures stay readable
 * and no real PDF has to be committed: the bytes are the `%PDF-` magic the
 * capture checks for, followed by the pages as JSON, and the injected
 * extractPages reverses that. Every LINE inside is publisher output.
 */
function fakePdf(pages: readonly string[]): Uint8Array {
  return new TextEncoder().encode(`%PDF-${JSON.stringify(pages)}`);
}
const extractPages = async (bytes: Uint8Array): Promise<string[]> =>
  JSON.parse(new TextDecoder().decode(bytes.subarray(5))) as string[];

/** A current-version table followed by the archived one, as the SOS prints them. */
function ruleInfoHtml(opts: {
  versionId: string;
  effective: string;
  fileName: string;
  archivedId: string;
  archivedEffective: string;
}): string {
  const link = (fn: string, id: string, date: string, label: string): string =>
    `<a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; ` +
    `${fn}('${id}', '${opts.fileName}' )" data-cf-modified-fbec94caefc83a8b6f1bd47a-="">${date} (${label})</a>`;
  return `
<table><tr><td><p><b>Current version</b></p></td></tr></table>
<table class="noStripes"><thead><tr><th><b>Effective date <br>(PDF)</b></th><th><b>Adopted date</b></th></tr></thead>
<tbody><tr>
<td>${link('OpenRuleWindow', opts.versionId, opts.effective, 'PDF')}</td>
<td style="text-align: center;">11/07/2025</td>
<td>${link('OpenRuleWordVersion', opts.versionId, opts.effective, 'DOCX')}</td>
</tr></tbody></table>
<table><tr><td><p><b>Archived versions</b></p></td></tr></table>
<table class="noStripes"><tbody><tr>
<td>${link('OpenRuleWindow', opts.archivedId, opts.archivedEffective, 'PDF')}</td>
</tr></tbody></table>`;
}

// --- DOI (3 CCR 702-5, headerKind 'regulation') ------------------------------
const DOI_DEPT_ID = 18;
const DOI_AGENCY_ID = 57;
const DOI_RULE_ID = 2201;
const DOI_RULE_VERSION_ID = '12295';

const DOI_SOURCE: CcrCaptureSource = {
  code: '3 CCR',
  deptName: 'Department of Regulatory Agencies',
  agencyName: 'Division of Insurance',
  seriesNum: '3 CCR 702-5',
  chapterKey: '702-5',
  chapterTitle: 'Property and Casualty',
  domain: 'insurance',
  headerKind: 'regulation',
  filter: { kind: 'regs', regCites: ['702-5-1-14', '702-5-2-12'] },
};

const DEPT_LIST_URL = `${CCR_BASE}/NumericalDeptList.do`;
const DOI_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=${DOI_DEPT_ID}&agencyID=${DOI_AGENCY_ID}`;
const DOI_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=${DOI_RULE_ID}&deptID=${DOI_DEPT_ID}&agencyID=${DOI_AGENCY_ID}`;
const DOI_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=${DOI_RULE_VERSION_ID}&fileName=3%20CCR%20702-5`;

const DOI_DEPT_LIST_HTML =
  `<a href="/CCR/NumericalCCRDocList.do?deptID=${DOI_DEPT_ID}&deptName=700 Department of Regulatory Agencies` +
  `&agencyID=${DOI_AGENCY_ID}&agencyName=702 Division of Insurance"> <u>Division of Insurance</u></a>`;
const DOI_DOC_LIST_HTML =
  `<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=${DOI_RULE_ID}&deptID=${DOI_DEPT_ID}` +
  `&agencyID=${DOI_AGENCY_ID}&seriesNum=3 CCR 702-5">3 CCR 702-5</a>`;
// The version's own effective date (12/30/2025) is deliberately different from
// the date 5-1-14's own text states (September 1, 2012), so the
// prefers-own / falls-back-to-version assertion cannot be satisfied by both
// paths landing on the same date. The archived row is later-dated AND
// higher-numbered, as the real page's first archived row is.
const DOI_RULE_INFO_HTML = ruleInfoHtml({
  versionId: DOI_RULE_VERSION_ID,
  effective: '12/30/2025',
  fileName: '3 CCR 702-5',
  archivedId: '12316',
  archivedEffective: '12/30/2026',
});

/**
 * Real 3 CCR 702-5 lines. 5-2-12's slice stops before its own Effective Date
 * section, which is what exercises the fallback to the version's date.
 */
const DOI_PDF = fakePdf([
  `CODE OF COLORADO REGULATIONS 3 CCR 702-5
Division of Insurance
46
Regulation 5-1-14 PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND
CASUALTY FIRST PARTY CLAIMS
Section 1 Authority
This regulation is promulgated and adopted by the Commissioner of Insurance pursuant to §§ 10-1-109
and 10-3-1110, C.R.S.
Section 7 Effective Date
This regulation shall become effective on September 1, 2012.
Section 8 History
New regulation 78-14, effective 1978.
Amended regulation effective September 1, 2012.`,
  `CODE OF COLORADO REGULATIONS 3 CCR 702-5
Division of Insurance
88
Regulation 5-2-12 CONCERNING AUTOMOBILE INSURANCE CONSUMER PROTECTIONS
Section 1 Authority
This regulation is promulgated and adopted by the Commissioner of Insurance under the authority of
§§ 10-1-109 and 10-4-616, C.R.S.`,
]);

const DOI_PAGES: Record<string, string> = {
  [DEPT_LIST_URL]: DOI_DEPT_LIST_HTML,
  [DOI_DOC_LIST_URL]: DOI_DOC_LIST_HTML,
  [DOI_RULE_INFO_URL]: DOI_RULE_INFO_HTML,
};
const DOI_BINARIES: Record<string, Uint8Array> = { [DOI_DOC_URL]: DOI_PDF };

// --- COMPS (7 CCR 1103-1, headerKind 'comps-rule') ---------------------------
const COMPS_DEPT_ID = 10;
const COMPS_AGENCY_ID = 58;
const COMPS_RULE_ID = 2509;
const COMPS_RULE_VERSION_ID = '12406';

const COMPS_SOURCE: CcrCaptureSource = {
  code: '7 CCR',
  deptName: 'Department of Labor and Employment',
  agencyName: 'Division of Labor Standards and Statistics',
  seriesNum: '7 CCR 1103-1',
  chapterKey: '1103-1',
  chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
  domain: 'employment',
  headerKind: 'comps-rule',
  filter: { kind: 'prefix', citePrefix: '1103-1-5.' },
};

const COMPS_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=${COMPS_DEPT_ID}&agencyID=${COMPS_AGENCY_ID}`;
const COMPS_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=${COMPS_RULE_ID}&deptID=${COMPS_DEPT_ID}&agencyID=${COMPS_AGENCY_ID}`;
const COMPS_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=${COMPS_RULE_VERSION_ID}&fileName=7%20CCR%201103-1`;

const COMPS_DEPT_LIST_HTML =
  `<a href="/CCR/NumericalCCRDocList.do?deptID=${COMPS_DEPT_ID}&deptName=1100 Department of Labor and Employment` +
  `&agencyID=${COMPS_AGENCY_ID}&agencyName=1101 Division of Labor Standards and Statistics (Includes 1103 Series)">` +
  `<u>Division of Labor Standards and Statistics</u></a>`;
const COMPS_DOC_LIST_HTML =
  `<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=${COMPS_RULE_ID}&deptID=${COMPS_DEPT_ID}` +
  `&agencyID=${COMPS_AGENCY_ID}&seriesNum=7 CCR 1103-1">7 CCR 1103-1</a>`;
const COMPS_RULE_INFO_HTML = ruleInfoHtml({
  versionId: COMPS_RULE_VERSION_ID,
  effective: '02/01/2026',
  fileName: '7 CCR 1103-1',
  archivedId: '11206',
  archivedEffective: '01/01/2024',
});

const COMPS_PDF = fakePdf([
  `CODE OF COLORADO REGULATIONS 7 CCR 1103-1
Division of Labor Standards and Statistics
22
Rule 4. Overtime.
4.1 Overtime Wages.
Rule 5. Meal and Rest Periods.
5.1 Meal Periods. Employees shall be entitled to an uninterrupted and duty-free meal
period of at least a 30-minute duration when the shift exceeds 5 consecutive
hours.
5.2 Rest Periods. Every employer shall authorize and permit a compensated 10-
minute rest period for each 4 hours of work, or major fractions thereof.`,
]);

const COMPS_PAGES: Record<string, string> = {
  [DEPT_LIST_URL]: COMPS_DEPT_LIST_HTML,
  [COMPS_DOC_LIST_URL]: COMPS_DOC_LIST_HTML,
  [COMPS_RULE_INFO_URL]: COMPS_RULE_INFO_HTML,
};
const COMPS_BINARIES: Record<string, Uint8Array> = { [COMPS_DOC_URL]: COMPS_PDF };

function fakeIo(opts: {
  pages: Record<string, string>;
  binaries?: Record<string, Uint8Array>;
  withFetchBinary?: boolean;
  log?: (line: string) => void;
}): { io: CaptureIo; fetchTextLog: string[]; fetchBinaryLog: string[] } {
  const fetchTextLog: string[] = [];
  const fetchBinaryLog: string[] = [];
  const pages = new Map(Object.entries(opts.pages));
  const binaries = new Map(Object.entries(opts.binaries ?? {}));
  const log = opts.log ?? (() => {});

  const fetchText: CaptureIo['fetchText'] = async (url) => {
    fetchTextLog.push(url);
    const body = pages.get(url);
    if (body === undefined) throw new Error(`fake io: no text fixture for ${url}`);
    return body;
  };
  const fetchJson: CaptureIo['fetchJson'] = async () => {
    throw new Error('unused');
  };

  if (opts.withFetchBinary === false) {
    return { io: { fetchText, fetchJson, log }, fetchTextLog, fetchBinaryLog };
  }

  const fetchBinary: NonNullable<CaptureIo['fetchBinary']> = async (url) => {
    fetchBinaryLog.push(url);
    const bytes = binaries.get(url);
    if (!bytes) throw new Error(`fake io: no binary fixture for ${url}`);
    return bytes;
  };
  return { io: { fetchText, fetchJson, fetchBinary, log }, fetchTextLog, fetchBinaryLog };
}

describe('captureCcr', () => {
  test('1. a regs filter yields exactly the named cites with manifest metadata and the rule-info sourceUrl', async () => {
    const { io } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], { extractPages });
    expect(result.sections.map((s) => s.cite)).toEqual(['702-5-1-14', '702-5-2-12']);
    for (const section of result.sections) {
      expect(section.code).toBe('3 CCR');
      expect(section.chapter).toBe('702-5');
      expect(section.chapterTitle).toBe('Property and Casualty');
      expect(section.domain).toBe('insurance');
      expect(section.ccrRuleVersionId).toBe(DOI_RULE_VERSION_ID);
      expect(section.sourceUrl).toBe(DOI_RULE_INFO_URL);
    }
  });

  test('1a. the document fetched is the current version PDF, never the archived one', async () => {
    const { io, fetchBinaryLog } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    await captureCcr(io, [DOI_SOURCE], { extractPages });
    expect(fetchBinaryLog).toEqual([DOI_DOC_URL]);
    expect(fetchBinaryLog[0]).not.toContain('12316');
  });

  test("2. effectiveDate prefers the body's own stated date, and falls back to the version's date when the body states none", async () => {
    const { io } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], { extractPages });
    const byCite = new Map(result.sections.map((s) => [s.cite, s]));
    expect(byCite.get('702-5-1-14')!.effectiveDate).toBe('2012-09-01');
    expect(byCite.get('702-5-2-12')!.effectiveDate).toBe('2025-12-30');
  });

  test('2a. the running page header never reaches a captured section', async () => {
    const { io } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], { extractPages });
    for (const section of result.sections) {
      expect(section.text).not.toContain('CODE OF COLORADO REGULATIONS');
    }
  });

  test('3. a named regCite absent from the document throws, naming the series', async () => {
    const missing: CcrCaptureSource = {
      ...DOI_SOURCE,
      filter: { kind: 'regs', regCites: ['702-5-1-14', '702-5-9-99'] },
    };
    await expect(
      captureCcr(fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES }).io, [missing], { extractPages }),
    ).rejects.toThrow(/3 CCR 702-5/);
    await expect(
      captureCcr(fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES }).io, [missing], { extractPages }),
    ).rejects.toThrow(/702-5-9-99/);
  });

  test('3a. a download that is not a PDF throws rather than being parsed as one', async () => {
    const notPdf = { [DOI_DOC_URL]: new TextEncoder().encode('\xd0\xcf\x11\xe0legacy doc') };
    await expect(
      captureCcr(fakeIo({ pages: DOI_PAGES, binaries: notPdf }).io, [DOI_SOURCE], { extractPages }),
    ).rejects.toThrow(/not a PDF/i);
  });

  test('4. a prefix filter keeps only matching cites and reports the counts via io.log', async () => {
    const logLines: string[] = [];
    const { io } = fakeIo({ pages: COMPS_PAGES, binaries: COMPS_BINARIES, log: (l) => logLines.push(l) });
    const result = await captureCcr(io, [COMPS_SOURCE], { extractPages });
    expect(result.sections.map((s) => s.cite)).toEqual(['1103-1-5.1', '1103-1-5.2']);
    expect(logLines.some((l) => l.includes('1103-1-5.') && /kept 2 of 5/.test(l))).toBe(true);
  });

  test('5. when previousSections already carry the ruleVersionId the rule-info page states, fetchBinary is never called', async () => {
    const previousSections: CoSection[] = [
      {
        cite: '702-5-1-14',
        code: '3 CCR',
        chapter: '702-5',
        chapterTitle: 'Property and Casualty',
        heading: 'PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS',
        text: 'previously-captured verbatim text for 5-1-14',
        effectiveDate: '2012-09-01',
        domain: 'insurance',
        sourceUrl: DOI_RULE_INFO_URL,
        ccrRuleVersionId: DOI_RULE_VERSION_ID,
      },
      {
        cite: '702-5-2-12',
        code: '3 CCR',
        chapter: '702-5',
        chapterTitle: 'Property and Casualty',
        heading: 'CONCERNING AUTOMOBILE INSURANCE CONSUMER PROTECTIONS',
        text: 'previously-captured verbatim text for 5-2-12',
        effectiveDate: '2025-12-30',
        domain: 'insurance',
        sourceUrl: DOI_RULE_INFO_URL,
        ccrRuleVersionId: DOI_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], { previousSections, extractPages });
    expect(fetchBinaryLog).toHaveLength(0);
    expect(result.sections).toEqual(previousSections);
  });

  test('5a. regs kind: previous shares the ruleVersionId but is missing a current filter.regCite — shortcut declines, fetchBinary is called', async () => {
    const staleButIncompletePrevious: CoSection[] = [
      {
        cite: '702-5-1-14',
        code: '3 CCR',
        chapter: '702-5',
        chapterTitle: 'Property and Casualty',
        heading: 'PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS',
        text: 'previously-captured verbatim text for 5-1-14',
        effectiveDate: '2012-09-01',
        domain: 'insurance',
        sourceUrl: DOI_RULE_INFO_URL,
        ccrRuleVersionId: DOI_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], {
      previousSections: staleButIncompletePrevious,
      extractPages,
    });
    expect(fetchBinaryLog.length).toBeGreaterThan(0);
    expect(result.sections.map((s) => s.cite)).toEqual(['702-5-1-14', '702-5-2-12']);
  });

  test('5b. prefix kind: previous contains a cite that no longer matches the current prefix — shortcut declines, fetchBinary is called', async () => {
    const staleOutOfScopePrevious: CoSection[] = [
      {
        cite: '1103-1-2.4.1',
        code: '7 CCR',
        chapter: '1103-1',
        chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
        heading: 'Certain Salespersons and Mechanics.',
        text: 'previously-captured verbatim text for 2.4.1',
        effectiveDate: '2026-02-01',
        domain: 'employment',
        sourceUrl: COMPS_RULE_INFO_URL,
        ccrRuleVersionId: COMPS_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({ pages: COMPS_PAGES, binaries: COMPS_BINARIES });
    const result = await captureCcr(io, [COMPS_SOURCE], {
      previousSections: staleOutOfScopePrevious,
      extractPages,
    });
    expect(fetchBinaryLog.length).toBeGreaterThan(0);
    expect(result.sections.map((s) => s.cite)).toEqual(['1103-1-5.1', '1103-1-5.2']);
  });

  test('5c. prefix kind: shortcut fires when every previous cite still satisfies the current prefix, and the log carries the widened-prefix caveat', async () => {
    const logLines: string[] = [];
    const previousSections: CoSection[] = [
      {
        cite: '1103-1-5.2',
        code: '7 CCR',
        chapter: '1103-1',
        chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
        heading: 'Rest Periods.',
        text: 'previously-captured verbatim text for 5.2',
        effectiveDate: '2026-02-01',
        domain: 'employment',
        sourceUrl: COMPS_RULE_INFO_URL,
        ccrRuleVersionId: COMPS_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({
      pages: COMPS_PAGES,
      binaries: COMPS_BINARIES,
      log: (l) => logLines.push(l),
    });
    const result = await captureCcr(io, [COMPS_SOURCE], { previousSections, extractPages });
    expect(fetchBinaryLog).toHaveLength(0);
    expect(result.sections).toEqual(previousSections);
    expect(logLines).toHaveLength(1);
    expect(logLines[0]).toMatch(/WIDENED prefix/i);
  });

  test('6. a fake io with no fetchBinary member throws a clear error naming fetchBinary', async () => {
    const { io } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES, withFetchBinary: false });
    await expect(captureCcr(io, [DOI_SOURCE], { extractPages })).rejects.toThrow(/fetchBinary/);
  });
});
