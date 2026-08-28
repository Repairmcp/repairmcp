import { describe, expect, test } from 'bun:test';
import { WaCorpus } from '../src/corpus.js';
import type { WaCorpusFile } from '../src/schema.js';

/**
 * Fixture-level scoring behavior. The real-corpus ranking assertions (the six
 * kickoff demo criteria) live in corpus.test.ts; this file pins the machinery:
 * short-circuits, filters, boosts, and — the lesson of the May branch, whose
 * production adapter zeroed a scoring component and no test noticed — that
 * every breakdown component is demonstrably alive through the public API.
 */

const META = {
  state: 'WA',
  capturedAt: '2026-08-27',
  currentThrough: '2026-08-27',
  sourceNote: 'test fixture',
  sourceUrl: 'https://app.leg.wa.gov',
} as const;

const FIXTURE: WaCorpusFile = {
  meta: META,
  sections: [
    {
      cite: '284-30-330',
      code: 'WAC',
      chapter: '284-30',
      chapterTitle: 'Trade practices',
      heading: 'Specific unfair claims settlement practices defined.',
      text:
        'The following are unfair practices of the insurer in the settlement of claims:\n' +
        '(1) Not attempting in good faith to effectuate prompt, fair and equitable settlements of claims.\n' +
        '(2) Ignoring the procedures described in WAC 284-30-999 for claims communications.',
      effectiveDate: '2016-10-30',
      domain: 'insurance',
      sourceUrl: 'https://app.leg.wa.gov/WAC/default.aspx?cite=284-30-330',
    },
    {
      cite: '284-30-394',
      code: 'WAC',
      chapter: '284-30',
      chapterTitle: 'Trade practices',
      heading: 'Denial of storage and towing costs.',
      text:
        'The insurer must not deny reasonable storage or towing charges without a documented basis. ' +
        'Storage charges accrue from the date of loss.',
      domain: 'insurance',
      sourceUrl: 'https://app.leg.wa.gov/WAC/default.aspx?cite=284-30-394',
    },
    {
      cite: '46.71.025',
      code: 'RCW',
      chapter: '46.71',
      chapterTitle: 'Automotive repair',
      heading: 'Written estimate required.',
      text: 'A repair facility shall provide the customer with a written price estimate before repairs.',
      domain: 'repair_law',
      sourceUrl: 'https://app.leg.wa.gov/RCW/default.aspx?cite=46.71.025',
    },
  ],
};

const ANNOTATIONS = {
  'WAC 284-30-330': {
    topics: ['fair_settlement', 'steering'],
    claimUseCases: ['steering away from shop of choice'],
    quoteSafeExcerpts: ['prompt, fair and equitable settlements of claims'],
  },
};

const corpus = () => new WaCorpus(FIXTURE, ANNOTATIONS);

describe('citation short-circuits', () => {
  test('an exact cite returns that section at 1.0 with breakdown.citation = 1', () => {
    const result = corpus().search('WAC 284-30-330');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.section.cite).toBe('284-30-330');
    expect(result.hits[0]!.score).toBe(1);
    expect(result.hits[0]!.breakdown.citation).toBe(1);
    expect(result.citationMiss).toBeUndefined();
  });

  test('a cite-shaped MISS falls through to fuzzy scoring instead of a hard zero', () => {
    // The May branch returned score 0 for any cite-shaped query that missed.
    // Here 284-30-999 does not exist, but a section referencing it surfaces.
    const result = corpus().search('WAC 284-30-999');
    expect(result.citationMiss).toBe('WAC 284-30-999');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]!.section.cite).toBe('284-30-330');
    expect(result.hits[0]!.score).toBeGreaterThan(0);
  });

  test('a chapter-shaped query lists that chapter, not a miss and not the world', () => {
    const result = corpus().search('WAC 284-30');
    expect(result.chapterListing).toBe(true);
    expect(result.hits.map((h) => h.section.cite)).toEqual(['284-30-330', '284-30-394']);
  });
});

describe('filters are hard constraints, never score components', () => {
  test('domain filter excludes other domains', () => {
    const result = corpus().search('estimate repairs', { domain: 'insurance' });
    expect(result.hits.some((h) => h.section.code === 'RCW')).toBe(false);
  });

  test('topic filter excludes sections without the topic', () => {
    const result = corpus().search('storage charges', { topics: ['meal_rest_breaks'] });
    expect(result.hits).toHaveLength(0);
  });

  test('a filtered search scores survivors identically to an unfiltered one', () => {
    const unfiltered = corpus().search('storage charges');
    const filtered = corpus().search('storage charges', { domain: 'insurance' });
    const a = unfiltered.hits.find((h) => h.section.cite === '284-30-394')!;
    const b = filtered.hits.find((h) => h.section.cite === '284-30-394')!;
    expect(b.score).toBe(a.score);
    expect(b.breakdown).toEqual(a.breakdown);
  });
});

describe('find-supporting boosts', () => {
  test('claimUseCases vocabulary bridges shop slang the statute never uses', () => {
    // "steering" appears nowhere in the fixture text — only in the annotation.
    const result = corpus().findSupporting('insurer steering me away from my shop');
    const hit = result.hits.find((h) => h.section.cite === '284-30-330');
    expect(hit).toBeDefined();
    expect(hit!.breakdown.useCase).toBeGreaterThan(0);
  });

  test('a phrase match on the heading earns the phrase boost', () => {
    const result = corpus().findSupporting('denial of storage and towing');
    const hit = result.hits.find((h) => h.section.cite === '284-30-394')!;
    expect(hit.breakdown.phrase).toBe(0.1);
  });

  test('the breakdown components sum to the score', () => {
    const result = corpus().findSupporting('storage towing charges insurer');
    const hit = result.hits.find((h) => h.section.cite === '284-30-394')!;
    const sum =
      hit.breakdown.citation +
      hit.breakdown.text +
      hit.breakdown.heading +
      hit.breakdown.density +
      hit.breakdown.useCase +
      hit.breakdown.phrase;
    expect(Math.abs(sum - hit.score)).toBeLessThan(0.005);
  });
});

describe('no dead breakdown components — the May branch regression', () => {
  test('every component is > 0 in at least one public-API panel case', () => {
    const c = corpus();
    const panel = [
      c.search('WAC 284-30-330'), // citation
      c.search('storage towing charges insurer'), // text, heading, density
      c.findSupporting('insurer steering me away from my shop'), // useCase
      c.findSupporting('denial of storage and towing'), // phrase
    ];
    const alive = new Set<string>();
    for (const result of panel) {
      for (const hit of result.hits) {
        for (const [key, value] of Object.entries(hit.breakdown)) {
          if (value > 0) alive.add(key);
        }
      }
    }
    for (const key of ['citation', 'text', 'heading', 'density', 'useCase', 'phrase']) {
      expect(alive).toContain(key);
    }
  });
});

describe('constructor integrity enforcement', () => {
  test('an annotation key matching no section throws — renumbering fails loudly', () => {
    expect(
      () => new WaCorpus(FIXTURE, { 'WAC 999-99-999': { topics: ['fair_settlement'] } }),
    ).toThrow(/999-99-999/);
  });

  test('an excerpt that is not a literal substring throws — the paraphrase guard', () => {
    expect(
      () =>
        new WaCorpus(FIXTURE, {
          'WAC 284-30-330': {
            topics: ['fair_settlement'],
            quoteSafeExcerpts: ['fully completed proof of loss'],
          },
        }),
    ).toThrow(/substring/i);
  });

  test('an unknown topic throws', () => {
    expect(
      () => new WaCorpus(FIXTURE, { 'WAC 284-30-330': { topics: ['not_a_topic'] } }),
    ).toThrow(/topic/i);
  });
});

describe('lookup and metadata', () => {
  test('getSection tolerates every citation spelling', () => {
    const c = corpus();
    for (const input of ['WAC 284-30-330', 'wac:284-30-330', 'wac-284-30-330', '284-30-330']) {
      expect(c.getSection(input)?.cite).toBe('284-30-330');
    }
    expect(c.getSection('RCW 46.71.025')?.cite).toBe('46.71.025');
    expect(c.getSection('WAC 284-30-999')).toBeNull();
    expect(c.getSection('not a cite')).toBeNull();
  });

  test('freshness states the capture date on both fields', () => {
    expect(corpus().freshness()).toEqual({
      currentThrough: '2026-08-27',
      syncedAt: '2026-08-27',
      recordCount: 3,
    });
  });

  test('domainBreakdown counts per domain', () => {
    expect(corpus().domainBreakdown()).toEqual({
      insurance: 2,
      repair_law: 1,
      safety: 0,
      employment: 0,
    });
  });
});
