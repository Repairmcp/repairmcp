// packages/state-co/test/capture-ccr.test.ts
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { strToU8, zipSync } from 'fflate';
import { captureCcr } from '../src/capture-ccr.js';
import type { CoSection } from '../src/schema.js';
import { CCR_BASE, type CcrCaptureSource } from '../src/sources-ccr.js';

/**
 * Fixtures mirror the two shapes task 6 already proved against real SOS
 * markup (parse-ccr.test.ts): the SOS browse-page shapes for
 * findAgencyIds/findRuleId/findCurrentVersion, and the WordprocessingML
 * shape (DOI_XML / COMPS_XML) for parseCcrDocumentXml. Reused here, not
 * imported — those consts are private to that test file.
 */
const p = (text: string, opts: { numbered?: boolean } = {}): string =>
  `<w:p>${opts.numbered ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : ''}` +
  `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const DOI_XML = `<?xml version="1.0"?><w:document><w:body>
${p('DEPARTMENT OF REGULATORY AGENCIES')}
${p('Division of Insurance')}
${p('3 CCR 702-5')}
${p('Regulation 5-1-14 PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS')}
${p('Section 1 Authority')}
${p('This regulation is promulgated under the authority of § 10-1-109, C.R.S.')}
${p('Section 8 Effective Date')}
${p('This regulation is effective December 30, 2025.')}
${p('Regulation 5-2-12 AUTOMOBILE INSURANCE CONSUMER PROTECTIONS')}
${p('Section 1 Authority')}
${p('Body of 5-2-12.')}
</w:body></w:document>`;

const COMPS_XML = `<?xml version="1.0"?><w:document><w:body>
${p('COLORADO OVERTIME AND MINIMUM PAY STANDARDS ORDER ("COMPS ORDER") #40')}
${p('Rule 5.2 Rest Periods')}
${p('Every employer shall authorize and permit a compensated 10-minute rest period for each 4 hours of work, or major fractions thereof.')}
${p('Rule 2.4.1 Exemption for certain salespersons and mechanics')}
${p('Salespersons, parts-persons, and mechanics employed by automobile, truck, or farm implement (retail) dealers are exempt from Rule 4 (Overtime).')}
</w:body></w:document>`;

// --- DOI (3 CCR 702-5, headerKind 'regulation') fixtures ---
const DOI_DEPT_ID = 18;
const DOI_AGENCY_ID = 57;
const DOI_RULE_ID = 2201;
const DOI_RULE_VERSION_ID = '11592';

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

const DOI_DEPT_LIST_URL = `${CCR_BASE}/NumericalDeptList.do`;
const DOI_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=${DOI_DEPT_ID}&agencyID=${DOI_AGENCY_ID}`;
const DOI_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=${DOI_RULE_ID}&deptID=${DOI_DEPT_ID}&agencyID=${DOI_AGENCY_ID}`;
const DOI_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=${DOI_RULE_VERSION_ID}&fileName=3+CCR+702-5&fileType=WORD`;

const DOI_DEPT_LIST_HTML = `<a href="NumericalCCRDocList.do?deptID=${DOI_DEPT_ID}&agencyID=${DOI_AGENCY_ID}&deptName=Department+of+Regulatory+Agencies&agencyName=Division+of+Insurance">Division of Insurance</a>`;
const DOI_DOC_LIST_HTML = `<a href="DisplayRule.do?action=ruleinfo&ruleId=${DOI_RULE_ID}&deptID=${DOI_DEPT_ID}&agencyID=${DOI_AGENCY_ID}&seriesNum=3+CCR+702-5">3 CCR 702-5</a> Property and Casualty`;
// The version's own Effective Date (01/15/2026) is deliberately different
// from the body-stated date on 5-1-14 (December 30, 2025), so the
// prefers-own / falls-back-to-version assertion is not accidentally
// satisfied by both paths landing on the same date.
const DOI_RULE_INFO_HTML = `
  <td>Effective Date: 01/15/2026</td>
  <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=${DOI_RULE_VERSION_ID}&fileName=3+CCR+702-5&fileType=WORD')">Word document</a>`;

const doiDocxBytes = zipSync({ 'word/document.xml': strToU8(DOI_XML) });

const DOI_PAGES: Record<string, string> = {
  [DOI_DEPT_LIST_URL]: DOI_DEPT_LIST_HTML,
  [DOI_DOC_LIST_URL]: DOI_DOC_LIST_HTML,
  [DOI_RULE_INFO_URL]: DOI_RULE_INFO_HTML,
};
const DOI_BINARIES: Record<string, Uint8Array> = { [DOI_DOC_URL]: doiDocxBytes };

// --- COMPS (7 CCR 1103-1, headerKind 'comps-rule') fixtures ---
const COMPS_DEPT_ID = 25;
const COMPS_AGENCY_ID = 40;
const COMPS_RULE_ID = 3100;
const COMPS_RULE_VERSION_ID = '9001';

const COMPS_SOURCE: CcrCaptureSource = {
  code: '7 CCR',
  deptName: 'Department of Labor and Employment',
  agencyName: 'Division of Labor Standards and Statistics',
  seriesNum: '7 CCR 1103-1',
  chapterKey: '1103-1',
  chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
  domain: 'employment',
  headerKind: 'comps-rule',
  filter: { kind: 'prefix', citePrefix: '1103-1-5' },
};

const COMPS_DEPT_LIST_URL = `${CCR_BASE}/NumericalDeptList.do`;
const COMPS_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=${COMPS_DEPT_ID}&agencyID=${COMPS_AGENCY_ID}`;
const COMPS_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=${COMPS_RULE_ID}&deptID=${COMPS_DEPT_ID}&agencyID=${COMPS_AGENCY_ID}`;
const COMPS_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=${COMPS_RULE_VERSION_ID}&fileName=7+CCR+1103-1&fileType=WORD`;

const COMPS_DEPT_LIST_HTML = `<a href="NumericalCCRDocList.do?deptID=${COMPS_DEPT_ID}&agencyID=${COMPS_AGENCY_ID}&deptName=Department+of+Labor+and+Employment&agencyName=Division+of+Labor+Standards+and+Statistics">Division of Labor Standards and Statistics</a>`;
const COMPS_DOC_LIST_HTML = `<a href="DisplayRule.do?action=ruleinfo&ruleId=${COMPS_RULE_ID}&deptID=${COMPS_DEPT_ID}&agencyID=${COMPS_AGENCY_ID}&seriesNum=7+CCR+1103-1">7 CCR 1103-1</a> COMPS Order`;
const COMPS_RULE_INFO_HTML = `
  <td>Effective Date: 01/01/2026</td>
  <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=${COMPS_RULE_VERSION_ID}&fileName=7+CCR+1103-1&fileType=WORD')">Word document</a>`;

const compsDocxBytes = zipSync({ 'word/document.xml': strToU8(COMPS_XML) });

const COMPS_PAGES: Record<string, string> = {
  [COMPS_DEPT_LIST_URL]: COMPS_DEPT_LIST_HTML,
  [COMPS_DOC_LIST_URL]: COMPS_DOC_LIST_HTML,
  [COMPS_RULE_INFO_URL]: COMPS_RULE_INFO_HTML,
};
const COMPS_BINARIES: Record<string, Uint8Array> = { [COMPS_DOC_URL]: compsDocxBytes };

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
    const result = await captureCcr(io, [DOI_SOURCE]);
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

  test('2. effectiveDate prefers the body\'s own stated date, and falls back to the version\'s date when the body states none', async () => {
    const { io } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE]);
    const byCite = new Map(result.sections.map((s) => [s.cite, s]));
    expect(byCite.get('702-5-1-14')!.effectiveDate).toBe('2025-12-30');
    expect(byCite.get('702-5-2-12')!.effectiveDate).toBe('2026-01-15');
  });

  test('3. a named regCite absent from the document throws, naming the series', async () => {
    const missing: CcrCaptureSource = {
      ...DOI_SOURCE,
      filter: { kind: 'regs', regCites: ['702-5-1-14', '702-5-9-99'] },
    };
    await expect(
      captureCcr(fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES }).io, [missing]),
    ).rejects.toThrow(/3 CCR 702-5/);
    await expect(
      captureCcr(fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES }).io, [missing]),
    ).rejects.toThrow(/702-5-9-99/);
  });

  test('4. a prefix filter keeps only matching cites and reports the dropped count via io.log', async () => {
    const logLines: string[] = [];
    const { io } = fakeIo({ pages: COMPS_PAGES, binaries: COMPS_BINARIES, log: (l) => logLines.push(l) });
    const result = await captureCcr(io, [COMPS_SOURCE]);
    expect(result.sections.map((s) => s.cite)).toEqual(['1103-1-5.2']);
    expect(logLines.some((l) => l.includes('1103-1-5') && /dropped 1/.test(l))).toBe(true);
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
        effectiveDate: '2025-12-30',
        domain: 'insurance',
        sourceUrl: DOI_RULE_INFO_URL,
        ccrRuleVersionId: DOI_RULE_VERSION_ID,
      },
      {
        cite: '702-5-2-12',
        code: '3 CCR',
        chapter: '702-5',
        chapterTitle: 'Property and Casualty',
        heading: 'AUTOMOBILE INSURANCE CONSUMER PROTECTIONS',
        text: 'previously-captured verbatim text for 5-2-12',
        effectiveDate: '2026-01-15',
        domain: 'insurance',
        sourceUrl: DOI_RULE_INFO_URL,
        ccrRuleVersionId: DOI_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], { previousSections });
    expect(fetchBinaryLog).toHaveLength(0);
    expect(result.sections).toEqual(previousSections);
  });

  test('5a. regs kind: previous shares the ruleVersionId but is missing a current filter.regCite — shortcut declines, fetchBinary is called', async () => {
    // Same ruleVersionId as DOI_PAGES states, but the manifest's DOI_SOURCE
    // now asks for 702-5-2-12 too — a regCite added since this stale set was
    // captured. The version alone must not be enough to short-circuit.
    const staleButIncompletePrevious: CoSection[] = [
      {
        cite: '702-5-1-14',
        code: '3 CCR',
        chapter: '702-5',
        chapterTitle: 'Property and Casualty',
        heading: 'PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS',
        text: 'previously-captured verbatim text for 5-1-14',
        effectiveDate: '2025-12-30',
        domain: 'insurance',
        sourceUrl: DOI_RULE_INFO_URL,
        ccrRuleVersionId: DOI_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES });
    const result = await captureCcr(io, [DOI_SOURCE], { previousSections: staleButIncompletePrevious });
    expect(fetchBinaryLog.length).toBeGreaterThan(0);
    expect(result.sections.map((s) => s.cite)).toEqual(['702-5-1-14', '702-5-2-12']);
  });

  test('5b. prefix kind: previous contains a cite that no longer matches the current prefix — shortcut declines, fetchBinary is called', async () => {
    // Same ruleVersionId as COMPS_PAGES states, but 1103-1-2.4.1 does not
    // satisfy COMPS_SOURCE's citePrefix '1103-1-5' — as if the prefix was
    // narrowed (or the stale set predates a narrowing) since this set was
    // captured. The version alone must not be enough to short-circuit.
    const staleOutOfScopePrevious: CoSection[] = [
      {
        cite: '1103-1-2.4.1',
        code: '7 CCR',
        chapter: '1103-1',
        chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
        heading: 'Exemption for certain salespersons and mechanics',
        text: 'previously-captured verbatim text for 2.4.1',
        effectiveDate: '2026-01-01',
        domain: 'employment',
        sourceUrl: COMPS_RULE_INFO_URL,
        ccrRuleVersionId: COMPS_RULE_VERSION_ID,
      },
    ];
    const { io, fetchBinaryLog } = fakeIo({ pages: COMPS_PAGES, binaries: COMPS_BINARIES });
    const result = await captureCcr(io, [COMPS_SOURCE], { previousSections: staleOutOfScopePrevious });
    expect(fetchBinaryLog.length).toBeGreaterThan(0);
    expect(result.sections.map((s) => s.cite)).toEqual(['1103-1-5.2']);
  });

  test('5c. prefix kind: shortcut fires when every previous cite still satisfies the current prefix, and the log carries the widened-prefix caveat', async () => {
    const logLines: string[] = [];
    const previousSections: CoSection[] = [
      {
        cite: '1103-1-5.2',
        code: '7 CCR',
        chapter: '1103-1',
        chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
        heading: 'Rest Periods',
        text: 'previously-captured verbatim text for 5.2',
        effectiveDate: '2026-01-01',
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
    const result = await captureCcr(io, [COMPS_SOURCE], { previousSections });
    expect(fetchBinaryLog).toHaveLength(0);
    expect(result.sections).toEqual(previousSections);
    expect(logLines).toHaveLength(1);
    expect(logLines[0]).toMatch(/WIDENED prefix/i);
  });

  test('6. a fake io with no fetchBinary member throws a clear error naming fetchBinary', async () => {
    const { io } = fakeIo({ pages: DOI_PAGES, binaries: DOI_BINARIES, withFetchBinary: false });
    await expect(captureCcr(io, [DOI_SOURCE])).rejects.toThrow(/fetchBinary/);
  });
});
