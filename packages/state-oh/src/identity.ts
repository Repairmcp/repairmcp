/**
 * Ohio's identity. Three codes whose cite shapes are disjoint — dotted
 * Revised Code numbers (4505.101), hyphenated Administrative Code numbers
 * with an optional colon (3901-1-54, 109:4-3-13), and the one Constitution
 * cite ("art. II, § 34a") — so bare cites resolve by SHAPE and never by
 * lookup. The shared factory cannot do this itself: it reads a dotted
 * two-group number as a chapter and has never seen a colon, so Ohio
 * resolves everything here (the PA/FL/CA pattern) and keeps the factory's
 * id, displayCite, and formatCitation.
 *
 * Every section has an effective date, so every citation carries
 * "effective M/D/YYYY" (the factory default) — there is no silence path.
 */
import type { Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity } from '@repairmcp/state-law';
import { OH_CODES, type OhCode, type OhSection } from './schema.js';
import { OH_CONST_CITE } from './sources.js';

export const OH_IDENTITY = {
  sourceId: 'state-oh',
  sourceName: 'State of Ohio',
  sourceShortName: 'OH Law',
  sourceUrl: 'https://codes.ohio.gov/',
  description:
    "Ohio state law for collision repair facilities: insurance claims handling (OAC 3901-1-54 — the insurer pays the difference or names a shop that will repair for its written estimate and ensures workmanlike repairs if it names only one, no unreasonable travel to a specific shop, restoration to pre-loss condition when the insurer designates a shop, itemized betterment limited to a measurable decrease in market value, the total loss replacement and cash-value methods with sales tax, notice before storage payments stop, acknowledgment within 15 days and a decision within 21 days; OAC 3901-1-07 the general unfair claims practices; ORC 3901.20 through 3901.22 with no private right of action; ORC 1345.81 aftermarket crash parts disclosure; ORC 4505.11 salvage titles), the shop's own obligations (OAC 109:4-3-13 — the estimate-choice form, authorization for additional work of ten per cent or more, no charge for unauthorized work, parts return, the itemized invoice; the Consumer Sales Practices Act and its treble-damages remedy), holding and disposing of a car (ORC 4505.101 the repair garage's title route under $3,500, ORC 4513.60 the sheriff's storage order on a garage's complaint, and the bailee's lien statute that excludes motor vehicles), employment rules (ORC 4113.15 semimonthly pay and liquidated damages, 4113.19 no deductions for damaged tools without a contract, 4111.03 overtime, the constitutional minimum wage, workers' compensation and the noncomplying employer's lost defenses), and Ohio's own safety layer (ORC 4121.47 the VSSR additional award, the BWC specific safety requirements for workshops and factories, the EPA auto body permit-by-rule and county-limited VOC rule) — captured verbatim from codes.ohio.gov.",
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const LONG_NAMES: Record<OhCode, string> = {
  ORC: 'Ohio Revised Code section',
  OAC: 'Ohio Administrative Code rule',
  'Ohio Const.': 'Ohio Constitution',
};

const factory = makeStateIdentity({
  ...OH_IDENTITY,
  codes: OH_CODES.map((code) => ({ code, longName: LONG_NAMES[code], separator: '.' as const })),
});

export const ORC_CITE_SHAPE = /^\d{3,4}\.\d{2,3}$/;
export const OAC_CITE_SHAPE = /^\d{3,4}(?::\d{1,2})?-\d{1,2}-\d{2}$/;
const ORC_CHAPTER_SHAPE = /^\d{3,4}$/;
const OAC_CHAPTER_SHAPE = /^\d{3,4}(?::\d{1,2})?-\d{1,2}$/;

const CODE_WORDS: ReadonlyArray<{ re: RegExp; code: OhCode }> = [
  { re: /^(?:R\.?\s*C\.?|O\.?\s*R\.?\s*C\.?|OHIO\s+REV(?:ISED)?\.?\s+CODE(?:\s+ANN\.?)?)(?=[\s§:]|$)/, code: 'ORC' },
  { re: /^(?:O\.?\s*A\.?\s*C\.?|OHIO\s+ADM(?:IN)?(?:ISTRATIVE)?\.?\s*CODE)(?=[\s§:]|$)/, code: 'OAC' },
  { re: /^(?:OHIO\s+CONST(?:ITUTION)?\.?)(?=[\s,]|$)/, code: 'Ohio Const.' },
];

const CONST_SECTION = { kind: 'section', code: 'Ohio Const.', cite: OH_CONST_CITE } as const;
const NAMED: ReadonlyArray<{ re: RegExp; query: NonNullable<CitationQuery> }> = [
  { re: /^(?:CSPA|(?:OHIO )?CONSUMER SALES PRACTICES ACT)$/, query: { kind: 'chapter', code: 'ORC', chapter: '1345' } },
  { re: /^(?:UNFAIR (?:PROPERTY\/CASUALTY )?CLAIMS? SETTLEMENT(?: PRACTICES)?(?: RULE)?|CLAIMS SETTLEMENT RULE)$/, query: { kind: 'section', code: 'OAC', cite: '3901-1-54' } },
  { re: /^(?:UNFAIR TRADE PRACTICES RULE)$/, query: { kind: 'section', code: 'OAC', cite: '3901-1-07' } },
  { re: /^(?:(?:THE )?(?:AG|ATTORNEY GENERAL'?S?) REPAIR RULE|MOTOR VEHICLE REPAIRS?(?: OR SERVICES?)? RULE|REPAIR RULE)$/, query: { kind: 'section', code: 'OAC', cite: '109:4-3-13' } },
  { re: /^(?:AFTERMARKET (?:CRASH )?PARTS?(?: STATUTE| LAW| DISCLOSURE)?)$/, query: { kind: 'section', code: 'ORC', cite: '1345.81' } },
  { re: /^(?:MINIMUM WAGE AMENDMENT|(?:ARTICLE|ART\.?) (?:II|2),? (?:SECTION|SEC\.?|§) 34A|(?:SECTION|SEC\.?|§) 34A)$/, query: CONST_SECTION },
  { re: /^(?:VSSR|(?:BWC )?SPECIFIC SAFETY (?:REQUIREMENTS?|RULES?)|BWC SAFETY (?:RULES|REQUIREMENTS)|WORKSHOPS AND FACTORIES)$/, query: { kind: 'chapter', code: 'OAC', chapter: '4123:1-5' } },
  { re: /^(?:VSSR STATUTE|SPECIFIC SAFETY RULE STATUTE)$/, query: { kind: 'section', code: 'ORC', cite: '4121.47' } },
  { re: /^(?:(?:AUTO ?BODY )?PERMIT[- ]BY[- ]RULE)$/, query: { kind: 'section', code: 'OAC', cite: '3745-31-30' } },
  { re: /^(?:ABANDONED VEHICLES?)$/, query: { kind: 'chapter', code: 'ORC', chapter: '4513' } },
  { re: /^(?:WORKERS'? COMP(?:ENSATION)?(?: ACT| LAW)?)$/, query: { kind: 'chapter', code: 'ORC', chapter: '4123' } },
  { re: /^(?:MINIMUM (?:FAIR )?WAGE (?:STANDARDS )?(?:ACT|LAW)|OVERTIME LAW)$/, query: { kind: 'chapter', code: 'ORC', chapter: '4111' } },
  { re: /^(?:UNFAIR (?:AND|OR) DECEPTIVE (?:INSURANCE )?(?:ACTS OR )?PRACTICES(?: ACT)?)$/, query: { kind: 'chapter', code: 'ORC', chapter: '3901' } },
];

const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X' };
const CONST_BODY = /^(?:(?:ART(?:ICLE)?\.?)\s*)?([IVX]+|\d{1,2})\s*,?\s*(?:§|SEC(?:TION)?\.?)\s*(\d+[A-Z]?)$/;

/** Strips a leading section/rule keyword or symbol (two passes for "§ SEC. 5") and trailing punctuation. */
function stripLead(s: string): string {
  const once = (x: string) => x.replace(/^(?:§+|SEC\.|SECTION|RULE|R\.|S\.)\s*/, '');
  return once(once(s)).replace(/[,;.]\s*$/, '').trim();
}

function resolveBody(code: OhCode | undefined, rawBody: string): CitationQuery {
  const chapterForm = /^(?:CH\.?|CHAPTER)\s+(\S+)$/.exec(rawBody);
  if (chapterForm) {
    const ch = chapterForm[1]!.toLowerCase();
    if ((!code || code === 'ORC') && ORC_CHAPTER_SHAPE.test(ch)) return { kind: 'chapter', code: 'ORC', chapter: ch };
    if ((!code || code === 'OAC') && OAC_CHAPTER_SHAPE.test(ch)) return { kind: 'chapter', code: 'OAC', chapter: ch };
    return null;
  }
  if (code === 'Ohio Const.') {
    const m = CONST_BODY.exec(rawBody);
    if (!m) return null;
    const article = ROMAN[m[1]!] ?? m[1]!;
    const cite = `art. ${article}, § ${m[2]!.toLowerCase()}`;
    return cite === OH_CONST_CITE ? CONST_SECTION : null;
  }
  const body = stripLead(rawBody).toLowerCase();
  if (!body) return null;
  if ((!code || code === 'ORC') && ORC_CITE_SHAPE.test(body)) return { kind: 'section', code: 'ORC', cite: body };
  if ((!code || code === 'OAC') && OAC_CITE_SHAPE.test(body)) return { kind: 'section', code: 'OAC', cite: body };
  if (!code && ORC_CHAPTER_SHAPE.test(body)) return { kind: 'chapter', code: 'ORC', chapter: body };
  if (!code && OAC_CHAPTER_SHAPE.test(body)) return { kind: 'chapter', code: 'OAC', chapter: body };
  return null;
}

export function resolveOhCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const parsed = parseOhId(trimmed);
    if (parsed) return { kind: 'section', code: parsed.code, cite: parsed.cite };
  }

  const upper = trimmed.toUpperCase().replace(/^THE\s+/, '');
  for (const n of NAMED) if (n.re.test(upper)) return n.query;

  for (const w of CODE_WORDS) {
    const m = w.re.exec(upper);
    if (!m) continue;
    const rest = upper.slice(m[0].length).replace(/^[\s,.:]+/, '');
    return resolveBody(w.code, rest);
  }
  return resolveBody(undefined, upper);
}

export function parseOhId(id: string): { code: OhCode; cite: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const codePart = id.slice(0, idx).trim().toLowerCase();
  const cite = id.slice(idx + 1).trim();
  const code = OH_CODES.find((c) => c.toLowerCase() === codePart);
  return code && cite ? { code, cite } : null;
}

export const ohStateIdentity: StateIdentity = { ...factory, resolveCitationQuery: resolveOhCitationQuery, parseId: parseOhId };

export function ohId(code: OhCode, cite: string): string {
  return ohStateIdentity.id(code, cite);
}
export function displayCite(section: Pick<OhSection, 'code' | 'cite'>): string {
  return ohStateIdentity.displayCite(section);
}
export function formatOhCitation(section: OhSection): Citation {
  return ohStateIdentity.formatCitation(section);
}
