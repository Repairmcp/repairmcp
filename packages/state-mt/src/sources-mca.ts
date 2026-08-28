import type { MtDomain } from './schema.js';

/**
 * The MCA half of the Montana capture manifest. MCA is section-per-page
 * with slot-numbered URLs that cannot be derived from the cite, so capture
 * is two-tier: fetch each part's sections_index.html to map cites to URLs,
 * then fetch each section page. Chapter titles are config-owned and
 * cross-checked against each page's own header (mismatch warns).
 * Every cite here was verified against official sources in the plan's
 * research pass; a named cite that is absent, reserved, or repealed
 * hard-fails at capture.
 */
export interface McaCaptureSource {
  code: 'MCA';
  title: number;
  chapter: number;
  part: number;
  /** Becomes StateSection.chapter, e.g. '33-18'. */
  chapterKey: string;
  chapterTitle: string;
  domain: MtDomain;
  filter: { kind: 'part' } | { kind: 'sections'; cites: readonly string[] };
  note?: string;
}

export const MT_MCA_SOURCES: readonly McaCaptureSource[] = [
  // ── Domain A: insurance claims ─────────────────────────────────────
  {
    code: 'MCA',
    title: 33,
    chapter: 18,
    part: 2,
    chapterKey: '33-18',
    chapterTitle: 'Unfair Trade Practices',
    domain: 'insurance',
    filter: { kind: 'part' },
    note: "The UTPA, insurer's relations with insured and claimant: -201 unfair claim settlement practices, -221/-223 glass steering, -224 body-shop steering + the estimating-system clause, -242 independent cause of action, -245 prompt payment of motor vehicle claims.",
  },
  {
    code: 'MCA',
    title: 33,
    chapter: 23,
    part: 2,
    chapterKey: '33-23',
    chapterTitle: 'Casualty Insurance',
    domain: 'insurance',
    filter: { kind: 'sections', cites: ['33-23-202'] },
    note: 'Total loss must be reimbursed at actual replacement value; book-value policy provisions are void. Pairs with 27-1-306.',
  },
  {
    code: 'MCA',
    title: 27,
    chapter: 1,
    part: 3,
    chapterKey: '27-1',
    chapterTitle: 'Availability of Remedies -- Liability',
    domain: 'insurance',
    filter: { kind: 'sections', cites: ['27-1-306'] },
    note: 'The replacement-value measure of damages the total-loss statute references.',
  },
  {
    code: 'MCA',
    title: 30,
    chapter: 14,
    part: 1,
    chapterKey: '30-14',
    chapterTitle: 'Unfair Trade Practices and Consumer Protection',
    domain: 'insurance',
    filter: {
      kind: 'sections',
      cites: ['30-14-101', '30-14-102', '30-14-103', '30-14-104', '30-14-111', '30-14-133'],
    },
    note: 'The Montana Consumer Protection Act core: definitions, unlawful practices, the rulemaking authority ARM 23.19 rests on, and the -133 private action.',
  },

  // ── Domain B: auto repair law ──────────────────────────────────────
  {
    code: 'MCA',
    title: 71,
    chapter: 3,
    part: 12,
    chapterKey: '71-3',
    chapterTitle: 'Liens',
    domain: 'repair_law',
    filter: { kind: 'part' },
    note: "Agisters' liens and liens for service: 71-3-1201 is the possessory lien for repair, towing, and storage charges.",
  },
  {
    code: 'MCA',
    title: 61,
    chapter: 12,
    part: 4,
    chapterKey: '61-12',
    chapterTitle: 'Miscellaneous Provisions',
    domain: 'repair_law',
    filter: { kind: 'part' },
    note: 'Reclaiming, storage-cost caps, and sale or release of unreclaimed vehicles.',
  },
  {
    code: 'MCA',
    title: 61,
    chapter: 8,
    part: 9,
    chapterKey: '61-8',
    chapterTitle: 'Traffic Regulation',
    domain: 'repair_law',
    filter: { kind: 'part' },
    note: 'The Montana Professional Tow Truck Act, including -906 insurance and storage requirements.',
  },
  {
    code: 'MCA',
    title: 61,
    chapter: 3,
    part: 2,
    chapterKey: '61-3',
    chapterTitle: 'Certificates of Title, Registration, and Taxation of Motor Vehicles',
    domain: 'repair_law',
    filter: { kind: 'sections', cites: ['61-3-211', '61-3-223'] },
    note: 'Salvage certificates and the salvage-vehicle definition a shop consults on totals.',
  },

  // ── Domain C: workplace safety ─────────────────────────────────────
  {
    code: 'MCA',
    title: 39,
    chapter: 71,
    part: 15,
    chapterKey: '39-71',
    chapterTitle: "Workers' Compensation",
    domain: 'safety',
    filter: { kind: 'part' },
    note: 'The Montana Safety Culture Act — the one state safety law binding a private shop. Private-sector technical standards are federal OSHA (29 CFR), outside a state corpus; Title 50 ch. 71 is public-sector only and deliberately NOT captured.',
  },

  // ── Domain D: employment / HR ──────────────────────────────────────
  {
    code: 'MCA',
    title: 39,
    chapter: 2,
    part: 9,
    chapterKey: '39-2',
    chapterTitle: 'The Employment Relationship',
    domain: 'employment',
    filter: { kind: 'part' },
    note: 'The Wrongful Discharge From Employment Act — the only one in the nation.',
  },
  {
    code: 'MCA',
    title: 39,
    chapter: 3,
    part: 2,
    chapterKey: '39-3',
    chapterTitle: 'Wages and Wage Protection',
    domain: 'employment',
    filter: { kind: 'sections', cites: ['39-3-205'] },
    note: 'Final wages: due immediately on for-cause termination unless a written policy extends.',
  },
  {
    code: 'MCA',
    title: 39,
    chapter: 3,
    part: 4,
    chapterKey: '39-3',
    chapterTitle: 'Wages and Wage Protection',
    domain: 'employment',
    filter: { kind: 'sections', cites: ['39-3-404', '39-3-405', '39-3-406', '39-3-409'] },
    note: 'Minimum wage, overtime, exclusions, and the annually adjusted rate. Montana has NO adult meal/rest break statute — that absence is stated in the tool descriptions.',
  },
  {
    code: 'MCA',
    title: 41,
    chapter: 2,
    part: 1,
    chapterKey: '41-2',
    chapterTitle: 'Child Labor',
    domain: 'employment',
    filter: { kind: 'part' },
    note: 'Prohibited duties for minors — hoisting apparatus and power-driven machinery reach lifts and frame racks; -110 covers apprentice and student-learner programs.',
  },
  {
    code: 'MCA',
    title: 39,
    chapter: 71,
    part: 4,
    chapterKey: '39-71',
    chapterTitle: "Workers' Compensation",
    domain: 'employment',
    filter: { kind: 'sections', cites: ['39-71-401'] },
    note: 'Mandatory coverage and plan election — the employer-obligation core of a much larger chapter.',
  },
];

function pathSegment(n: number): string {
  return String(n * 10).padStart(4, '0');
}

export function mcaPartIndexUrl(source: McaCaptureSource): string {
  return (
    `https://mca.legmt.gov/bills/mca/title_${pathSegment(source.title)}/` +
    `chapter_${pathSegment(source.chapter)}/part_${pathSegment(source.part)}/sections_index.html`
  );
}

export function mcaSectionUrl(source: McaCaptureSource, href: string): string {
  const base =
    `https://mca.legmt.gov/bills/mca/title_${pathSegment(source.title)}/` +
    `chapter_${pathSegment(source.chapter)}/part_${pathSegment(source.part)}/`;
  return base + href.replace(/^\.\//, '');
}
