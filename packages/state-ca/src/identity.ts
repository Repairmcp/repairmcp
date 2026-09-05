/**
 * California's identity. Every California cite is a single number with an
 * optional decimal ("758.5", "9884.9", "2695.8", "5446", "226.2") — the
 * shared factory's 2–3-group splitter cannot read that, so California
 * resolves everything in its own resolver. Bare cites resolve by EXACT
 * SECTION NUMBER: the captured numbers are unique across all eight codes
 * (CA_CITE_CODES is built from the manifests and a test asserts no number
 * belongs to two codes), so "758.5" needs no code word and "5446" is
 * unambiguously 8 CCR. Code-worded forms, id forms, "Cal. Code Regs. tit.
 * 10, § 2695.8", and a handful of named-act aliases resolve too. Chapter
 * listings come only from the aliases (the Automotive Repair Act, the Fair
 * Claims regulations, Wage Order 9's article), because California chapter
 * numbers repeat across codes and parts.
 *
 * Citations carry "effective M/D/YYYY" when the source states a date and
 * stay silent otherwise. No edition pin exists: none of the three surfaces
 * states a currency marker, so currency is the capture date and the
 * 4-week drift checker is the freshness mechanism.
 */
import type { Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity } from '@repairmcp/state-law';
import { CA_CODES } from './schema.js';
import type { CaCode, CaSection } from './schema.js';
import { CA_DIR_SOURCES, CA_LII_SOURCES } from './sources-regs.js';
import { CA_STATUTE_SOURCES } from './sources-statutes.js';

export const CA_IDENTITY = {
  sourceId: 'state-ca',
  sourceName: 'State of California',
  sourceShortName: 'CA Law',
  sourceUrl: 'https://leginfo.legislature.ca.gov',
  description:
    'California state law for collision repair facilities: insurance claims handling (Ins. Code 758.5 anti-steering with its written notice of the right to choose a shop, 758.6 anti-capping on paint and materials, the 790.03(h) unfair claims settlement practices catalog, the Fair Claims Settlement Practices Regulations at 10 CCR 2695 including the 2695.8 automobile standards, the 2695.81 labor rate survey rule, and the 2695.85 Auto Body Repair Consumer Bill of Rights, total loss definitions and salvage duties), the Automotive Repair Act and Bureau of Automotive Repair regulations (written estimates and authorization, teardown, invoices, replaced parts, the 16 CCR 3365 standard that auto body and frame repairs follow OEM or nationally recognized specifications, aftermarket crash parts disclosure), the repair and storage lien and lien sale, Cal/OSHA orders on spray booths, spray coating, respirators, airborne contaminants, hazard communication, and the injury and illness prevention program, and employment rules (final pay, waiting time penalties, piece-rate rest and nonproductive time pay, meal and rest periods, overtime, expense reimbursement, commission agreements, workers\' compensation, and Wage Order 9) — captured verbatim from the Legislature, the Department of Industrial Relations, and the Legal Information Institute\'s mirror of the California Code of Regulations.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const LONG_NAMES: Record<CaCode, string> = {
  'Cal. Ins. Code': 'California Insurance Code section',
  'Cal. Bus. & Prof. Code': 'California Business and Professions Code section',
  'Cal. Lab. Code': 'California Labor Code section',
  'Cal. Veh. Code': 'California Vehicle Code section',
  'Cal. Civ. Code': 'California Civil Code section',
  '10 CCR': 'California Code of Regulations, Title 10, section',
  '16 CCR': 'California Code of Regulations, Title 16, section',
  '8 CCR': 'California Code of Regulations, Title 8, section',
};

const factory = makeStateIdentity({
  ...CA_IDENTITY,
  codes: CA_CODES.map((code) => ({
    code,
    longName: LONG_NAMES[code],
    separator: '.' as const,
  })),
});

/**
 * Cite → code, built from the manifests so it cannot drift from what is
 * captured. Duplicate numbers across codes throw at module load — bare-cite
 * resolution depends on uniqueness, and a collision must be a conscious
 * manifest decision, never an accident discovered by a shop.
 */
export const CA_CITE_CODES: Readonly<Record<string, CaCode>> = (() => {
  const map: Record<string, CaCode> = {};
  const claim = (cite: string, code: CaCode): void => {
    const prior = map[cite];
    if (prior && prior !== code) {
      throw new Error(
        `California cite ${cite} is claimed by both ${prior} and ${code} — bare cites would be ambiguous.`,
      );
    }
    map[cite] = code;
  };
  for (const source of CA_STATUTE_SOURCES) {
    for (const spec of source.sections) claim(spec.cite, source.code);
  }
  for (const source of CA_LII_SOURCES) claim(source.cite, source.code);
  for (const source of CA_DIR_SOURCES) claim(source.cite, '8 CCR');
  return map;
})();

/** Code-word aliases a shop or an AI client might type, checked in order. */
const CODE_ALIASES: ReadonlyArray<{ pattern: RegExp; code: CaCode }> = [
  { pattern: /^(?:CAL(?:IFORNIA)?\.?\s+)?INS(?:URANCE)?\.?\s+CODE\b/, code: 'Cal. Ins. Code' },
  {
    pattern:
      /^(?:CAL(?:IFORNIA)?\.?\s+)?(?:BUS(?:INESS)?\.?\s*(?:&|AND)\s*PROF(?:ESSIONS)?\.?\s+CODE|B\s*&\s*P(?:\s+CODE)?|BPC)\b/,
    code: 'Cal. Bus. & Prof. Code',
  },
  { pattern: /^(?:CAL(?:IFORNIA)?\.?\s+)?LAB(?:OR)?\.?\s+CODE\b/, code: 'Cal. Lab. Code' },
  { pattern: /^(?:CAL(?:IFORNIA)?\.?\s+)?VEH(?:ICLE)?\.?\s+CODE\b/, code: 'Cal. Veh. Code' },
  { pattern: /^(?:CAL(?:IFORNIA)?\.?\s+)?CIV(?:IL)?\.?\s+CODE\b/, code: 'Cal. Civ. Code' },
];

/**
 * CCR forms: "10 CCR 2695.8", "Title 10 CCR 2695.8", "Cal. Code Regs. tit.
 * 10, § 2695.8", "8 C.C.R. 5446", "CCR 2695.8" (no title — resolved by cite).
 */
const CCR_TITLED =
  /^(?:TITLE\s+)?(\d+)\s*(?:C\.?C\.?R\.?|CAL\.?\s*CODE\s*(?:OF\s*)?REGS?\.?)\b[\s,.:§-]*(?:TIT(?:LE)?\.?\s*\d+[\s,.:]*)?(?:§|SEC\.|SECTION)?\s*/;
const CCR_REGS_FIRST =
  /^(?:CAL\.?\s*CODE\s*(?:OF\s*)?REGS?\.?|C\.?C\.?R\.?)[\s,.:]*TIT(?:LE)?\.?\s*(\d+)[\s,.:]*(?:§|SEC\.|SECTION)?\s*/;
const CCR_UNTITLED = /^(?:C\.?C\.?R\.?|CAL\.?\s*CODE\s*(?:OF\s*)?REGS?\.?)\b[\s,.:§]*(?:§|SEC\.|SECTION)?\s*/;

const CCR_CODES: Record<string, CaCode> = { '10': '10 CCR', '16': '16 CCR', '8': '8 CCR' };

const BARE_CITE = /^(\d+(?:\.\d+)?)$/;

/** Named-act aliases → the chapter they list, or the section they mean. */
const NAMED: ReadonlyArray<{ pattern: RegExp; query: NonNullable<CitationQuery> }> = [
  {
    pattern: /^(?:THE\s+)?AUTOMOTIVE\s+REPAIR\s+ACT$/,
    query: { kind: 'chapter', code: 'Cal. Bus. & Prof. Code', chapter: '20.3 (Div. 3)' },
  },
  {
    pattern: /^(?:THE\s+)?FAIR\s+CLAIMS\s+SETTLEMENT\s+PRACTICES(?:\s+REG(?:ULATION)?S?)?$/,
    query: { kind: 'chapter', code: '10 CCR', chapter: '5, subch. 7.5, art. 1 (Tit. 10)' },
  },
  {
    pattern: /^(?:IWC\s+)?WAGE\s+ORDER\s+(?:NO\.?\s*)?9(?:-\d{4})?$/,
    query: { kind: 'section', code: '8 CCR', cite: '11090' },
  },
  {
    pattern: /^(?:THE\s+)?(?:AUTO\s+BODY\s+REPAIR\s+)?CONSUMER\s+BILL\s+OF\s+RIGHTS$/,
    query: { kind: 'section', code: '10 CCR', cite: '2695.85' },
  },
];

function stripLead(s: string): string {
  return s.replace(/^(?:§|SEC\.|SECTION|RULE)\s*/, '').replace(/[,;.]\s*$/, '');
}

/**
 * Order is load-bearing: id forms -> named aliases -> CCR forms -> code-worded
 * statute cites -> bare cite (exact-number lookup). Anything else returns
 * null and falls to fuzzy scoring.
 */
export function resolveCaCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  if (trimmed.includes(':') && !/\s/.test(trimmed.split(':').pop() ?? ' ')) {
    const parsed = parseCaId(trimmed);
    if (parsed) return { kind: 'section', code: parsed.code, cite: parsed.cite };
  }

  let upper = stripLead(trimmed.toUpperCase());

  for (const alias of NAMED) {
    if (alias.pattern.test(upper)) return alias.query;
  }

  for (const form of [CCR_TITLED, CCR_REGS_FIRST]) {
    const match = form.exec(upper);
    if (match) {
      const code = CCR_CODES[match[1]!];
      const rest = stripLead(upper.slice(match[0].length));
      const cite = BARE_CITE.exec(rest)?.[1];
      if (!code || !cite) return null;
      return { kind: 'section', code, cite };
    }
  }
  const untitled = CCR_UNTITLED.exec(upper);
  if (untitled) {
    const cite = BARE_CITE.exec(stripLead(upper.slice(untitled[0].length)))?.[1];
    const code = cite ? CA_CITE_CODES[cite] : undefined;
    if (!cite || !code || !code.endsWith('CCR')) return null;
    return { kind: 'section', code, cite };
  }

  let code: CaCode | undefined;
  for (const alias of CODE_ALIASES) {
    const match = alias.pattern.exec(upper);
    if (match) {
      code = alias.code;
      upper = stripLead(upper.slice(match[0].length).replace(/^[\s:.,-]+/, ''));
      break;
    }
  }

  const bare = BARE_CITE.exec(upper);
  if (bare) {
    const cite = bare[1]!;
    const resolved = code ?? CA_CITE_CODES[cite];
    if (!resolved) return null;
    return { kind: 'section', code: resolved, cite };
  }

  return null;
}

export const caStateIdentity: StateIdentity = {
  ...factory,
  resolveCitationQuery: resolveCaCitationQuery,
};

export function caId(code: CaCode, cite: string): string {
  return caStateIdentity.id(code, cite);
}
export function parseCaId(id: string): { code: CaCode; cite: string } | null {
  const parsed = caStateIdentity.parseId(id);
  if (!parsed) return null;
  // The factory's parseId reconstructs the code via .toUpperCase(), which no
  // mixed-case California code survives — re-derive the correctly-cased literal.
  const code = CA_CODES.find((c) => c.toUpperCase() === parsed.code.toUpperCase());
  if (!code) return null;
  return { code, cite: parsed.cite };
}
/** "Cal. Ins. Code 758.5" / "10 CCR 2695.8" — the display cite everything renders. */
export function displayCite(section: Pick<CaSection, 'code' | 'cite'>): string {
  return caStateIdentity.displayCite(section);
}
export function formatCaCitation(section: CaSection): Citation {
  return caStateIdentity.formatCitation(section);
}
