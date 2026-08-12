export * from './schema.js';
export * from './scraper.js';
export { DEGAdapter } from './adapter.js';
export { deriveCorpusMeta } from './freshness.js';
export type { DegSource, FindSupportingOpts, FindSupportingHit } from './ports.js';
export {
  buildDegSearchInquiriesTool,
  buildDegGetInquiryTool,
  buildDegListRecentTool,
  buildDegFindSupportingTool,
  registerDegTools,
} from './tools.js';
export {
  tokenize,
  bigramsOf,
  detectIp,
  scoreInquiry,
  snippetForQuery,
  type ScoreInquiryOpts,
  type ScoringBreakdown,
} from './scoring.js';
