/**
 * Washington's legal-posture lines, produced by the shared templates in
 * @repairmcp/state-law so the states cannot drift from each other. The
 * strings are byte-identical to the pre-extraction originals.
 */
import {
  EDUCATIONAL_CAVEAT,
  makeEmptySearchHint,
  makeLegalAdviceNote,
} from '@repairmcp/state-law';

export { EDUCATIONAL_CAVEAT };

export const LEGAL_ADVICE_NOTE = makeLegalAdviceNote('Washington');

export const EMPTY_SEARCH_HINT = makeEmptySearchHint('Washington');
