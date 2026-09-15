/**
 * Illinois's identity. Two codes whose cite shapes the shared factory
 * cannot express — an ILCS cite is three parts ("815 ILCS 308/15": chapter,
 * act, section) and an Administrative Code cite carries its title ("50 Ill.
 * Adm. Code 919.80") — so Illinois resolves everything here (the TX/FL/PA/OH
 * pattern) and formats its own citations. The cite stored on a section IS
 * the display cite; ids compress it ("ilcs:815-308/15", "iac:50-919.80").
 *
 * Bare section tokens ("154.6", "919.80", "3-117.1") resolve by EXACT match
 * across the manifest; a token two sections claim ("15": 306/15, 308/15,
 * 192/15) resolves to nothing by design — the act is required — and the
 * identity test lists the collisions so a new one is visible. "5/154.6"
 * cannot resolve by act number alone because 215 ILCS 5 and 625 ILCS 5 are
 * both captured; it resolves through the section token.
 *
 * Citations carry "effective M/D/YYYY" when the section has a date and are
 * bare when it does not — the silence path is the normal case for pre-1990s
 * Public Acts (155.29, 154.5, 770 ILCS 45/1).
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity } from '@repairmcp/state-law';
import { IL_CODES, type IlCode, type IlSection } from './schema.js';
import { IL_SOURCES, manifestCites } from './sources.js';

export const IL_IDENTITY = {
  sourceId: 'state-il',
  sourceName: 'State of Illinois',
  sourceShortName: 'IL Law',
  sourceUrl: 'https://www.ilga.gov/',
  description:
    "Illinois state law for collision repair facilities: insurance claims handling (215 ILCS 5/154.6 — a paint-and-materials cap is an improper claims practice by statute, and an insurer must verify that a repairer it designates is licensed; 50 Ill. Adm. Code 919.80 — the insurer's estimate must allow workmanlike repairs and when the insured's estimate exceeds it the insurer names a shop that will do the work for its number or promises reimbursement in writing, no unreasonable travel to a recommended shop, notice before storage payments stop, all reasonable towing paid, betterment itemized with a $500 cap on wear and rust, replacement crash parts of like kind and quality, the total loss replacement and cash methods with the 30-day right of recourse and Exhibit A; 919.90 no abandoning salvage to a storage yard; 919.50 thirty days to pay; Section 155 attorney fees for vexatious delay with no common-law bad faith tort; 155.29 aftermarket crash parts disclosure; 154.9 and 154.10 total loss tax and the written valuation explanation), the shop's own act (815 ILCS 308, the Automotive Collision Repair Act — no work over $100 without authorization, the 10 percent rule, parts designated new/used/rebuilt/aftermarket, the consumer-rights statement, return of removed parts, the invoice, the posted sign, the lien barred for unauthorized work; the Consumer Fraud Act private action), holding a car (770 ILCS 45 and 50, the Labor and Storage Lien Acts, with the certified lienholder notice that must precede storage fees; 625 ILCS 5/4-201 and 4-214), repairer licensing under 625 ILCS 5/5-301 and salvage certificates under 3-117.1, employment rules (820 ILCS 115 wage payment, final compensation, and deductions only with express written consent, with the Department of Labor's damaged-property and required-equipment rules; the Minimum Wage Law's $15 rate and overtime; the One Day Rest In Seven Act's meal periods; the Paid Leave for All Workers Act; the Freedom to Work Act's non-compete floor; the Workers' Compensation Act's insurance duty and penalties), and the Chicago-area and Metro East motor vehicle refinishing rules (35 Ill. Adm. Code 218 and 219 Subpart HH — VOM limits, HVLP guns, enclosed gun cleaners) — captured verbatim from ilga.gov.",
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const LONG_NAMES: Record<IlCode, string> = {
  ILCS: 'Illinois Compiled Statutes',
  'Ill. Adm. Code': 'Illinois Administrative Code',
};

const factory = makeStateIdentity({
  ...IL_IDENTITY,
  codes: IL_CODES.map((code) => ({ code, longName: LONG_NAMES[code], separator: '.' as const })),
});

export const ILCS_CITE_SHAPE = /^\d{1,3} ILCS \d{1,4}\/[\w.\-]+$/;
export const IAC_CITE_SHAPE = /^\d{1,2} Ill\. Adm\. Code \d{1,4}\.(?:\d+|[A-Z]+ [A-Z0-9]+)$/;

/** Every manifest cite keyed by its bare section token; a token two sections claim maps to null. */
export const IL_CITE_TOKENS: ReadonlyMap<string, string | null> = (() => {
  const map = new Map<string, string | null>();
  for (const c of manifestCites()) {
    const token = c.code === 'ILCS' ? c.cite.slice(c.cite.indexOf('/') + 1) : c.cite.slice(c.cite.lastIndexOf(' ') + 1);
    const key = token.toLowerCase();
    map.set(key, map.has(key) ? null : c.cite);
  }
  return map;
})();
/** The bare tokens the manifest claims twice or more — the identity test pins this list. */
export const IL_TOKEN_COLLISIONS: readonly string[] = [...IL_CITE_TOKENS.entries()].filter(([, v]) => v === null).map(([k]) => k).sort();

/** Act numbers ("308") that name exactly one captured act; "5" names two (215 ILCS 5 and 625 ILCS 5) and is absent. */
const ACT_BY_NUMBER: ReadonlyMap<string, string | null> = (() => {
  const map = new Map<string, string | null>();
  for (const s of IL_SOURCES) {
    if (s.kind === 'part') continue;
    const num = s.chapter.slice(s.chapter.lastIndexOf(' ') + 1);
    map.set(num, map.has(num) && map.get(num) !== s.chapter ? null : s.chapter);
  }
  return map;
})();
const ACT_CHAPTERS: ReadonlySet<string> = new Set(IL_SOURCES.filter((s) => s.kind !== 'part').map((s) => s.chapter));
const PART_CHAPTERS: ReadonlyMap<string, string> = new Map(IL_SOURCES.filter((s) => s.kind === 'part').map((s) => [s.part, `${s.title} Ill. Adm. Code ${s.part}`]));

const CH = (chapter: string): CitationQuery => ({ kind: 'chapter', code: chapter.includes('Ill. Adm. Code') ? 'Ill. Adm. Code' : 'ILCS', chapter });
const SEC = (cite: string): CitationQuery => ({ kind: 'section', code: cite.includes('Ill. Adm. Code') ? 'Ill. Adm. Code' : 'ILCS', cite });

const NAMED: ReadonlyArray<{ re: RegExp; query: NonNullable<CitationQuery> }> = [
  { re: /^(?:(?:ILLINOIS )?AUTOMOTIVE COLLISION REPAIR ACT|COLLISION REPAIR ACT|ACRA)$/, query: CH('815 ILCS 308') },
  { re: /^(?:(?:ILLINOIS )?AUTOMOTIVE REPAIR ACT|REPAIR ACT)$/, query: CH('815 ILCS 306') },
  { re: /^(?:(?:ILLINOIS )?CONSUMER FRAUD(?: AND DECEPTIVE BUSINESS PRACTICES)? ACT|CONSUMER FRAUD|CFA|ICFA)$/, query: CH('815 ILCS 505') },
  { re: /^(?:(?:ILLINOIS )?INSURANCE CODE)$/, query: CH('215 ILCS 5') },
  { re: /^(?:(?:ILLINOIS )?VEHICLE CODE)$/, query: CH('625 ILCS 5') },
  { re: /^(?:IMPROPER CLAIMS? PRACTICES?(?: ACT| STATUTE| CATALOG)?|UNFAIR CLAIMS? (?:SETTLEMENT )?PRACTICES?(?: ACT)?)$/, query: SEC('215 ILCS 5/154.6') },
  { re: /^(?:PART 919|(?:THE )?CLAIMS? (?:PRACTICES? )?(?:RULE|REGULATION)|IMPROPER CLAIMS PRACTICE RULE)$/, query: CH('50 Ill. Adm. Code 919') },
  { re: /^(?:AUTO(?:MOBILE)? CLAIMS? RULE|PRIVATE PASSENGER (?:AUTO(?:MOBILE)? )?CLAIMS? (?:PRACTICES? )?RULE)$/, query: SEC('50 Ill. Adm. Code 919.80') },
  { re: /^(?:EXHIBIT A|TOTAL LOSS (?:EXHIBIT|NOTICE|AUTOMOBILE CLAIMS))$/, query: SEC('50 Ill. Adm. Code 919.EXHIBIT A') },
  { re: /^(?:AFTERMARKET (?:CRASH )?PARTS?(?: STATUTE| LAW| DISCLOSURE)?)$/, query: SEC('215 ILCS 5/155.29') },
  { re: /^(?:SECTION 155|VEXATIOUS(?: AND UNREASONABLE)?(?: DELAY)?(?: STATUTE)?|ATTORNEY FEES? STATUTE)$/, query: SEC('215 ILCS 5/155') },
  { re: /^(?:PAINT (?:AND|&) MATERIALS? CAP(?: STATUTE)?)$/, query: SEC('215 ILCS 5/154.6') },
  { re: /^(?:REPAIRER LICENS(?:E|ING)(?: STATUTE| LAW)?|REPAIRER'?S? LICENSE)$/, query: SEC('625 ILCS 5/5-301') },
  { re: /^(?:LABOR AND STORAGE LIEN ACT|STORAGE LIEN ACT)$/, query: CH('770 ILCS 45') },
  { re: /^(?:(?:LABOR AND STORAGE LIEN )?\(?SMALL AMOUNT\)? ACT|SMALL AMOUNT LIEN ACT)$/, query: CH('770 ILCS 50') },
  { re: /^(?:(?:ILLINOIS )?WAGE PAYMENT(?: AND COLLECTION)? ACT|IWPCA)$/, query: CH('820 ILCS 115') },
  { re: /^(?:(?:ILLINOIS )?MINIMUM WAGE (?:LAW|ACT)|IMWL)$/, query: CH('820 ILCS 105') },
  { re: /^(?:ONE DAY REST IN SEVEN ACT|ODRISA|MEAL (?:PERIOD|BREAK) (?:ACT|LAW))$/, query: CH('820 ILCS 140') },
  { re: /^(?:PAID LEAVE FOR ALL WORKERS ACT|PLAWA|PAID LEAVE ACT)$/, query: SEC('820 ILCS 192/15') },
  { re: /^(?:(?:ILLINOIS )?FREEDOM TO WORK ACT|NON-?COMPETE (?:ACT|LAW|STATUTE))$/, query: SEC('820 ILCS 90/10') },
  { re: /^(?:WORKERS'? COMP(?:ENSATION)?(?: ACT| LAW)?)$/, query: SEC('820 ILCS 305/4') },
  { re: /^(?:(?:ILLINOIS )?(?:OSHA|OCCUPATIONAL SAFETY AND HEALTH ACT))$/, query: SEC('820 ILCS 219/15') },
  { re: /^(?:(?:MOTOR VEHICLE )?REFINISH(?:ING)? (?:RULE|RULES|VOC RULE)|VOM (?:LIMITS?|RULE)|CHICAGO(?: AREA)? REFINISH(?:ING)? RULE)$/, query: CH('35 Ill. Adm. Code 218') },
  { re: /^(?:METRO EAST REFINISH(?:ING)? RULE)$/, query: CH('35 Ill. Adm. Code 219') },
];

/** Strips a leading section keyword or symbol (two passes for "§ SEC. 5") and trailing punctuation; drops a trailing subsection group "(b)(2)". */
function stripLead(s: string): string {
  const once = (x: string) => x.replace(/^(?:§+|SEC\.|SECTION|RULE|R\.|S\.)\s*/, '');
  return once(once(s)).replace(/(?:\([A-Z0-9]{1,4}\))+$/, '').replace(/[,;.]\s*$/, '').trim();
}

const ILCS_FULL = /^(\d{1,3})\s*ILCS\s*(\d{1,4})\s*\/\s*([\w.\-]+?)(?:\([A-Z0-9]{1,4}\))*$/;
const ILCS_ACT = /^(\d{1,3})\s*ILCS\s*(\d{1,4})\/?$/;
const IAC_FULL = /^(\d{1,2})\s*(?:ILL(?:INOIS)?\.?\s*ADM(?:IN)?(?:ISTRATIVE)?\.?\s*CODE|IAC|IL\.? ADM\.? CODE)\s*(\d{1,4})\.((?:\d+|EXHIBIT [A-Z]))(?:\([A-Z0-9]{1,4}\))*$/;
const IAC_PART = /^(\d{1,2})\s*(?:ILL(?:INOIS)?\.?\s*ADM(?:IN)?(?:ISTRATIVE)?\.?\s*CODE|IAC|IL\.? ADM\.? CODE)\s*(?:PART\s*)?(\d{1,4})$/;
const ACT_QUALIFIED = /^(\d{1,4})\/([\w.\-]+?)(?:\([A-Z0-9]{1,4}\))*$/;
const OF_THE_ACT = /^(?:SEC(?:TION)?\.?|§)\s*([\w.\-]+?)(?:\([A-Z0-9]{1,4}\))*\s+OF\s+(?:THE\s+)?(.+)$/;
const BARE_TOKEN = /^[\w.\-]+$/;

function fromToken(token: string): CitationQuery {
  const cite = IL_CITE_TOKENS.get(token.toLowerCase());
  return cite ? SEC(cite) : null;
}

export function resolveIlCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  if (!trimmed) return null;

  if (/^(?:ilcs|iac):/i.test(trimmed)) {
    const parsed = parseIlId(trimmed);
    return parsed ? SEC(parsed.cite) : null;
  }

  const upper = trimmed.toUpperCase().replace(/^THE\s+/, '');
  for (const n of NAMED) if (n.re.test(upper)) return n.query;
  // A leading "section"/"§" before a full cite ("section 815 ILCS 308/15") is noise; the "Section N of the Act" form is handled first.
  const lead = /^(?:§+|SEC\.|SECTION)\s*(?=\d)/.exec(upper);
  const cited = lead ? upper.slice(lead[0].length) : upper;

  const ofAct = OF_THE_ACT.exec(upper);
  if (ofAct) {
    const inner = resolveIlCitationQuery(ofAct[2]!);
    if (inner?.kind === 'chapter' && inner.code === 'ILCS') return SEC(`${inner.chapter}/${ofAct[1]!.toLowerCase()}`);
    if (inner?.kind === 'chapter') return SEC(`${inner.chapter}.${ofAct[1]!}`);
    return null;
  }

  const full = ILCS_FULL.exec(cited);
  if (full) return SEC(`${full[1]} ILCS ${full[2]}/${full[3]!.toLowerCase()}`);
  const act = ILCS_ACT.exec(cited);
  if (act) {
    const chapter = `${act[1]} ILCS ${act[2]}`;
    return ACT_CHAPTERS.has(chapter) ? CH(chapter) : null;
  }
  const iac = IAC_FULL.exec(cited);
  if (iac) return SEC(`${iac[1]} Ill. Adm. Code ${iac[2]}.${iac[3]}`);
  const part = IAC_PART.exec(cited);
  if (part) {
    const chapter = PART_CHAPTERS.get(part[2]!);
    return chapter && chapter.startsWith(`${part[1]} `) ? CH(chapter) : null;
  }

  const body = stripLead(upper);
  if (!body) return null;
  const qualified = ACT_QUALIFIED.exec(body);
  if (qualified) {
    const chapter = ACT_BY_NUMBER.get(qualified[1]!);
    if (chapter) return SEC(`${chapter}/${qualified[2]!.toLowerCase()}`);
    return fromToken(qualified[2]!);
  }
  if (BARE_TOKEN.test(body)) return fromToken(body);
  return null;
}

export function ilId(code: IlCode, cite: string): string {
  return code === 'ILCS' ? `ilcs:${cite.replace(' ILCS ', '-')}` : `iac:${cite.replace(' Ill. Adm. Code ', '-')}`;
}
export function parseIlId(id: string): { code: IlCode; cite: string } | null {
  const m = /^(ilcs|iac):(.+)$/i.exec(id.trim());
  if (!m) return null;
  const rest = m[2]!.trim();
  if (m[1]!.toLowerCase() === 'ilcs') {
    const r = /^(\d{1,3})-(\d{1,4})\/([\w.\-]+)$/.exec(rest);
    return r ? { code: 'ILCS', cite: `${r[1]} ILCS ${r[2]}/${r[3]}` } : null;
  }
  const r = /^(\d{1,2})-(\d{1,4}\.(?:\d+|EXHIBIT [A-Z]))$/.exec(rest);
  return r ? { code: 'Ill. Adm. Code', cite: `${r[1]} Ill. Adm. Code ${r[2]}` } : null;
}

export function displayCite(section: Pick<IlSection, 'code' | 'cite'>): string {
  return section.cite;
}

function isoToDisplay(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  return fmtDateUtc(new Date(`${iso}T00:00:00.000Z`));
}

export function formatIlCitation(section: IlSection): Citation {
  const display = section.cite;
  const effective = isoToDisplay(section.effectiveDate);
  const note = effective ? `effective ${effective}` : undefined;
  const longName = LONG_NAMES[section.code];
  return {
    shortForm: note ? `${display}, ${note}` : display,
    longForm: note
      ? `${longName} ${section.cite} (${section.heading}), ${section.chapterTitle}, ${note}, ${section.sourceUrl}`
      : `${longName} ${section.cite} (${section.heading}), ${section.chapterTitle}, ${section.sourceUrl}`,
    sourceId: IL_IDENTITY.sourceId,
    sourceName: IL_IDENTITY.sourceName,
    itemId: ilId(section.code, section.cite),
    url: section.sourceUrl,
    retrievedAt: new Date(),
    publishedAt: section.effectiveDate ? new Date(`${section.effectiveDate}T00:00:00.000Z`) : undefined,
  };
}

export const ilStateIdentity: StateIdentity = {
  ...factory,
  id: (code, cite) => ilId(code as IlCode, cite),
  parseId: parseIlId,
  displayCite,
  resolveCitationQuery: resolveIlCitationQuery,
  formatCitation: (section) => formatIlCitation(section as IlSection),
};
