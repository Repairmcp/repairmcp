import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { SourceAdapter } from '../adapter/source-adapter.js';
import type {
  BaseItem,
  ListRecentOpts,
  SearchQuery,
  SearchResult,
} from '../adapter/types.js';

/**
 * A function that registers a single tool against an MCP server.
 * Each `buildXTool(adapter)` returns one of these — the base class iterates
 * registrars and calls each with its server instance.
 */
export type ToolRegistrar = (server: McpServer) => void;

/**
 * Optional overrides for the standard tool builders. Verticals (e.g. DEG) use
 * these to ship domain-specific tool descriptions while keeping the core's
 * input schema and handler logic. Tool descriptions are the AI's primary signal
 * for routing — see ARCHITECTURE.md §7.3.
 */
export interface BuildToolOpts {
  /** Override the default tool description. Plain text; no markdown headers. */
  description?: string;
  /** Override the default human-readable title. */
  title?: string;
}

interface SerializedSearchHit {
  id: string;
  title: string;
  url: string;
  score: number;
  snippet?: string;
  citation: ReturnType<SourceAdapter<BaseItem>['formatCitation']>;
}

function serializeSearchResult<T extends BaseItem>(r: SearchResult<T>): SerializedSearchHit {
  return {
    id: r.item.id,
    title: r.item.title,
    url: r.item.url,
    score: r.score,
    snippet: r.snippet,
    citation: r.citation,
  };
}

function jsonContent(obj: unknown): { type: 'text'; text: string } {
  return { type: 'text', text: JSON.stringify(obj, null, 2) };
}

// ─────────────────────────────────────────────────────────────────────
// Standard tool 1 of 4 — search
// ─────────────────────────────────────────────────────────────────────

export function buildSearchTool<T extends BaseItem>(
  adapter: SourceAdapter<T>,
  opts: BuildToolOpts = {},
): ToolRegistrar {
  const name = `${adapter.sourceId}_search_${adapter.itemNounPlural}`;
  const defaultDescription = `Free-text search across ${adapter.sourceName} ${adapter.itemNounPlural}.

USE THIS WHEN:
- The user asks about a topic, operation, or part and you need related ${adapter.itemNounPlural} as evidence.
- You want a ranked list to scan before deciding which ${adapter.itemNoun} to fetch in full.

INPUT: A free-text \`text\` query (the most important field) plus optional \`limit\` and \`offset\` for pagination.

OUTPUT: Ranked array of ${adapter.itemNounPlural} with relevance \`score\` (0–1), short \`snippet\`, and a ready-to-cite \`citation\`. Use \`citation.shortForm\` verbatim when referencing in generated text.`;

  return (server) => {
    server.registerTool(
      name,
      {
        title: opts.title ?? `Search ${adapter.sourceName}`,
        description: opts.description ?? defaultDescription,
        inputSchema: {
          text: z.string().min(1).describe('Free-text query.').optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe('Max results to return (1–50).'),
          offset: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe('Pagination offset.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ text, limit, offset }) => {
        const query: SearchQuery = {
          text,
          limit: limit ?? 10,
          offset: offset ?? 0,
        };
        const results = await adapter.search(query);
        const hits = results.map(serializeSearchResult);
        const payload = { count: hits.length, results: hits };
        return {
          content: [jsonContent(payload)],
          structuredContent: payload,
        };
      },
    );
  };
}

// ─────────────────────────────────────────────────────────────────────
// Standard tool 2 of 4 — get by id
// ─────────────────────────────────────────────────────────────────────

export function buildGetByIdTool<T extends BaseItem>(
  adapter: SourceAdapter<T>,
  opts: BuildToolOpts = {},
): ToolRegistrar {
  const name = `${adapter.sourceId}_get_${adapter.itemNoun}`;
  const defaultDescription = `Fetch a single ${adapter.sourceName} ${adapter.itemNoun} by its ID, with full content and a citation.

USE THIS WHEN:
- A search result looks promising and you need the complete ${adapter.itemNoun} text to cite or quote.
- You already know the ${adapter.itemNoun} ID (e.g. from a previous search or external reference).

INPUT: The ${adapter.itemNoun} \`id\` (string).

OUTPUT: The complete ${adapter.itemNoun} record plus a \`citation\` object. If not found, returns \`{ found: false }\`.`;

  return (server) => {
    server.registerTool(
      name,
      {
        title: opts.title ?? `Get ${adapter.sourceName} ${adapter.itemNoun}`,
        description: opts.description ?? defaultDescription,
        inputSchema: {
          id: z.string().min(1).describe(`The ${adapter.itemNoun} ID.`),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ id }) => {
        const item = await adapter.getById(id);
        if (!item) {
          const payload = { found: false, id };
          return {
            content: [jsonContent(payload)],
            structuredContent: payload,
          };
        }
        const citation = adapter.formatCitation(item);
        const payload = { found: true, item, citation };
        return {
          content: [jsonContent(payload)],
          structuredContent: payload,
        };
      },
    );
  };
}

// ─────────────────────────────────────────────────────────────────────
// Standard tool 3 of 4 — list recent
// ─────────────────────────────────────────────────────────────────────

export function buildListRecentTool<T extends BaseItem>(
  adapter: SourceAdapter<T>,
  opts: BuildToolOpts = {},
): ToolRegistrar {
  const name = `${adapter.sourceId}_list_recent`;
  const defaultDescription = `List the most recent ${adapter.sourceName} ${adapter.itemNounPlural} (newest first).

USE THIS WHEN:
- The user asks "what's new in ${adapter.sourceShortName}" or wants a recency-driven view.
- You're surfacing changes since a known date.

INPUT: Optional \`since\` (ISO 8601 timestamp) and \`limit\`.

OUTPUT: Array of ${adapter.itemNounPlural} sorted newest first, each with its citation.`;

  return (server) => {
    server.registerTool(
      name,
      {
        title: opts.title ?? `Recent ${adapter.sourceName} ${adapter.itemNounPlural}`,
        description: opts.description ?? defaultDescription,
        inputSchema: {
          since: z
            .string()
            .datetime()
            .optional()
            .describe('Only items updated at/after this ISO 8601 timestamp.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe('Max items to return (1–50).'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ since, limit }) => {
        const opts: ListRecentOpts = {};
        if (since) opts.since = new Date(since);
        if (limit !== undefined) opts.limit = limit;
        const items = await adapter.listRecent(opts);
        const payload = {
          count: items.length,
          items: items.map((item) => ({
            item,
            citation: adapter.formatCitation(item),
          })),
        };
        return {
          content: [jsonContent(payload)],
          structuredContent: payload,
        };
      },
    );
  };
}

// ─────────────────────────────────────────────────────────────────────
// Standard tool 4 of 4 — find supporting
// ─────────────────────────────────────────────────────────────────────

/**
 * Baseline implementation: pass the line-item text through `adapter.search` with
 * vehicle filters and rename `score` → `confidence` for the AI's mental model.
 * Verticals with domain-specific scoring (DEG bigram + IP match) should override
 * by registering a custom tool of the same name and skipping this builder.
 */
export function buildFindSupportingTool<T extends BaseItem>(
  adapter: SourceAdapter<T>,
  opts: BuildToolOpts = {},
): ToolRegistrar {
  const name = `${adapter.sourceId}_find_supporting`;
  const defaultDescription = `Find ${adapter.sourceName} ${adapter.itemNounPlural} that support charging or denying a specific labor / line-item operation.

USE THIS WHEN:
- Writing a supplement and you need ${adapter.sourceShortName} citations to justify a line item.
- An insurer denied an operation and you need precedent.
- A line item appears on an estimate and you want to verify whether it's established practice in ${adapter.sourceShortName} resolutions.

INPUT: \`lineItemText\` in plain language (e.g. "R&I rear bumper for refinish on adjacent panel"); optional \`vehicleYear\` / \`vehicleMake\` / \`vehicleModel\` filters.

OUTPUT: Ranked list of supporting ${adapter.itemNounPlural} with \`confidence\` scores (0–1) and ready-to-cite citations. Use \`citation.shortForm\` verbatim when referencing in your response (e.g. "${adapter.sourceShortName} #14732 (3/14/2025)").`;

  return (server) => {
    server.registerTool(
      name,
      {
        title: opts.title ?? `Find supporting ${adapter.sourceName} ${adapter.itemNounPlural}`,
        description: opts.description ?? defaultDescription,
        inputSchema: {
          lineItemText: z
            .string()
            .min(1)
            .describe('Line item text in plain language.'),
          vehicleYear: z.number().int().optional(),
          vehicleMake: z.string().optional(),
          vehicleModel: z.string().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(5)
            .describe('Max supporting items to return (1–20).'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ lineItemText, vehicleYear, vehicleMake, vehicleModel, limit }) => {
        const filters: Record<string, unknown> = {};
        if (vehicleYear !== undefined) filters['vehicleYear'] = vehicleYear;
        if (vehicleMake) filters['vehicleMake'] = vehicleMake;
        if (vehicleModel) filters['vehicleModel'] = vehicleModel;
        const results = await adapter.search({
          text: lineItemText,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
          limit: limit ?? 5,
          offset: 0,
        });
        const hits = results.map((r) => ({
          id: r.item.id,
          title: r.item.title,
          url: r.item.url,
          confidence: r.score,
          snippet: r.snippet,
          citation: r.citation,
        }));
        const payload = { count: hits.length, results: hits };
        return {
          content: [jsonContent(payload)],
          structuredContent: payload,
        };
      },
    );
  };
}
