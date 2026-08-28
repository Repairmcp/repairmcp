/**
 * Washington's identity: the per-state config handed to the shared
 * makeStateIdentity factory (@repairmcp/state-law), plus the WA-typed
 * wrappers under their original names. The citation templates and the
 * resolver live in the factory and reproduce the pre-extraction behavior
 * byte-for-byte — the identity tests' exact-string assertions are the proof.
 * Bare-cite inference is config: hyphens mean WAC here, dots mean RCW.
 */
import type { Citation } from '@repairmcp/core';
import { makeStateIdentity, type StateIdentity } from '@repairmcp/state-law';
import type { WaCode, WaSection } from './schema.js';

export const WA_IDENTITY = {
  sourceId: 'state-wa',
  sourceName: 'Washington State Legislature',
  sourceShortName: 'WA Law',
  sourceUrl: 'https://leg.wa.gov',
  description:
    'Washington state law for collision repair facilities: insurance claims handling (WAC 284-30, RCW 48.30), auto repair law (RCW 46.71), workplace safety (WISHA), and employment rules — captured verbatim from leg.wa.gov.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

export const waStateIdentity: StateIdentity = makeStateIdentity({
  ...WA_IDENTITY,
  codes: [
    {
      code: 'WAC',
      longName: 'Washington Administrative Code',
      separator: '-',
      claimsBareSeparators: ['-'],
    },
    {
      code: 'RCW',
      longName: 'Revised Code of Washington',
      separator: '.',
      claimsBareSeparators: ['.'],
    },
  ],
});

export type CitationQuery =
  | { kind: 'section'; code: WaCode; cite: string }
  | { kind: 'chapter'; code: WaCode; chapter: string }
  | null;

export function waId(code: WaCode, cite: string): string {
  return waStateIdentity.id(code, cite);
}

export function parseWaId(id: string): { code: WaCode; cite: string } | null {
  return waStateIdentity.parseId(id) as { code: WaCode; cite: string } | null;
}

/** "WAC 284-30-330" / "RCW 46.71.025" — the display cite everything renders. */
export function displayCite(section: Pick<WaSection, 'code' | 'cite'>): string {
  return waStateIdentity.displayCite(section);
}

export function resolveCitationQuery(query: string): CitationQuery {
  return waStateIdentity.resolveCitationQuery(query) as CitationQuery;
}

export function formatWaCitation(section: WaSection): Citation {
  return waStateIdentity.formatCitation(section);
}
