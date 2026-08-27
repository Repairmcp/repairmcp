import { describe, expect, test } from 'bun:test';
import { NhtsaClient } from '../src/client';
import { LawCorpus } from '../src/laws/adapter';
import {
  buildCheckRecallsTool,
  buildDecodeVinTool,
  buildGetLawSectionTool,
  buildGetRecallTool,
  buildSearchComplaintsTool,
  buildSearchSafetyLawTool,
} from '../src/tools';
import corpusJson from '../data/uscode-title49-ch301.json';

const laws = new LawCorpus(corpusJson);

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  structuredContent: Record<string, unknown>;
  content: Array<{ type: 'text'; text: string }>;
}>;

/** Register into a fake server and capture the handler for direct invocation. */
function captureToolHandler(register: (server: unknown) => unknown): ToolHandler {
  let handler: ToolHandler | undefined;
  register({
    registerTool: (_name: string, _def: unknown, h: ToolHandler) => {
      handler = h;
    },
  });
  if (!handler) throw new Error('Expected tool handler to be registered');
  return handler;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function routedClient(routes: Array<[string, unknown | 'FAIL' | 'FAIL_400' | 'THROW']>): NhtsaClient {
  return new NhtsaClient({
    fetchImpl: async (url) => {
      const text = String(url);
      for (const [needle, body] of routes) {
        if (text.includes(needle)) {
          if (body === 'FAIL') return jsonResponse({ error: 'down' }, 503);
          if (body === 'FAIL_400') return jsonResponse({ message: 'Bad Request' }, 400);
          if (body === 'THROW') throw new Error('socket hang up');
          return jsonResponse(body);
        }
      }
      return jsonResponse({ error: 'unrouted' }, 500);
    },
  });
}

const RECALL_ROW = {
  NHTSACampaignNumber: '21V978000',
  Component: 'POWER TRAIN:DRIVELINE:DRIVESHAFT',
  Summary: 'Driveshaft bolts may loosen.',
  ReportReceivedDate: '16/12/2021',
  parkIt: true,
};

const VIN = '1HGCM82633A004352';

const VPIC_ROW = {
  VIN,
  ModelYear: '2003',
  Make: 'HONDA',
  Model: 'Accord',
  BodyClass: 'Coupe',
  ErrorCode: '0',
};

describe('failure honesty — handlers never throw', () => {
  for (const failure of ['FAIL', 'THROW'] as const) {
    test(`upstream ${failure === 'FAIL' ? '503' : 'network error'} returns an unavailable payload`, async () => {
      const handler = captureToolHandler(
        buildCheckRecallsTool(routedClient([['/recalls/recallsByVehicle?', failure]])),
      );
      const result = await handler({ modelYear: 2020, make: 'Ford', model: 'Transit' });
      const payload = result.structuredContent;
      expect(payload['nhtsaStatus']).toBe('unavailable');
      expect(String(payload['note'])).toContain('not an empty result');
      expect(payload['retrievedAt']).toBeDefined();
      expect(payload['vehicle']).toEqual({ modelYear: 2020, make: 'Ford', model: 'Transit' });
    });
  }

  test('timeout returns an unavailable payload, not a rejection', async () => {
    const client = new NhtsaClient({
      timeoutMs: 1,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    });
    const handler = captureToolHandler(buildCheckRecallsTool(client));
    const result = await handler({ modelYear: 2020, make: 'Ford', model: 'Transit' });
    expect(result.structuredContent['nhtsaStatus']).toBe('unavailable');
  });

  test('missing vehicle input names the missing fields without touching the network', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () => {
        throw new Error('no network expected');
      },
    });
    const handler = captureToolHandler(buildCheckRecallsTool(client));
    const result = await handler({ make: 'Ford' });
    expect(String(result.structuredContent['inputError'])).toContain('modelYear');
    expect(String(result.structuredContent['inputError'])).toContain('model');
  });
});

describe('nhtsa_check_recalls', () => {
  test('returns cited recalls with stop-drive flags', async () => {
    const handler = captureToolHandler(
      buildCheckRecallsTool(
        routedClient([['/recalls/recallsByVehicle?', { results: [RECALL_ROW] }]]),
      ),
    );
    const result = await handler({ modelYear: 2020, make: 'Ford', model: 'Transit' });
    const payload = result.structuredContent;
    expect(payload['recallCount']).toBe(1);
    const recall = (payload['recalls'] as Array<Record<string, unknown>>)[0]!;
    expect(recall['parkIt']).toBe(true);
    expect((recall['citation'] as Record<string, unknown>)['shortForm']).toBe(
      'NHTSA Recall 21V978000 (reported 12/16/2021)',
    );
    expect(payload['note']).toBeUndefined();
  });

  test('an HTTP 400 (unrecognized vehicle, verified live) becomes a vocabulary diagnosis, never an outage', async () => {
    const handler = captureToolHandler(
      buildCheckRecallsTool(
        routedClient([
          ['/recalls/recallsByVehicle?', 'FAIL_400'],
          ['/products/vehicle/models?', { results: [{ model: 'TRANSIT' }, { model: 'TRANSIT CONNECT' }] }],
        ]),
      ),
    );
    const result = await handler({ modelYear: 2020, make: 'Ford', model: 'Sprinter' });
    const payload = result.structuredContent;
    expect(payload['nhtsaStatus']).toBeUndefined();
    expect(payload['vehicleNotRecognized']).toBe(true);
    expect(String(payload['note'])).toContain('not an outage');
    expect(payload['knownModels']).toContain('TRANSIT');
  });

  test('a 400 with a near-match model falls back to NHTSA vocabulary and returns records', async () => {
    const calls: string[] = [];
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        const text = String(url);
        calls.push(text);
        if (text.includes('/recalls/recallsByVehicle?')) {
          if (text.includes('model=F-150&')) return jsonResponse({ message: 'Bad Request' }, 400);
          return jsonResponse({ results: [RECALL_ROW] });
        }
        return jsonResponse({ results: [{ model: 'F-150 SUPER CREW' }] });
      },
    });
    const handler = captureToolHandler(buildCheckRecallsTool(client));
    const result = await handler({ modelYear: 2019, make: 'Ford', model: 'F-150' });
    expect(result.structuredContent['recallCount']).toBe(1);
    expect(calls.some((c) => c.includes('issueType=r'))).toBe(true);
    expect(calls.some((c) => c.includes('model=F-150+SUPER+CREW'))).toBe(true);
  });

  test('zero with a model missing from NHTSA vocabulary names the mismatch', async () => {
    const handler = captureToolHandler(
      buildCheckRecallsTool(
        routedClient([
          ['/recalls/recallsByVehicle?', { results: [] }],
          ['/products/vehicle/models?', { results: [{ model: 'TRANSIT' }, { model: 'TRANSIT CONNECT' }] }],
        ]),
      ),
    );
    const result = await handler({ modelYear: 2020, make: 'Ford', model: 'Transit 250' });
    const payload = result.structuredContent;
    expect(payload['recallCount']).toBe(0);
    expect(String(payload['note'])).toContain('not in NHTSA');
    expect(payload['knownModels']).toContain('TRANSIT');
  });

  test('zero with a vocabulary-matching model is a stated true zero', async () => {
    const handler = captureToolHandler(
      buildCheckRecallsTool(
        routedClient([
          ['/recalls/recallsByVehicle?', { results: [] }],
          ['/products/vehicle/models?', { results: [{ model: 'TRANSIT' }] }],
        ]),
      ),
    );
    const result = await handler({ modelYear: 2020, make: 'Ford', model: 'Transit' });
    expect(String(result.structuredContent['note'])).toContain('true zero');
    expect(result.structuredContent['knownModels']).toBeUndefined();
  });
});

describe('nhtsa_search_complaints', () => {
  const COMPLAINTS = {
    results: [
      {
        odiNumber: 1,
        components: 'STEERING',
        summary: 'Steering locked while driving.',
        crash: true,
        numberOfInjuries: 2,
        dateComplaintFiled: '06/30/2026',
      },
      {
        odiNumber: 2,
        components: 'ELECTRICAL SYSTEM',
        summary: 'Radio reboots.',
        crash: false,
        dateComplaintFiled: '05/01/2026',
      },
    ],
  };

  test('filters before ranking, tallies the matched set, carries the caveat', async () => {
    const handler = captureToolHandler(
      buildSearchComplaintsTool(
        routedClient([['/complaints/complaintsByVehicle?', COMPLAINTS]]),
      ),
    );
    const result = await handler({
      modelYear: 2020,
      make: 'Ford',
      model: 'Transit',
      keyword: 'steering',
    });
    const payload = result.structuredContent;
    expect(payload['totalComplaints']).toBe(2);
    expect(payload['matched']).toBe(1);
    expect(payload['tallies']).toEqual({ crashes: 1, fires: 0, injuries: 2, deaths: 0 });
    const complaints = payload['complaints'] as Array<Record<string, unknown>>;
    expect(complaints).toHaveLength(1);
    expect(complaints[0]!['odiNumber']).toBe('1');
    expect(String(payload['allegationCaveat'])).toContain('not NHTSA defect findings');
  });

  test('nonzero total with zero matches says the filter did it', async () => {
    const handler = captureToolHandler(
      buildSearchComplaintsTool(
        routedClient([['/complaints/complaintsByVehicle?', COMPLAINTS]]),
      ),
    );
    const result = await handler({
      modelYear: 2020,
      make: 'Ford',
      model: 'Transit',
      keyword: 'zzzqqq',
    });
    expect(String(result.structuredContent['note'])).toContain('none matched');
  });
});

describe('VIN hygiene — the /legal claim, enforced', () => {
  test('no full VIN anywhere in any payload, on success or failure', async () => {
    const routes: Array<[string, unknown]> = [
      ['/DecodeVinValuesExtended/', { Results: [VPIC_ROW] }],
      ['/recalls/recallsByVehicle?', { results: [RECALL_ROW] }],
      ['/complaints/complaintsByVehicle?', { results: [] }],
      ['/products/vehicle/models?', { results: [{ model: 'ACCORD' }] }],
    ];
    const client = routedClient(routes);

    for (const [build, args] of [
      [buildDecodeVinTool, { vin: VIN }],
      [buildCheckRecallsTool, { vin: VIN }],
      [buildSearchComplaintsTool, { vin: VIN, keyword: 'air bag' }],
    ] as const) {
      const handler = captureToolHandler(build(client));
      const result = await handler(args as Record<string, unknown>);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(VIN);
      expect(serialized).toContain('004352');
    }

    // Failure path: vPIC down, VIN in the error chain — still scrubbed.
    const failing = captureToolHandler(
      buildCheckRecallsTool(routedClient([['/DecodeVinValuesExtended/', 'THROW']])),
    );
    const failure = await failing({ vin: VIN });
    expect(JSON.stringify(failure)).not.toContain(VIN);
  });
});

describe('law tools (corpus-backed, no upstream)', () => {
  test('nhtsa_search_safety_law answers the render-inoperative question with citations', async () => {
    const handler = captureToolHandler(buildSearchSafetyLawTool(laws));
    const result = await handler({ query: 'make inoperative safety device', limit: 5 });
    const payload = result.structuredContent;
    const sections = payload['sections'] as Array<Record<string, unknown>>;
    expect(sections[0]!['section']).toBe('30122');
    expect((sections[0]!['citation'] as Record<string, unknown>)['shortForm']).toMatch(
      /^49 U\.S\.C\. §30122 \(current through P\.L\. .+\)$/,
    );
    expect(String(payload['legalNote'])).toContain('not legal advice');
    expect(payload['corpusCurrentThrough']).toBe(laws.meta.currentThrough);
  });

  test('nhtsa_get_law_section returns the verbatim text and tolerates § formats', async () => {
    const handler = captureToolHandler(buildGetLawSectionTool(laws));
    const result = await handler({ section: '§30122' });
    const payload = result.structuredContent;
    expect(payload['found']).toBe(true);
    const section = payload['section'] as Record<string, unknown>;
    expect(String(section['text'])).toContain('may not knowingly make inoperative');
    expect(String(section['text'])).toContain('motor vehicle repair business');
  });

  test('a missing section says so and points at search', async () => {
    const handler = captureToolHandler(buildGetLawSectionTool(laws));
    const result = await handler({ section: '99999' });
    expect(result.structuredContent['found']).toBe(false);
    expect(String(result.structuredContent['note'])).toContain('nhtsa_search_safety_law');
  });
});

describe('nhtsa_get_recall', () => {
  test('an unknown campaign number is found:false with a caution, not an empty lie', async () => {
    const handler = captureToolHandler(
      buildGetRecallTool(routedClient([['/recalls/campaignNumber?', { results: [] }]])),
    );
    const result = await handler({ campaignNumber: '99V999000' });
    expect(result.structuredContent['found']).toBe(false);
    expect(String(result.structuredContent['note'])).toContain('Verify the number');
  });
});
