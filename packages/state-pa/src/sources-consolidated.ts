import type { PaConsolidatedCode, PaDomain } from './schema.js';

/**
 * The consolidated-statute half of the Pennsylvania manifest (kickoff §2,
 * §3.1): three chapter pages on the Legislature's static mirror, 17 cites.
 * Every chapter page was fetched 2026-09-14 and its section list read back.
 * Capture is by CHAPTER page because a section's date often lives only in
 * its subchapter's or chapter's Enactment note, which the single-section
 * page omits; `chapterKey` names the subchapter and the capture
 * cross-checks the SUBCHAPTER label each section sits under.
 */
export interface PaConsolidatedCaptureSource {
  code: PaConsolidatedCode;
  title: 42 | 75;
  chapter: number;
  /** The SUBCHAPTER letter the cites sit under, cross-checked at capture. */
  subchapter: string;
  /** "ch. 73, subch. A" — the chapter value every section carries. */
  chapterKey: string;
  chapterTitle: string;
  domain: PaDomain;
  cites: readonly string[];
  note?: string;
}

export const LEGIS_BASE = 'https://www.legis.state.pa.us/WU01/LI/LI';
/** robots.txt Crawl-delay for legis.state.pa.us. Do not lower. */
export const LEGIS_MIN_DELAY_MS = 5_000;

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function consolidatedChapterUrl(title: number, chapter: number): string {
  return `${LEGIS_BASE}/CT/HTM/${pad(title, 2)}/00.${pad(chapter, 3)}..HTM`;
}

/** "1161" → …/75/00.011.061.000..HTM; "1165.1" → …/75/00.011.065.001..HTM (decimal sections carry the decimal in the last group). */
export function consolidatedSectionUrl(title: number, cite: string): string {
  const [whole, decimal] = cite.split('.');
  const n = Number(whole);
  const chapter = Math.floor(n / 100);
  const section = n % 100;
  return `${LEGIS_BASE}/CT/HTM/${pad(title, 2)}/00.${pad(chapter, 3)}.${pad(section, 3)}.${pad(Number(decimal ?? 0), 3)}..HTM`;
}

export function consolidatedRawName(title: number, chapter: number): string {
  return `pa-ct-${pad(title, 2)}-ch${chapter}.html`;
}

export const PA_CONSOLIDATED_SOURCES: readonly PaConsolidatedCaptureSource[] = [
  { code: '42 Pa.C.S.', title: 42, chapter: 83, subchapter: 'G', chapterKey: 'ch. 83, subch. G',
    chapterTitle: 'Particular Rights and Immunities — Special Damages', domain: 'insurance', cites: ['8371'],
    note: 'Bad faith: interest at prime plus 3%, punitive damages, costs and fees. The INSURED\'s remedy — a third-party claimant has no 8371 claim.' },
  { code: '75 Pa.C.S.', title: 75, chapter: 11, subchapter: 'D', chapterKey: 'ch. 11, subch. D',
    chapterTitle: 'Certificate of Title and Security Interests — Salvage Vehicles, Theft Vehicles, Reconstructed Vehicles and Flood Vehicles', domain: 'insurance',
    cites: ['1161', '1162', '1163', '1164', '1165', '1165.1', '1166', '1167'],
    note: '1165.2 is (Expired) and is deliberately absent.' },
  { code: '75 Pa.C.S.', title: 75, chapter: 73, subchapter: 'A', chapterKey: 'ch. 73, subch. A',
    chapterTitle: 'Abandoned Vehicles and Cargos — Abandoned Vehicles and Salvors', domain: 'repair_law',
    cites: ['7301', '7304', '7305', '7306', '7307', '7308', '7311', '7312'],
    note: '7311 is the garage keeper\'s 15-day report; the salvor/police/private-property mechanics (7302, 7303, 7303.1, 7304.1, 7309, 7310, 7311.1, 7311.2) are excluded. The abandoned-vehicle definition sits in 75 Pa.C.S. 102 (154 KB, not captured).' },
];
