/**
 * The legal-posture lines, stated wherever state law text is served. One
 * producer per sentence so the wording cannot drift between the Claude tools
 * and the ChatGPT connector, and one template per state so the states cannot
 * drift from each other. Echoes the service terms at repairmcp.com/legal.
 */

/** The dispute-tool caveat. Served under ONE key (`caveat`) everywhere. */
export const EDUCATIONAL_CAVEAT =
  'Educational information only. Verify the official source and review legal strategy with qualified counsel before making legal claims.';

export function makeLegalAdviceNote(stateName: string): string {
  return `This quotes ${stateName} law and cites the section. It is not legal advice.`;
}

export function makeEmptySearchHint(stateName: string): string {
  return `No matching ${stateName} law found. Try broader terms, or remove the domain/topic filters.`;
}
