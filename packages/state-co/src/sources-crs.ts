import type { CoDomain } from './schema.js';

/**
 * The CRS half of the Colorado capture manifest. CRS is published as one
 * file per TITLE (olls.info), so capture fetches each distinct title once
 * and each entry selects sections out of it. Every cite here was verified
 * in the kickoff's research pass; a named cite absent from its title file
 * hard-fails at capture (for Title 8 that failure names the PDF-only
 * supplement risk from kickoff §9.1).
 */
export interface CrsCaptureSource {
  code: 'CRS';
  title: number;
  /** Becomes StateSection.chapter, e.g. '10-4' (title-article). */
  chapterKey: string;
  chapterTitle: string;
  domain: CoDomain;
  filter: { kind: 'sections'; cites: readonly string[] } | { kind: 'article' };
  note?: string;
}

export const CRS_INDEX_URL =
  'https://content.leg.colorado.gov/agencies/office-legislative-legal-services/2026-crs-titles-download';

export const CO_CRS_SOURCES: readonly CrsCaptureSource[] = [
  {
    code: 'CRS', title: 10, chapterKey: '10-3',
    chapterTitle: 'Regulation of Insurance Companies', domain: 'insurance',
    filter: { kind: 'sections', cites: ['10-3-1104'] },
    note: 'The unfair claims practices catalog at (1)(h). DOI enforcement only — no private right of action; the annotation carries that caveat.',
  },
  {
    code: 'CRS', title: 10, chapterKey: '10-3',
    chapterTitle: 'Regulation of Insurance Companies', domain: 'insurance',
    filter: {
      kind: 'sections',
      cites: ['10-3-1301', '10-3-1302', '10-3-1303', '10-3-1304', '10-3-1305', '10-3-1306'],
    },
    note: 'The Model Quality Replacement Parts Act, whole part. 10-3-1305 is the aftermarket-parts estimate disclosure.',
  },
  {
    code: 'CRS', title: 10, chapterKey: '10-4',
    chapterTitle: 'Property and Casualty Insurance', domain: 'insurance',
    filter: { kind: 'sections', cites: ['10-4-120', '10-4-639'] },
    note: '10-4-120: anti-steering, (2)(a)-(i) prohibited acts, (3)(a)-(g) required acts incl. (3)(e) "assume all reasonable costs". 10-4-639: total loss — taxes/fees, valuation method, towing/storage disclosure.',
  },
  {
    code: 'CRS', title: 42, chapterKey: '42-9',
    chapterTitle: 'Motor Vehicle Repairs', domain: 'repair_law',
    filter: { kind: 'article' },
    note: 'The Motor Vehicle Repair Act, whole article: estimates, over-estimate caps, storage, parts disclosure and return, invoices, warranties, penalties. NOT repealed (kickoff §2.3).',
  },
  {
    code: 'CRS', title: 42, chapterKey: '42-4',
    chapterTitle: 'Regulation of Vehicles and Traffic', domain: 'repair_law',
    filter: { kind: 'sections', cites: ['42-4-2103'] },
    note: 'Towing without authorization — the statute the PUC towing rules enforce.',
  },
  {
    code: 'CRS', title: 6, chapterKey: '6-1',
    chapterTitle: 'Colorado Consumer Protection Act', domain: 'repair_law',
    filter: { kind: 'sections', cites: ['6-1-105'] },
    note: 'The deceptive-practices catalog: (1)(e) service misrepresentation, (1)(l) price statements, (1)(n) bait-and-switch, (1)(u) failure to disclose, (1)(rrr) catch-all. Private-claim public-impact threshold is case law — annotation caveat.',
  },
  {
    code: 'CRS', title: 8, chapterKey: '8-4',
    chapterTitle: 'Wages', domain: 'employment',
    filter: { kind: 'sections', cites: ['8-4-103', '8-4-105', '8-4-109'] },
    note: 'The Wage Act: paydays and pay statements (-103), permitted deductions (-105), final pay on separation with the entrusted-property carve-out (-109). Title 8 partly ships in the PDF-only supplement zip — a hard-fail here means consult crs2026-statute-pdfs.zip (kickoff §9.1).',
  },
];
