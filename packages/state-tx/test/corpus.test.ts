import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/tx-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/tx-annotations.json' with { type: 'json' };
import { TxAdapter } from '../src/adapter.js';
import { TxCorpus } from '../src/corpus.js';
import { TX_STATUTES_CURRENCY, displayCite } from '../src/identity.js';
import { TX_TOPICS } from '../src/taxonomy.js';

const corpus = new TxCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all three domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(25);
    expect(domains.repair_law).toBeGreaterThan(15);
    expect(domains.employment).toBeGreaterThan(7);
  });
  test('the TX_STATUTES_CURRENCY pin matches the corpus — the Legislature rollover tripwire', () => {
    const note = (corpus.meta as { txStatutesCurrencyNote?: string }).txStatutesCurrencyNote ?? '';
    expect(note).toContain(TX_STATUTES_CURRENCY);
  });
  test('statute and TAC sections carry effective dates; TAC sections carry a recordId', () => {
    for (const s of corpus.sections) {
      if (s.code === '28 TAC') {
        expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.tacRecordId).toMatch(/^\d+$/);
      } else {
        expect(s.tacRecordId).toBeUndefined();
      }
      if (s.code === 'TDI Bulletin') {
        expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
  test('the two steering bulletins are present with their issue dates', () => {
    const bulletins = corpus.sections.filter((s) => s.code === 'TDI Bulletin');
    expect(bulletins.map((b) => b.cite).sort()).toEqual(['B-0026-11', 'B-0031-10']);
    expect(corpus.getSection('B-0031-10')?.effectiveDate).toBe('2010-08-02');
  });
  test('the appraisal chapter is present, effective 9/1/2025', () => {
    const s = corpus.getSection('Tex. Ins. Code 1813.003');
    expect(s?.effectiveDate).toBe('2025-09-01');
    expect(s?.text).toContain('appraisal provision');
  });
  test('the 18% interest remedy is captured verbatim', () => {
    const s = corpus.getSection('542.060');
    expect(s?.text).toContain('18 percent a year');
    expect(s?.text).toContain("attorney's fees");
  });
  test('every topic reaches at least one section — no dead topics, structurally', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const topic of TX_TOPICS) {
      expect(reachable.has(topic), `topic ${topic} reaches no section`).toBe(true);
    }
  });
  test('getSection tolerates every citation spelling', () => {
    for (const input of [
      'Tex. Ins. Code 1952.301',
      'Insurance Code 1952.301',
      'tex. ins. code:1952.301',
      '1952.301',
      'Sec. 1952.301',
    ]) {
      expect(corpus.getSection(input)?.cite).toBe('1952.301');
    }
    for (const input of ['28 TAC 5.501', '5.501', '§5.501', '28 tac:5.501']) {
      expect(corpus.getSection(input)?.cite).toBe('5.501');
    }
    for (const input of ['B-0031-10', 'Bulletin B-31-10', 'TDI Bulletin B-0031-10']) {
      expect(corpus.getSection(input)?.cite).toBe('B-0031-10');
    }
    expect(corpus.getSection('Labor Code 61.014')?.cite).toBe('61.014');
    expect(corpus.getSection('70.001')?.cite).toBe('70.001');
    expect(corpus.getSection('501.091')?.cite).toBe('501.091');
    expect(corpus.getSection('Tex. Ins. Code 999.999')).toBeNull();
  });
});

/**
 * The launch bar (kickoff §5). Every query is shop-floor phrasing, never
 * statutory phrasing — the annotation layer's claimUseCases are the bridge,
 * and these assertions are what prove the bridge carries weight. When one of
 * these fails the fix is annotation vocabulary, never a scoring weight.
 */
describe('launch demo criteria — the expert gauntlet', () => {
  test('steering: the 1952 subchapter G pair leads', () => {
    const r = corpus.findSupporting('adjuster says my customer has to use their network shop');
    expect(['1952.301', '1952.302']).toContain(r.hits[0]!.section.cite);
  });
  test('the Texas headliner: invoking appraisal on a lowball reaches 1813.003 first', () => {
    const r = corpus.findSupporting('customer wants to invoke appraisal on a lowball estimate');
    expect(r.hits[0]!.section.cite).toBe('1813.003');
  });
  test('supplement sitting unanswered: the 542 deadlines in the top three', () => {
    const r = corpus.findSupporting('supplement has been sitting for two months with no answer from the carrier');
    const top3 = r.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3.some((c) => c.startsWith('542.05'))).toBe(true);
  });
  test('the 18% letter: 542.060 in the top three', () => {
    const r = corpus.findSupporting('what interest and attorney fees does the insurer owe for slow paying the claim');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('542.060');
  });
  test('artificially low labor rates: Bulletin B-0031-10 in the top three', () => {
    const r = corpus.findSupporting('insurer sets reimbursement rates artificially low and repairs would be substandard');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('B-0031-10');
  });
  test('parts choice: 1952.301 or the 5.501 notice in the top three', () => {
    const r = corpus.findSupporting('carrier wrote the estimate with aftermarket parts and says that is all they cover');
    const top3 = r.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3.some((c) => c === '1952.301' || c === '5.501')).toBe(true);
  });
  test('storage on a total loss: 2303.156 in the top three', () => {
    const r = corpus.findSupporting('insurer paid the total loss but will not pay the storage charges');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('2303.156');
  });
  test('abandoned vehicle: the possessory lien family in the top three', () => {
    const r = corpus.findSupporting('customer will not pay for the repair and the car is sitting here, can I hold or sell it');
    const top3 = r.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3.some((c) => c === '70.001' || c === '70.006')).toBe(true);
  });
  test('final paycheck: 61.014 first', () => {
    const r = corpus.findSupporting('tech quit yesterday, when is his final check due');
    expect(r.hits[0]!.section.cite).toBe('61.014');
  });
  test('comeback chargeback: 61.018 in the top three', () => {
    const r = corpus.findSupporting('can I deduct the cost of a comeback from my painter\'s paycheck');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('61.018');
  });
  test('total loss threshold: 501.091 in the top three', () => {
    const r = corpus.findSupporting('when is it legally a total loss in Texas, repair cost versus actual cash value');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('501.091');
  });
  test('an exact cite short-circuits at 1.0', () => {
    const r = corpus.search('Tex. Ins. Code 1952.301');
    expect(r.hits[0]!.score).toBe(1);
    expect(r.hits[0]!.breakdown.citation).toBe(1);
  });
  test('a chapter listing works for the prompt payment subchapter', () => {
    const r = corpus.search('542');
    expect(r.chapterListing).toBe(true);
    expect(r.hits.length).toBeGreaterThan(8);
  });
});

describe('TxAdapter as a SourceAdapter', () => {
  const adapter = new TxAdapter(corpus);

  test('getById round-trips the dotted-code id namespace', async () => {
    const item = await adapter.getById('tex. ins. code:1952.301');
    expect(item?.metadata.record.cite).toBe('1952.301');
  });

  test('sectionToItem title starts with the display cite', () => {
    const section = corpus.getSection('Tex. Ins. Code 1952.301')!;
    const item = adapter.sectionToItem(section);
    expect(item.title.startsWith(displayCite(section))).toBe(true);
  });
});
