/**
 * Worker-safe entry point — `@repairmcp/deg/worker`.
 *
 * The root barrel (`./index.js`) re-exports `scraper.ts`, which pulls in
 * cheerio, and `adapter.ts`, which reads the corpus off disk with `node:fs`.
 * Neither belongs in a Cloudflare Worker bundle, and a Worker importing the
 * root barrel would drag both in whether it used them or not.
 *
 * So this file exists to say exactly what the remote server is allowed to see:
 * the schema, the scorer, the tools, and the D1 adapter. Nothing that touches
 * the filesystem, nothing that parses HTML.
 */
export * from './schema.js';
export type { DegSource, FindSupportingOpts, FindSupportingHit } from './ports.js';
export { DEG_IDENTITY, formatDegCitation } from './identity.js';
export { deriveCorpusMeta } from './freshness.js';
export {
  parseFilters,
  inquiryMatchesFilters,
  type DEGFilters,
} from './filters.js';
export {
  SEARCHABLE_FIELDS,
  buildHaystack,
  scoreText,
  coverageScore,
  extractSnippet,
} from './text-match.js';
export {
  tokenize,
  bigramsOf,
  detectIp,
  scoreInquiry,
  compareSupportingHits,
  snippetForQuery,
  type ScoreInquiryOpts,
  type ScoringBreakdown,
} from './scoring.js';
export {
  buildDegSearchInquiriesTool,
  buildDegGetInquiryTool,
  buildDegListRecentTool,
  buildDegFindSupportingTool,
  registerDegTools,
} from './tools.js';
export {
  degInquiryToDocument,
  buildDegConnectorSearchTool,
  buildDegConnectorFetchTool,
  registerDegConnectorTools,
} from './openai.js';
export { D1DEGAdapter, type D1DEGAdapterOpts } from './d1/adapter.js';
export type { D1Like, D1PreparedLike, ResultCache } from './d1/types.js';
export {
  INQUIRY_COLUMNS,
  SELECT_COLUMNS,
  BM25_RANK,
  CORPUS_META_KEYS,
  SELECT_CORPUS_META,
  buildMatchExpression,
  rowToInquiry,
  rowsToCorpusMeta,
  inquiryToRow,
  type CorpusMetaRow,
  type InquiryRow,
} from './d1/sql.js';
