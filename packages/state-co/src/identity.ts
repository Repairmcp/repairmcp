/**
 * Colorado's identity. Bare-cite inference: hyphenated triples are CRS (the
 * dominant code, the role hyphens play for MCA in Montana); regulations need
 * their prefix; COMPS rules alone claim bare dotted numbers. CRS citations
 * carry the EDITION — CRS prints session-law source notes, never effective
 * dates, and silence-over-guess is the house rule. CCR citations carry real
 * effective dates; the bulletin carries its issue date. CRS_EDITION is
 * pinned against corpus meta by a test so the yearly rollover fails loudly.
 *
 * resolveCoCitationQuery wraps the shared factory: the factory's 2-3-group
 * splitter cannot express CRS point-five sections (42-9-108.5), four-group
 * CCR cites (702-5-1-14), or letter-bearing bulletin cites (B-5.04), so
 * those forms resolve here and everything else delegates.
 */
import { fmtDateUtc, type Citation } from '@repairmcp/core';
import { makeStateIdentity, type CitationQuery, type StateIdentity } from '@repairmcp/state-law';
import { CO_CODES } from './schema.js';
import type { CoCode, CoSection } from './schema.js';

export const CRS_EDITION = 'Colorado Revised Statutes 2026';
export const CRS_EDITION_NOTE = `${CRS_EDITION.match(/\d{4}/)?.[0] ?? ''} edition`;

export const CO_IDENTITY = {
  sourceId: 'state-co',
  sourceName: 'State of Colorado',
  sourceShortName: 'CO Law',
  sourceUrl: 'https://leg.colorado.gov',
  description:
    'Colorado state law for collision repair facilities: insurance claims handling (CRS 10-4-120 anti-steering and payment duties, the unfair claims practices catalog, the Model Quality Replacement Parts Act, DOI claim-handling regulations and Bulletin B-5.04), the Motor Vehicle Repair Act, towing rules, and employment rules (the Wage Act and the COMPS Order) — captured verbatim from the CRS and the Code of Colorado Regulations.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

function isoToDisplay(iso: string | undefined): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return fmtDateUtc(new Date(`${iso}T00:00:00.000Z`));
}

const factory = makeStateIdentity({
  ...CO_IDENTITY,
  codes: [
    {
      code: 'CRS',
      longName: 'Colorado Revised Statutes section',
      separator: '-',
      claimsBareSeparators: ['-'],
      citationNote: () => CRS_EDITION_NOTE,
    },
    { code: '3 CCR', longName: 'Code of Colorado Regulations, 3 CCR', separator: '-' },
    { code: '4 CCR', longName: 'Code of Colorado Regulations, 4 CCR', separator: '-' },
    { code: '7 CCR', longName: 'Code of Colorado Regulations, 7 CCR', separator: '-' },
    {
      code: 'Colorado DOI Bulletin',
      longName: 'Colorado Division of Insurance Bulletin',
      separator: '-',
      citationNote: (section) => {
        const issued = isoToDisplay(section.effectiveDate);
        return issued ? `issued ${issued}` : undefined;
      },
    },
  ],
});

/** The three captured CCR series, for bare-chapter and shorthand resolution. */
const CCR_SERIES: ReadonlyArray<{ code: CoCode; series: string }> = [
  { code: '3 CCR', series: '702-5' },
  { code: '4 CCR', series: '723-6' },
  { code: '7 CCR', series: '1103-1' },
];

const CRS_SECTION = /^(\d+)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;
const CCR_FULL = /^([347])\s*C\.?C\.?R\.?\s+(\d{3,4}-\d+)(?:-(.+))?$/i;
const DOI_REG = /^REG(?:ULATION)?\.?\s+(5-\d+-\d+)$/i;
const COMPS_RULE = /^(?:COMPS\s+)?RULE\s+(\d+(?:\.\d+)+)$/i;
const BARE_DOTTED = /^\d+(?:\.\d+)+$/;
const BULLETIN = /^(?:(?:COLORADO\s+)?(?:DOI\s+)?BULLETIN\s+)?B-?(\d+\.\d+)$/i;

/**
 * Order is load-bearing: bulletin -> full CCR -> Reg shorthand -> COMPS ->
 * bare series -> CRS (with dotted/point-five support) -> factory fallback.
 * Each branch's pattern is narrow enough that reordering would not change
 * behavior today, but the order documents the priority these forms are
 * meant to be checked in as new shorthands are added later.
 */
export function resolveCoCitationQuery(query: string): CitationQuery {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/^(?:§|SECTION)\s+/, '').replace(/,\s*C\.R\.S\.?$/, '');

  const bulletin = BULLETIN.exec(upper);
  if (bulletin) {
    return { kind: 'section', code: 'Colorado DOI Bulletin', cite: `B-${bulletin[1]!}` };
  }

  const ccr = CCR_FULL.exec(upper);
  if (ccr) {
    const code = `${ccr[1]!} CCR`;
    const series = ccr[2]!;
    return ccr[3]
      ? { kind: 'section', code, cite: `${series}-${ccr[3]}` }
      : { kind: 'chapter', code, chapter: series };
  }

  const reg = DOI_REG.exec(upper);
  if (reg) {
    // DOI regulation numbers live in the 702-5 series: "5-1-14" -> 702-5-1-14.
    return { kind: 'section', code: '3 CCR', cite: `702-${reg[1]!}` };
  }

  const compsMatch = COMPS_RULE.exec(upper);
  if (compsMatch) {
    return { kind: 'section', code: '7 CCR', cite: `1103-1-${compsMatch[1]!}` };
  }
  if (BARE_DOTTED.test(upper)) {
    return { kind: 'section', code: '7 CCR', cite: `1103-1-${upper}` };
  }

  const bareSeries = CCR_SERIES.find((s) => s.series === upper);
  if (bareSeries) {
    return { kind: 'chapter', code: bareSeries.code, chapter: bareSeries.series };
  }

  const bareCrs = CRS_SECTION.exec(upper.replace(/^CRS[\s:.-]+/, ''));
  if (bareCrs) {
    return { kind: 'section', code: 'CRS', cite: `${bareCrs[1]}-${bareCrs[2]}-${bareCrs[3]}` };
  }

  return factory.resolveCitationQuery(trimmed);
}

export const coStateIdentity: StateIdentity = { ...factory, resolveCitationQuery: resolveCoCitationQuery };

export type CoCitationQuery =
  | { kind: 'section'; code: CoCode; cite: string }
  | { kind: 'chapter'; code: CoCode; chapter: string }
  | null;

export function coId(code: CoCode, cite: string): string {
  return coStateIdentity.id(code, cite);
}
export function parseCoId(id: string): { code: CoCode; cite: string } | null {
  const parsed = coStateIdentity.parseId(id);
  if (!parsed) return null;
  // The factory's parseId reconstructs the code via .toUpperCase(), which
  // only round-trips codes that are already all-caps (CRS, the CCR titles).
  // 'Colorado DOI Bulletin' does not survive that, so re-derive the
  // correctly-cased CoCode literal by matching case-insensitively against
  // CO_CODES; a match found elsewhere but not here is a foreign id — null.
  const code = CO_CODES.find((c) => c.toUpperCase() === parsed.code.toUpperCase());
  if (!code) return null;
  return { code, cite: parsed.cite };
}
/** "CRS 10-4-120" / "3 CCR 702-5-1-14" — the display cite everything renders. */
export function displayCite(section: Pick<CoSection, 'code' | 'cite'>): string {
  return coStateIdentity.displayCite(section);
}
export function formatCoCitation(section: CoSection): Citation {
  return coStateIdentity.formatCitation(section);
}
