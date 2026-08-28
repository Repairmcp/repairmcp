import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import corpusJson from '../data/wa-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/wa-annotations.json' with { type: 'json' };
import { WaCorpus } from '../src/corpus.js';
import { buildWaSearchAuthorityTool } from '../src/tools.js';

/**
 * The golden panel: top-10 (cite, score, breakdown) pinned for ten queries,
 * plus ONE byte-exact payload string. Generated from live behavior before the
 * state-law extraction began; its whole purpose is to catch ranking or
 * wire-format drift that the behavioral suites are too coarse to see —
 * iteration-order changes, per-component rounding, tie-break edits, stopword
 * "cleanups" (the stoplist filters AFTER normalizeToken, so entries like
 * 'this' never match their normalized form and DO contribute coverage —
 * that quirk is load-bearing), and payload key reordering.
 *
 * If a DELIBERATE scoring change lands, regenerate via the documented
 * generator and say so in the commit. If this fails during a refactor, the
 * refactor changed behavior: fix the refactor, not this file.
 */

const goldenDir = join(import.meta.dirname, 'golden');
const panel = JSON.parse(readFileSync(join(goldenDir, 'ranking-panel.json'), 'utf8')) as Record<
  string,
  {
    kind: 'search' | 'findSupporting';
    query: string;
    citationMiss: string | null;
    chapterListing: boolean | null;
    hits: Array<{ cite: string; score: number; breakdown: Record<string, number> }>;
  }
>;

const corpus = new WaCorpus(corpusJson, annotationsJson);

describe('golden ranking panel', () => {
  for (const [id, expected] of Object.entries(panel)) {
    test(`${id}: "${expected.query}"`, () => {
      const result = corpus[expected.kind](expected.query, { limit: 10 });
      expect(result.citationMiss ?? null).toEqual(expected.citationMiss);
      expect(result.chapterListing ?? null).toEqual(expected.chapterListing);
      expect(
        result.hits.map((h) => ({
          cite: `${h.section.code} ${h.section.cite}`,
          score: h.score,
          breakdown: h.breakdown,
        })),
      ).toEqual(expected.hits);
    });
  }
});

describe('golden payload string', () => {
  test('wa_search_authority("deny storage charges", limit 2) is byte-identical', async () => {
    let handler:
      | ((input: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>)
      | undefined;
    buildWaSearchAuthorityTool(corpus)({
      registerTool: (_name: string, _def: unknown, h: never) => {
        handler = h as typeof handler;
      },
    } as never);
    const { content } = await handler!({ query: 'deny storage charges', limit: 2 });
    const expected = readFileSync(join(goldenDir, 'search-payload.txt'), 'utf8');
    expect(content[0]!.text).toBe(expected);
  });
});
