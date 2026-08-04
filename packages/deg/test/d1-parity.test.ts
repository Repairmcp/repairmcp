/**
 * Local and remote must answer `deg_find_supporting` identically.
 *
 * This is the test the whole D1 design is accountable to. `DEGAdapter` scores
 * every record in the corpus; `D1DEGAdapter` scores only the candidates FTS5
 * hands it. Those agree exactly as long as bm25 retrieval never drops a record
 * the scorer would have ranked into the top results — and nothing else in the
 * system will tell us when that stops being true.
 *
 * If this fails, raise the candidate pool in `d1/adapter.ts` before reaching
 * for anything else. A shop reading a confidence of 0.883 on the remote server
 * and 0.71 on the local one has been handed two different answers about whether
 * to put a line item on a supplement.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEGAdapter } from '../src/adapter';
import { D1DEGAdapter } from '../src/d1/adapter';
import { DEGInquirySchema, type DEGInquiry } from '../src/schema';
import { makeFakeD1, type FakeD1 } from './helpers/d1-fake';

const FIXED_NOW = new Date('2026-05-07T12:00:00Z');

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

/** Real estimator phrasing, covering the operations the demo scenarios use. */
const QUERIES: Array<{ label: string; lineItemText: string; opts?: Record<string, unknown> }> = [
  { label: 'blend two-tone refinish', lineItemText: 'blend two-tone refinish' },
  { label: 'weld-thru primer', lineItemText: 'weld-thru primer non-included' },
  {
    label: 'R&I rear bumper',
    lineItemText: 'R&I rear bumper for refinish on adjacent panel',
  },
  { label: 'underhood lamp aim', lineItemText: 'underhood lamp aim after R&I' },
  { label: 'frame measurement', lineItemText: 'frame measurement during blueprinting' },
  { label: 'MOTOR GTE (IP boost)', lineItemText: 'MOTOR GTE pages refinish question' },
  { label: 'Audatex DBRM (IP boost)', lineItemText: 'Audatex DBRM labor time' },
  {
    label: 'vehicle boost',
    lineItemText: 'labor time refinish',
    opts: { vehicleMake: 'Ford' },
  },
  {
    label: 'full vehicle boost',
    lineItemText: 'bumper cover refinish',
    opts: { vehicleYear: 2020, vehicleMake: 'Toyota', vehicleModel: 'Camry' },
  },
  { label: 'single common term', lineItemText: 'refinish' },
];

let fake: FakeD1;
let local: DEGAdapter;
let remote: D1DEGAdapter;

beforeAll(() => {
  local = new DEGAdapter(corpus);
  fake = makeFakeD1(corpus);
  remote = new D1DEGAdapter(fake);
});

afterAll(() => {
  fake.close();
});

describe('find_supporting parity: in-memory vs D1', () => {
  test('the corpus fixture is present', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  for (const q of QUERIES) {
    test(`identical ranking and confidence — ${q.label}`, async () => {
      const args = { lineItemText: q.lineItemText, now: FIXED_NOW, limit: 5, ...q.opts };
      const a = await local.findSupporting(args);
      const b = await remote.findSupporting(args);

      expect(b.map((r) => r.inquiry.id)).toEqual(a.map((r) => r.inquiry.id));
      for (let i = 0; i < a.length; i++) {
        expect(b[i]!.score).toBeCloseTo(a[i]!.score, 3);
        expect(b[i]!.breakdown).toEqual(a[i]!.breakdown);
        expect(b[i]!.snippet).toBe(a[i]!.snippet);
      }
    });
  }
});

describe('the pinned case', () => {
  test('"blend two-tone refinish" ranks 40990 #1 above 0.7 through D1', async () => {
    const results = await remote.findSupporting({
      lineItemText: 'blend two-tone refinish',
      now: FIXED_NOW,
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.inquiry.id).toBe('40990');
    expect(results[0]!.score).toBeGreaterThan(0.7);
  });
});

describe('search parity: score and filters', () => {
  test('score is term coverage on both sides for the same record', async () => {
    const text = 'rear bumper refinish adjacent panel';
    const a = await local.search({ text, limit: 20, offset: 0 });
    const b = await remote.search({ text, limit: 20, offset: 0 });

    // Ordering deliberately differs — remote orders by bm25, local by coverage.
    // The score attached to a given record must not.
    const localById = new Map(a.map((r) => [r.item.id, r.score]));
    let compared = 0;
    for (const hit of b) {
      const localScore = localById.get(hit.item.id);
      if (localScore === undefined) continue;
      expect(hit.score).toBeCloseTo(localScore, 6);
      compared++;
    }
    expect(compared).toBeGreaterThan(0);
  });

  test('getById returns the same record on both sides', async () => {
    for (const inq of corpus.slice(0, 10)) {
      expect(await remote.getById(inq.id)).toEqual((await local.getById(inq.id))!);
    }
  });

  test('listRecent returns the same ids in the same order', async () => {
    const a = await local.listRecent({ limit: 15 });
    const b = await remote.listRecent({ limit: 15 });
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
  });

  test('citations are identical', async () => {
    for (const inq of corpus.slice(0, 10)) {
      // retrievedAt is stamped at call time and legitimately differs by a
      // millisecond between the two calls. Everything a shop would quote must not.
      const { retrievedAt: _a, ...remoteCitation } = remote.formatCitation(inq);
      const { retrievedAt: _b, ...localCitation } = local.formatCitation(inq);
      expect(remoteCitation).toEqual(localCitation);
    }
  });
});
