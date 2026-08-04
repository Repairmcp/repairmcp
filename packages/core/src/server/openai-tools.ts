/**
 * OpenAI connector tools: `search` and `fetch`.
 *
 * These implement the contract ChatGPT expects of a remote MCP server used as a
 * custom connector or deep-research source. It is a strict compatibility
 * contract, not a convention — the rules encoded here come from OpenAI's MCP
 * documentation and each one is load-bearing:
 *
 *   - The tools are named exactly `search` and `fetch`. Not `${sourceId}_search`.
 *     ChatGPT looks for these two names.
 *   - Each takes exactly one string argument: `query` for search, `id` for fetch.
 *     Not an object, not two arguments, not an optional second one.
 *   - Each declares an output schema.
 *   - Each returns the payload BOTH as `structuredContent` and as a JSON-encoded
 *     string in `content[0].text`. Returning only one of the two is the most
 *     common way a connector silently returns nothing.
 *   - `url` must be a non-empty string. ChatGPT creates citation metadata only
 *     when it is, and a connector that cites nothing is a connector that gets
 *     removed.
 *
 * Nothing here is DEG-specific: any `SourceAdapter` can expose a ChatGPT
 * connector surface. What core cannot know is how to flatten a domain record
 * into one blob of text, so that arrives as the `toDocument` mapper.
 */
import { z } from 'zod';
import type { SourceAdapter } from '../adapter/source-adapter.js';
import type { BaseItem } from '../adapter/types.js';
import type { BuildToolOpts, ToolRegistrar } from './tool-builder.js';

/** What a vertical must supply to turn one of its items into a connector document. */
export interface ConnectorDocument {
  /** Full text of the record, for `fetch`. */
  text: string;
  /** Free-form key/value bag surfaced to ChatGPT alongside the text. */
  metadata?: Record<string, unknown>;
}

export interface BuildOpenAiToolOpts<T extends BaseItem> extends BuildToolOpts {
  /** Flatten an item into connector text + metadata. */
  toDocument: (item: T) => ConnectorDocument;
  /**
   * Short excerpt for a `search` hit. Defaults to the first 200 characters of
   * `toDocument(item).text`.
   */
  toSnippet?: (item: T) => string;
}

const DEFAULT_SNIPPET_CHARS = 200;

function defaultSnippet(text: string): string {
  const head = text.slice(0, DEFAULT_SNIPPET_CHARS).trim();
  return head.length < text.trim().length ? `${head}…` : head;
}

/**
 * Both tools return this pair. OpenAI's doc is explicit that the same value
 * must appear in both places, so there is exactly one function that builds it.
 */
function connectorResult(payload: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

// ─────────────────────────────────────────────────────────────────────
// search
// ─────────────────────────────────────────────────────────────────────

const SearchResultShape = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
});

const SearchOutputShape = { results: z.array(SearchResultShape) };

/**
 * `search` — one string in, `{results: [{id, title, text, url}]}` out.
 *
 * OpenAI's doc enumerates `id`, `title`, and `url`. `text` is an additive
 * snippet, declared in our own output schema; it is what OpenAI's deep-research
 * cookbook example returns, and it lets ChatGPT triage hits without spending a
 * `fetch` round trip on each one. If a connector ever rejects results over it,
 * dropping the field here and from `SearchResultShape` is the whole fix.
 */
export function buildOpenAiSearchTool<T extends BaseItem>(
  adapter: SourceAdapter<T>,
  opts: BuildOpenAiToolOpts<T>,
): ToolRegistrar {
  const defaultDescription = `Search ${adapter.sourceName} (${adapter.sourceShortName}) ${adapter.itemNounPlural} and return ranked matches.

USE THIS WHEN: the user asks about anything ${adapter.sourceShortName} covers and you need candidate ${adapter.itemNounPlural} to read.

INPUT: query — a single free-text search string.

OUTPUT: results — an array of { id, title, text, url }. text is a short excerpt, not the full record. Call fetch with an id to read one in full before quoting it.`;

  return (server) => {
    server.registerTool(
      'search',
      {
        title: opts.title ?? `Search ${adapter.sourceShortName}`,
        description: opts.description ?? defaultDescription,
        inputSchema: {
          query: z.string().describe(`Search query for ${adapter.sourceName}.`),
        },
        outputSchema: SearchOutputShape,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query }) => {
        const hits = await adapter.search({ text: query, limit: 10, offset: 0 });
        const results = hits.map((hit) => {
          const doc = opts.toDocument(hit.item);
          return {
            id: hit.item.id,
            title: hit.item.title,
            text: opts.toSnippet?.(hit.item) ?? hit.snippet ?? defaultSnippet(doc.text),
            url: hit.item.url,
          };
        });
        return connectorResult({ results });
      },
    );
  };
}

// ─────────────────────────────────────────────────────────────────────
// fetch
// ─────────────────────────────────────────────────────────────────────

const FetchOutputShape = {
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.record(z.string(), z.unknown()),
};

/**
 * `fetch` — one string in, `{id, title, text, url, metadata}` out.
 *
 * A miss returns the same shape with empty strings and `metadata.found: false`
 * rather than an MCP error. The shape is a contract: a connector that answers a
 * bad id with a protocol error tends to abandon the whole turn, where one that
 * answers with an empty document lets the model try a different id.
 */
export function buildOpenAiFetchTool<T extends BaseItem>(
  adapter: SourceAdapter<T>,
  opts: BuildOpenAiToolOpts<T>,
): ToolRegistrar {
  const defaultDescription = `Fetch the full text of one ${adapter.sourceName} (${adapter.sourceShortName}) ${adapter.itemNoun} by id.

USE THIS WHEN: a search result looks relevant and you need the complete record before quoting or citing it.

INPUT: id — the ${adapter.itemNoun} id string, taken from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the full record. url is the canonical source page — cite it.`;

  return (server) => {
    server.registerTool(
      'fetch',
      {
        title: opts.title ?? `Fetch ${adapter.sourceShortName} ${adapter.itemNoun}`,
        description: opts.description ?? defaultDescription,
        inputSchema: {
          id: z.string().describe(`The ${adapter.itemNoun} id to retrieve.`),
        },
        outputSchema: FetchOutputShape,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ id }) => {
        const item = await adapter.getById(id);
        if (!item) {
          return connectorResult({
            id,
            title: '',
            text: '',
            url: '',
            metadata: { found: false, source: adapter.sourceShortName },
          });
        }
        const doc = opts.toDocument(item);
        return connectorResult({
          id: item.id,
          title: item.title,
          text: doc.text,
          url: item.url,
          metadata: { found: true, source: adapter.sourceShortName, ...doc.metadata },
        });
      },
    );
  };
}
