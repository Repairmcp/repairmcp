/**
 * New York's identity. Ten codes. Statute cites are bare section numbers
 * that REPEAT across codes (Workers' Comp. Law 2 and any other code's 2),
 * so a bare number resolves only when exactly one captured code claims it
 * (NY_CITE_CODES, built from the manifests); a number two codes claim
 * resolves to null and the get-tool's input text says to word the code —
 * fuzzy search then surfaces both, because each section's text opens with
 * "§ N." Regulation cites are unique by shape (216.N / 82.N / 142-S.N)
 * and guidance cites by their words. The shared factory's group splitter
 * cannot express any of this, so New York resolves everything itself.
 *
 * Citation notes differ by code, as the kickoff §4 records: statutes carry
 * the Senate's REVISION date ("revised 6/23/2017"); 11 and 12 NYCRR carry
 * an effective date (silence without one); 15 NYCRR carries the DMV
 * booklet edition (NY_CR82_EDITION, pinned against corpus meta by a test so
 * a reissue fails at re-capture); DFS guidance carries its issue date and,
 * when withdrawn, the withdrawal date. All dates route through fmtDateUtc.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity, type StateSection } from '@repairmcp/state-law';
import { NY_CODES, type NyCode, type NySection } from './schema.js';
import { NY_DFS_SOURCES } from './sources-dfs.js';
import { NY_PDF_PART_SOURCES } from './sources-parts.js';
import { NY_REG64_SOURCE } from './sources-reg64.js';
import { NY_STATUTE_SOURCES } from './sources-statutes.js';

/** The edition token the CR-82 cover prints. Bump consciously after reading the reissued booklet. */
export const NY_CR82_EDITION = 'CR-82 (5/26)';

export const NY_IDENTITY = {
  sourceId: 'state-ny',
  sourceName: 'State of New York',
  sourceShortName: 'NY Law',
  sourceUrl: 'https://www.nysenate.gov/legislation/laws',
  description:
    "New York state law for collision repair facilities: insurance claims handling (Ins. Law 2610 — no requiring, and no unrequested recommending of, a particular repair shop; 2601 the unfair claim settlement practices catalog, with no private right of action; 3411 physical damage standard provisions and inspections; Regulation 64, 11 NYCRR 216 — acknowledgment within 15 business days, prompt investigation, inspection of a damaged vehicle within six business days, good-faith negotiation, parts and labor provisions, total loss valuation, third-party property damage claims; DFS opinions and circular letters on total loss, certified-shop steering, and Regulation 64, one of them withdrawn and marked so), the Motor Vehicle Repair Shop Registration Act (Veh. & Traf. Law 398 through 398-h) and 15 NYCRR Part 82 (written estimates, authorization, parts return, invoices, records, registration, signs, quality repairs, insurers and repair shops), the bailee's lien on a motor vehicle and the sale to enforce it, General Business Law 349 and 350, and employment rules (weekly pay for manual workers, deductions, wage notices and statements, remedies, meal periods, one day of rest in seven, the minimum wage order's call-in pay and spread of hours, workers' compensation and the independent contractor question) — captured verbatim from the Senate's public site, the DMV and DOL booklets, the Legal Information Institute's NYCRR mirror (Regulation 64 only, provenance stated), and dfs.ny.gov.",
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

const LONG_NAMES: Record<NyCode, string> = {
  'N.Y. Ins. Law': 'New York Insurance Law section',
  'N.Y. Veh. & Traf. Law': 'New York Vehicle and Traffic Law section',
  'N.Y. Gen. Bus. Law': 'New York General Business Law section',
  'N.Y. Lien Law': 'New York Lien Law section',
  'N.Y. Lab. Law': 'New York Labor Law section',
  "N.Y. Workers' Comp. Law": "New York Workers' Compensation Law section",
  '11 NYCRR': 'New York Codes, Rules and Regulations Title 11 section',
  '15 NYCRR': 'New York Codes, Rules and Regulations Title 15 section',
  '12 NYCRR': 'New York Codes, Rules and Regulations Title 12 section',
  'DFS Guidance': 'New York Department of Financial Services guidance document',
};

function iso(d: string | undefined): string | undefined {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDateUtc(new Date(`${d}T00:00:00.000Z`)) : undefined;
}

const revisedNote = (s: NySection): string | undefined => (iso(s.effectiveDate) ? `revised ${iso(s.effectiveDate)}` : undefined);
const dfsNote = (s: NySection): string | undefined => {
  const issued = iso(s.effectiveDate);
  const withdrawn = iso(s.dfsWithdrawnDate);
  if (!issued) return undefined;
  return withdrawn ? `issued ${issued}, withdrawn ${withdrawn}` : `issued ${issued}`;
};

const factory = makeStateIdentity({
  ...NY_IDENTITY,
  codes: NY_CODES.map((code) => ({
    code,
    longName: LONG_NAMES[code],
    separator: '.' as const,
    ...(code === '15 NYCRR' ? { citationNote: () => NY_CR82_EDITION } : {}),
    ...(code === 'DFS Guidance' ? { citationNote: (s: StateSection) => dfsNote(s as NySection) } : {}),
    ...(code.startsWith('N.Y. ') ? { citationNote: (s: StateSection) => revisedNote(s as NySection) } : {}),
  })),
});

/** Every captured cite → the codes that claim it (built from the manifests). */
export const NY_CITE_CODES: Readonly<Record<string, readonly NyCode[]>> = (() => {
  const map: Record<string, NyCode[]> = {};
  const claim = (cite: string, code: NyCode): void => {
    const list = (map[cite] ??= []);
    if (!list.includes(code)) list.push(code);
  };
  for (const s of NY_STATUTE_SOURCES) for (const c of s.cites) claim(c.toUpperCase(), s.code);
  for (const c of NY_REG64_SOURCE.cites) claim(c, '11 NYCRR');
  for (const p of NY_PDF_PART_SOURCES) for (const c of p.cites) claim(c, p.code);
  for (const d of NY_DFS_SOURCES) claim(d.cite, 'DFS Guidance');
  return map;
})();

const REG_SHAPES: ReadonlyArray<{ re: RegExp; code: NyCode }> = [
  { re: /^216\.\d{1,2}$/, code: '11 NYCRR' },
  { re: /^82\.\d{1,2}$/, code: '15 NYCRR' },
  { re: /^142-[123]\.\d{1,2}$/, code: '12 NYCRR' },
];
const STATUTE_SHAPE = /^\d{1,4}(?:-[A-Z]{1,2})?$/;

/** Code words → code. Longest/most specific first; all tested upper-case. */
const CODE_WORDS: ReadonlyArray<{ re: RegExp; code: NyCode }> = [
  { re: /^(?:N\.?Y\.?\s*)?(?:INS\.?|INSURANCE)\s+LAW\b/, code: 'N.Y. Ins. Law' },
  { re: /^ISC\b/, code: 'N.Y. Ins. Law' },
  { re: /^(?:N\.?Y\.?\s*)?(?:VEH\.?\s*(?:&|AND)\s*TRAF\.?|VEHICLE\s+(?:&|AND)\s+TRAFFIC)\s+LAW\b/, code: 'N.Y. Veh. & Traf. Law' },
  { re: /^(?:VTL|VAT)\b/, code: 'N.Y. Veh. & Traf. Law' },
  { re: /^(?:N\.?Y\.?\s*)?(?:GEN\.?\s*BUS\.?|GENERAL\s+BUSINESS)\s+LAW\b/, code: 'N.Y. Gen. Bus. Law' },
  { re: /^(?:GBL|GBS)\b/, code: 'N.Y. Gen. Bus. Law' },
  { re: /^(?:N\.?Y\.?\s*)?LIEN\s+LAW\b/, code: 'N.Y. Lien Law' },
  { re: /^LIE\b/, code: 'N.Y. Lien Law' },
  { re: /^(?:N\.?Y\.?\s*)?(?:LAB\.?|LABOR)\s+LAW\b/, code: 'N.Y. Lab. Law' },
  { re: /^LAB\b/, code: 'N.Y. Lab. Law' },
  { re: /^(?:N\.?Y\.?\s*)?WORKERS'?\s+(?:COMP\.?|COMPENSATION)\s+LAW\b/, code: "N.Y. Workers' Comp. Law" },
  { re: /^(?:WCL|WKC)\b/, code: "N.Y. Workers' Comp. Law" },
  { re: /^11\s+N\.?Y\.?C\.?R\.?R\.?\b/, code: '11 NYCRR' },
  { re: /^15\s+N\.?Y\.?C\.?R\.?R\.?\b/, code: '15 NYCRR' },
  { re: /^12\s+N\.?Y\.?C\.?R\.?R\.?\b/, code: '12 NYCRR' },
  { re: /^REG(?:ULATION|\.)?\s*64\b/, code: '11 NYCRR' },
];

const NAMED: ReadonlyArray<{ re: RegExp; query: NonNullable<CitationQuery> }> = [
  { re: /^(?:INSURANCE\s+)?REG(?:ULATION|\.)?\s*64$/, query: { kind: 'chapter', code: '11 NYCRR', chapter: 'Part 216' } },
  { re: /^(?:11\s+NYCRR\s+)?PART\s+216$/, query: { kind: 'chapter', code: '11 NYCRR', chapter: 'Part 216' } },
  { re: /^(?:THE\s+)?(?:MOTOR\s+VEHICLE\s+)?REPAIR\s+SHOP\s+REGISTRATION\s+ACT$/, query: { kind: 'chapter', code: 'N.Y. Veh. & Traf. Law', chapter: 'art. 12-A' } },
  { re: /^ART(?:ICLE|\.)?\s*12-A$/, query: { kind: 'chapter', code: 'N.Y. Veh. & Traf. Law', chapter: 'art. 12-A' } },
  { re: /^(?:15\s+NYCRR\s+)?PART\s+82$/, query: { kind: 'chapter', code: '15 NYCRR', chapter: 'Part 82' } },
  { re: /^(?:THE\s+)?REPAIR\s+SHOP\s+REGULATIONS$/, query: { kind: 'chapter', code: '15 NYCRR', chapter: 'Part 82' } },
  { re: /^(?:12\s+NYCRR\s+)?PART\s+142$/, query: { kind: 'chapter', code: '12 NYCRR', chapter: 'Part 142' } },
  { re: /^(?:THE\s+)?MINIMUM\s+WAGE\s+ORDER(?:\s+FOR\s+MISCELLANEOUS\s+INDUSTRIES(?:\s+AND\s+OCCUPATIONS)?)?$/, query: { kind: 'chapter', code: '12 NYCRR', chapter: 'Part 142' } },
  { re: /^PAYMENT\s+OF\s+WAGES$/, query: { kind: 'chapter', code: 'N.Y. Lab. Law', chapter: 'art. 6' } },
];

const OGC = /^(?:DFS\s+)?(?:OGC\s+)?(?:OPINION\s+)?(?:NO\.?\s*)?(\d{2}-\d{2}-\d{2})$/;
const CIRCULAR = /^(?:DFS\s+)?(?:INSURANCE\s+)?(?:CIRCULAR\s+LETTER|CL)\s+(?:NO\.?\s*)?(\d{1,3})\s*\((\d{4})\)$/;

function stripLead(s: string): string {
  return s.replace(/^(?:§+|SEC\.|SECTION|S\.)\s*/, '').replace(/^(?:§+|SEC\.|SECTION|S\.)\s*/, '').replace(/[,;.]\s*$/, '').trim();
}

export function resolveNyCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const parsed = parseNyId(trimmed);
    if (parsed) return { kind: 'section', code: parsed.code, cite: parsed.cite };
  }

  let upper = trimmed.toUpperCase().replace(/^THE\s+/, '');
  // "Section 2610 of the Insurance Law" → "INSURANCE LAW 2610"
  const ofThe = /^(?:§|SEC\.|SECTION)\s*([0-9A-Z.-]+)\s+OF\s+(?:THE\s+)?(.+)$/.exec(upper);
  if (ofThe) upper = `${ofThe[2]} ${ofThe[1]}`;

  for (const n of NAMED) if (n.re.test(upper)) return n.query;

  const ogc = OGC.exec(upper);
  if (ogc && /OGC|OPINION/.test(upper)) return { kind: 'section', code: 'DFS Guidance', cite: `OGC Opinion ${ogc[1]}` };
  const cl = CIRCULAR.exec(upper);
  if (cl) return { kind: 'section', code: 'DFS Guidance', cite: `Circular Letter ${cl[1]} (${cl[2]})` };

  for (const w of CODE_WORDS) {
    const m = w.re.exec(upper);
    if (!m) continue;
    const body = stripLead(upper.slice(m[0].length).replace(/^[\s,.:]+/, ''));
    if (!body) return null;
    if (w.code === '11 NYCRR' || w.code === '15 NYCRR' || w.code === '12 NYCRR') {
      const shape = REG_SHAPES.find((r) => r.code === w.code);
      return shape && shape.re.test(body) ? { kind: 'section', code: w.code, cite: body } : null;
    }
    return STATUTE_SHAPE.test(body) ? { kind: 'section', code: w.code, cite: body } : null;
  }

  const bare = stripLead(upper);
  for (const r of REG_SHAPES) if (r.re.test(bare)) return { kind: 'section', code: r.code, cite: bare };
  if (STATUTE_SHAPE.test(bare)) {
    const claimants = NY_CITE_CODES[bare];
    return claimants && claimants.length === 1 ? { kind: 'section', code: claimants[0]!, cite: bare } : null;
  }
  return null;
}

export const nyStateIdentity: StateIdentity = { ...factory, resolveCitationQuery: resolveNyCitationQuery };

export function nyId(code: NyCode, cite: string): string {
  return nyStateIdentity.id(code, cite);
}
export function parseNyId(id: string): { code: NyCode; cite: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const codePart = id.slice(0, idx).trim().toLowerCase();
  const cite = id.slice(idx + 1).trim();
  const code = NY_CODES.find((c) => c.toLowerCase() === codePart);
  return code && cite ? { code, cite } : null;
}
export function displayCite(section: Pick<NySection, 'code' | 'cite'>): string {
  return nyStateIdentity.displayCite(section);
}
export function formatNyCitation(section: NySection): Citation {
  return nyStateIdentity.formatCitation(section);
}
