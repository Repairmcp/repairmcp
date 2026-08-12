/**
 * The corpus cutoff, and the guarantee that both servers state the same one.
 *
 * The parity test here is the one that matters. `DEGAdapter` derives its dates
 * from the JSON it loaded; `D1DEGAdapter` reads them out of a table written at
 * import time. Those are different code paths over different storage, and if
 * they ever disagree, a shop asking the same question of Claude and of ChatGPT
 * is told two different things about how current the answer is — which is the
 * failure this whole feature exists to prevent, reintroduced one layer down.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEGAdapter } from '../src/adapter';
import { D1DEGAdapter } from '../src/d1/adapter';
import { deriveCorpusMeta } from '../src/freshness';
import { DEGInquirySchema, type DEGInquiry } from '../src/schema';
import {
  buildDegFindSupportingTool,
  buildDegGetInquiryTool,
  buildDegListRecentTool,
  buildDegSearchInquiriesTool,
} from '../src/tools';
import { makeFakeD1, type FakeD1 } from './helpers/d1-fake';

const SAMPLE_PATH = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'apps',
  'deg-server',
  'data',
  'sample-inquiries.json',
);

const corpus: DEGInquiry[] = existsSync(SAMPLE_PATH)
  ? DEGInquirySchema.array().parse(JSON.parse(readFileSync(SAMPLE_PATH, 'utf-8')))
  : [];

/** Minimal valid inquiry; each test overrides only the fields it is about. */
function inquiry(over: Partial<DEGInquiry> & { id: string }): DEGInquiry {
  return {
    title: 'Welded Panel Operations',
    url: `https://degweb.org/inquiries/${over.id}/`,
    lastUpdated: new Date('2020-01-01T00:00:00Z'),
    metadata: {},
    inquiryNumber: over.id,
    ip: 'CCC',
    status: 'resolved',
    submittedAt: new Date('2020-01-01T00:00:00Z'),
    ...over,
  } as DEGInquiry;
}

describe('deriveCorpusMeta', () => {
  test('currentThrough is the newest effective date, not the newest submission', () => {
    // The record submitted last was never resolved; the record resolved last was
    // submitted earlier. The cutoff has to follow COALESCE(resolved, submitted) —
    // the same expression the D1 index and the find_supporting tie-break use.
    const meta = deriveCorpusMeta([
      inquiry({
        id: '1',
        submittedAt: new Date('2026-01-05T00:00:00Z'),
        resolvedAt: new Date('2026-07-31T00:00:00Z'),
        metadata: { lastSeenAt: '2026-08-02T18:56:29.467Z' },
      }),
      inquiry({
        id: '2',
        submittedAt: new Date('2026-06-01T00:00:00Z'),
        metadata: { lastSeenAt: '2026-08-02T18:56:29.467Z' },
      }),
    ]);
    expect(meta?.currentThrough).toBe('2026-07-31');
  });

  test('syncedAt is the index sighting, and outranks the body fetch', () => {
    // bodyFetchedAt runs a day later than the sync that produced it on the real
    // corpus. Taking the max across keys would claim a day more currency than we
    // have, which is the exact overstatement this module exists to stop.
    const meta = deriveCorpusMeta([
      inquiry({
        id: '1',
        metadata: {
          lastSeenAt: '2026-08-02T18:56:29.467Z',
          bodyFetchedAt: '2026-08-03T00:05:30.320Z',
        },
      }),
    ]);
    expect(meta?.syncedAt).toBe('2026-08-02');
  });

  test('falls back to scrapedAt when no record carries lastSeenAt', () => {
    // The sample corpus is written by the older scraper, which records scrapedAt.
    const meta = deriveCorpusMeta([
      inquiry({ id: '1', metadata: { scrapedAt: '2026-05-06T23:40:52.002Z' } }),
    ]);
    expect(meta?.syncedAt).toBe('2026-05-06');
  });

  test('recordCount is the corpus size', () => {
    const meta = deriveCorpusMeta([
      inquiry({ id: '1', metadata: { lastSeenAt: '2026-08-02T00:00:00Z' } }),
      inquiry({ id: '2', metadata: { lastSeenAt: '2026-08-02T00:00:00Z' } }),
    ]);
    expect(meta?.recordCount).toBe(2);
  });

  test('an empty corpus claims nothing', () => {
    expect(deriveCorpusMeta([])).toBeNull();
  });

  test('a corpus with no crawl timestamp claims nothing, rather than half of it', () => {
    // Half a currency claim reads to a model exactly as confidently as a whole
    // one. Silence is the honest degradation.
    expect(deriveCorpusMeta([inquiry({ id: '1', metadata: {} })])).toBeNull();
  });

  test('a malformed timestamp is ignored rather than propagated', () => {
    expect(deriveCorpusMeta([inquiry({ id: '1', metadata: { lastSeenAt: 'soon' } })])).toBeNull();
    expect(deriveCorpusMeta([inquiry({ id: '1', metadata: { lastSeenAt: 42 } })])).toBeNull();
  });
});

describe('the real sample corpus', () => {
  test('derives a complete, well-formed freshness claim', () => {
    if (corpus.length === 0) return;
    const meta = deriveCorpusMeta(corpus);
    expect(meta).not.toBeNull();
    expect(meta!.currentThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta!.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta!.recordCount).toBe(corpus.length);
    // The corpus cannot have been synced before its newest record existed.
    expect(meta!.syncedAt >= meta!.currentThrough).toBe(true);
  });
});

describe('local / remote parity', () => {
  let fake: FakeD1;
  let d1: D1DEGAdapter;
  let local: DEGAdapter;

  beforeAll(() => {
    fake = makeFakeD1(corpus);
    d1 = new D1DEGAdapter(fake);
    local = new DEGAdapter(corpus);
  });

  afterAll(() => {
    fake.close();
  });

  test('both adapters report exactly the same cutoff', async () => {
    if (corpus.length === 0) return;
    expect(await d1.corpusMeta()).toEqual(await local.corpusMeta());
  });

  test('the D1 answer round-trips through the real 0004 DDL', async () => {
    if (corpus.length === 0) return;
    const meta = await d1.corpusMeta();
    expect(meta).toEqual(deriveCorpusMeta(corpus));
  });
});

describe('degradation', () => {
  test('a database without the freshness migrations answers null, not an error', async () => {
    // The deploy order is migrations-then-code, but the reverse must not take
    // the server down: a missing metadata row is worth a silence, not an outage
    // on every tool call.
    const bare = makeFakeD1(corpus, { meta: false });
    try {
      const adapter = new D1DEGAdapter(bare);
      expect(await adapter.corpusMeta()).toBeNull();
      // And the rest of the adapter still works.
      expect(await adapter.count()).toBe(corpus.length);
    } finally {
      bare.close();
    }
  });

  test('an in-memory adapter over an empty corpus answers null', async () => {
    expect(await new DEGAdapter([]).corpusMeta()).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// What the four deg_* tools actually say
// ──────────────────────────────────────────────────────────────────────

interface CapturedTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<{ structuredContent: Record<string, unknown> }>;
}

/**
 * Capture what a registrar registers, without standing up an MCP server.
 *
 * A registrar only ever calls `registerTool(name, config, handler)`, so a
 * three-property fake is enough to read the description and drive the handler.
 * The SDK's own `outputSchema` validation is exercised in
 * `packages/core/test/openai-tools.test.ts` over a real round trip; what is
 * being checked here is DEG's wiring, not the protocol.
 */
function capture(register: (server: never) => void): CapturedTool[] {
  const tools: CapturedTool[] = [];
  const fakeServer = {
    registerTool(name: string, config: { description: string }, handler: CapturedTool['handler']) {
      tools.push({ name, description: config.description, handler });
    },
  };
  register(fakeServer as never);
  return tools;
}

async function toolsFor(adapter: DEGAdapter | D1DEGAdapter): Promise<Map<string, CapturedTool>> {
  const freshness = (await adapter.corpusMeta()) ?? undefined;
  const captured = [
    ...capture(buildDegSearchInquiriesTool(adapter, freshness)),
    ...capture(buildDegGetInquiryTool(adapter, freshness)),
    ...capture(buildDegListRecentTool(adapter, freshness)),
    ...capture(buildDegFindSupportingTool(adapter, freshness)),
  ];
  return new Map(captured.map((t) => [t.name, t]));
}

describe('deg tools state the cutoff', () => {
  let tools: Map<string, CapturedTool>;
  let meta: NonNullable<ReturnType<typeof deriveCorpusMeta>>;

  beforeAll(async () => {
    tools = await toolsFor(new DEGAdapter(corpus));
    meta = deriveCorpusMeta(corpus)!;
  });

  test('all four descriptions carry the freshness sentence', () => {
    if (corpus.length === 0) return;
    expect([...tools.keys()].sort()).toEqual([
      'deg_find_supporting',
      'deg_get_inquiry',
      'deg_list_recent',
      'deg_search_inquiries',
    ]);
    for (const tool of tools.values()) {
      expect(tool.description).toContain('CORPUS FRESHNESS');
      expect(tool.description).toContain(meta.currentThrough);
      // The shop-floor description is still there — freshness appends, it does
      // not replace. These tool descriptions are the AI's routing signal.
      expect(tool.description.length).toBeGreaterThan(200);
    }
  });

  test('deg_list_recent always carries the note', async () => {
    if (corpus.length === 0) return;
    const res = await tools.get('deg_list_recent')!.handler({ limit: 3 });
    expect(res.structuredContent['corpusCurrentThrough']).toBe(meta.currentThrough);
    expect(res.structuredContent['corpusNote']).toContain(meta.currentThrough);
  });

  test('a since past the cutoff earns the stronger note', async () => {
    if (corpus.length === 0) return;
    const beyond = new Date(`${meta.currentThrough}T00:00:00Z`);
    beyond.setUTCFullYear(beyond.getUTCFullYear() + 1);
    const res = await tools
      .get('deg_list_recent')!
      .handler({ since: beyond.toISOString(), limit: 3 });
    // An empty result here reads as "nothing happened" unless the payload says
    // otherwise. This is the wording that says otherwise.
    expect(res.structuredContent['corpusNote']).toContain('does not mean no inquiries');
  });

  test('deg_search_inquiries notes recency queries only', async () => {
    if (corpus.length === 0) return;
    const search = tools.get('deg_search_inquiries')!;

    const recent = await search.handler({ text: 'any recent rulings on blend time', limit: 3 });
    expect(recent.structuredContent['corpusNote']).toContain(meta.currentThrough);

    const ordinary = await search.handler({ text: 'weld-thru primer', limit: 3 });
    expect(ordinary.structuredContent['corpusNote']).toBeUndefined();
    // The dates ride along regardless — only the note is conditional.
    expect(ordinary.structuredContent['corpusCurrentThrough']).toBe(meta.currentThrough);
  });

  test('deg_get_inquiry carries the cutoff, found or not', async () => {
    if (corpus.length === 0) return;
    const get = tools.get('deg_get_inquiry')!;
    const hit = await get.handler({ id: corpus[0]!.id });
    expect(hit.structuredContent['found']).toBe(true);
    expect(hit.structuredContent['corpusCurrentThrough']).toBe(meta.currentThrough);

    const miss = await get.handler({ id: 'no-such-inquiry' });
    expect(miss.structuredContent['found']).toBe(false);
    expect(miss.structuredContent['corpusCurrentThrough']).toBe(meta.currentThrough);
  });

  test('deg_find_supporting carries the cutoff alongside the confidence score', async () => {
    if (corpus.length === 0) return;
    const res = await tools
      .get('deg_find_supporting')!
      .handler({ lineItemText: 'blend two-tone refinish', limit: 3 });
    expect(res.structuredContent['corpusCurrentThrough']).toBe(meta.currentThrough);
    // A confidence number next to a stale corpus is the exact pairing that
    // produced the wrong currency claim, so both must be present together.
    expect((res.structuredContent['results'] as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('local and remote tools quote the same cutoff', () => {
  let fake: FakeD1;

  beforeAll(() => {
    fake = makeFakeD1(corpus);
  });

  afterAll(() => {
    fake.close();
  });

  test('every description and every payload agrees across the two adapters', async () => {
    if (corpus.length === 0) return;
    const localTools = await toolsFor(new DEGAdapter(corpus));
    const d1Tools = await toolsFor(new D1DEGAdapter(fake));

    for (const [name, localTool] of localTools) {
      const d1Tool = d1Tools.get(name)!;
      expect(d1Tool.description).toBe(localTool.description);
    }

    const localSearch = await localTools.get('deg_search_inquiries')!.handler({
      text: 'latest blend time rulings',
      limit: 3,
    });
    const d1Search = await d1Tools.get('deg_search_inquiries')!.handler({
      text: 'latest blend time rulings',
      limit: 3,
    });
    expect(d1Search.structuredContent['corpusCurrentThrough']).toBe(
      localSearch.structuredContent['corpusCurrentThrough'],
    );
    expect(d1Search.structuredContent['corpusNote']).toBe(
      localSearch.structuredContent['corpusNote'],
    );
  });
});
