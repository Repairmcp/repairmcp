import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/mt-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/mt-annotations.json' with { type: 'json' };
import { MtCorpus } from '../src/corpus.js';
import { MCA_EDITION } from '../src/identity.js';
import { MT_TOPICS } from '../src/taxonomy.js';

/**
 * The committed capture is the fixture. The demo-criteria rankings are the
 * launch bar: every one of these questions must surface the right Montana
 * section, quotable verbatim, before the site card flips.
 */

const corpus = new MtCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all four domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(30);
    expect(domains.repair_law).toBeGreaterThan(25);
    expect(domains.safety).toBeGreaterThan(5);
    expect(domains.employment).toBeGreaterThan(20);
  });

  test('the MCA_EDITION pin matches the corpus — the yearly rollover tripwire', () => {
    expect((corpus.meta as { mcaEdition?: string }).mcaEdition).toBe(MCA_EDITION);
  });

  test('MCA sections never carry effective dates; ARM sections always do', () => {
    for (const section of corpus.sections) {
      if (section.code === 'MCA') {
        expect(section.effectiveDate).toBeUndefined();
      } else {
        expect(section.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(section.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  test('every topic reaches at least one section — no dead topics, structurally', () => {
    const reachable = new Set<string>();
    for (const section of corpus.sections) {
      for (const topic of corpus.topicsFor(section)) reachable.add(topic);
    }
    for (const topic of MT_TOPICS) {
      expect(reachable.has(topic), `topic ${topic} reaches no section`).toBe(true);
    }
  });

  test('getSection tolerates every citation spelling', () => {
    for (const input of ['MCA 33-18-224', 'mca:33-18-224', '33-18-224']) {
      expect(corpus.getSection(input)?.cite).toBe('33-18-224');
    }
    for (const input of ['ARM 23.19.203', 'arm:23.19.203', '23.19.203']) {
      expect(corpus.getSection(input)?.cite).toBe('23.19.203');
    }
    expect(corpus.getSection('MCA 99-99-999')).toBeNull();
  });

  test('freshness states the capture date and the record count', () => {
    const freshness = corpus.freshness();
    expect(freshness.currentThrough).toBe(corpus.meta.capturedAt);
    expect(freshness.recordCount).toBe(corpus.sections.length);
  });
});

describe('launch demo criteria', () => {
  test('the killer demo: deleted estimating-system operations reach 33-18-224 first', () => {
    const result = corpus.findSupporting(
      'adjuster is deleting operations from the estimating system we both use',
    );
    expect(result.hits[0]!.section.cite).toBe('33-18-224');
  });

  test('steering: 33-18-224 in the top three', () => {
    const result = corpus.findSupporting('insurer steering my customer to their preferred shop');
    expect(result.hits.slice(0, 3).map((h) => h.section.cite)).toContain('33-18-224');
  });

  test('suing over a lowball: 33-18-242 in the top three', () => {
    const result = corpus.findSupporting('can I sue the insurer for lowballing this claim');
    expect(result.hits.slice(0, 3).map((h) => h.section.cite)).toContain('33-18-242');
  });

  test('total loss at book value: 33-23-202 and 27-1-306 in the top three', () => {
    const result = corpus.findSupporting('total loss paid at book value instead of replacement value');
    const top3 = result.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3).toContain('33-23-202');
    expect(top3).toContain('27-1-306');
  });

  test('written estimates: the ARM repair rules in the top three', () => {
    const result = corpus.search('do I have to give the customer a written estimate');
    const top3 = result.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3.some((cite) => cite === '23.19.202' || cite === '23.19.203')).toBe(true);
  });

  test('holding the car: 71-3-1201 in the top three', () => {
    const result = corpus.findSupporting('can I keep the car until the repair bill is paid');
    expect(result.hits.slice(0, 3).map((h) => h.section.cite)).toContain('71-3-1201');
  });

  test('firing after probation: the WDEA elements section first', () => {
    const result = corpus.findSupporting('fired a tech after probation without good cause');
    expect(result.hits[0]!.section.cite).toBe('39-2-904');
  });

  test('final paycheck timing: 39-3-205 first', () => {
    const result = corpus.findSupporting('when is the final paycheck due after termination');
    expect(result.hits[0]!.section.cite).toBe('39-3-205');
  });

  test('an exact cite short-circuits at 1.0', () => {
    const result = corpus.search('MCA 33-18-201');
    expect(result.hits[0]!.section.cite).toBe('33-18-201');
    expect(result.hits[0]!.score).toBe(1);
    expect(result.hits[0]!.breakdown.citation).toBe(1);
  });

  test('prompt payment: 33-18-245 in the top three', () => {
    const result = corpus.findSupporting(
      'claim was approved but the insurer still has not paid after thirty working days',
    );
    expect(result.hits.slice(0, 3).map((h) => h.section.cite)).toContain('33-18-245');
  });
});
