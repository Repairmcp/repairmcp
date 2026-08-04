import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { D1DEGAdapter } from '../src/d1/adapter';
import { buildMatchExpression, inquiryToRow, rowToInquiry } from '../src/d1/sql';
import { DEGInquirySchema, type DEGInquiry } from '../src/schema';
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

let fake: FakeD1;
let adapter: D1DEGAdapter;

beforeAll(() => {
  fake = makeFakeD1(corpus);
  adapter = new D1DEGAdapter(fake);
});

afterAll(() => {
  fake.close();
});

// ──────────────────────────────────────────────────────────────────────
// MATCH expression construction — the injection surface
// ──────────────────────────────────────────────────────────────────────

describe('buildMatchExpression', () => {
  test('quotes every token, ORs them, prefixes the long ones', () => {
    expect(buildMatchExpression('blend two-tone refinish')).toBe(
      '"blend"* OR "two"* OR "tone"* OR "refinish"*',
    );
  });

  test('collapses R&I the same way the scorer does, and leaves "ri" exact', () => {
    // "ri"* would match right, rim, rivet, ribbon — the whole reason the prefix
    // rule is length-gated at all.
    expect(buildMatchExpression('R&I rear bumper')).toBe('"ri" OR "rear"* OR "bumper"*');
  });

  test('prefix matching is what reaches inflected forms', () => {
    // The corpus says "measurements" and "aiming"; the scorer substring-matches
    // "measurement" and "aim". Without the prefix, FTS5 would not retrieve those
    // records at all, and the two adapters would return different top-5s.
    expect(buildMatchExpression('measurement')).toBe('"measurement"*');
    expect(buildMatchExpression('aim')).toBe('"aim"*');
  });

  test('FTS5 metacharacters cannot escape the quoting', () => {
    // Every one of these is an operator or syntax element in FTS5. None may
    // survive tokenization; if one did, it would change what the query means.
    const hostile = 'panel" OR inquiry_fts MATCH "x';
    const expr = buildMatchExpression(hostile);
    // The injected quote is gone, the bare OR was dropped as a stopword, and
    // the underscore in inquiry_fts split it into two ordinary terms. What is
    // left is quoted words and our own operators — nothing the caller reached.
    expect(expr).toBe('"panel"* OR "inquiry"* OR "fts"* OR "match"*');
    expect(expr!.replace(/ OR /g, '')).toMatch(/^(?:"[a-z0-9]+"\*?)+$/);
  });

  test('strips NEAR, parens, stars, carets, colons', () => {
    const expr = buildMatchExpression('NEAR(bumper panel, 3) ^title:refinish*');
    expect(expr).toBe('"near"* OR "bumper"* OR "panel"* OR "title"* OR "refinish"*');
  });

  test('all-stopword query yields null, not an empty MATCH', () => {
    // An empty MATCH string is an FTS5 syntax error, so "no usable tokens" has
    // to be representable as something other than ''.
    expect(buildMatchExpression('the of and to for')).toBeNull();
    expect(buildMatchExpression('   ')).toBeNull();
    expect(buildMatchExpression('!!! ??? ...')).toBeNull();
  });
});

describe('search with an unusable query', () => {
  test('returns empty rather than matching everything', async () => {
    expect(await adapter.search({ text: 'the of and', limit: 10, offset: 0 })).toEqual([]);
  });

  test('findSupporting likewise', async () => {
    expect(await adapter.findSupporting({ lineItemText: 'the of and' })).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Row round-trip fidelity
// ──────────────────────────────────────────────────────────────────────

describe('row round-trip', () => {
  test('every sample record survives inquiry → row → inquiry unchanged', () => {
    expect(corpus.length).toBeGreaterThan(0);
    for (const inq of corpus) {
      expect(rowToInquiry(inquiryToRow(inq))).toEqual(inq);
    }
  });

  test('metadata survives as an object, not a string', async () => {
    const first = corpus[0]!;
    const fetched = await adapter.getById(first.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.metadata).toEqual(first.metadata);
  });

  test('dates come back as Date instances', async () => {
    const first = corpus[0]!;
    const fetched = await adapter.getById(first.id);
    expect(fetched!.submittedAt).toBeInstanceOf(Date);
    expect(fetched!.lastUpdated).toBeInstanceOf(Date);
    expect(fetched!.submittedAt.toISOString()).toBe(first.submittedAt.toISOString());
  });

  test('a non-numeric id is a miss, not a throw', async () => {
    expect(await adapter.getById('banana')).toBeNull();
    expect(await adapter.getById('')).toBeNull();
    expect(await adapter.getById('1; DROP TABLE inquiry')).toBeNull();
  });

  test('an unknown numeric id is a miss', async () => {
    expect(await adapter.getById('999999999')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// listRecent
// ──────────────────────────────────────────────────────────────────────

describe('listRecent', () => {
  test('newest first', async () => {
    const items = await adapter.listRecent({ limit: 20 });
    expect(items.length).toBeGreaterThan(1);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.submittedAt.getTime()).toBeLessThanOrEqual(
        items[i - 1]!.submittedAt.getTime(),
      );
    }
  });

  test('limit respected', async () => {
    expect((await adapter.listRecent({ limit: 3 })).length).toBe(3);
  });

  test('since filters on submission date', async () => {
    const all = await adapter.listRecent({ limit: 50 });
    const cutoff = all[Math.floor(all.length / 2)]!.submittedAt;
    const since = await adapter.listRecent({ limit: 50, since: cutoff });
    expect(since.length).toBeGreaterThan(0);
    for (const item of since) {
      expect(item.submittedAt.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// search filters + pagination
// ──────────────────────────────────────────────────────────────────────

describe('search filters', () => {
  test('ip filter restricts results', async () => {
    const results = await adapter.search({
      text: 'refinish labor',
      filters: { ip: 'CCC' },
      limit: 20,
      offset: 0,
    });
    for (const r of results) expect(r.item.ip).toBe('CCC');
  });

  test('status filter restricts results', async () => {
    const results = await adapter.search({
      text: 'refinish labor',
      filters: { status: 'resolved' },
      limit: 20,
      offset: 0,
    });
    for (const r of results) expect(r.item.status).toBe('resolved');
  });

  test('vehicleMake matches case-insensitively as a substring', async () => {
    const anyMake = corpus.find((i) => i.vehicleMake)?.vehicleMake;
    if (!anyMake) return;
    const results = await adapter.search({
      text: 'labor',
      filters: { vehicleMake: anyMake.toLowerCase() },
      limit: 20,
      offset: 0,
    });
    for (const r of results) {
      expect((r.item.vehicleMake ?? '').toLowerCase()).toContain(anyMake.toLowerCase());
    }
  });

  test('LIKE wildcards in a filter value are escaped, not interpreted', async () => {
    // '%' would otherwise match every make in the corpus.
    const results = await adapter.search({
      text: 'labor',
      filters: { vehicleMake: '%' },
      limit: 20,
      offset: 0,
    });
    expect(results).toEqual([]);
  });

  test('limit and offset paginate a stable ordering', async () => {
    const page1 = await adapter.search({ text: 'refinish labor time', limit: 3, offset: 0 });
    const page2 = await adapter.search({ text: 'refinish labor time', limit: 3, offset: 3 });
    const ids1 = page1.map((r) => r.item.id);
    const ids2 = page2.map((r) => r.item.id);
    for (const id of ids2) expect(ids1).not.toContain(id);
  });

  test('every hit carries a citation with the DEG short form', async () => {
    const results = await adapter.search({ text: 'refinish', limit: 3, offset: 0 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.citation.shortForm).toMatch(/^DEG #\d+ \(\d{1,2}\/\d{1,2}\/\d{4}\)$/);
    }
  });
});

describe('count', () => {
  test('reports the seeded corpus size', async () => {
    expect(await adapter.count()).toBe(corpus.length);
  });
});
