import { describe, expect, test } from 'bun:test';
import { RepairMCPServer } from '@repairmcp/core';
import corpusJson from '../data/mt-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/mt-annotations.json' with { type: 'json' };
import { MtAdapter, type MtItem } from '../src/adapter.js';
import { MtCorpus } from '../src/corpus.js';
import { registerMtConnectorTools } from '../src/openai.js';
import { registerMtTools } from '../src/tools.js';

const corpus = new MtCorpus(corpusJson, annotationsJson);
const adapter = new MtAdapter(corpus);

describe('MtAdapter as a SourceAdapter', () => {
  test('search returns items with citations over the shared ranking', async () => {
    const results = await adapter.search({
      text: 'estimating system operations disregarded',
      limit: 5,
      offset: 0,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.item.id === 'mca:33-18-224')).toBe(true);
  });

  test('getById round-trips both codes and rejects junk', async () => {
    expect((await adapter.getById('mca:33-18-201'))?.metadata.record.cite).toBe('33-18-201');
    expect((await adapter.getById('ARM 23.19.203'))?.metadata.record.cite).toBe('23.19.203');
    expect(await adapter.getById('wac:284-30-330')).toBeNull();
  });

  test('listRecent orders ARM rules by effective date (MCA has none)', async () => {
    const items = await adapter.listRecent({ limit: 5 });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.metadata.record.code).toBe('ARM');
  });

  test('all six tools register on a real server without name collisions', () => {
    const server = new RepairMCPServer<MtItem>(adapter, { name: 'test-mt', version: '0.0.0' });
    expect(() => {
      registerMtTools(server, corpus);
      registerMtConnectorTools(server, adapter, corpus);
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
  registerMtConnectorTools(fakeServer as unknown as RepairMCPServer<MtItem>, adapter, corpus);

  test('search carries the corpus freshness fields', async () => {
    const { structuredContent: payload } = await handlers.get('search')!({
      query: 'wrongful discharge good cause',
    });
    expect(payload.corpusCurrentThrough).toBe(corpus.meta.capturedAt);
    const results = payload.results as Array<Record<string, string>>;
    expect(results.length).toBeGreaterThan(0);
  });

  test('fetch returns the verbatim text with citation and the Montana legal note', async () => {
    const { structuredContent: payload } = await handlers.get('fetch')!({ id: 'mca:33-18-224' });
    expect(payload.text as string).toContain('unilaterally disregard a repair operation');
    expect(payload.text as string).toContain('MCA 33-18-224, 2025 edition');
    expect(payload.text as string).toContain('This quotes Montana law');
    expect((payload.metadata as Record<string, unknown>).found).toBe(true);
  });

  test('a fetch miss returns the full shape with found=false', async () => {
    const { structuredContent: payload } = await handlers.get('fetch')!({ id: 'mca:99-99-999' });
    expect(payload.text).toBe('');
    expect((payload.metadata as Record<string, unknown>).found).toBe(false);
  });
});
