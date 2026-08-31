import type { CcrHeaderKind } from './parse-ccr.js';
import type { CoDomain } from './schema.js';

/**
 * The CCR half of the manifest. The SOS publishes one document per SERIES;
 * capture is two-tier like Montana's MCA slot URLs: the dept list resolves
 * deptID/agencyID by NAME, the doc list resolves the series ruleId, the
 * rule-info page yields the current ruleVersionId + effective date + the
 * document download, and that document is split into individual regulations.
 *
 * The download is the PDF, not the Word file. The research pass planned to
 * split word/document.xml, but the SOS "Word" download is `application/msword`
 * — a legacy OLE .doc with no zip container to open — and the rule-info page
 * designates the other one anyway: "The PDF document constitutes the official
 * version of the rule and shall govern in all cases. The Word document is
 * provided as an accessible alternative."
 *
 * deptName/agencyName strings are row-matching keys on the SOS pages —
 * verified against the real 273-row department list at the first capture.
 */
export interface CcrCaptureSource {
  code: '3 CCR' | '4 CCR' | '7 CCR';
  deptName: string;
  agencyName: string;
  seriesNum: string;
  /** Becomes StateSection.chapter, e.g. '702-5'. */
  chapterKey: string;
  chapterTitle: string;
  domain: CoDomain;
  headerKind: CcrHeaderKind;
  filter: { kind: 'regs'; regCites: readonly string[] } | { kind: 'prefix'; citePrefix: string };
  note?: string;
}

export const CCR_BASE = 'https://www.coloradosos.gov/CCR';

export const CO_CCR_SOURCES: readonly CcrCaptureSource[] = [
  {
    code: '3 CCR',
    deptName: 'Department of Regulatory Agencies',
    agencyName: 'Division of Insurance',
    seriesNum: '3 CCR 702-5',
    chapterKey: '702-5',
    chapterTitle: 'Property and Casualty',
    domain: 'insurance',
    headerKind: 'regulation',
    filter: { kind: 'regs', regCites: ['702-5-1-14', '702-5-2-12', '702-5-2-15'] },
    note: '5-1-14 prompt payment (60 days); 5-2-12 auto consumer protections; 5-2-15 total-loss valuation and rental reimbursement (kickoff §2.2).',
  },
  {
    code: '4 CCR',
    deptName: 'Department of Regulatory Agencies',
    agencyName: 'Public Utilities Commission',
    seriesNum: '4 CCR 723-6',
    chapterKey: '723-6',
    chapterTitle: 'Rules Regulating Transportation by Motor Vehicle',
    domain: 'repair_law',
    headerKind: 'puc-rule',
    filter: { kind: 'prefix', citePrefix: '723-6-65' },
    note: 'The towing-carrier 6500-series ONLY — the series document is the whole transportation rulebook and must never be captured whole (kickoff §2.4; the leak test enforces).',
  },
  {
    code: '7 CCR',
    deptName: 'Department of Labor and Employment',
    agencyName: 'Division of Labor Standards and Statistics',
    seriesNum: '7 CCR 1103-1',
    chapterKey: '1103-1',
    chapterTitle: 'Colorado Overtime and Minimum Pay Standards Order',
    domain: 'employment',
    headerKind: 'comps-rule',
    filter: {
      kind: 'regs',
      regCites: ['1103-1-2.4.1', '1103-1-3.1', '1103-1-4.1.1', '1103-1-5.1', '1103-1-5.2'],
    },
    note: 'COMPS Order #40: 2.4.1 the dealer salesperson/parts/mechanic exemption (the "dealers" caveat is annotated, not settled), 3.1 minimum wage, 4.1.1 overtime, 5.1 meal periods, 5.2 rest periods. Rule numbers are the #38/#39 structure — a named-reg hard-fail at first capture means Order #40 renumbered; reconcile against the real document consciously.',
  },
];
