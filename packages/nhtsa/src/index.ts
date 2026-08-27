// Client + upstream boundary
export { NhtsaApiError, NhtsaClient } from './client.js';
export type { NhtsaClientOptions, VehicleLookupInput } from './client.js';
export * from './urls.js';
export { isVinLike, redactVin, redactVinLikeText, VIN_LIKE_PATTERN } from './redact.js';

// Schemas
export * from './schema.js';
export * from './laws/schema.js';

// Law corpus
export { LawCorpus } from './laws/adapter.js';
export { LawParseError, parseChapterHtml, olrcSectionUrl } from './laws/parse.js';
export type { ParsedChapter } from './laws/parse.js';
export { searchLawSections } from './laws/search.js';
export type { LawSearchHit } from './laws/search.js';
export { LEGAL_ADVICE_NOTE } from './laws/notes.js';

// Identity + citations
export {
  NHTSA_IDENTITY,
  complaintId,
  formatComplaintCitation,
  formatLawCitation,
  formatRecallCitation,
  lawId,
  parseNhtsaId,
  recallId,
} from './identity.js';
export type { NhtsaItemKind } from './identity.js';

// Live-source conventions
export { LIVE_SENTENCE, callNhtsa, nowIso, unavailablePayload } from './live.js';
export type { NhtsaUnavailablePayload } from './live.js';

// Relevance scoring
export { scoreComplaintRelevance, textContainsSearchTerm } from './relevance.js';
export type { ComplaintRelevance, ComplaintRelevanceOpts } from './relevance.js';

// Adapter + connector + tools
export { NhtsaLiveAdapter } from './adapter.js';
export type { NhtsaItem } from './adapter.js';
export { parseVehicleQuery } from './parse-query.js';
export type { ParsedVehicleQuery } from './parse-query.js';
export { nhtsaItemToDocument, registerNhtsaConnectorTools } from './openai.js';
export { registerNhtsaTools } from './tools.js';
export { resolveVehicle } from './resolve-vehicle.js';
