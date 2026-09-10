import type { NyDomain, NyStatuteCode } from './schema.js';

/**
 * The statutes half of the New York manifest: which sections to fetch from
 * the Senate's public site, one page per section. Every cite below was
 * fetched 2026-09-10 and its catchline read back (kickoff §2). The Senate
 * uses its own law ids (GBS, not GBL; LIE; WKC) and prints section letters
 * upper-case in URLs ("398-D").
 *
 * `chapter` is the article as the page's location line prints it, made to
 * read after the word "chapter" ("art. 26"); the capture cross-checks it
 * against the page so a wrong expectation fails at capture, never silently.
 * Headings are NOT here: New York prints catchlines and the parser
 * captures them as source text.
 */
export interface NyStatuteCaptureSource {
  code: NyStatuteCode;
  lawId: 'ISC' | 'VAT' | 'GBS' | 'LIE' | 'LAB' | 'WKC';
  /** "art. 26" — the ARTICLE number the location line prints. */
  chapter: string;
  chapterTitle: string;
  domain: NyDomain;
  /** As the Senate prints them, lower-case letters allowed ("398-d"). */
  cites: readonly string[];
  note?: string;
}

export const NY_LAW_IDS: Record<NyStatuteCode, NyStatuteCaptureSource['lawId']> = {
  'N.Y. Ins. Law': 'ISC',
  'N.Y. Veh. & Traf. Law': 'VAT',
  'N.Y. Gen. Bus. Law': 'GBS',
  'N.Y. Lien Law': 'LIE',
  'N.Y. Lab. Law': 'LAB',
  "N.Y. Workers' Comp. Law": 'WKC',
};

export const SENATE_BASE = 'https://www.nysenate.gov/legislation/laws';
export function senateSectionUrl(lawId: string, cite: string): string {
  return `${SENATE_BASE}/${lawId}/${cite.toUpperCase()}`;
}

export const NY_STATUTE_SOURCES: readonly NyStatuteCaptureSource[] = [
  { code: 'N.Y. Ins. Law', lawId: 'ISC', chapter: 'art. 26', chapterTitle: 'Unfair Claim Settlement Practices; Other Misconduct', domain: 'insurance', cites: ['2601', '2610'],
    note: '2601 is the catalog and carries NO private right of action (Rocanova v. Equitable Life, 1994). 2610(a) bars requiring a particular shop; (b) bars recommending one unless asked, narrowed in practice by Allstate v. Serio (2d Cir. 2001) — see the DFS guidance code.' },
  { code: 'N.Y. Ins. Law', lawId: 'ISC', chapter: 'art. 34', chapterTitle: 'Insurance Contracts — Property/Casualty', domain: 'insurance', cites: ['3411'] },
  { code: 'N.Y. Veh. & Traf. Law', lawId: 'VAT', chapter: 'art. 12-A', chapterTitle: 'Motor Vehicle Repair Shop Registration Act', domain: 'repair_law',
    cites: ['398', '398-a', '398-b', '398-c', '398-d', '398-e', '398-f', '398-g', '398-h'] },
  { code: 'N.Y. Gen. Bus. Law', lawId: 'GBS', chapter: 'art. 22-A', chapterTitle: 'Consumer Protection from Deceptive Acts and Practices', domain: 'repair_law', cites: ['349', '350'] },
  { code: 'N.Y. Lien Law', lawId: 'LIE', chapter: 'art. 8', chapterTitle: 'Liens on Personal Property', domain: 'repair_law', cites: ['184'],
    note: "184 is the garage keeper's lien on a motor vehicle; the sale sections sit in art. 9." },
  { code: 'N.Y. Lien Law', lawId: 'LIE', chapter: 'art. 9', chapterTitle: 'Enforcement of Liens on Personal Property', domain: 'repair_law', cites: ['200', '201', '202'] },
  { code: 'N.Y. Lab. Law', lawId: 'LAB', chapter: 'art. 5', chapterTitle: 'Hours of Labor', domain: 'employment', cites: ['160', '161', '162'] },
  { code: 'N.Y. Lab. Law', lawId: 'LAB', chapter: 'art. 6', chapterTitle: 'Payment of Wages', domain: 'employment', cites: ['190', '191', '193', '195', '198', '198-c'],
    note: '191(1)(a): manual workers are paid weekly; 198 carries the remedies (amended 2025).' },
  { code: 'N.Y. Lab. Law', lawId: 'LAB', chapter: 'art. 19', chapterTitle: 'Minimum Wage Act', domain: 'employment', cites: ['652', '663'] },
  { code: "N.Y. Workers' Comp. Law", lawId: 'WKC', chapter: 'art. 1', chapterTitle: 'Short Title; Application and Definitions', domain: 'employment', cites: ['2'] },
  { code: "N.Y. Workers' Comp. Law", lawId: 'WKC', chapter: 'art. 2', chapterTitle: 'Compensation', domain: 'employment', cites: ['10'] },
  { code: "N.Y. Workers' Comp. Law", lawId: 'WKC', chapter: 'art. 4', chapterTitle: 'Security for Payment of Compensation', domain: 'employment', cites: ['50', '52'] },
];
