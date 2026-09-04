// Adapter contract
export type {
  BaseItem,
  SearchQuery,
  SearchResult,
  ListRecentOpts,
  RefreshResult,
} from './adapter/types.js';
export { SearchQuerySchema } from './adapter/types.js';
export type { SourceAdapter } from './adapter/source-adapter.js';

// Corpus freshness — what a source knows about its own currency
export type { CorpusFreshness, FreshnessPayload } from './corpus/freshness.js';
export {
  beyondCutoffNote,
  freshnessFields,
  freshnessSentence,
  impliesRecency,
  recencyNote,
  sinceIsBeyondCorpus,
  withFreshness,
} from './corpus/freshness.js';

// Citation
export type { Citation } from './citation/schema.js';
export type { CitationInput } from './citation/formatter.js';
export { buildCitation, fmtDateUtc } from './citation/formatter.js';

// Server + tool builders
export type {
  RepairMCPServerOpts,
  RegisterStandardToolsOpts,
  StandardToolName,
} from './server/mcp-server.js';
export { RepairMCPServer } from './server/mcp-server.js';
export type { ToolRegistrar, BuildToolOpts } from './server/tool-builder.js';
export {
  buildFindSupportingTool,
  buildGetByIdTool,
  buildListRecentTool,
  buildSearchTool,
} from './server/tool-builder.js';

// MCP usage telemetry (Analytics Engine, platform-structural)
export type {
  AnalyticsDataPoint,
  AnalyticsEngineLike,
  McpRequestLike,
  McpUsageEvent,
  McpUsageEventKind,
} from './server/usage.js';
export { parseMcpUsage, recordMcpUsage } from './server/usage.js';

// OpenAI / ChatGPT connector contract (search + fetch)
export type {
  ConnectorDocument,
  BuildOpenAiToolOpts,
} from './server/openai-tools.js';
export {
  buildOpenAiSearchTool,
  buildOpenAiFetchTool,
} from './server/openai-tools.js';
