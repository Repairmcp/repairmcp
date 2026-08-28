import type { MtDomain } from './schema.js';

/**
 * The ARM half of the Montana capture manifest. ARM is captured through the
 * Secretary of State's public JSON API at rules.mt.gov (the website itself
 * is a JavaScript app; the API is the real publication surface): walk the
 * Title→Chapter→Subchapter tree by sectionId, then fetch each rule's detail
 * and its ACCESSIBLE_HTML document. Every rule carries an ISO effective date
 * and a SHA-256 content hash from the API itself.
 */
export interface ArmCaptureSource {
  code: 'ARM';
  /** The API tree sectionId, e.g. '6.6.17' or '23.19.2'. */
  subchapterId: string;
  /** Becomes StateSection.chapter, e.g. '6.6'. */
  chapterKey: string;
  chapterTitle: string;
  domain: MtDomain;
  /** Named rules hard-fail when missing or not EFFECTIVE. */
  filter: { kind: 'subchapter' } | { kind: 'rules'; ruleIds: readonly string[] };
  note?: string;
}

export const MT_ARM_SOURCES: readonly ArmCaptureSource[] = [
  {
    code: 'ARM',
    subchapterId: '23.19.2',
    chapterKey: '23.19',
    chapterTitle: 'Consumer Protection Office',
    domain: 'repair_law',
    filter: { kind: 'subchapter' },
    note: 'Motor vehicle repairs: Montana has NO repair-estimate statute; 23.19.202 (estimates/invoices) and 23.19.203 (repairs and services) are the law, as consumer-protection rules under MCA 30-14-104.',
  },
  {
    code: 'ARM',
    subchapterId: '6.6.17',
    chapterKey: '6.6',
    chapterTitle: 'Insurance Department',
    domain: 'insurance',
    filter: { kind: 'subchapter' },
    note: '6.6.1701 defines "general business practice" for MCA 33-18-201 enforcement. NOTE: the "ARM 6.6.2807" total-loss cite circulating on consumer sites is a propagated citation error (6.6.28 is surplus lines) — the total-loss authority is MCA 33-23-202 + 27-1-306.',
  },
  {
    code: 'ARM',
    subchapterId: '23.6.1',
    chapterKey: '23.6',
    chapterTitle: 'Tow Trucks',
    domain: 'repair_law',
    filter: { kind: 'rules', ruleIds: ['23.6.108'] },
    note: 'Tow and storage insurance requirements, paired with MCA 61-8-906.',
  },
];
