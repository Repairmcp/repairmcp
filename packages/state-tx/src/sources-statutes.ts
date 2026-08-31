import type { TxCode, TxDomain } from './schema.js';

/**
 * The statutes half of the Texas capture manifest. The statutes SPA's own
 * backend (tcss.legis.texas.gov) serves the classic whole-chapter HTML at
 * /resources/{ABBR}/htm/{ABBR}.{chapter}.htm — capture fetches each chapter
 * once and each entry selects sections out of it by name. Every cite here was
 * verified against the live chapter files 2026-08-31 (kickoff §2); a named
 * cite absent from its chapter file hard-fails at capture.
 */
export interface TxStatuteCaptureSource {
  code: TxCode;
  /** The backend's code abbreviation: IN, LA, OC, PR, BC, TN. */
  abbr: string;
  /** Becomes StateSection.chapter, e.g. '1952'. */
  chapter: string;
  chapterTitle: string;
  domain: TxDomain;
  cites: readonly string[];
  note?: string;
}

export const TX_STATUTES_BASE = 'https://tcss.legis.texas.gov/resources';
export const TX_STATUTES_CURRENCY_URL =
  'https://tcss.legis.texas.gov/api/GetProperty/StatutesCurrentMsg';
/** The human landing page for a chapter — becomes sourceUrl. */
export function txStatuteSourceUrl(abbr: string, chapter: string): string {
  return `https://statutes.capitol.texas.gov/Docs/${abbr}/htm/${abbr}.${chapter}.htm`;
}

export const TX_STATUTE_SOURCES: readonly TxStatuteCaptureSource[] = [
  {
    code: 'Tex. Ins. Code', abbr: 'IN', chapter: '1952',
    chapterTitle: 'Policy Provisions and Forms for Automobile Insurance', domain: 'insurance',
    cites: [
      '1952.301', '1952.302', '1952.303', '1952.304', '1952.305', '1952.306', '1952.307',
    ],
    note: 'Subchapter G, Repair of Motor Vehicles, whole subchapter: .301 bars limiting parts/facility choice (anti-steering), .302 the prohibited-acts list (referral fees, "must use" statements, unreasonable travel, gag on parts disclosure), .305 the notice of rights, .307 the rulemaking hook for 28 TAC 5.501.',
  },
  {
    code: 'Tex. Ins. Code', abbr: 'IN', chapter: '1813',
    chapterTitle: 'Appraisal of Disputed Losses', domain: 'insurance',
    cites: ['1813.001', '1813.002', '1813.003', '1813.004'],
    note: 'SB 458 (2025): mandatory appraisal provision in personal auto and residential policies. Applies to policies delivered/issued/renewed on or after 1/1/2026; never commercial auto or TWIA — the annotation carries that caveat.',
  },
  {
    code: 'Tex. Ins. Code', abbr: 'IN', chapter: '542',
    chapterTitle: 'Processing and Settlement of Claims', domain: 'insurance',
    cites: [
      '542.051', '542.052', '542.053', '542.054', '542.055', '542.056', '542.057',
      '542.058', '542.059', '542.060', '542.061',
    ],
    note: 'Subchapter B, Prompt Payment of Claims, whole subchapter. 542.051 defines "claim" as FIRST-party only — that scoping caveat is annotation content. 542.060 is the teeth: claim + 18% annual interest + attorney fees.',
  },
  {
    code: 'Tex. Ins. Code', abbr: 'IN', chapter: '541',
    chapterTitle: 'Unfair Methods of Competition and Unfair or Deceptive Acts or Practices',
    domain: 'insurance',
    cites: ['541.003', '541.060', '541.061', '541.151', '541.152', '541.162'],
    note: '541.060 the unfair settlement practices catalog; 541.151/.152 the private action and damages (Texas HAS one, unlike CO 10-3-1104 — but third-party claimants lack standing under Allstate v. Watson, an annotation caveat).',
  },
  {
    code: 'Tex. Transp. Code', abbr: 'TN', chapter: '501',
    chapterTitle: 'Certificate of Title Act', domain: 'insurance',
    cites: ['501.091'],
    note: 'The salvage/nonrepairable definitions — the honest answer to "when is it legally a total in Texas": no insurance-code percentage threshold exists; these title definitions are what govern branding.',
  },
  {
    code: 'Tex. Occ. Code', abbr: 'OC', chapter: '2303',
    chapterTitle: 'Vehicle Storage Facilities', domain: 'repair_law',
    cites: [
      '2303.002', '2303.151', '2303.152', '2303.153', '2303.154', '2303.155',
      '2303.156', '2303.160',
    ],
    note: 'Notice deadlines, storage charges, payment by lienholder or insurance company, release. Scope caveat for annotations: ch. 2303 governs LICENSED vehicle storage facilities, not every shop holding a car in process.',
  },
  {
    code: 'Tex. Prop. Code', abbr: 'PR', chapter: '70',
    chapterTitle: 'Miscellaneous Liens', domain: 'repair_law',
    cites: ['70.001', '70.003', '70.004', '70.005', '70.006', '70.007', '70.008'],
    note: "The possessory lien family: 70.001 worker's lien (retain possession until paid), 70.006 the abandoned-vehicle sale/disposal path with its notice and county filing mechanics.",
  },
  {
    code: 'Tex. Bus. & Com. Code', abbr: 'BC', chapter: '17',
    chapterTitle: 'Deceptive Trade Practices', domain: 'repair_law',
    cites: ['17.45', '17.46', '17.50', '17.505'],
    note: 'The DTPA core: definitions, the 17.46(b) laundry list, 17.50 relief for consumers, 17.505 pre-suit notice.',
  },
  {
    code: 'Tex. Lab. Code', abbr: 'LA', chapter: '61',
    chapterTitle: 'Payment of Wages', domain: 'employment',
    cites: ['61.011', '61.014', '61.015', '61.017', '61.018', '61.051'],
    note: 'The Payday Law: paydays, final pay (discharged: 6th day; quit: next regular payday), commissions and bonuses (flag-hour relevance), delivery, written-authorization deductions, the TWC wage claim.',
  },
  {
    code: 'Tex. Lab. Code', abbr: 'LA', chapter: '62',
    chapterTitle: 'Minimum Wage', domain: 'employment',
    cites: ['62.051', '62.052', '62.151'],
    note: '62.051 adopts the federal minimum; 62.151 the FLSA bridge (persons covered by the federal act). Texas has NO state overtime or break law — the tool descriptions say so.',
  },
];
