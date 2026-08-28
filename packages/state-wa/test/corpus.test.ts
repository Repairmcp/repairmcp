import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/wa-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/wa-annotations.json' with { type: 'json' };
import { WaCorpus } from '../src/corpus.js';

/**
 * The committed capture is the fixture — same pattern as nhtsa's laws.test.ts.
 * The demo-criteria rankings below are the kickoff §5 bar: every one of these
 * questions must surface the right section, quotable verbatim, before the site
 * card flips. They are ranking assertions against real data on purpose — if a
 * re-capture or a scoring change breaks one, that IS the signal to stop.
 */

const corpus = new WaCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all four domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(100);
    expect(domains.repair_law).toBeGreaterThan(80);
    expect(domains.safety).toBeGreaterThan(150);
    expect(domains.employment).toBeGreaterThan(200);
    expect(corpus.sections.length).toBe(
      domains.insurance + domains.repair_law + domains.safety + domains.employment,
    );
  });

  test('296-62 holds exactly the chromium subset and the spray section — the parent never leaked in', () => {
    const cites = corpus.sections.filter((s) => s.chapter === '296-62').map((s) => s.cite);
    expect(cites.length).toBeGreaterThan(5);
    for (const cite of cites) {
      expect(cite.startsWith('296-62-080') || cite === '296-62-11019').toBe(true);
    }
  });

  test('freshness states the capture date and the record count', () => {
    const freshness = corpus.freshness();
    expect(freshness.currentThrough).toBe(corpus.meta.capturedAt);
    expect(freshness.syncedAt).toBe(corpus.meta.capturedAt);
    expect(freshness.recordCount).toBe(corpus.sections.length);
  });

  test('the verified effective-date anchor: WAC 284-30-330 current text is 10/30/2016', () => {
    expect(corpus.getSection('WAC 284-30-330')?.effectiveDate).toBe('2016-10-30');
  });

  test('getSection returns verbatim text with the history note preserved', () => {
    const section = corpus.getSection('284-30-330')!;
    expect(section.text).toContain('Misrepresenting pertinent facts or insurance policy provisions.');
    expect(section.historyNote).toContain('WSR 16-20-050');
  });
});

describe('kickoff §5 demo criteria', () => {
  test('aftermarket parts: the disclosure statute surfaces', () => {
    const result = corpus.search('Can the insurer make me use aftermarket parts in Washington');
    const top3 = result.hits.slice(0, 3).map((h) => h.section.cite);
    expect(
      top3.some((cite) => ['46.71.015', '46.71.011', '46.71.025'].includes(cite)),
    ).toBe(true);
  });

  test('steering: WAC 284-30-390 surfaces through shop vocabulary the rule never uses', () => {
    const result = corpus.findSupporting('insurer steering my customer away from our shop');
    const top3 = result.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3).toContain('284-30-390');
  });

  test('written estimate: RCW 46.71.025 is the first answer', () => {
    const result = corpus.search('do I have to give the customer a written estimate');
    expect(result.hits[0]!.section.cite).toBe('46.71.025');
  });

  test('painter breaks: WAC 296-126-092 is the first answer', () => {
    const result = corpus.findSupporting('what breaks are my painters entitled to');
    expect(result.hits[0]!.section.cite).toBe('296-126-092');
  });

  test('storage denial: WAC 284-30-394 is the first answer', () => {
    const result = corpus.search('is the insurer allowed to deny storage charges');
    expect(result.hits[0]!.section.cite).toBe('284-30-394');
  });

  test('total-loss valuation: the -391/-392 standards surface together', () => {
    const result = corpus.findSupporting('total loss valuation dispute comparable vehicles');
    const top3 = result.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3).toContain('284-30-391');
    expect(top3.some((cite) => ['284-30-392', '284-30-320'].includes(cite))).toBe(true);
  });

  test('a supplement dispute reaches the -390 supplement clause', () => {
    const result = corpus.findSupporting(
      'insurer refuses to pay supplement for hidden damage found during teardown',
    );
    const top3 = result.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3).toContain('284-30-390');
  });
});
