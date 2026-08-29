import { describe, expect, test } from 'bun:test';
import {
  findAgencyIds, findCurrentVersion, findRuleId, parseCcrDocumentXml,
} from '../src/parse-ccr.js';

/** Minimal WordprocessingML: one <w:p> per paragraph, text in <w:t> runs. */
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

describe('parseCcrDocumentXml', () => {
  test('regulation kind splits on "Regulation N-N-N" headers', () => {
    const { regs } = parseCcrDocumentXml(DOI_XML, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });
    expect(regs.map((r) => r.regNumber)).toEqual(['5-1-14', '5-2-12']);
    expect(regs[0]!.heading).toBe('PENALTIES FOR FAILURE TO PROMPTLY ADDRESS PROPERTY AND CASUALTY FIRST PARTY CLAIMS');
    expect(regs[0]!.text).toContain('Section 1 Authority');
  });
  test('a stated effective date inside the reg body is extracted as ISO', () => {
    const { regs } = parseCcrDocumentXml(DOI_XML, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });
    expect(regs[0]!.statedEffectiveDate).toBe('2025-12-30');
    expect(regs[1]!.statedEffectiveDate).toBeUndefined();
  });
  test('comps-rule kind splits on "Rule N.N" headers, dotted numbers preserved', () => {
    const { regs } = parseCcrDocumentXml(COMPS_XML, { headerKind: 'comps-rule', seriesNum: '7 CCR 1103-1' });
    expect(regs.map((r) => r.regNumber)).toEqual(['5.2', '2.4.1']);
    expect(regs[0]!.text).toContain('10-minute rest period');
  });
  test('Word auto-numbering trips a warning — verbatim numbering may be lost', () => {
    const numbered = `<?xml version="1.0"?><w:document><w:body>${p('Regulation 5-1-14 X')}${p('item', { numbered: true })}</w:body></w:document>`;
    const { warnings } = parseCcrDocumentXml(numbered, { headerKind: 'regulation', seriesNum: '3 CCR 702-5' });
    expect(warnings.some((w) => /auto-number/i.test(w))).toBe(true);
  });
  test('a document with no headers hard-fails', () => {
    expect(() =>
      parseCcrDocumentXml(`<?xml?><w:document><w:body>${p('nothing here')}</w:body></w:document>`, {
        headerKind: 'regulation', seriesNum: '3 CCR 702-5',
      }),
    ).toThrow();
  });
});

describe('SOS page discovery', () => {
  test('findAgencyIds pulls dept/agency ids from the doc-list href', () => {
    const html = `<a href="NumericalCCRDocList.do?deptID=18&agencyID=57&deptName=Department+of+Regulatory+Agencies&agencyName=Division+of+Insurance">Division of Insurance</a>`;
    expect(findAgencyIds(html, 'Department of Regulatory Agencies', 'Division of Insurance')).toEqual({ deptID: 18, agencyID: 57 });
  });
  test('findRuleId locates the series row', () => {
    const html = `<a href="DisplayRule.do?action=ruleinfo&ruleId=2201&deptID=18&agencyID=57&seriesNum=3+CCR+702-5">3 CCR 702-5</a> Property and Casualty`;
    expect(findRuleId(html, '3 CCR 702-5')).toBe(2201);
  });
  test('findCurrentVersion extracts ruleVersionId, effective date, and the word-document download', () => {
    const html = `
      <td>Effective Date: 12/30/2025</td>
      <a href="javascript:void(0)" onclick="downloadWordDoc('GenerateRulePdf.do?ruleVersionId=11592&fileName=3+CCR+702-5&fileType=WORD')">Word document</a>`;
    const v = findCurrentVersion(html);
    expect(v.ruleVersionId).toBe('11592');
    expect(v.effectiveDate).toBe('2025-12-30');
    expect(v.docDownload.url).toContain('ruleVersionId=11592');
  });
  test('a ruleinfo page with no word-document link hard-fails — no silent PDF fallback', () => {
    expect(() => findCurrentVersion('<td>Effective Date: 12/30/2025</td>')).toThrow(/word/i);
  });
});
