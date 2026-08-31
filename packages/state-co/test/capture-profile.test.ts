// packages/state-co/test/capture-profile.test.ts
import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { CO_BULLETIN_SOURCE, CO_CAPTURE_PROFILE } from '../src/capture.js';
import { CRS_EDITION } from '../src/identity.js';
import { CCR_BASE } from '../src/sources-ccr.js';
import { CRS_INDEX_URL } from '../src/sources-crs.js';

/**
 * Full-manifest fixtures for CO_CAPTURE_PROFILE.captureAll. captureAll does
 * not take sources as a parameter — it hardcodes the real CO_CRS_SOURCES,
 * CO_CCR_SOURCES and CO_BULLETIN_SOURCE — so these fixtures must satisfy the
 * ENTIRE production manifest: every title, every series, every named cite, and
 * now the bulletin, which is no longer skippable.
 *
 * The CCR and bulletin documents are real PDFs, built here rather than
 * committed, so this test runs captureAll through the same unpdf extraction
 * the capture uses. Shapes are the ones the first real capture found
 * (2026-08-31): bold section heads over interleaved article tables of contents
 * for CRS, and for the CCR a rule-info page whose current version is printed
 * above ~70 archived ones.
 */

// ------------------------------------------------------------- PDF building

/** A minimal, valid, uncompressed PDF: one text object per page. */
function makePdf(pages: readonly (readonly string[])[]): Uint8Array {
  const esc = (s: string): string => s.replace(/([\\()])/g, '\\$1');
  const objects: string[] = [];
  const pageIds: number[] = [];
  let next = 4;
  for (const lines of pages) {
    const contentId = next++;
    const pageId = next++;
    pageIds.push(pageId);
    const stream =
      'BT /F1 11 Tf 12 TL 40 740 Td\n' +
      lines.map((l) => `(${esc(l)}) Tj T*`).join('\n') +
      '\nET';
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
  }
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < next; i++) {
    offsets[i] = pdf.length;
    pdf += objects[i]!;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let i = 1; i < next; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// --------------------------------------------------------------------- CRS

const TIMES = `style='font-family:"Times New Roman",serif'`;
const toc = (cite: string, catchline: string): string =>
  `<p class=MsoNormal style='margin-left:1.25in;text-indent:-1.25in'><span ${TIMES}>${cite}.</span>` +
  `&nbsp;&nbsp;<span ${TIMES}>${catchline}</span></p>`;
const head = (cite: string, catchline: string): string =>
  `<p class=MsoNormal style='text-indent:.15in;page-break-after:avoid'><b><span ${TIMES}>${cite}.</span></b>` +
  `<span ${TIMES}>&nbsp;&nbsp;<b>${catchline}</b>&nbsp;</span></p>`;

function crsSection(cite: string): string {
  return (
    `${head(cite, `Heading for ${cite}.`)}\n` +
    `<p>Body text for ${cite}.</p>\n` +
    '<p>Source: L. 2020: Entire section added.</p>'
  );
}

const TITLE_10_URL = 'https://olls.info/crs/crs2026-title-10.htm';
const TITLE_42_URL = 'https://olls.info/crs/crs2026-title-42.htm';
const TITLE_6_URL = 'https://olls.info/crs/crs2026-title-06.htm';
const TITLE_8_URL = 'https://olls.info/crs/crs2026-title-08.htm';

const INDEX_HTML = `
<html><body>
<div class="masthead">Second Regular Session | 75th General Assembly</div>
<p>Current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="${TITLE_10_URL}">Title 10</a>
<a href="${TITLE_42_URL}">Title 42</a>
<a href="${TITLE_6_URL}">Title 6</a>
<a href="${TITLE_8_URL}">Title 8</a>
</body></html>`;

const TITLE_10_HTML = `<html><body>
${toc('10-3-1104', 'A table-of-contents entry that must not become a section.')}
${crsSection('10-3-1104')}
${crsSection('10-3-1301')}
${crsSection('10-3-1302')}
${crsSection('10-3-1303')}
${crsSection('10-3-1304')}
${crsSection('10-3-1305')}
${crsSection('10-3-1306')}
${crsSection('10-4-120')}
${crsSection('10-4-639')}
</body></html>`;

/**
 * `duplicate42_9_104` repeats the 42-9-104 block to manufacture a genuine
 * same-code:same-cite collision: the article filter (unlike the 'sections'
 * filter) reads the raw parsed array with no Map dedup, so two heads for the
 * same cite become two CoSection pushes.
 */
function title42Html(opts: { duplicate42_9_104?: boolean } = {}): string {
  return `<html><body>
${toc('42-9-104', 'A table-of-contents entry that must not become a section.')}
${crsSection('42-9-104')}
${opts.duplicate42_9_104 ? crsSection('42-9-104') : ''}
${crsSection('42-4-2103')}
</body></html>`;
}

const TITLE_6_HTML = `<html><body>${toc('6-1-105', 'TOC.')}${crsSection('6-1-105')}</body></html>`;
const TITLE_8_HTML = `<html><body>
${toc('8-4-103', 'TOC.')}
${crsSection('8-4-103')}
${crsSection('8-4-105')}
${crsSection('8-4-109')}
</body></html>`;

// --------------------------------------------------------------------- CCR

/** One shared department list, with the real "702 Division of …" name shape. */
const DEPT_LIST_URL = `${CCR_BASE}/NumericalDeptList.do`;
const agencyRow = (deptID: number, deptName: string, agencyID: number, agencyName: string): string =>
  `<TR><TD><a href="/CCR/NumericalCCRDocList.do?deptID=${deptID}&deptName=${deptName}` +
  `&agencyID=${agencyID}&agencyName=${agencyName}"> <u>row</u></a></TD></TR>`;
const DEPT_LIST_HTML = `
${agencyRow(18, '700 Department of Regulatory Agencies', 13, '701 Division of Banking')}
${agencyRow(18, '700 Department of Regulatory Agencies', 57, '702 Division of Insurance')}
${agencyRow(18, '700 Department of Regulatory Agencies', 96, '723 Public Utilities Commission')}
${agencyRow(10, '1100 Department of Labor and Employment', 29, '1101 Division of Unemployment Insurance')}
${agencyRow(10, '1100 Department of Labor and Employment', 58, '1101 Division of Labor Standards and Statistics (Includes 1103 Series)')}`;

function ruleInfoHtml(opts: {
  versionId: string;
  effective: string;
  fileName: string;
  archivedId: string;
  archivedEffective: string;
}): string {
  const link = (fn: string, id: string, date: string, label: string): string =>
    `<a href="javascript:void(0)" onclick="if (!window.__cfRLUnblockHandlers) return false; ` +
    `${fn}('${id}', '${opts.fileName}' )" data-cf-modified-x-="">${date} (${label})</a>`;
  return `
<table><tr><td><p><b>Current version</b></p></td></tr></table>
<table class="noStripes"><tbody><tr>
<td>${link('OpenRuleWindow', opts.versionId, opts.effective, 'PDF')}</td>
<td style="text-align: center;">11/07/2025</td>
<td>${link('OpenRuleWordVersion', opts.versionId, opts.effective, 'DOCX')}</td>
</tr></tbody></table>
<table><tr><td><p><b>Archived versions</b></p></td></tr></table>
<table class="noStripes"><tbody><tr>
<td>${link('OpenRuleWindow', opts.archivedId, opts.archivedEffective, 'PDF')}</td>
</tr></tbody></table>`;
}

const docListRow = (ruleId: number, deptID: number, agencyID: number, seriesNum: string): string =>
  `<a href="/CCR/DisplayRule.do?action=ruleinfo&ruleId=${ruleId}&deptID=${deptID}` +
  `&agencyID=${agencyID}&seriesNum=${seriesNum}">${seriesNum}</a>`;

// 3 CCR 702-5 — Division of Insurance
const DOI_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=18&agencyID=57`;
const DOI_DOC_LIST_HTML =
  docListRow(2195, 18, 57, '3 CCR 702-1') + docListRow(2201, 18, 57, '3 CCR 702-5') + docListRow(2206, 18, 57, '3 CCR 702-10');
const DOI_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=2201&deptID=18&agencyID=57`;
const DOI_RULE_INFO_HTML = ruleInfoHtml({
  versionId: '12295', effective: '12/30/2025', fileName: '3 CCR 702-5',
  archivedId: '12316', archivedEffective: '12/30/2026',
});
const DOI_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=12295&fileName=3%20CCR%20702-5`;
const DOI_PDF = makePdf([
  [
    'Regulation 5-1-14 PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND',
    'CASUALTY FIRST PARTY CLAIMS',
    'Section 4 Rules',
    'A. Timely Decisions and Payment of Benefits',
    'Section 7 Effective Date',
    'This regulation shall become effective on September 1, 2012.',
    'Section 8 History',
    'New regulation 78-14, effective 1978.',
  ],
  [
    'CODE OF COLORADO REGULATIONS 3 CCR 702-5',
    'Division of Insurance',
    '2',
    'Regulation 5-2-12 CONCERNING AUTOMOBILE INSURANCE CONSUMER PROTECTIONS',
    'Section 1 Authority',
    'Body of 5-2-12.',
  ],
  [
    'CODE OF COLORADO REGULATIONS 3 CCR 702-5',
    'Division of Insurance',
    '3',
    'Regulation 5-2-15 CONCERNING CONSUMER PROTECTION FOR VEHICLE VALUATION AND',
    'RENTAL REIMBURSEMENT',
    'Body of 5-2-15.',
  ],
]);

// 4 CCR 723-6 — Public Utilities Commission
const PUC_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=18&agencyID=96`;
const PUC_DOC_LIST_HTML = docListRow(2262, 18, 96, '4 CCR 723-6');
const PUC_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=2262&deptID=18&agencyID=96`;
const PUC_RULE_INFO_HTML = ruleInfoHtml({
  versionId: '11963', effective: '06/14/2025', fileName: '4 CCR 723-6',
  archivedId: '11905', archivedEffective: '04/14/2025',
});
const PUC_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=11963&fileName=4%20CCR%20723-6`;
const PUC_PDF = makePdf([
  [
    '6400. Applicability of Unified Carrier Registration Agreement Rules.',
    'Outside the towing band.',
    '6500. Applicability of Towing Carrier Rules.',
    'Rules 6500 through 6514 apply to towing carriers.',
    '6502. [Reserved].',
    '6511. Rates and Charges.',
    '(a) Drop Charge. A towing carrier is prohibited from assessing a drop charge.',
  ],
]);

// 7 CCR 1103-1 — COMPS Order #40
const COMPS_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=10&agencyID=58`;
const COMPS_DOC_LIST_HTML = docListRow(2509, 10, 58, '7 CCR 1103-1');
const COMPS_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=2509&deptID=10&agencyID=58`;
const COMPS_RULE_INFO_HTML = ruleInfoHtml({
  versionId: '12406', effective: '02/01/2026', fileName: '7 CCR 1103-1',
  archivedId: '11206', archivedEffective: '01/01/2024',
});
const COMPS_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=12406&fileName=7%20CCR%201103-1`;
const COMPS_PDF = makePdf([
  [
    'Rule 2. Coverage and Exemptions.',
    '2.4.1 Certain Salespersons and Mechanics. Salespersons, parts-persons, and',
    'mechanics employed by automobile dealers are exempt from Rule 4 (Overtime).',
    'Rule 3. Minimum Wages.',
    '3.1 Statewide Minimum Wage. Under the minimum wage requirements of Article',
    'XVIII, Section 15, of the Colorado Constitution.',
    'Rule 4. Overtime.',
    '4.1 Overtime Wages.',
    '4.1.1 Employees shall be paid time and one-half of the regular rate of pay for',
    'any work in excess of 40 hours per workweek.',
    'Rule 5. Meal and Rest Periods.',
    '5.1 Meal Periods. Employees shall be entitled to an uninterrupted meal period.',
    '5.2 Rest Periods. Every employer shall authorize a compensated 10-minute rest period.',
  ],
]);

// The DOI bulletin.
const BULLETIN_PDF = makePdf([
  [
    'Bulletin No. B-5.04',
    'Notice of the Provisions Pertaining to the Payment of Claims for the Repair of Damaged',
    'Property',
    'Under 10-4-120, C.R.S. insurers are required to make certain disclosures.',
    'Reissued September 19, 2016.',
  ],
]);

function buildIo(opts: { duplicate42_9_104?: boolean } = {}): CaptureIo {
  const pages = new Map<string, string>([
    [CRS_INDEX_URL, INDEX_HTML],
    [TITLE_10_URL, TITLE_10_HTML],
    [TITLE_42_URL, title42Html(opts)],
    [TITLE_6_URL, TITLE_6_HTML],
    [TITLE_8_URL, TITLE_8_HTML],
    [DEPT_LIST_URL, DEPT_LIST_HTML],
    [DOI_DOC_LIST_URL, DOI_DOC_LIST_HTML],
    [DOI_RULE_INFO_URL, DOI_RULE_INFO_HTML],
    [PUC_DOC_LIST_URL, PUC_DOC_LIST_HTML],
    [PUC_RULE_INFO_URL, PUC_RULE_INFO_HTML],
    [COMPS_DOC_LIST_URL, COMPS_DOC_LIST_HTML],
    [COMPS_RULE_INFO_URL, COMPS_RULE_INFO_HTML],
  ]);
  const binaries = new Map<string, Uint8Array>([
    [DOI_DOC_URL, DOI_PDF],
    [PUC_DOC_URL, PUC_PDF],
    [COMPS_DOC_URL, COMPS_PDF],
    [CO_BULLETIN_SOURCE.pdfUrl, BULLETIN_PDF],
  ]);
  return {
    async fetchText(url) {
      const body = pages.get(url);
      if (body === undefined) throw new Error(`fake io: no text fixture for ${url}`);
      return body;
    },
    async fetchJson() {
      throw new Error('unused');
    },
    async fetchBinary(url) {
      const bytes = binaries.get(url);
      if (!bytes) throw new Error(`fake io: no binary fixture for ${url}`);
      return bytes;
    },
    log: () => {},
  };
}

describe('CO_CAPTURE_PROFILE', () => {
  test('is shaped for the registry: CO, real corpus/attention paths, not supportsOnly', () => {
    expect(CO_CAPTURE_PROFILE.state).toBe('CO');
    expect(CO_CAPTURE_PROFILE.corpusPath).toBe('packages/state-co/data/co-law-corpus.json');
    expect(CO_CAPTURE_PROFILE.attentionFileName).toBe('CO-LAW-ATTENTION.txt');
    expect(CO_CAPTURE_PROFILE.supportsOnly).toBe(false);
  });

  test('the bulletin source points at an official colorado.gov surface', () => {
    expect(new URL(CO_BULLETIN_SOURCE.pdfUrl).host).toBe('doi.colorado.gov');
    expect(new URL(CO_BULLETIN_SOURCE.pageUrl).host).toBe('doi.colorado.gov');
    // The per-host agent override is an override, not a disguise: it still has
    // to name us AND carry the contact URL a publisher would use to reach us.
    expect(CO_BULLETIN_SOURCE.userAgent).toContain('RepairMCP-Bot');
    expect(CO_BULLETIN_SOURCE.userAgent).toContain('+https://repairmcp.com');
  });

  test('captureAll composes CRS + CCR + the bulletin with no overlap, and meta carries crsEdition/crsCurrencyNote', async () => {
    const outcome = await CO_CAPTURE_PROFILE.captureAll(buildIo());

    const crsSections = outcome.file.sections.filter((s) => s.code === 'CRS');
    const ccrSections = outcome.file.sections.filter(
      (s) => s.code !== 'CRS' && s.code !== 'Colorado DOI Bulletin',
    );
    const bulletins = outcome.file.sections.filter((s) => s.code === 'Colorado DOI Bulletin');
    expect(crsSections.length).toBeGreaterThan(0);
    expect(ccrSections.length).toBeGreaterThan(0);
    expect(bulletins).toHaveLength(1);
    expect(bulletins[0]!.cite).toBe('B-5.04');
    expect(bulletins[0]!.text).toContain('10-4-120');

    // No overlap: every "code:cite" key is unique.
    const keys = outcome.file.sections.map((s) => `${s.code}:${s.cite}`);
    expect(new Set(keys).size).toBe(keys.length);

    expect(outcome.file.meta.state).toBe('CO');
    expect(outcome.file.meta.crsEdition).toBe(CRS_EDITION);
    expect(outcome.file.meta.crsCurrencyNote).toContain('Seventy-fifth General Assembly');
  });

  test('table-of-contents entries never reach the corpus as sections', async () => {
    const outcome = await CO_CAPTURE_PROFILE.captureAll(buildIo());
    for (const section of outcome.file.sections) {
      expect(section.heading).not.toContain('table-of-contents entry');
    }
  });

  test('every CCR section carries the current ruleVersionId and an effective date', async () => {
    const outcome = await CO_CAPTURE_PROFILE.captureAll(buildIo());
    const byCite = new Map(outcome.file.sections.map((s) => [s.cite, s]));
    expect(byCite.get('702-5-1-14')!.ccrRuleVersionId).toBe('12295');
    // Its own stated date wins over the version's 12/30/2025.
    expect(byCite.get('702-5-1-14')!.effectiveDate).toBe('2012-09-01');
    expect(byCite.get('702-5-2-12')!.effectiveDate).toBe('2025-12-30');
    expect(byCite.get('1103-1-5.2')!.ccrRuleVersionId).toBe('12406');
    expect(byCite.get('723-6-6511')!.effectiveDate).toBe('2025-06-14');
  });

  test('the PUC prefix filter keeps the towing band and nothing else', async () => {
    const outcome = await CO_CAPTURE_PROFILE.captureAll(buildIo());
    const pucCites = outcome.file.sections.filter((s) => s.code === '4 CCR').map((s) => s.cite);
    expect(pucCites).toEqual(['723-6-6500', '723-6-6511']);
    expect(pucCites).not.toContain('723-6-6400');
    expect(pucCites).not.toContain('723-6-6502'); // [Reserved]
  });

  test('a manufactured duplicate (same code:cite from two entries) throws', async () => {
    await expect(
      CO_CAPTURE_PROFILE.captureAll(buildIo({ duplicate42_9_104: true })),
    ).rejects.toThrow(/overlap/i);
  });
});
