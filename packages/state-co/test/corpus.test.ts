import { describe, expect, test } from 'bun:test';
import corpusJson from '../data/co-law-corpus.json' with { type: 'json' };
import annotationsJson from '../data/co-annotations.json' with { type: 'json' };
import { CoAdapter } from '../src/adapter.js';
import { CoCorpus } from '../src/corpus.js';
import { CRS_EDITION, displayCite } from '../src/identity.js';
import { CO_TOPICS } from '../src/taxonomy.js';

const corpus = new CoCorpus(corpusJson, annotationsJson);

describe('the committed corpus', () => {
  test('validates and holds all three domains', () => {
    const domains = corpus.domainBreakdown();
    expect(domains.insurance).toBeGreaterThan(13);
    expect(domains.repair_law).toBeGreaterThan(15);
    expect(domains.employment).toBeGreaterThan(6);
  });
  test('the CRS_EDITION pin matches the corpus — the yearly rollover tripwire', () => {
    expect((corpus.meta as { crsEdition?: string }).crsEdition).toBe(CRS_EDITION);
  });
  test('CRS sections never carry effective dates; CCR sections always do, with a version id', () => {
    for (const s of corpus.sections) {
      if (s.code === 'CRS') {
        expect(s.effectiveDate).toBeUndefined();
        expect(s.ccrRuleVersionId).toBeUndefined();
      } else if (s.code !== 'Colorado DOI Bulletin') {
        expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.ccrRuleVersionId).toMatch(/^\d+$/);
      }
    }
  });
  test('the bulletin is one section with its issue date', () => {
    const bulletins = corpus.sections.filter((s) => s.code === 'Colorado DOI Bulletin');
    expect(bulletins.length).toBe(1);
    expect(bulletins[0]!.effectiveDate).toBe('2016-09-19');
  });
  test('the PUC series never leaked past the towing band', () => {
    for (const s of corpus.sections.filter((x) => x.code === '4 CCR')) {
      expect(s.cite.startsWith('723-6-65')).toBe(true);
    }
    expect(corpus.sections.filter((x) => x.code === '4 CCR').length).toBeLessThan(45);
  });
  test('every topic reaches at least one section — no dead topics, structurally', () => {
    const reachable = new Set<string>();
    for (const s of corpus.sections) for (const t of corpus.topicsFor(s)) reachable.add(t);
    for (const topic of CO_TOPICS) {
      expect(reachable.has(topic), `topic ${topic} reaches no section`).toBe(true);
    }
  });
  test('the first-party statutory remedy sections (10-3-1115, 10-3-1116) are in the corpus', () => {
    const s1115 = corpus.getSection('CRS 10-3-1115');
    const s1116 = corpus.getSection('CRS 10-3-1116');
    expect(s1115?.domain).toBe('insurance');
    expect(s1116?.domain).toBe('insurance');
    expect(s1116?.text).toContain('two times the covered benefit');
  });
  test('getSection tolerates every citation spelling', () => {
    for (const input of ['CRS 10-4-120', 'crs:10-4-120', '10-4-120']) {
      expect(corpus.getSection(input)?.cite).toBe('10-4-120');
    }
    for (const input of ['3 CCR 702-5-1-14', 'Reg 5-1-14']) {
      expect(corpus.getSection(input)?.cite).toBe('702-5-1-14');
    }
    expect(corpus.getSection('COMPS Rule 5.2')?.cite).toBe('1103-1-5.2');
    expect(corpus.getSection('B-5.04')?.cite).toBe('B-5.04');
    expect(corpus.getSection('CRS 99-99-999')).toBeNull();
  });
});

/**
 * The launch bar (kickoff §7). Every query is shop-floor phrasing, never
 * statutory phrasing — the annotation layer's claimUseCases are the bridge,
 * and these assertions are what prove the bridge carries weight. When one of
 * these fails the fix is annotation vocabulary, never a scoring weight.
 */
describe('launch demo criteria — the expert gauntlet', () => {
  test('steering: 10-4-120 first', () => {
    const r = corpus.findSupporting('adjuster says my customer has to use their network shop');
    expect(r.hits[0]!.section.cite).toBe('10-4-120');
  });
  test('the killer demo: OEM procedure short-pay reaches 10-4-120 with the (3)(e) excerpt', () => {
    const r = corpus.findSupporting(
      'insurer refuses to pay for the OEM procedure and is short-paying the repair',
    );
    expect(r.hits[0]!.section.cite).toBe('10-4-120');
    expect(r.hits[0]!.annotation?.quoteSafeExcerpts?.some((e) => e.includes('reasonable costs'))).toBe(
      true,
    );
  });
  test('undisclosed aftermarket parts: 10-3-1305 in the top three', () => {
    const r = corpus.findSupporting('estimate written with aftermarket parts and nobody told the customer');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('10-3-1305');
  });
  test('supplement sitting: Reg 5-1-14 in the top three', () => {
    const r = corpus.findSupporting('supplement has been sitting for two months with no answer from the carrier');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('702-5-1-14');
  });
  test('total loss taxes and fees: 10-4-639 in the top three', () => {
    const r = corpus.findSupporting('total loss but they will not pay the sales tax and registration fees');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('10-4-639');
  });
  test('authorization: 42-9-104 in the top three', () => {
    const r = corpus.findSupporting('customer never authorized the extra work before we started');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('42-9-104');
  });
  test('over the estimate and storage: 42-9-106 in the top three', () => {
    const r = corpus.findSupporting('final bill came in over the written estimate and now storage charges');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('42-9-106');
  });
  test('painter breaks: the COMPS rest rule in the top three', () => {
    const r = corpus.findSupporting('do my painters get paid rest breaks during the shift');
    expect(r.hits.slice(0, 3).map((h) => h.section.cite)).toContain('1103-1-5.2');
  });
  test('flag-hour overtime: the exemption rule surfaces WITH the dealers caveat', () => {
    const r = corpus.findSupporting('are my flag rate techs exempt from overtime');
    const hit = r.hits.slice(0, 3).find((h) => h.section.cite === '1103-1-2.4.1');
    expect(hit).toBeDefined();
    expect(hit!.annotation?.claimUseCases?.some((u) => /dealer/i.test(u))).toBe(true);
  });
  test('final paycheck: 8-4-109 first', () => {
    const r = corpus.findSupporting('tech quit and still has my tools, when is his final check due');
    expect(r.hits[0]!.section.cite).toBe('8-4-109');
  });
  /**
   * Added after the brief was written: 10-3-1115/-1116 landed in the corpus
   * later (task 10's CRS additions), and they are the only sections in it
   * that answer "what can we actually DO about it" with a money remedy. The
   * scenario earns a slot because the honest-caveat annotation on 10-3-1104
   * ("no private right of action of its own") is only useful if the section
   * that DOES carry one outranks it on exactly this question.
   */
  test('statutory first-party remedy: 10-3-1115 or 10-3-1116 in the top three', () => {
    const r = corpus.findSupporting("can I sue the insurer for unreasonably delaying my customer's claim");
    const top3 = r.hits.slice(0, 3).map((h) => h.section.cite);
    expect(top3.some((c) => c === '10-3-1115' || c === '10-3-1116')).toBe(true);
  });
  test('an exact cite short-circuits at 1.0', () => {
    const r = corpus.search('CRS 10-4-120');
    expect(r.hits[0]!.score).toBe(1);
    expect(r.hits[0]!.breakdown.citation).toBe(1);
  });
  test('a chapter listing works for the repair act', () => {
    const r = corpus.search('42-9');
    expect(r.chapterListing).toBe(true);
    expect(r.hits.length).toBeGreaterThan(8);
  });
});

describe('CoAdapter as a SourceAdapter', () => {
  const adapter = new CoAdapter(corpus);

  test('getById round-trips the space-bearing CCR id namespace', async () => {
    const item = await adapter.getById('3 ccr:702-5-1-14');
    expect(item?.metadata.record.cite).toBe('702-5-1-14');
  });

  test('sectionToItem title starts with the display cite', () => {
    const section = corpus.getSection('CRS 10-4-120')!;
    const item = adapter.sectionToItem(section);
    expect(item.title.startsWith(displayCite(section))).toBe(true);
  });
});
