/**
 * Pennsylvania's identity. Ten codes, three cite shapes the shared factory's
 * group splitter cannot express (four-digit consolidated numbers, dotted and
 * hyphenated P.S. numbers, dotted Pa. Code numbers), so Pennsylvania
 * resolves everything itself. Bare cites resolve by EXACT match through
 * PA_CITE_CODES, built from the three manifests; the shipped manifest has no
 * cite claimed by two codes (identity.test.ts) and the NY two-claimant rule
 * (resolve to null, word the code) stands as the guard.
 *
 * Citation notes (kickoff §4): consolidated and Pa. Code sections carry
 * "effective M/D/YYYY" (the factory default; silence without a date); P.S.
 * sections carry "amended M/D/YYYY" or "enacted M/D/YYYY" because the act
 * page states approval dates, never effective clauses. All through fmtDateUtc.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity, type StateSection } from '@repairmcp/state-law';
import { PA_ACT_CODES, PA_CODES, type PaCode, type PaSection } from './schema.js';
import { PA_ACT_SOURCES, type PaActCaptureSource } from './sources-acts.js';
import { PA_CONSOLIDATED_SOURCES } from './sources-consolidated.js';
import { PA_PACODE_SOURCES } from './sources-pacode.js';

export const PA_IDENTITY = {
  sourceId: 'state-pa',
  sourceName: 'Commonwealth of Pennsylvania',
  sourceShortName: 'PA Law',
  sourceUrl: 'https://www.palegis.us/statutes',
  description:
    "Pennsylvania state law for collision repair facilities: insurance claims handling (31 Pa. Code 62.3 — the appraiser may not name a repair shop without disclosing there is no requirement to use it, must review the appraisal with the shop the consumer chose, must disclose aftermarket crash parts, and applies the total-loss formula and valuation methods; 63 P.S. 861 — no appraiser or employer may require repairs at a specified shop, inspection within six working days; 31 Pa. Code 146.5 through 146.8 — acknowledgment within 10 working days, investigation within 30 days, acceptance or denial within 15 working days, the automobile settlement standards including restoration to pre-loss condition and documented betterment; the Unfair Insurance Practices Act catalog with no private right of action; 42 Pa.C.S. 8371 bad faith with interest, punitive damages, and fees; salvage certificates), the Attorney General's Automotive Industry Trade Practices (37 Pa. Code 301.5 — written records and authorization, parts return, storage-charge posting, the itemized invoice) with the Consumer Protection Law's private action, the abandoned-vehicle chapter (the garage keeper's 15-day report, notice, costs, and sale), and employment rules (the Wage Payment and Collection Law's final-pay and liquidated-damages sections, the Minimum Wage Act and 34 Pa. Code Chapter 231 overtime rules, 34 Pa. Code 9.1 authorized deductions, the Workers' Compensation Act) — captured verbatim from the Legislature's static mirror and the Pennsylvania Code.",
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const LONG_NAMES: Record<PaCode, string> = {
  '42 Pa.C.S.': 'Pennsylvania Consolidated Statutes Title 42 section',
  '75 Pa.C.S.': 'Pennsylvania Consolidated Statutes Title 75 section',
  '40 P.S.': 'Purdon\'s Pennsylvania Statutes Title 40 section',
  '43 P.S.': 'Purdon\'s Pennsylvania Statutes Title 43 section',
  '63 P.S.': 'Purdon\'s Pennsylvania Statutes Title 63 section',
  '73 P.S.': 'Purdon\'s Pennsylvania Statutes Title 73 section',
  '77 P.S.': 'Purdon\'s Pennsylvania Statutes Title 77 section',
  '31 Pa. Code': 'Pennsylvania Code Title 31 section',
  '34 Pa. Code': 'Pennsylvania Code Title 34 section',
  '37 Pa. Code': 'Pennsylvania Code Title 37 section',
};

function iso(d: string | undefined): string | undefined {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDateUtc(new Date(`${d}T00:00:00.000Z`)) : undefined;
}

const actNote = (s: PaSection): string | undefined => {
  const d = iso(s.effectiveDate);
  return d ? `${s.dateKind ?? 'amended'} ${d}` : undefined;
};

const factory = makeStateIdentity({
  ...PA_IDENTITY,
  codes: PA_CODES.map((code) => ({
    code,
    longName: LONG_NAMES[code],
    separator: '.' as const,
    ...((PA_ACT_CODES as readonly string[]).includes(code) ? { citationNote: (s: StateSection) => actNote(s as PaSection) } : {}),
  })),
});

/** Every captured cite → the codes that claim it (built from the three manifests). */
export const PA_CITE_CODES: Readonly<Record<string, readonly PaCode[]>> = (() => {
  const map: Record<string, PaCode[]> = {};
  const claim = (cite: string, code: PaCode): void => {
    const list = (map[cite] ??= []);
    if (!list.includes(code)) list.push(code);
  };
  for (const s of PA_CONSOLIDATED_SOURCES) for (const c of s.cites) claim(c, s.code);
  for (const a of PA_ACT_SOURCES) for (const x of a.sections) claim(x.psCite, a.code);
  for (const p of PA_PACODE_SOURCES) for (const c of p.cites) claim(c, p.code);
  return map;
})();

const CITE_SHAPE = /^(?:\d{1,4}(?:\.\d+[a-z]?)?|201-\d+(?:\.\d+)?)$/i;

/** Code words → code. */
const CODE_WORDS: ReadonlyArray<{ re: RegExp; code: (n: string) => string }> = [
  { re: /^(\d{2})\s*PA\.?\s*C\.?\s*S\.?\s*A?\.?(?=[\s§:]|$)/, code: (n) => `${n} Pa.C.S.` },
  { re: /^(\d{2})\s*PA\s*CS(?=[\s§:]|$)/, code: (n) => `${n} Pa.C.S.` },
  { re: /^(\d{2})\s*PA\.?\s*CODE(?=[\s§:]|$)/, code: (n) => `${n} Pa. Code` },
  { re: /^(\d{2})\s*P\.?\s*S\.?(?=[\s§:]|$)/, code: (n) => `${n} P.S.` },
  { re: /^(\d{2})\s*PA\.?\s*STAT\.?(?:\s*ANN\.?)?(?=[\s§:]|$)/, code: (n) => `${n} P.S.` },
  { re: /^TITLE\s+(\d{2})(?=[\s§:]|$)/, code: (n) => `${n} Pa.C.S.` },
];

const actByAlias = (code: PaCode, actNo: number): PaActCaptureSource => {
  const act = PA_ACT_SOURCES.find((a) => a.code === code && a.actNo === actNo);
  if (!act) throw new Error(`No act ${actNo} under ${code} in PA_ACT_SOURCES`);
  return act;
};
const ACT_ALIASES: ReadonlyArray<{ re: RegExp; act: PaActCaptureSource }> = [
  { re: /^(?:UIPA|UNFAIR INSURANCE PRACTICES ACT)$/, act: actByAlias('40 P.S.', 205) },
  { re: /^(?:MVPDAA|(?:MOTOR VEHICLE )?(?:PHYSICAL DAMAGE )?APPRAISER ACT)$/, act: actByAlias('63 P.S.', 367) },
  { re: /^(?:UTPCPL|(?:UNFAIR TRADE PRACTICES AND )?CONSUMER PROTECTION LAW)$/, act: actByAlias('73 P.S.', 387) },
  { re: /^(?:WPCL|WAGE PAYMENT AND COLLECTION LAW)$/, act: actByAlias('43 P.S.', 329) },
  { re: /^(?:MWA|(?:THE )?MINIMUM WAGE ACT(?: OF 1968)?)$/, act: actByAlias('43 P.S.', 5) },
  { re: /^(?:WCA|WORKERS'? COMP(?:ENSATION)? ACT)$/, act: actByAlias('77 P.S.', 338) },
];

const NAMED: ReadonlyArray<{ re: RegExp; query: NonNullable<CitationQuery> }> = [
  { re: /^(?:31 PA\.? CODE )?CHAPTER 146$/, query: { kind: 'chapter', code: '31 Pa. Code', chapter: 'Chapter 146' } },
  { re: /^UNFAIR CLAIMS? SETTLEMENT PRACTICES(?: REGULATIONS?)?$/, query: { kind: 'chapter', code: '31 Pa. Code', chapter: 'Chapter 146' } },
  { re: /^(?:31 PA\.? CODE )?CHAPTER 62$/, query: { kind: 'chapter', code: '31 Pa. Code', chapter: 'Chapter 62' } },
  { re: /^APPRAISER REGULATIONS?$/, query: { kind: 'chapter', code: '31 Pa. Code', chapter: 'Chapter 62' } },
  { re: /^(?:37 PA\.? CODE )?CHAPTER 301$/, query: { kind: 'chapter', code: '37 Pa. Code', chapter: 'Chapter 301' } },
  { re: /^AUTOMOTIVE INDUSTRY TRADE PRACTICES$/, query: { kind: 'chapter', code: '37 Pa. Code', chapter: 'Chapter 301' } },
  { re: /^(?:34 PA\.? CODE )?CHAPTER 231$/, query: { kind: 'chapter', code: '34 Pa. Code', chapter: 'Chapter 231' } },
  { re: /^MINIMUM WAGE REGULATIONS?$/, query: { kind: 'chapter', code: '34 Pa. Code', chapter: 'Chapter 231' } },
  { re: /^ABANDONED VEHICLES?(?: AND SALVORS)?$/, query: { kind: 'chapter', code: '75 Pa.C.S.', chapter: 'ch. 73, subch. A' } },
  { re: /^SALVAGE VEHICLES?$/, query: { kind: 'chapter', code: '75 Pa.C.S.', chapter: 'ch. 11, subch. D' } },
];

/** The two-pass strip removes a DOUBLED lead ("§ SEC. 5" — a stray keyword plus symbol both present) that a single pass would leave half-stripped. */
function stripLead(s: string): string {
  return s.replace(/^(?:§+|SEC\.|SECTION|S\.)\s*/, '').replace(/^(?:§+|SEC\.|SECTION|S\.)\s*/, '').replace(/[,;.]\s*$/, '').trim();
}

export function resolvePaCitationQuery(query: string): CitationQuery {
  const trimmed = query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const parsed = parsePaId(trimmed);
    if (parsed) return { kind: 'section', code: parsed.code, cite: parsed.cite };
  }

  let upper = trimmed.toUpperCase().replace(/^THE\s+/, '');
  // "Section 5 of the Unfair Insurance Practices Act" → "UNFAIR INSURANCE PRACTICES ACT 5"
  const ofThe = /^(?:§|SEC\.|SECTION)\s*([0-9A-Z.-]+)\s+OF\s+(?:THE\s+)?(.+)$/.exec(upper);
  if (ofThe) upper = `${ofThe[2]} ${ofThe[1]}`;

  for (const n of NAMED) if (n.re.test(upper)) return n.query;

  // Act aliases: try the WHOLE string first (a name can itself end in a
  // number, e.g. "MINIMUM WAGE ACT OF 1968" — splitting first would peel
  // "1968" off as a section number and leave an alias no regex matches).
  // Only when no alias claims the whole string do we split a trailing
  // section number off and match the remaining name.
  for (const a of ACT_ALIASES) {
    if (a.re.test(upper)) return { kind: 'chapter', code: a.act.code, chapter: a.act.shortTitle };
  }
  const actForm = /^(.+?)(?:\s+(?:§|SEC\.|SECTION)?\s*(\d+(?:\.\d+)?))?$/.exec(upper);
  if (actForm && actForm[2]) {
    const name = actForm[1]!.replace(/\s+(?:§|SEC\.|SECTION)$/, '').trim();
    for (const a of ACT_ALIASES) {
      if (!a.re.test(name)) continue;
      const entry = a.act.sections.find((x) => x.actSection === actForm[2]);
      return entry ? { kind: 'section', code: a.act.code, cite: entry.psCite } : null;
    }
  }

  for (const w of CODE_WORDS) {
    const m = w.re.exec(upper);
    if (!m) continue;
    const code = w.code(m[1]!);
    if (!(PA_CODES as readonly string[]).includes(code)) return null;
    const body = stripLead(upper.slice(m[0].length).replace(/^[\s,.:]+/, '')).toLowerCase();
    return body && CITE_SHAPE.test(body) ? { kind: 'section', code, cite: body } : null;
  }

  const bare = stripLead(upper).toLowerCase();
  if (CITE_SHAPE.test(bare)) {
    const claimants = PA_CITE_CODES[bare];
    return claimants && claimants.length === 1 ? { kind: 'section', code: claimants[0]!, cite: bare } : null;
  }
  return null;
}

export function parsePaId(id: string): { code: PaCode; cite: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const codePart = id.slice(0, idx).trim().toLowerCase();
  const cite = id.slice(idx + 1).trim();
  const code = PA_CODES.find((c) => c.toLowerCase() === codePart);
  return code && cite ? { code, cite } : null;
}

export const paStateIdentity: StateIdentity = { ...factory, resolveCitationQuery: resolvePaCitationQuery, parseId: parsePaId };

export function paId(code: PaCode, cite: string): string {
  return paStateIdentity.id(code, cite);
}
export function displayCite(section: Pick<PaSection, 'code' | 'cite'>): string {
  return paStateIdentity.displayCite(section);
}
export function formatPaCitation(section: PaSection): Citation {
  return paStateIdentity.formatCitation(section);
}
