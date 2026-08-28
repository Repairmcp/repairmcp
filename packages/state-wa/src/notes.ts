/**
 * The legal-posture lines, stated wherever Washington law text is served —
 * tool descriptions, tool payloads, and connector documents. One producer per
 * sentence so the wording cannot drift between the Claude tools and the
 * ChatGPT connector. Echoes the service terms at repairmcp.com/legal.
 */

/** The state-law sibling of nhtsa's LEGAL_ADVICE_NOTE. */
export const LEGAL_ADVICE_NOTE =
  'This quotes Washington law and cites the section. It is not legal advice.';

/**
 * The dispute-tool caveat, ported from the May branch. Served under ONE key
 * (`caveat`) everywhere — the branch's caveat/legalPostureCaveat split was
 * two names for the same sentence and does not port.
 */
export const EDUCATIONAL_CAVEAT =
  'Educational information only. Verify the official source and review legal strategy with qualified counsel before making legal claims.';

export const EMPTY_SEARCH_HINT =
  'No matching Washington law found. Try broader terms, or remove the domain/topic filters.';
