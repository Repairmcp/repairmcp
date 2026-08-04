/**
 * The ChatGPT connector contract, verified over a real MCP round trip.
 *
 * These assertions are not style preferences — each one is a rule from OpenAI's
 * MCP documentation, and breaking any of them makes the connector silently
 * return nothing rather than fail loudly. The round trip goes through
 * `InMemoryTransport`, a real `Client`, and a real `McpServer`, so the SDK's
 * own `outputSchema` validation runs. Calling the handler directly would skip
 * exactly the layer most likely to reject a malformed payload.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RepairMCPServer } from '../src/server/mcp-server.js';
import { buildOpenAiFetchTool, buildOpenAiSearchTool } from '../src/server/openai-tools.js';
import type { SourceAdapter } from '../src/adapter/source-adapter.js';
import type { BaseItem, ListRecentOpts, SearchQuery, SearchResult } from '../src/adapter/types.js';
import { buildCitation } from '../src/citation/formatter.js';

interface Doc extends BaseItem {
  content: string;
}

const DOCS: Doc[] = [
  {
    id: '101',
    title: 'Blend time on adjacent panels',
    url: 'https://example.org/items/101/',
    lastUpdated: new Date('2025-03-14T00:00:00Z'),
    metadata: {},
    content: 'Blend refinish time is not included in the base refinish operation.',
  },
  {
    id: '102',
    title: 'Weld-thru primer',
    url: 'https://example.org/items/102/',
    lastUpdated: new Date('2024-11-02T00:00:00Z'),
    metadata: {},
    content: 'x'.repeat(500),
  },
];

class FakeAdapter implements SourceAdapter<Doc> {
  readonly sourceId = 'demo';
  readonly sourceName = 'Demo Source';
  readonly sourceShortName = 'DEMO';
  readonly sourceUrl = 'https://example.org';
  readonly description = 'A source used only by tests.';
  readonly itemNoun = 'item';
  readonly itemNounPlural = 'items';

  async search(query: SearchQuery): Promise<SearchResult<Doc>[]> {
    const text = (query.text ?? '').toLowerCase();
    return DOCS.filter((d) => d.content.toLowerCase().includes(text) || text === '').map((d) => ({
      item: d,
      score: 1,
      citation: this.formatCitation(d),
    }));
  }

  async getById(id: string): Promise<Doc | null> {
    return DOCS.find((d) => d.id === id) ?? null;
  }

  async listRecent(_opts: ListRecentOpts): Promise<Doc[]> {
    return DOCS;
  }

  formatCitation(item: Doc) {
    return buildCitation({
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      sourceShortName: this.sourceShortName,
      itemId: item.id,
      url: item.url,
      itemNoun: this.itemNoun,
      publishedAt: item.lastUpdated,
    });
  }

  async refresh() {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }
}

const adapter = new FakeAdapter();
let client: Client;

beforeAll(async () => {
  const server = new RepairMCPServer(adapter, { name: 'test', version: '0.0.0' });
  server.registerCustomTool(
    buildOpenAiSearchTool(adapter, {
      toDocument: (d) => ({ text: d.content, metadata: { kind: 'demo' } }),
    }),
  );
  server.registerCustomTool(
    buildOpenAiFetchTool(adapter, {
      toDocument: (d) => ({ text: d.content, metadata: { kind: 'demo' } }),
    }),
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

// ──────────────────────────────────────────────────────────────────────
// Tool declaration
// ──────────────────────────────────────────────────────────────────────

describe('tool declaration', () => {
  test('the tools are named exactly search and fetch', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['fetch', 'search']);
  });

  test('search takes exactly one string argument named query', async () => {
    const { tools } = await client.listTools();
    const search = tools.find((t) => t.name === 'search')!;
    const schema = search.inputSchema as { properties?: Record<string, { type?: string }>; required?: string[] };
    expect(Object.keys(schema.properties ?? {})).toEqual(['query']);
    expect(schema.properties!['query']!.type).toBe('string');
    expect(schema.required).toEqual(['query']);
  });

  test('fetch takes exactly one string argument named id', async () => {
    const { tools } = await client.listTools();
    const fetchTool = tools.find((t) => t.name === 'fetch')!;
    const schema = fetchTool.inputSchema as { properties?: Record<string, { type?: string }>; required?: string[] };
    expect(Object.keys(schema.properties ?? {})).toEqual(['id']);
    expect(schema.properties!['id']!.type).toBe('string');
    expect(schema.required).toEqual(['id']);
  });

  test('both declare an output schema', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.outputSchema).toBeDefined();
    }
  });

  test('both are marked read-only', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// search results
// ──────────────────────────────────────────────────────────────────────

describe('search', () => {
  test('returns {results: [{id, title, text, url}]} and nothing else', async () => {
    const res = await client.callTool({ name: 'search', arguments: { query: 'blend' } });
    const payload = res.structuredContent as { results: Array<Record<string, unknown>> };
    expect(Array.isArray(payload.results)).toBe(true);
    expect(payload.results.length).toBeGreaterThan(0);
    for (const hit of payload.results) {
      expect(Object.keys(hit).sort()).toEqual(['id', 'text', 'title', 'url']);
    }
  });

  test('url is a non-empty string on every hit — ChatGPT cites nothing without it', async () => {
    const res = await client.callTool({ name: 'search', arguments: { query: 'blend' } });
    const payload = res.structuredContent as { results: Array<{ url: string }> };
    for (const hit of payload.results) {
      expect(typeof hit.url).toBe('string');
      expect(hit.url.length).toBeGreaterThan(0);
    }
  });

  test('content[0].text parses to exactly structuredContent', async () => {
    const res = await client.callTool({ name: 'search', arguments: { query: 'blend' } });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0]!.type).toBe('text');
    expect(JSON.parse(content[0]!.text)).toEqual(res.structuredContent);
  });

  test('long content is truncated into a snippet, not returned whole', async () => {
    const res = await client.callTool({ name: 'search', arguments: { query: '' } });
    const payload = res.structuredContent as { results: Array<{ id: string; text: string }> };
    const long = payload.results.find((r) => r.id === '102')!;
    expect(long.text.length).toBeLessThan(500);
    expect(long.text.endsWith('…')).toBe(true);
  });

  test('a query matching nothing returns an empty array, not an error', async () => {
    const res = await client.callTool({ name: 'search', arguments: { query: 'zzzznomatch' } });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { results: unknown[] }).results).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// fetch results
// ──────────────────────────────────────────────────────────────────────

describe('fetch', () => {
  test('returns {id, title, text, url, metadata} and nothing else', async () => {
    const res = await client.callTool({ name: 'fetch', arguments: { id: '101' } });
    const payload = res.structuredContent as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['id', 'metadata', 'text', 'title', 'url']);
    expect(payload['id']).toBe('101');
    expect(payload['url']).toBe('https://example.org/items/101/');
    expect(payload['text']).toContain('Blend refinish time');
  });

  test('content[0].text parses to exactly structuredContent', async () => {
    const res = await client.callTool({ name: 'fetch', arguments: { id: '101' } });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text)).toEqual(res.structuredContent);
  });

  test('metadata carries the mapper output', async () => {
    const res = await client.callTool({ name: 'fetch', arguments: { id: '101' } });
    const meta = (res.structuredContent as { metadata: Record<string, unknown> }).metadata;
    expect(meta['kind']).toBe('demo');
    expect(meta['found']).toBe(true);
  });

  test('an unknown id keeps the shape rather than raising a protocol error', async () => {
    const res = await client.callTool({ name: 'fetch', arguments: { id: 'nope' } });
    expect(res.isError).toBeFalsy();
    const payload = res.structuredContent as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['id', 'metadata', 'text', 'title', 'url']);
    expect((payload['metadata'] as Record<string, unknown>)['found']).toBe(false);
    expect(payload['text']).toBe('');
  });
});
