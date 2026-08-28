/**
 * Montana's identity: the per-state config handed to the shared
 * makeStateIdentity factory. Bare-cite inference is the exact opposite of
 * Washington's: hyphenated triples (33-18-201) are MCA, dotted triples
 * (6.6.1701) are ARM.
 *
 * MCA citations carry the EDITION, not an effective date — MCA history lines
 * state session laws ("amd. Sec. 3, Ch. 229, L. 2025"), never effective
 * dates, so per-section dates would be a guess and silence-over-guess is the
 * house rule. ARM citations carry the rule's real ISO effective date via the
 * factory default. The MCA_EDITION constant is pinned against the corpus
 * meta by a test, so the yearly edition rollover fails loudly at re-capture
 * and requires a human.
 */
import type { Citation } from '@repairmcp/core';
import { makeStateIdentity, type StateIdentity } from '@repairmcp/state-law';
import type { MtCode, MtSection } from './schema.js';

/** The MCA edition this package is built against. Must match meta.mcaEdition. */
export const MCA_EDITION = 'Montana Code Annotated 2025';

/** The clause MCA citations carry: "MCA 33-18-201, 2025 edition". */
export const MCA_EDITION_NOTE = `${MCA_EDITION.match(/\d{4}/)?.[0] ?? ''} edition`;

export const MT_IDENTITY = {
  sourceId: 'state-mt',
  sourceName: 'State of Montana',
  sourceShortName: 'MT Law',
  sourceUrl: 'https://mca.legmt.gov',
  description:
    'Montana state law for collision repair facilities: insurance claims handling (MCA Title 33 ch. 18 including the UTPA private action and the body-shop steering statute), repair and lien law, the Safety Culture Act, and employment rules including the Wrongful Discharge From Employment Act — captured verbatim from the MCA and the ARM.',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
} as const;

export const mtStateIdentity: StateIdentity = makeStateIdentity({
  ...MT_IDENTITY,
  codes: [
    {
      code: 'MCA',
      longName: 'Montana Code Annotated',
      separator: '-',
      claimsBareSeparators: ['-'],
      citationNote: () => MCA_EDITION_NOTE,
    },
    {
      code: 'ARM',
      longName: 'Administrative Rules of Montana',
      separator: '.',
      claimsBareSeparators: ['.'],
    },
  ],
});

export type MtCitationQuery =
  | { kind: 'section'; code: MtCode; cite: string }
  | { kind: 'chapter'; code: MtCode; chapter: string }
  | null;

export function mtId(code: MtCode, cite: string): string {
  return mtStateIdentity.id(code, cite);
}

export function parseMtId(id: string): { code: MtCode; cite: string } | null {
  return mtStateIdentity.parseId(id) as { code: MtCode; cite: string } | null;
}

/** "MCA 33-18-201" / "ARM 6.6.1701" — the display cite everything renders. */
export function displayCite(section: Pick<MtSection, 'code' | 'cite'>): string {
  return mtStateIdentity.displayCite(section);
}

export function resolveMtCitationQuery(query: string): MtCitationQuery {
  return mtStateIdentity.resolveCitationQuery(query) as MtCitationQuery;
}

export function formatMtCitation(section: MtSection): Citation {
  return mtStateIdentity.formatCitation(section);
}
