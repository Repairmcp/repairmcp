// packages/state-co/test/capture-profile.test.ts
import { describe, expect, test } from 'bun:test';
import { strToU8, zipSync } from 'fflate';
import type { CaptureIo } from '@repairmcp/state-law';
import { CO_CAPTURE_PROFILE } from '../src/capture.js';
import { CRS_EDITION } from '../src/identity.js';
import { CCR_BASE } from '../src/sources-ccr.js';
import { CRS_INDEX_URL } from '../src/sources-crs.js';

/**
 * Full-manifest fixtures for CO_CAPTURE_PROFILE.captureAll. Unlike
 * capture-crs.test.ts / capture-ccr.test.ts (task 5 / task 7), captureAll
 * does not take sources as a parameter — it hardcodes the real
 * CO_CRS_SOURCES and CO_CCR_SOURCES (src/capture.ts) — so these fixtures
 * must satisfy the ENTIRE production manifest: every title, every series,
 * every named cite it asks for. Shapes are adapted from those two files'
 * fixtures, not copied verbatim, since the real manifest needs more cites
 * than either file's minimal examples cover.
 */

function crsSection(cite: string): string {
  return (
    `<p><b>${cite}.  Heading for ${cite}.</b></p>\n` +
    `<p>Body text for ${cite}.</p>\n` +
    `<p>Source: L. 2020: Entire section added.</p>`
  );
}

const TITLE_10_URL = 'https://olls.info/crs/crs2026-title-10.htm';
const TITLE_42_URL = 'https://olls.info/crs/crs2026-title-42.htm';
const TITLE_6_URL = 'https://olls.info/crs/crs2026-title-6.htm';
const TITLE_8_URL = 'https://olls.info/crs/crs2026-title-8.htm';

const INDEX_HTML = `
<html><body>
<p>The statutes are current with the changes made by amendments, additions, and repeals
to Colorado Revised Statutes by the Seventy-fifth General Assembly at its Second
Regular Session in 2026.</p>
<a href="${TITLE_10_URL}">Title 10</a>
<a href="${TITLE_42_URL}">Title 42</a>
<a href="${TITLE_6_URL}">Title 6</a>
<a href="${TITLE_8_URL}">Title 8</a>
</body></html>`;

// Title 10: 10-3-1104 (unfair claims), 10-3-1301..1306 (Model Act), 10-4-120 + 10-4-639.
const TITLE_10_HTML = `<html><body>
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

// Title 42: 42-9-104 (article filter needs at least one live 42-9-* section)
// + 42-4-2103 (towing). `duplicate42_9_104` repeats the 42-9-104 block to
// manufacture a genuine same-code:same-cite collision: the article filter
// (unlike the 'sections' filter) reads the raw parsed array with no Map
// dedup, so two blocks for the same cite become two CoSection pushes.
function title42Html(opts: { duplicate42_9_104?: boolean } = {}): string {
  const section429104 = crsSection('42-9-104');
  return `<html><body>
${section429104}
${opts.duplicate42_9_104 ? section429104 : ''}
${crsSection('42-4-2103')}
</body></html>`;
}

const TITLE_6_HTML = `<html><body>${crsSection('6-1-105')}</body></html>`;

const TITLE_8_HTML = `<html><body>
${crsSection('8-4-103')}
${crsSection('8-4-105')}
${crsSection('8-4-109')}
</body></html>`;

function wp(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

// One shared department list — captureCcr fetches it once, outside the
// per-source loop, and resolves all three agencies out of it. findAgencyIds
// scans a 200-before/300-after character window around each regex match to
// confirm the agency name; real SOS markup has enough surrounding table
// structure to keep adjacent rows apart, so PAD reproduces that separation
// here — without it, one row's wide lookahead window bleeds into the next
// row's name and findAgencyIds resolves the wrong (deptID, agencyID) pair.
const PAD = `<!-- ${'padding-row '.repeat(60)} -->`;
const DEPT_LIST_URL = `${CCR_BASE}/NumericalDeptList.do`;
const DEPT_LIST_HTML = `
<a href="NumericalCCRDocList.do?deptID=18&amp;agencyID=57&amp;deptName=Department+of+Regulatory+Agencies&amp;agencyName=Division+of+Insurance">Division of Insurance</a>
${PAD}
<a href="NumericalCCRDocList.do?deptID=18&amp;agencyID=58&amp;deptName=Department+of+Regulatory+Agencies&amp;agencyName=Public+Utilities+Commission">Public Utilities Commission</a>
${PAD}
<a href="NumericalCCRDocList.do?deptID=25&amp;agencyID=40&amp;deptName=Department+of+Labor+and+Employment&amp;agencyName=Division+of+Labor+Standards+and+Statistics">Division of Labor Standards and Statistics</a>`;

// --- DOI: 3 CCR 702-5 (headerKind 'regulation'), regs filter ---
const DOI_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=18&agencyID=57`;
const DOI_DOC_LIST_HTML =
  '<a href="DisplayRule.do?action=ruleinfo&amp;ruleId=2201&amp;deptID=18&amp;agencyID=57&amp;seriesNum=3+CCR+702-5">3 CCR 702-5</a>';
const DOI_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=2201&deptID=18&agencyID=57`;
const DOI_RULE_INFO_HTML = `
  <td>Effective Date: 01/15/2026</td>
  <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=11592&fileName=3+CCR+702-5&fileType=WORD')">Word document</a>`;
const DOI_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=11592&fileName=3+CCR+702-5&fileType=WORD`;
const DOI_XML = `<?xml version="1.0"?><w:document><w:body>
${wp('Regulation 5-1-14 PROMPT PAYMENT')}
${wp('Body of 5-1-14.')}
${wp('Regulation 5-2-12 AUTOMOBILE INSURANCE CONSUMER PROTECTIONS')}
${wp('Body of 5-2-12.')}
${wp('Regulation 5-2-15 TOTAL LOSS VALUATION')}
${wp('Body of 5-2-15.')}
</w:body></w:document>`;
const DOI_DOCX_BYTES = zipSync({ 'word/document.xml': strToU8(DOI_XML) });

// --- PUC: 4 CCR 723-6 (headerKind 'puc-rule'), prefix filter '723-6-65' ---
const PUC_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=18&agencyID=58`;
const PUC_DOC_LIST_HTML =
  '<a href="DisplayRule.do?action=ruleinfo&amp;ruleId=3300&amp;deptID=18&amp;agencyID=58&amp;seriesNum=4+CCR+723-6">4 CCR 723-6</a>';
const PUC_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=3300&deptID=18&agencyID=58`;
const PUC_RULE_INFO_HTML = `
  <td>Effective Date: 02/01/2026</td>
  <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=20001&fileName=4+CCR+723-6&fileType=WORD')">Word document</a>`;
const PUC_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=20001&fileName=4+CCR+723-6&fileType=WORD`;
const PUC_XML = `<?xml version="1.0"?><w:document><w:body>
${wp('6511. Towing carrier standards.')}
${wp('Body of 6511.')}
</w:body></w:document>`;
const PUC_DOCX_BYTES = zipSync({ 'word/document.xml': strToU8(PUC_XML) });

// --- COMPS: 7 CCR 1103-1 (headerKind 'comps-rule'), regs filter ---
const COMPS_DOC_LIST_URL = `${CCR_BASE}/NumericalCCRDocList.do?deptID=25&agencyID=40`;
const COMPS_DOC_LIST_HTML =
  '<a href="DisplayRule.do?action=ruleinfo&amp;ruleId=3100&amp;deptID=25&amp;agencyID=40&amp;seriesNum=7+CCR+1103-1">7 CCR 1103-1</a>';
const COMPS_RULE_INFO_URL = `${CCR_BASE}/DisplayRule.do?action=ruleinfo&ruleId=3100&deptID=25&agencyID=40`;
const COMPS_RULE_INFO_HTML = `
  <td>Effective Date: 01/01/2026</td>
  <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=9001&fileName=7+CCR+1103-1&fileType=WORD')">Word document</a>`;
const COMPS_DOC_URL = `${CCR_BASE}/GenerateRulePdf.do?ruleVersionId=9001&fileName=7+CCR+1103-1&fileType=WORD`;
const COMPS_XML = `<?xml version="1.0"?><w:document><w:body>
${wp('Rule 2.4.1 Exemption for certain salespersons and mechanics')}
${wp('Body of 2.4.1.')}
${wp('Rule 3.1 Minimum wage')}
${wp('Body of 3.1.')}
${wp('Rule 4.1.1 Overtime')}
${wp('Body of 4.1.1.')}
${wp('Rule 5.1 Meal periods')}
${wp('Body of 5.1.')}
${wp('Rule 5.2 Rest periods')}
${wp('Body of 5.2.')}
</w:body></w:document>`;
const COMPS_DOCX_BYTES = zipSync({ 'word/document.xml': strToU8(COMPS_XML) });

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
    [DOI_DOC_URL, DOI_DOCX_BYTES],
    [PUC_DOC_URL, PUC_DOCX_BYTES],
    [COMPS_DOC_URL, COMPS_DOCX_BYTES],
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

  test('captureAll composes CRS + CCR sections with no overlap, meta carries crsEdition/crsCurrencyNote, and the null bulletin is skipped with a warning', async () => {
    const outcome = await CO_CAPTURE_PROFILE.captureAll(buildIo());

    const crsSections = outcome.file.sections.filter((s) => s.code === 'CRS');
    const ccrSections = outcome.file.sections.filter(
      (s) => s.code !== 'CRS' && s.code !== 'Colorado DOI Bulletin',
    );
    expect(crsSections.length).toBeGreaterThan(0);
    expect(ccrSections.length).toBeGreaterThan(0);
    expect(outcome.file.sections.some((s) => s.code === 'Colorado DOI Bulletin')).toBe(false);

    // No overlap: every "code:cite" key is unique.
    const keys = outcome.file.sections.map((s) => `${s.code}:${s.cite}`);
    expect(new Set(keys).size).toBe(keys.length);

    expect(outcome.file.meta.state).toBe('CO');
    expect(outcome.file.meta.crsEdition).toBe(CRS_EDITION);
    expect(typeof outcome.file.meta.crsCurrencyNote).toBe('string');
    expect((outcome.file.meta.crsCurrencyNote as string).length).toBeGreaterThan(0);

    expect(outcome.report.warnings.some((w) => /bulletin skipped/i.test(w))).toBe(true);
  });

  test('a manufactured duplicate (same code:cite from two entries) throws', async () => {
    await expect(
      CO_CAPTURE_PROFILE.captureAll(buildIo({ duplicate42_9_104: true })),
    ).rejects.toThrow(/overlap/i);
  });
});
