/**
 * Florida's identity. Statute cites are chapter.section dotted pairs
 * ("626.9743", "559.905") the shared factory's 2–3-group splitter would read
 * as CHAPTERS — the Texas problem — so Florida resolves everything in its
 * own resolver. FAC cites carry a letter-bearing chapter ("69B-220.201")
 * the splitter cannot express either. Bare cites resolve by EXACT NUMBER:
 * FL_CITE_CODES is built from the two manifests and a test asserts no
 * number belongs to both codes (structurally impossible — FAC cites carry
 * a letter — but the guard is free and the failure would be a shop's).
 *
 * Florida statutes state NO per-section effective dates: the history note
 * is a session-law list and the text's currency is the annual EDITION
 * Online Sunshine prints above every page. Statute citations therefore
 * carry the edition ("Fla. Stat. 626.9743, 2026 edition" — the MT/CO
 * rule), and FL_STATUTES_EDITION pins that phrase against corpus meta so
 * the yearly rollover (or a special-session suffix) fails loudly at
 * re-capture. FAC citations carry real effective dates.
 */
import type { Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity } from '@repairmcp/state-law';
import { FL_CODES } from './schema.js';
import type { FlCode, FlSection } from './schema.js';
import { FL_FAC_SOURCES } from './sources-fac.js';
import { FL_STATUTE_SOURCES } from './sources-statutes.js';

/** The edition phrase Online Sunshine prints, whole — suffix included when one is printed. */
export const FL_STATUTES_EDITION = 'The 2026 Florida Statutes';
export const FL_EDITION_NOTE = `${FL_STATUTES_EDITION.match(/\d{4}/)?.[0] ?? ''} edition`;

export const FL_IDENTITY = {
  sourceId: 'state-fl',
  sourceName: 'State of Florida',
  sourceShortName: 'FL Law',
  sourceUrl: 'https://www.leg.state.fl.us/statutes/',
  description:
    'Florida state law for collision repair facilities: insurance claims handling (Fla. Stat. 626.9743 motor vehicle claim settlement practices — parts at least equivalent in kind and quality, restoration to pre-loss condition when the insurer requires a shop, a copy of the estimate, 72 hours\' notice before storage payments stop, total loss valuation methods and itemized deductions; 624.155 the civil remedy for bad faith with its 60-day notice; the 626.9541(1)(i) unfair claim settlement practices catalog; 627.4265 payment of a settlement within 20 days; 319.30 the 80 percent total loss threshold; the adjuster code of ethics at Fla. Admin. Code 69B-220.201 and the prompt-investigation standards at 69O-166.024), the Florida Motor Vehicle Repair Act (written estimates over $150 and the disclosure statement, charges over the estimate, holding the vehicle, invoices, records, the possessory lien and the bond to release it, unlawful acts and the customer\'s remedies), the labor lien and the sale of the vehicle to enforce it, towing and storage liens and fee limits, aftermarket crash parts disclosure, the Deceptive and Unfair Trade Practices Act, and employment rules (the state minimum wage, the ten-hour legal day, fees for unpaid wages, E-Verify, the private whistleblower act, workers\' compensation coverage, independent contractor tests, and stop-work orders) — captured verbatim from the Legislature\'s Online Sunshine and the Florida Administrative Code.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const LONG_NAMES: Record<FlCode, string> = {
  'Fla. Stat.': 'Florida Statutes section',
  'Fla. Admin. Code': 'Florida Administrative Code rule',
};

const factory = makeStateIdentity({
  ...FL_IDENTITY,
  codes: [
    {
      code: 'Fla. Stat.',
      longName: LONG_NAMES['Fla. Stat.'],
      separator: '.' as const,
      citationNote: () => FL_EDITION_NOTE,
    },
    {
      code: 'Fla. Admin. Code',
      longName: LONG_NAMES['Fla. Admin. Code'],
      separator: '.' as const,
    },
  ],
});

/**
 * Cite → code, built from the manifests so it cannot drift from what is
 * captured. Duplicate numbers across codes throw at module load.
 */
export const FL_CITE_CODES: Readonly<Record<string, FlCode>> = (() => {
  const map: Record<string, FlCode> = {};
  const claim = (cite: string, code: FlCode): void => {
    const prior = map[cite];
    if (prior && prior !== code) {
      throw new Error(`Florida cite ${cite} is claimed by both ${prior} and ${code} — bare cites would be ambiguous.`);
    }
    map[cite] = code;
  };
  for (const source of FL_STATUTE_SOURCES) for (const cite of source.cites) claim(cite, 'Fla. Stat.');
  for (const source of FL_FAC_SOURCES) for (const rule of source.rules) claim(rule.cite, 'Fla. Admin. Code');
  return map;
})();

const STATUTE_CITE = /^(\d{1,4}\.\d{1,5})$/;
const FAC_CITE = /^(\d{1,3}[A-Z]?-\d{1,4}\.\d{1,5})$/;

/** "Fla. Stat.", "F.S.", "Florida Statutes", "s.", "§", "Section" — the statute code words. */
const STATUTE_WORD =
  /^(?:FLA\.?\s*STAT\.?(?:UTES?)?|FLORIDA\s+STATUTES?|F\.?\s*S\.?)\b[\s,.:§]*(?:§|SEC\.|SECTION|S\.)?\s*/;
/** "Fla. Admin. Code R.", "F.A.C.", "Florida Administrative Code", "Rule" — the FAC code words. */
const FAC_WORD =
  /^(?:FLA\.?\s*ADMIN\.?\s*CODE|FLORIDA\s+ADMINISTRATIVE\s+CODE|F\.?\s*A\.?\s*C\.?|FAC)\b[\s,.:§]*(?:(?:ANN\.|R\.|RULE)\s*)*/;
const RULE_WORD = /^RULE\s+/;

/** Named-act aliases → the chapter they list. */
const NAMED: ReadonlyArray<{ pattern: RegExp; query: NonNullable<CitationQuery> }> = [
  {
    pattern: /^(?:THE\s+)?(?:FLORIDA\s+)?MOTOR\s+VEHICLE\s+REPAIR\s+ACT$/,
    query: { kind: 'chapter', code: 'Fla. Stat.', chapter: '559, pt. IX' },
  },
  {
    pattern: /^(?:THE\s+)?(?:FLORIDA\s+)?(?:DECEPTIVE\s+AND\s+UNFAIR\s+TRADE\s+PRACTICES\s+ACT|FDUTPA)$/,
    query: { kind: 'chapter', code: 'Fla. Stat.', chapter: '501, pt. II' },
  },
  {
    pattern: /^(?:THE\s+)?(?:FLORIDA\s+)?UNFAIR\s+INSURANCE\s+TRADE\s+PRACTICES(?:\s+ACT)?$/,
    query: { kind: 'chapter', code: 'Fla. Stat.', chapter: '626, pt. IX' },
  },
  {
    pattern: /^(?:THE\s+)?(?:NONORIGINAL\s+(?:MANUFACTURER'?S\s+)?)?(?:REPLACEMENT\s+)?CRASH\s+PARTS(?:\s+ACT|\s+LAW)?$/,
    query: { kind: 'chapter', code: 'Fla. Stat.', chapter: '501, pt. I' },
  },
  {
    pattern: /^(?:THE\s+)?(?:FLORIDA\s+)?WORKERS'?\s+COMPENSATION\s+LAW$/,
    query: { kind: 'chapter', code: 'Fla. Stat.', chapter: '440' },
  },
  {
    pattern: /^(?:THE\s+)?ADJUSTER\s+CODE\s+OF\s+ETHICS$/,
    query: { kind: 'section', code: 'Fla. Admin. Code', cite: '69B-220.201' },
  },
];

function stripLead(s: string): string {
  return s.replace(/^(?:§|SEC\.|SECTION|S\.|RULE)\s*/, '').replace(/[,;.]\s*$/, '');
}

/**
 * Order is load-bearing: id forms -> named aliases -> FAC forms (worded,
 * then a bare FAC-shaped cite) -> statute forms (worded, then a bare
 * dotted number through the captured map). Anything else returns null and
 * falls to fuzzy scoring.
 */
export function resolveFlCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  if (trimmed.includes(':') && !/\s/.test(trimmed.split(':').pop() ?? ' ')) {
    const parsed = parseFlId(trimmed);
    if (parsed) return { kind: 'section', code: parsed.code, cite: parsed.cite };
  }

  const upper = stripLead(trimmed.toUpperCase());

  for (const alias of NAMED) {
    if (alias.pattern.test(upper)) return alias.query;
  }

  const facWord = FAC_WORD.exec(upper) ?? RULE_WORD.exec(upper);
  if (facWord) {
    const cite = FAC_CITE.exec(stripLead(upper.slice(facWord[0].length)))?.[1];
    return cite ? { kind: 'section', code: 'Fla. Admin. Code', cite } : null;
  }
  const bareFac = FAC_CITE.exec(upper);
  if (bareFac) return { kind: 'section', code: 'Fla. Admin. Code', cite: bareFac[1]! };

  const statuteWord = STATUTE_WORD.exec(upper);
  if (statuteWord) {
    const cite = STATUTE_CITE.exec(stripLead(upper.slice(statuteWord[0].length)))?.[1];
    return cite ? { kind: 'section', code: 'Fla. Stat.', cite } : null;
  }
  const bare = STATUTE_CITE.exec(upper);
  if (bare) {
    const cite = bare[1]!;
    const code = FL_CITE_CODES[cite];
    return code ? { kind: 'section', code, cite } : null;
  }

  return null;
}

export const flStateIdentity: StateIdentity = {
  ...factory,
  resolveCitationQuery: resolveFlCitationQuery,
};

export function flId(code: FlCode, cite: string): string {
  return flStateIdentity.id(code, cite);
}
export function parseFlId(id: string): { code: FlCode; cite: string } | null {
  const parsed = flStateIdentity.parseId(id);
  if (!parsed) return null;
  // The factory's parseId reconstructs the code via .toUpperCase(), which no
  // mixed-case Florida code survives — re-derive the correctly-cased literal.
  const code = FL_CODES.find((c) => c.toUpperCase() === parsed.code.toUpperCase());
  if (!code) return null;
  return { code, cite: parsed.cite };
}
/** "Fla. Stat. 626.9743" / "Fla. Admin. Code 69B-220.201" — the display cite everything renders. */
export function displayCite(section: Pick<FlSection, 'code' | 'cite'>): string {
  return flStateIdentity.displayCite(section);
}
export function formatFlCitation(section: FlSection): Citation {
  return flStateIdentity.formatCitation(section);
}
