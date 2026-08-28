import { describe, expect, test } from 'bun:test';
import { RepairMCPServer } from '@repairmcp/core';
import corpusJson from '../data/wa-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/wa-annotations.json' with { type: 'json' };
import { WaAdapter, type WaItem } from '../src/adapter.js';
import { WaCorpus } from '../src/corpus.js';
import { registerWaConnectorTools } from '../src/openai.js';
import { registerWaTools } from '../src/tools.js';

const corpus = new WaCorpus(corpusJson, annotationsJson);
const adapter = new WaAdapter(corpus);

describe('WaAdapter as a SourceAdapter', () => {
  test('search returns items with citations over the shared ranking', async () => {
    const results = await adapter.search({ text: 'deny storage charges', limit: 5, offset: 0 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.item.id).toBe('wac:284-30-394');
    expect(results[0]!.citation.shortForm).toContain('WAC 284-30-394');
    expect(results[0]!.item.url).toContain('cite=284-30-394');
  });

  test('getById round-trips both id forms and rejects junk', async () => {
    const byId = await adapter.getById('wac:284-30-330');
    expect(byId?.metadata.record.cite).toBe('284-30-330');
    const byCite = await adapter.getById('RCW 46.71.025');
    expect(byCite?.metadata.record.cite).toBe('46.71.025');
    expect(await adapter.getById('usc:30122')).toBeNull();
    expect(await adapter.getById('wac:999-99-999')).toBeNull();
  });

  test('listRecent orders by effective date, newest first, dated sections only', async () => {
    const items = await adapter.listRecent({ limit: 10 });
    expect(items.length).toBe(10);
    const dates = items.map((i) => (i.metadata.record.effectiveDate ?? '') as string);
    for (const date of dates) expect(date).not.toBe('');
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  test('formatCitation delegates to the one citation producer', async () => {
    const item = (await adapter.getById('wac:284-30-330'))!;
    expect(adapter.formatCitation(item).shortForm).toBe('WAC 284-30-330, effective 10/30/2016');
  });

  test('refresh is an honest no-op', async () => {
    const result = await adapter.refresh();
    expect(result.scanned).toBe(0);
    expect(result.added).toBe(0);
  });

  test('all six tools register on a real server without name collisions', () => {
    const server = new RepairMCPServer<WaItem>(adapter, { name: 'test-wa', version: '0.0.0' });
    expect(() => {
      registerWaTools(server, corpus);
      registerWaConnectorTools(server, adapter, corpus);
    }).not.toThrow();
  });
});

describe('connector tools (pure corpus, freshness passed)', () => {
  type Handler = (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent: Record<string, unknown>;
  }>;
  const handlers = new Map<string, Handler>();
  const fakeServer = {
    registerCustomTool(register: (s: unknown) => void) {
      register({
        registerTool: (name: string, _def: unknown, h: Handler) => handlers.set(name, h),
      });
      return fakeServer;
    },
  };
  registerWaConnectorTools(
    fakeServer as unknown as RepairMCPServer<WaItem>,
    adapter,
    corpus,
  );

  test('search carries the corpus freshness fields — the deliberate opposite of NHTSA', async () => {
    const { structuredContent: payload } = await handlers.get('search')!({
      query: 'written estimate required',
    });
    expect(payload.corpusCurrentThrough).toBe(corpus.meta.capturedAt);
    expect(payload.corpusSyncedAt).toBe(corpus.meta.capturedAt);
    const results = payload.results as Array<Record<string, string>>;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.url).toContain('app.leg.wa.gov');
  });

  test('fetch returns the verbatim text with citation and the legal note', async () => {
    const { structuredContent: payload } = await handlers.get('fetch')!({
      id: 'wac:284-30-330',
    });
    expect(payload.text as string).toContain(
      'Misrepresenting pertinent facts or insurance policy provisions.',
    );
    expect(payload.text as string).toContain('WAC 284-30-330, effective 10/30/2016');
    expect(payload.text as string).toContain('not legal advice');
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.found).toBe(true);
    expect(metadata.citation).toBe('WAC 284-30-330, effective 10/30/2016');
    expect(metadata.corpusCurrentThrough).toBe(corpus.meta.capturedAt);
  });

  test('a fetch miss returns the full shape with found=false, never an error', async () => {
    const { structuredContent: payload } = await handlers.get('fetch')!({ id: 'wac:999-99-999' });
    expect(payload.text).toBe('');
    expect((payload.metadata as Record<string, unknown>).found).toBe(false);
  });
});
