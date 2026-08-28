import type { ParsedWaSection } from './parse.js';
import type { WaCode, WaDomain } from './schema.js';

/**
 * The capture manifest: every chapter (or chapter subset) the corpus holds,
 * with the reason it is scoped the way it is. scripts/capture-waleg.ts is the
 * only consumer at capture time; tests assert the four-domain shape.
 *
 * All capture goes through CHAPTER pages (`cite=<chapter>&full=true`) — the
 * single-section page template has no anchors and part-head sections render
 * empty there (verified live 2026-08-27). "Single section" and "part subset"
 * are therefore anchor FILTERS over a chapter fetch, and two entries sharing a
 * chapter share one fetch.
 */
export type WaSectionFilter =
  | { kind: 'chapter' }
  | { kind: 'prefix'; prefixes: readonly string[] }
  /** Explicit cites — a miss hard-fails: you asked for it by name, and silence would hide a renumbering. */
  | { kind: 'sections'; cites: readonly string[] };

export interface WaCaptureSource {
  code: WaCode;
  chapter: string;
  /** Config-owned, eyeball-verified against the page at capture; feeds citation long forms. */
  chapterTitle: string;
  domain: WaDomain;
  filter: WaSectionFilter;
  note?: string;
}

export const WA_CAPTURE_SOURCES: readonly WaCaptureSource[] = [
  // ── Domain A: insurance claims ─────────────────────────────────────
  {
    code: 'WAC',
    chapter: '284-30',
    chapterTitle: 'Trade practices',
    domain: 'insurance',
    filter: { kind: 'chapter' },
    note: 'Unfair claims settlement practices: -330 defined practices, -390 motor vehicle claims, -391..-394 total loss/valuation/subrogation/storage.',
  },
  {
    code: 'RCW',
    chapter: '48.30',
    chapterTitle: 'Unfair practices and frauds',
    domain: 'insurance',
    filter: { kind: 'chapter' },
    note: '48.30.015 is the Insurance Fair Conduct Act (treble damages + fees).',
  },
  {
    code: 'RCW',
    chapter: '19.86',
    chapterTitle: 'Unfair business practices—Consumer protection',
    domain: 'insurance',
    filter: { kind: 'chapter' },
    note: 'The Consumer Protection Act — the private-action hook RCW 46.71.070 points at.',
  },

  // ── Domain B: auto repair law ──────────────────────────────────────
  {
    code: 'RCW',
    chapter: '46.71',
    chapterTitle: 'Automotive repair',
    domain: 'repair_law',
    filter: { kind: 'chapter' },
    note: 'The Automotive Repair Act: .025 written estimates, .015(2) aftermarket/non-OEM disclosure, .041 lien bar.',
  },
  {
    code: 'RCW',
    chapter: '60.08',
    chapterTitle: 'Chattel liens',
    domain: 'repair_law',
    filter: { kind: 'chapter' },
    note: 'The repair possessory lien chapter. RCW 60.04 is construction/real property — not this.',
  },
  {
    code: 'RCW',
    chapter: '46.80',
    chapterTitle: 'Vehicle wreckers',
    domain: 'repair_law',
    filter: { kind: 'chapter' },
  },
  {
    code: 'RCW',
    chapter: '46.55',
    chapterTitle: 'Towing and impoundment',
    domain: 'repair_law',
    filter: { kind: 'chapter' },
    note: 'Large and mostly tow-operator law; in scope for storage/impound questions.',
  },

  // ── Domain C: WISHA workplace safety ───────────────────────────────
  {
    code: 'WAC',
    chapter: '296-800',
    chapterTitle: 'Safety and health core rules',
    domain: 'safety',
    filter: { kind: 'chapter' },
  },
  {
    code: 'WAC',
    chapter: '296-24',
    chapterTitle: 'General safety and health standards',
    domain: 'safety',
    filter: { kind: 'prefix', prefixes: ['296-24-370'] },
    note: 'Spray finishing (flammable-materials side): the -370 family. Bare -370 is an empty part-head and parses out; the rules are -37001..-37027.',
  },
  {
    code: 'WAC',
    chapter: '296-62',
    chapterTitle: 'General occupational health standards',
    domain: 'safety',
    filter: { kind: 'prefix', prefixes: ['296-62-080'] },
    note: 'Hexavalent chromium, Part I-2 (-08003 ff.) — chromate primers. The parent chapter is ~3.5 MB and must NEVER be captured whole.',
  },
  {
    code: 'WAC',
    chapter: '296-62',
    chapterTitle: 'General occupational health standards',
    domain: 'safety',
    filter: { kind: 'sections', cites: ['296-62-11019'] },
    note: 'Spray-finishing operations (ventilation/health side). Shares the 296-62 fetch with the chromium entry.',
  },
  {
    code: 'WAC',
    chapter: '296-842',
    chapterTitle: 'Respirators',
    domain: 'safety',
    filter: { kind: 'chapter' },
    note: 'Isocyanate paint systems make this the collision-shop rule.',
  },
  {
    code: 'WAC',
    chapter: '296-901',
    chapterTitle: 'Globally harmonized system for hazard communication',
    domain: 'safety',
    filter: { kind: 'chapter' },
  },

  // ── Domain D: employment / HR ──────────────────────────────────────
  {
    code: 'RCW',
    chapter: '49.46',
    chapterTitle: 'Minimum wage requirements and labor standards',
    domain: 'employment',
    filter: { kind: 'chapter' },
    note: 'Overtime at .130, paid sick leave at .200/.210.',
  },
  {
    code: 'WAC',
    chapter: '296-126',
    chapterTitle: 'Standards of labor for the protection of employees',
    domain: 'employment',
    filter: { kind: 'chapter' },
    note: '-092 is meal and rest periods — the question every shop asks.',
  },
  {
    code: 'RCW',
    chapter: '49.60',
    chapterTitle: 'Discrimination—Human rights commission',
    domain: 'employment',
    filter: { kind: 'chapter' },
  },
  {
    code: 'RCW',
    chapter: '50A.05',
    chapterTitle: 'Paid family and medical leave—General provisions',
    domain: 'employment',
    filter: { kind: 'chapter' },
    note: '50A.04 is decodified (dispositions page only) — never fetch it.',
  },
  {
    code: 'RCW',
    chapter: '50A.10',
    chapterTitle: 'Paid family and medical leave—Premiums',
    domain: 'employment',
    filter: { kind: 'chapter' },
  },
  {
    code: 'RCW',
    chapter: '51.12',
    chapterTitle: 'Industrial insurance—Employments and occupations covered',
    domain: 'employment',
    filter: { kind: 'chapter' },
  },
  {
    code: 'RCW',
    chapter: '51.14',
    chapterTitle: 'Industrial insurance—Self-insurers',
    domain: 'employment',
    filter: { kind: 'chapter' },
  },
  {
    code: 'RCW',
    chapter: '51.16',
    chapterTitle: 'Industrial insurance—Assessment and collection of premiums',
    domain: 'employment',
    filter: { kind: 'chapter' },
    note: 'Verified at capture 2026-08-27: 25 sections of employer premium and payroll-reporting duties.',
  },
  {
    code: 'WAC',
    chapter: '296-125',
    chapterTitle: 'Nonagricultural employment of minors',
    domain: 'employment',
    filter: { kind: 'chapter' },
    note: 'Prohibited duties at -131/-141 — apprentices, hoists, spray painting.',
  },
];

/**
 * Apply one source's filter over a parsed chapter. A filter that matches
 * nothing throws: for `prefix` it means the family moved or the page changed;
 * for `sections` a missing cite was requested BY NAME, and silence would hide
 * a renumbering (or a part-head that parsed empty).
 */
export function applyFilter(
  sections: readonly ParsedWaSection[],
  filter: WaSectionFilter,
): ParsedWaSection[] {
  switch (filter.kind) {
    case 'chapter':
      return [...sections];
    case 'prefix': {
      const matched = sections.filter((s) =>
        filter.prefixes.some((prefix) => s.cite.startsWith(prefix)),
      );
      if (matched.length === 0) {
        throw new Error(`Prefix filter [${filter.prefixes.join(', ')}] matched no sections.`);
      }
      return matched;
    }
    case 'sections': {
      const byCite = new Map(sections.map((s) => [s.cite, s]));
      return filter.cites.map((cite) => {
        const section = byCite.get(cite);
        if (!section) {
          throw new Error(
            `Requested section ${cite} is not in the parsed chapter — renumbered, repealed, or an empty part-head.`,
          );
        }
        return section;
      });
    }
  }
}

export function chapterUrl(code: WaCode, chapter: string): string {
  return `https://app.leg.wa.gov/${code}/default.aspx?cite=${chapter}&full=true`;
}

export function sectionUrl(code: WaCode, cite: string): string {
  return `https://app.leg.wa.gov/${code}/default.aspx?cite=${cite}`;
}
