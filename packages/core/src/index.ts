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

// Citation
export type { Citation } from './citation/schema.js';
export type { CitationInput } from './citation/formatter.js';
export { buildCitation } from './citation/formatter.js';

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
