import type { PaDomain, PaPacodeCode } from './schema.js';

/**
 * The Pennsylvania Code half of the manifest (kickoff §2, §3.3): five
 * chapter pages on pacodeandbulletin.gov, 31 sections. The chapter "toc"
 * page carries every section's full text, Source note, and case-note
 * blocks (verified 2026-09-14), so the capture is five requests at the
 * 10 s floor the project owner set against the site's blanket robots
 * Disallow. Per-section pages are the `sourceUrl` each section carries.
 */
export interface PaPacodeCaptureSource {
  code: PaPacodeCode;
  title: 31 | 34 | 37;
  chapter: number;
  /** "Chapter 146" — the chapter value every section carries and the listing key. */
  chapterKey: string;
  chapterTitle: string;
  domain: PaDomain;
  cites: readonly string[];
  note?: string;
}

export const PACODE_BASE = 'https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data';
/** The project owner's floor for the Legislative Reference Bureau's site (2026-09-14). Do not lower. */
export const PACODE_MIN_DELAY_MS = 10_000;

const t3 = (title: number): string => String(title).padStart(3, '0');

export function pacodeChapterUrl(title: number, chapter: number): string {
  return `${PACODE_BASE}/${t3(title)}/chapter${chapter}/chap${chapter}toc.html`;
}
export function pacodeSectionUrl(title: number, chapter: number, cite: string): string {
  return `${PACODE_BASE}/${t3(title)}/chapter${chapter}/s${cite}.html&d=reduce`;
}
export function pacodeRawName(title: number, chapter: number): string {
  return `pa-pacode-${t3(title)}-ch${chapter}.html`;
}

export const PA_PACODE_SOURCES: readonly PaPacodeCaptureSource[] = [
  { code: '31 Pa. Code', title: 31, chapter: 146, chapterKey: 'Chapter 146', chapterTitle: 'Unfair Insurance Practices', domain: 'insurance',
    cites: ['146.1', '146.2', '146.3', '146.4', '146.5', '146.6', '146.7', '146.8', '146.9', '146.10'],
    note: '146.5 acknowledge within 10 working days; 146.6 investigate within 30 days; 146.7 accept or deny within 15 working days; 146.8 the automobile settlement standards.' },
  { code: '31 Pa. Code', title: 31, chapter: 62, chapterKey: 'Chapter 62', chapterTitle: 'Motor Vehicle Physical Damage Appraisers', domain: 'insurance',
    cites: ['62.1', '62.2', '62.3'],
    note: '62.4 is [Reserved] and is deliberately absent. 62.3(f)(4): no naming a shop without the no-requirement disclosure; (e) the total loss formula; (c)(10)-(11) aftermarket crash parts.' },
  { code: '37 Pa. Code', title: 37, chapter: 301, chapterKey: 'Chapter 301', chapterTitle: 'Automotive Industry Trade Practices', domain: 'repair_law',
    cites: ['301.1', '301.2', '301.3', '301.4', '301.5', '301.6'],
    note: '301.3, 301.5, 301.6 carry no Source note and the chapter has no adoption note: those citations carry no date.' },
  { code: '34 Pa. Code', title: 34, chapter: 231, chapterKey: 'Chapter 231', chapterTitle: 'Minimum Wage', domain: 'employment',
    cites: ['231.1', '231.21', '231.22', '231.31', '231.36', '231.37', '231.41', '231.42', '231.43'],
    note: '231.82-231.84 are {Abrogated} (Act 70 of 2021) and 231.81 is a stub pointing at them — excluded.' },
  { code: '34 Pa. Code', title: 34, chapter: 9, chapterKey: 'Chapter 9, Subchapter A', chapterTitle: 'Employment and Wages — Wage Payment and Collection Laws', domain: 'employment',
    cites: ['9.1', '9.2', '9.3'],
    note: '9.1 authorized deductions (the comeback-chargeback answer); 9.4 is railroads.' },
];
