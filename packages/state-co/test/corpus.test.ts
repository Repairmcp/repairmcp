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
