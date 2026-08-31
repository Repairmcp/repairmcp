/**
 * Texas's identity. Statute cites are chapter.section dotted pairs
 * ("1952.301"), which the shared factory's 2–3-group splitter would read as a
 * CHAPTER — so Texas resolves everything in its own resolver and delegates
 * nothing. Bare cites resolve by CHAPTER lookup: the captured chapters are
 * disjoint across every code (Insurance 541/542/1813/1952, Labor 61/62,
 * Occupations 2303, Property 70, Bus. & Com. 17, Transportation 501, TAC
 * 5/21), so "1952.301" needs no code word and "5.501" is unambiguously TAC.
 *
 * Texas statutes state per-section effective dates in their session-law
 * history notes ("eff. April 1, 2007" — newest wins, the WA rule), so statute
 * and TAC citations both carry "effective M/D/YYYY"; bulletins carry
 * "issued M/D/YYYY". Statute CURRENCY is the legislative session the text
 * reflects: TX_STATUTES_CURRENCY pins it against corpus meta so the next
 * Legislature fails the pin test loudly at re-capture.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import {
  makeStateIdentity,
  type CitationQuery,
  type StateIdentity,
  type StateSection,
} from '@repairmcp/state-law';
import { TX_CODES } from './schema.js';
import type { TxCode, TxSection } from './schema.js';

/** The session phrase the statutes site states its currency by. */
export const TX_STATUTES_CURRENCY = '89th 2nd Called Legislative Session, 2025';

export const TX_IDENTITY = {
  sourceId: 'state-tx',
  sourceName: 'State of Texas',
  sourceShortName: 'TX Law',
  sourceUrl: 'https://statutes.capitol.texas.gov',
  description:
    'Texas state law for collision repair facilities: insurance claims handling (Tex. Ins. Code ch. 1952 subch. G anti-steering and shop choice, ch. 1813 mandatory appraisal, ch. 542 prompt payment with the 18% interest remedy, the ch. 541 unfair settlement practices catalog and private action, 28 TAC 5.501 and the TDI unfair claims settlement rules, TDI steering bulletins), vehicle storage facility and possessory-lien law, the DTPA, and employment rules (the Payday Law and minimum wage) — captured verbatim from the Texas statutes, the Texas Administrative Code, and TDI.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

function isoToDisplay(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return fmtDateUtc(new Date(`${iso}T00:00:00.000Z`));
}

const LONG_NAMES: Record<TxCode, string> = {
  'Tex. Ins. Code': 'Texas Insurance Code section',
  'Tex. Lab. Code': 'Texas Labor Code section',
  'Tex. Occ. Code': 'Texas Occupations Code section',
  'Tex. Prop. Code': 'Texas Property Code section',
  'Tex. Bus. & Com. Code': 'Texas Business & Commerce Code section',
  'Tex. Transp. Code': 'Texas Transportation Code section',
  '28 TAC': 'Texas Administrative Code, Title 28, section',
  'TDI Bulletin': "Texas Department of Insurance Commissioner's Bulletin",
};

const factory = makeStateIdentity({
  ...TX_IDENTITY,
  codes: TX_CODES.map((code) => ({
    code,
    longName: LONG_NAMES[code],
    separator: '.' as const,
    ...(code === 'TDI Bulletin'
      ? {
          citationNote: (section: StateSection) => {
            const issued = isoToDisplay(section.effectiveDate);
            return issued ? `issued ${issued}` : undefined;
          },
        }
      : {}),
  })),
});

/**
 * Chapter → code, for bare-cite and bare-chapter resolution. Every captured
 * chapter appears here exactly once; the schema test asserts the corpus never
 * grows a chapter this map does not know (a collision would make bare cites
 * ambiguous, and that must be a conscious decision, not an accident).
 */
export const TX_CHAPTER_CODES: Record<string, TxCode> = {
  '541': 'Tex. Ins. Code',
  '542': 'Tex. Ins. Code',
  '1813': 'Tex. Ins. Code',
  '1952': 'Tex. Ins. Code',
  '61': 'Tex. Lab. Code',
  '62': 'Tex. Lab. Code',
  '2303': 'Tex. Occ. Code',
  '70': 'Tex. Prop. Code',
  '17': 'Tex. Bus. & Com. Code',
  '501': 'Tex. Transp. Code',
  '5': '28 TAC',
  '21': '28 TAC',
};

/** Code-word aliases a shop or an AI client might type, checked in order. */
const CODE_ALIASES: ReadonlyArray<{ pattern: RegExp; code: TxCode }> = [
  { pattern: /^(?:TEX(?:AS)?\.?\s+)?INS(?:URANCE)?\.?\s+CODE\b/, code: 'Tex. Ins. Code' },
  { pattern: /^(?:TEX(?:AS)?\.?\s+)?LAB(?:OR)?\.?\s+CODE\b/, code: 'Tex. Lab. Code' },
  { pattern: /^(?:TEX(?:AS)?\.?\s+)?OCC(?:UPATIONS)?\.?\s+CODE\b/, code: 'Tex. Occ. Code' },
  { pattern: /^(?:TEX(?:AS)?\.?\s+)?PROP(?:ERTY)?\.?\s+CODE\b/, code: 'Tex. Prop. Code' },
  {
    pattern: /^(?:TEX(?:AS)?\.?\s+)?BUS(?:INESS)?\.?\s*(?:&|AND)\s*COM(?:MERCE)?\.?\s+CODE\b/,
    code: 'Tex. Bus. & Com. Code',
  },
  { pattern: /^(?:TEX(?:AS)?\.?\s+)?TRANSP(?:ORTATION)?\.?\s+CODE\b/, code: 'Tex. Transp. Code' },
  { pattern: /^(?:28\s+)?(?:TAC|TEX\.?\s*ADMIN\.?\s*CODE)\b/, code: '28 TAC' },
];

const DOTTED_CITE = /^(\d{1,4})\.(\d{1,4}[A-Z]?)$/;
const BULLETIN =
  /^(?:(?:TDI|TEXAS|COMMISSIONER'?S?)\s+)?(?:BULLETIN\s*#?\s*)?B-?(\d{1,4})-(\d{2})$/;

/**
 * Order is load-bearing: id forms -> bulletin -> code-worded cites -> bare
 * dotted cite (chapter lookup) -> bare chapter. Anything else returns null
 * and falls to fuzzy scoring.
 */
export function resolveTxCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  // Id forms ("tex. ins. code:1952.301", "28 tac:5.501") round-trip here —
  // the factory fallback would misread the dotted pair as a chapter.
  if (trimmed.includes(':')) {
    const parsed = parseTxId(trimmed);
    return parsed ? { kind: 'section', code: parsed.code, cite: parsed.cite } : null;
  }

  let upper = trimmed
    .toUpperCase()
    .replace(/^(?:§|SEC\.|SECTION|RULE)\s*/, '')
    .replace(/[,;]\s*$/, '');

  const bulletin = BULLETIN.exec(upper);
  if (bulletin) {
    return {
      kind: 'section',
      code: 'TDI Bulletin',
      cite: `B-${bulletin[1]!.padStart(4, '0')}-${bulletin[2]!}`,
    };
  }

  let code: TxCode | undefined;
  for (const alias of CODE_ALIASES) {
    const match = alias.pattern.exec(upper);
    if (match) {
      code = alias.code;
      upper = upper
        .slice(match[0].length)
        .replace(/^[\s:.-]+/, '')
        .replace(/^(?:§|SEC\.|SECTION|CHAPTER|CH\.)\s*/, '');
      break;
    }
  }

  const dotted = DOTTED_CITE.exec(upper);
  if (dotted) {
    const resolved = code ?? TX_CHAPTER_CODES[dotted[1]!];
    if (!resolved) return null;
    return { kind: 'section', code: resolved, cite: upper };
  }

  const bareChapter = /^(\d{1,4})$/.exec(upper);
  if (bareChapter) {
    const resolved = code ?? TX_CHAPTER_CODES[bareChapter[1]!];
    if (!resolved) return null;
    return { kind: 'chapter', code: resolved, chapter: bareChapter[1]! };
  }

  return null;
}

export const txStateIdentity: StateIdentity = {
  ...factory,
  resolveCitationQuery: resolveTxCitationQuery,
};

export type TxCitationQuery =
  | { kind: 'section'; code: TxCode; cite: string }
  | { kind: 'chapter'; code: TxCode; chapter: string }
  | null;

export function txId(code: TxCode, cite: string): string {
  return txStateIdentity.id(code, cite);
}
export function parseTxId(id: string): { code: TxCode; cite: string } | null {
  const parsed = txStateIdentity.parseId(id);
  if (!parsed) return null;
  // The factory's parseId reconstructs the code via .toUpperCase(), which no
  // mixed-case Texas code survives — re-derive the correctly-cased literal.
  const code = TX_CODES.find((c) => c.toUpperCase() === parsed.code.toUpperCase());
  if (!code) return null;
  return { code, cite: parsed.cite };
}
/** "Tex. Ins. Code 1952.301" / "28 TAC 5.501" — the display cite everything renders. */
export function displayCite(section: Pick<TxSection, 'code' | 'cite'>): string {
  return txStateIdentity.displayCite(section);
}
export function formatTxCitation(section: TxSection): Citation {
  return txStateIdentity.formatCitation(section);
}
