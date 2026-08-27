import { describe, expect, test } from 'bun:test';
import { NhtsaClient } from '../src/client';
import { LawCorpus } from '../src/laws/adapter';
import { NhtsaLiveAdapter } from '../src/adapter';
import corpusJson from '../data/uscode-title49-ch301.json';

const laws = new LawCorpus(corpusJson);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Routes NHTSA URLs to canned bodies; unrouted URLs 500. */
function routedClient(routes: Array<[substring: string, body: unknown | 'FAIL']>): NhtsaClient {
  return new NhtsaClient({
    fetchImpl: async (url) => {
      const text = String(url);
      for (const [needle, body] of routes) {
        if (text.includes(needle)) {
          return body === 'FAIL' ? jsonResponse({ error: 'down' }, 503) : jsonResponse(body);
        }
      }
      return jsonResponse({ error: 'unrouted' }, 500);
    },
  });
}

const RECALL_ROW = {
  NHTSACampaignNumber: '21V978000',
  Component: 'POWER TRAIN:DRIVELINE:DRIVESHAFT',
  Summary: 'Driveshaft bolts may loosen and separate.',
  ReportReceivedDate: '16/12/2021',
};

const COMPLAINT_ROW = {
  odiNumber: 11747513,
  components: 'STEERING',
  summary: 'Steering wheel locked up while driving.',
  crash: true,
  dateComplaintFiled: '06/30/2026',
  products: [
    { type: 'Vehicle', productYear: '2020', productMake: 'FORD', productModel: 'TRANSIT' },
  ],
};

describe('NhtsaLiveAdapter.search (the connector surface)', () => {
  test('vehicle query returns recalls at 1.0, scored complaints, contract-shaped hits', async () => {
    const client = routedClient([
      ['/recalls/recallsByVehicle?', { results: [RECALL_ROW] }],
      ['/complaints/complaintsByVehicle?', { results: [COMPLAINT_ROW] }],
    ]);
    const adapter = new NhtsaLiveAdapter(client, laws);

    const hits = await adapter.search({ text: '2020 Ford Transit steering', limit: 10, offset: 0 });

    const recallHit = hits.find((h) => h.item.id === 'recall:21V978000');
    expect(recallHit).toBeDefined();
    expect(recallHit!.score).toBe(1);
    expect(recallHit!.item.title).toContain('21V978000');
    expect(recallHit!.citation.shortForm).toBe('NHTSA Recall 21V978000 (reported 12/16/2021)');

    const complaintHit = hits.find((h) => h.item.id === 'complaint:11747513');
    expect(complaintHit).toBeDefined();
    expect(complaintHit!.score).toBeGreaterThan(0.5); // keyword + category + severity
    expect(complaintHit!.item.lastUpdated.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  test('one live arm down still returns the other arm', async () => {
    const client = routedClient([
      ['/recalls/recallsByVehicle?', 'FAIL'],
      ['/complaints/complaintsByVehicle?', { results: [COMPLAINT_ROW] }],
    ]);
    const adapter = new NhtsaLiveAdapter(client, laws);

    const hits = await adapter.search({ text: '2020 Ford Transit steering', limit: 10, offset: 0 });
    expect(hits.some((h) => h.item.id === 'complaint:11747513')).toBe(true);
    expect(hits.some((h) => h.item.id.startsWith('recall:'))).toBe(false);
  });

  test('both live arms down with no law hits surfaces the outage instead of an empty set', async () => {
    const client = routedClient([
      ['/recalls/recallsByVehicle?', 'FAIL'],
      ['/complaints/complaintsByVehicle?', 'FAIL'],
    ]);
    const adapter = new NhtsaLiveAdapter(client, laws);

    // "zzz" keyword ensures no law section matches either.
    expect(
      adapter.search({ text: '2020 Ford Transit zzzqqq', limit: 10, offset: 0 }),
    ).rejects.toThrow();
  });

  test('a legal question with no vehicle searches the law corpus only — no network', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () => {
        throw new Error('no network expected for a law-only query');
      },
    });
    const adapter = new NhtsaLiveAdapter(client, laws);

    const hits = await adapter.search({
      text: 'make inoperative safety device',
      limit: 5,
      offset: 0,
    });
    expect(hits[0]?.item.id).toBe('law:30122');
    expect(hits[0]?.citation.shortForm).toMatch(/^49 U\.S\.C\. §30122 \(current through P\.L\./);
  });

  test('empty and blank queries return []', async () => {
    const adapter = new NhtsaLiveAdapter(routedClient([]), laws);
    expect(await adapter.search({ text: '', limit: 10, offset: 0 })).toEqual([]);
    expect(await adapter.search({ limit: 10, offset: 0 })).toEqual([]);
  });
});

describe('NhtsaLiveAdapter.getById', () => {
  const client = routedClient([
    ['/recalls/campaignNumber?', { results: [{ ...RECALL_ROW, PotentialNumberofUnitsAffected: 4548 }] }],
    ['/complaints/odinumber?', { results: [COMPLAINT_ROW] }],
    ['/recalls/campaignNumber?campaignNumber=NOPE', { results: [] }],
  ]);
  const adapter = new NhtsaLiveAdapter(client, laws);

  test('routes each prefix to its source', async () => {
    const recall = await adapter.getById('recall:21V978000');
    expect(recall?.metadata.kind).toBe('recall');

    const complaint = await adapter.getById('complaint:11747513');
    expect(complaint?.metadata.kind).toBe('complaint');

    const law = await adapter.getById('law:30122');
    expect(law?.metadata.kind).toBe('law');
    expect(law?.title).toContain('inoperative');
  });

  test('misses and junk return null (connector found:false path)', async () => {
    const emptyClient = routedClient([['/recalls/campaignNumber?', { results: [] }]]);
    const emptyAdapter = new NhtsaLiveAdapter(emptyClient, laws);
    expect(await emptyAdapter.getById('recall:99Z000000')).toBeNull();
    expect(await adapter.getById('law:99999')).toBeNull();
    expect(await adapter.getById('garbage')).toBeNull();
  });
});

describe('interface honesty', () => {
  const adapter = new NhtsaLiveAdapter(routedClient([]), laws);

  test('listRecent is empty and refresh is a no-op — never registered as tools', async () => {
    expect(await adapter.listRecent({})).toEqual([]);
    expect(await adapter.refresh()).toEqual({
      scanned: 0,
      added: 0,
      updated: 0,
      errors: 0,
      durationMs: 0,
    });
  });
});
