/**
 * Parity against the whole 22,652-record corpus.
 *
 * `d1-parity.test.ts` runs on the 50-record sample, where the candidate pool is
 * larger than the corpus — so it proves the scoring path is wired correctly but
 * cannot prove retrieval is deep enough. This one can, because at 22,652 records
 * the pool is a genuine bottleneck.
 *
 * Skipped when the corpus file is absent (it is gitignored), the same pattern
 * `scoring.test.ts` uses. Takes several seconds when it does run: it builds the
 * FTS index over 17.2 MB of text before the first assertion.
 *
 * This is the test that says whether a shop gets the same citation from the
 * remote server as from the local one. When it fails, the fix is in this order:
 * raise `DEFAULT_CANDIDATE_POOL`, then lower `PREFIX_MIN_LENGTH`, then think
 * harder — do not adjust the expectations.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEGAdapter } from '../src/adapter';
import { D1DEGAdapter } from '../src/d1/adapter';
import { DEGInquirySchema, type DEGInquiry } from '../src/schema';
import { makeFakeD1, type FakeD1 } from './helpers/d1-fake';

const FIXED_NOW = new Date('2026-05-07T12:00:00Z');

const FULL_PATH = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'apps',
  'deg-server',
  'data',
  'deg-inquiries-full.json',
);

const available = existsSync(FULL_PATH);

/**
 * The agreement panel — the 20 queries the retrieval design was chosen against.
 *
 * This exact list produced the numbers that picked the two-arm candidate pool
 * over a bm25-only one:
 *
 *   bm25 200 only          top-5 13/20   top-1 17/20
 *   bm25 500 only          top-5 17/20   top-1 18/20
 *   bm25 1000 only         top-5 17/20   top-1 18/20
 *   bm25 300 + recent 300  top-5 18/20   top-1 19/20
 *   bm25 500 + recent 500  top-5 19/20   top-1 20/20   ← shipped
 *
 * and then, with length-gated prefix matching added, 20/20 on both. It is kept
 * verbatim so the decision stays falsifiable: change the pool or the prefix rule
 * and this panel says immediately what it cost.
 *
 * The mix matters as much as the count. Saturated queries ("refinish", "labor
 * time refinish") are the ones a bm25-only pool gets wrong, because thousands of
 * records tie on score and recency is what actually decides. Do not prune them
 * for being "too vague" — they are the hard cases.
 */
const QUERIES = [
  'blend two-tone refinish',
  'weld-thru primer non-included',
  'R&I rear bumper for refinish on adjacent panel',
  'underhood lamp aim after R&I',
  'frame measurement during blueprinting',
  'MOTOR GTE pages refinish question',
  'Audatex DBRM labor time',
  'labor time refinish',
  'bumper cover refinish',
  'refinish',
  'clear coat two stage',
  'seat belt inspection after collision',
  'aim headlamps after bumper R&I',
  'corrosion protection inside panel',
  'setup and measure on frame bench',
  'non-included weld-thru primer on a quarter panel',
  'two stage clear coat blend adjacent panel',
  'drill and plug weld replacement panel',
  'pull to spec on a frame rack',
  'cavity wax after sectioning',
];

let fake: FakeD1 | null = null;
let local: DEGAdapter;
let remote: D1DEGAdapter;
let corpus: DEGInquiry[] = [];

beforeAll(() => {
  if (!available) return;
  corpus = DEGInquirySchema.array().parse(JSON.parse(readFileSync(FULL_PATH, 'utf-8')));
  local = new DEGAdapter(corpus);
  fake = makeFakeD1(corpus);
  remote = new D1DEGAdapter(fake);
});

afterAll(() => {
  fake?.close();
});

describe('full-corpus find_supporting parity', () => {
  test.skipIf(!available)('the corpus is the size we think it is', () => {
    expect(corpus.length).toBeGreaterThan(22_000);
  });

  test.skipIf(!available)('the agreement panel is intact', () => {
    // Guards against the panel being quietly trimmed when a query starts
    // failing. Twenty is the number the pool configuration was chosen against.
    expect(QUERIES.length).toBe(20);
    expect(new Set(QUERIES).size).toBe(20);
  });

  for (const q of QUERIES) {
    test.skipIf(!available)(`top-5 identical — ${q}`, async () => {
      const args = { lineItemText: q, now: FIXED_NOW, limit: 5 };
      const a = await local.findSupporting(args);
      const b = await remote.findSupporting(args);

      expect(b.map((r) => r.inquiry.id)).toEqual(a.map((r) => r.inquiry.id));
      for (let i = 0; i < a.length; i++) {
        expect(b[i]!.score).toBeCloseTo(a[i]!.score, 6);
        expect(b[i]!.breakdown).toEqual(a[i]!.breakdown);
      }
    });
  }
});

/**
 * The "40990 #1 at 0.883" benchmark in CLAUDE.md is a *sample-corpus* result —
 * it was measured when only the 50 hand-curated inquiries existed, and it still
 * holds there (see `scoring.test.ts` and `d1-parity.test.ts`).
 *
 * It does not hold on the full corpus, and never did: 30 records score a
 * perfect 1.000 on "blend two-tone refinish", and 40990 lands at rank 31 with a
 * lower score. That is true of the local STDIO server too — it is a property of
 * the corpus, not of D1. Asserting it here would pin a claim that is false on
 * the data we actually serve.
 */
describe('full-corpus behaviour of the demo query', () => {
  test.skipIf(!available)('the top hit is a perfect-coverage match', async () => {
    const results = await remote.findSupporting({
      lineItemText: 'blend two-tone refinish',
      now: FIXED_NOW,
      limit: 5,
    });
    expect(results.length).toBe(5);
    expect(results[0]!.score).toBeCloseTo(1, 6);
  });

  test.skipIf(!available)('40990 is still retrievable and still scores well', async () => {
    const inq = await remote.getById('40990');
    expect(inq).not.toBeNull();
    const deep = await remote.findSupporting({
      lineItemText: 'blend two-tone refinish',
      now: FIXED_NOW,
      limit: 50,
    });
    const found = deep.find((r) => r.inquiry.id === '40990');
    expect(found).toBeDefined();
    expect(found!.score).toBeGreaterThan(0.7);
  });
});
