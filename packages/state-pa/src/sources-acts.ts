import type { PaActCode, PaDomain } from './schema.js';
import { LEGIS_BASE } from './sources-consolidated.js';

/**
 * The unconsolidated-act half of the manifest (kickoff §2, §3.2): six acts,
 * one whole-act page each on the Legislature's static mirror, 41 sections.
 * Every act page was fetched 2026-09-14 and its section list read back.
 *
 * The page prints ACT section numbers ("Section 5."), never the P.S. numbers
 * everyone cites (43 P.S. 260.5), so `psCite` is asserted here per section
 * — no formula — and tests check uniqueness and the Pennsylvania Code's own
 * cross-references (62.2 cites "sections 3, 4, 8 and 11 of the act (63 P.S.
 * §§ 853, 854, 858 and 861)"). The 1915 Workers' Compensation Act prints no
 * catchlines, so its five headings are manifest descriptors.
 */
export interface PaActSectionEntry {
  /** As the page prints it: "5", "2.1", "301". */
  actSection: string;
  /** The Purdon's cite everyone uses: "260.5", "201-9.2", "861", "22". */
  psCite: string;
  /** Required when the act prints no catchline (WCA); forbidden otherwise. */
  heading?: string;
}

export interface PaActCaptureSource {
  code: PaActCode;
  year: number;
  actNo: number;
  /** The act's short title — the chapter value its sections carry. */
  shortTitle: string;
  chapterTitle: string;
  domain: PaDomain;
  sections: readonly PaActSectionEntry[];
  note?: string;
}

export function actUrl(year: number, actNo: number): string {
  return `${LEGIS_BASE}/US/HTM/${year}/0/${String(actNo).padStart(4, '0')}..HTM`;
}
export function actRawName(year: number, actNo: number): string {
  return `pa-us-${year}-${String(actNo).padStart(4, '0')}.html`;
}

const s = (actSection: string, psCite: string, heading?: string): PaActSectionEntry =>
  heading ? { actSection, psCite, heading } : { actSection, psCite };

export const PA_ACT_SOURCES: readonly PaActCaptureSource[] = [
  { code: '40 P.S.', year: 1974, actNo: 205, shortTitle: 'Unfair Insurance Practices Act', chapterTitle: 'Act 205 of 1974 (40 P.S. 1171.1 et seq.)', domain: 'insurance',
    sections: [s('1', '1171.1'), s('2', '1171.2'), s('3', '1171.3'), s('4', '1171.4'), s('5', '1171.5'), s('9', '1171.9'), s('11', '1171.11')],
    note: 'No private right of action (D\'Ambrosio, Pa. 1981); 5(a)(10) is the claims catalog; 5(b) repealed 2024, 12 repealed 1978.' },
  { code: '63 P.S.', year: 1972, actNo: 367, shortTitle: 'Motor Vehicle Physical Damage Appraiser Act', chapterTitle: 'Act 367 of 1972 (63 P.S. 851 et seq.)', domain: 'insurance',
    sections: [s('1', '851'), s('2', '852'), s('3', '853'), s('6', '856'), s('9', '859'), s('10', '860'), s('11', '861'), s('12', '862')],
    note: '11(d): no appraiser or employer may require repairs at a specified shop; 11(f)(5): inspect within six working days; 11(e): disputed supplements need a personal inspection.' },
  { code: '73 P.S.', year: 1968, actNo: 387, shortTitle: 'Unfair Trade Practices and Consumer Protection Law', chapterTitle: 'Act 387 of 1968 (73 P.S. 201-1 et seq.)', domain: 'repair_law',
    sections: [s('1', '201-1'), s('2', '201-2'), s('3', '201-3'), s('3.1', '201-3.1'), s('9.2', '201-9.2')],
    note: '3.1 is the rulemaking authority 37 Pa. Code Chapter 301 is issued under; 9.2 is the private action (treble damages).' },
  { code: '43 P.S.', year: 1961, actNo: 329, shortTitle: 'Wage Payment and Collection Law', chapterTitle: 'Act 329 of 1961 (43 P.S. 260.1 et seq.)', domain: 'employment',
    sections: [s('2.1', '260.2a'), s('3', '260.3'), s('4', '260.4'), s('5', '260.5'), s('6', '260.6'), s('7', '260.7'), s('8', '260.8'), s('9.1', '260.9a'), s('10', '260.10'), s('11.1', '260.11a')],
    note: 'Sections 2, 9, 11 are repealed and printed as such; 4.1 is railroads.' },
  { code: '43 P.S.', year: 1968, actNo: 5, shortTitle: 'The Minimum Wage Act of 1968', chapterTitle: 'Act 5 of 1968 (43 P.S. 333.101 et seq.)', domain: 'employment',
    sections: [s('3', '333.103'), s('4', '333.104'), s('5', '333.105'), s('8', '333.108'), s('12', '333.112'), s('13', '333.113')] },
  { code: '77 P.S.', year: 1915, actNo: 338, shortTitle: "Workers' Compensation Act", chapterTitle: 'Act 338 of 1915 (77 P.S. 1 et seq.)', domain: 'employment',
    sections: [
      s('104', '22', 'Definition of "employe"'),
      s('301', '431', 'Liability of employer for compensation; injury in the course of employment'),
      s('302', '461', 'Contractors and subcontractors; statutory employer'),
      s('303', '481', 'Exclusiveness of remedy; third-party actions'),
      s('305', '501', 'Insurance of liability; self-insurance; penalties for failure to insure'),
    ],
    note: 'The 1915 act prints no catchlines — headings are manifest descriptors (headingSource: manifest). West splits some sections\' subsections across P.S. numbers (301(a) is 431, 301(c) is 411); the P.S. cite of the opening subsection is used.' },
];
