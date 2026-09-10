import type { NyDomain } from './schema.js';
import type { PartSplitSpec } from './parse-pdf-part.js';

/**
 * The two official regulation booklets. Both are PDFs (kickoff §3.2–3.3):
 * the DMV's CR-82 prints all of 15 NYCRR Part 82 and its cover edition
 * "CR-82 (5/26)"; the DOL's CR 142 prints all of 12 NYCRR Part 142 and
 * states "As amended Effective June 24, 2020" once for the whole order.
 * Every cite below was read from the booklets' own contents 2026-09-10.
 * LII carries both parts too and is the by-hand cross-check only.
 */
export interface NyPdfPartSource {
  code: '15 NYCRR' | '12 NYCRR';
  captureSource: 'dmv' | 'dol';
  chapter: string;
  chapterTitle: string;
  domain: NyDomain;
  pdfUrl: string;
  /** The human landing page — becomes sourceUrl for every section. */
  pageUrl: string;
  cites: readonly string[];
  split: PartSplitSpec;
  /** Extraction-fidelity tripwire (the CO bulletin rule). */
  mustContain: readonly string[];
}

const range = (n: number, f: (i: number) => string): string[] => Array.from({ length: n }, (_, i) => f(i + 1));

export const NY_PART82_SOURCE: NyPdfPartSource = {
  code: '15 NYCRR',
  captureSource: 'dmv',
  chapter: 'Part 82',
  chapterTitle: 'Motor Vehicle Repair Shops (Regulations of the Commissioner of Motor Vehicles)',
  domain: 'repair_law',
  pdfUrl: 'https://dmv.ny.gov/forms/cr82.pdf',
  pageUrl: 'https://dmv.ny.gov/forms/cr82.pdf',
  cites: range(19, (i) => `82.${i}`),
  split: {
    head: /^(?:Section\s+)?(82\.\d{1,2})\s+([A-Z][^\n]*?\.)$/,
    bodyStart: /^Section 82\.1 Introduction\.$/,
    bodyEnd: /^APPENDIX A\b/,
    dropLines: [/^Part 82 - Page \d+$/],
  },
  mustContain: ['82.5 Obligations of the repair shop.', 'estimate in writing', '82.18 Insurers and repair shops.'],
};

export const NY_PART142_SOURCE: NyPdfPartSource = {
  code: '12 NYCRR',
  captureSource: 'dol',
  chapter: 'Part 142',
  chapterTitle: 'Minimum Wage Order for Miscellaneous Industries and Occupations',
  domain: 'employment',
  pdfUrl: 'https://forms.labor.ny.gov/WP/CR142.pdf',
  pageUrl: 'https://dol.ny.gov/minimum-wage-order-miscellaneous-industries-and-occupations-cr142',
  cites: ['142-1.1', ...range(23, (i) => `142-2.${i}`)],
  split: {
    head: /^§\s*(142-[12]\.\d{1,2})\s+([A-Z][^\n]*?)\.?$/,
    bodyStart: /^§\s*142-1\.1\b/,
    bodyEnd: /^SUBPART\s+142-3\b/i,
    // SUBPART banners and their "Sec. …"/bare-cite contents lines between a
    // section's body and the next head are structural, not substantive text
    // (see PartSplitSpec.skipFrom in parse-pdf-part.ts) — they are removed
    // by skipFrom below, not by dropLines. REGULATIONS is the running head
    // that can still appear inside a section's body pages.
    skipFrom: /^SUBPART\s/i,
    // Every line discarded in the skip region must be a contents entry
    // (a cite, optionally "Sec. "-prefixed, followed by more text) or an
    // all-caps banner line (the SUBPART heading itself, which may wrap).
    // REGULATIONS is dropped earlier by dropLines and never reaches this
    // check, but the regex admits it anyway. The real booklet's extraction
    // prints the "Sec." contents-list header on its OWN line, separate
    // from the cite that follows it — bare "Sec." must be admitted too.
    skipOnly: /^(?:Sec\.\s+)?142-[123]\.\d{1,2}\s+\S|^Sec\.$|^[A-Z0-9 ,;:'()\-’]{3,}$/,
    dropLines: [/^Part 142 - Page \d+$/, /^REGULATIONS$/],
  },
  mustContain: ['§ 142-2.4 Additional rate for split shift and spread of hours.', 'spread of hours exceeds 10 hours'],
};

export const NY_PDF_PART_SOURCES = [NY_PART82_SOURCE, NY_PART142_SOURCE] as const;

/** "CR-82 (5/26) MOTOR VEHICLE …" → "CR-82 (5/26)". Pinned by NY_CR82_EDITION. */
export function readCr82Edition(text: string): string {
  const m = /\bCR-82 \(\d{1,2}\/\d{2}\)/.exec(text);
  if (!m) throw new Error('No "CR-82 (M/YY)" edition token in the booklet — the DMV changed the cover, or the PDF did not extract.');
  return m[0];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "As amended\nEffective June 24, 2020" → "2020-06-24". */
export function readPart142EffectiveDate(text: string): string {
  const m = /As amended\s+Effective\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(text);
  if (!m) throw new Error('No "As amended Effective <Month D, YYYY>" line on the CR 142 cover — template drift.');
  const month = MONTHS.indexOf(m[1]!) + 1;
  if (month === 0) throw new Error(`Unknown month "${m[1]}" on the CR 142 cover.`);
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}
