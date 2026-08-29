import { describe, expect, test } from 'bun:test';
import { CoCorpusFileSchema, CoSectionSchema, CO_CODES, CO_DOMAINS } from '../src/schema.js';
import { CO_TOPICS, CO_CITE_PREFIX_TOPICS, baselineTopics } from '../src/taxonomy.js';

const base = {
  cite: '10-4-120',
  code: 'CRS',
  chapter: '10-4',
  chapterTitle: 'Property and Casualty Insurance',
  heading: 'Unfair or discriminatory trade practices.',
  text: '(1) The general assembly finds…',
  domain: 'insurance',
  sourceUrl: 'https://olls.info/crs/crs2026-title-10.htm',
};

describe('CO schema', () => {
  test('codes and domains are the CO enums', () => {
    expect([...CO_CODES]).toEqual(['CRS', '3 CCR', '4 CCR', '7 CCR', 'Colorado DOI Bulletin']);
    expect([...CO_DOMAINS]).toEqual(['insurance', 'repair_law', 'employment']);
  });
  test('a CRS section validates without an effectiveDate', () => {
    expect(CoSectionSchema.parse(base).cite).toBe('10-4-120');
  });
  test('a CCR section carries ccrRuleVersionId and effectiveDate', () => {
    const reg = CoSectionSchema.parse({
      ...base, code: '3 CCR', cite: '702-5-1-14', chapter: '702-5',
      chapterTitle: 'Property and Casualty', effectiveDate: '2025-12-30',
      ccrRuleVersionId: '11592',
    });
    expect(reg.ccrRuleVersionId).toBe('11592');
  });
  test('an unknown code is rejected', () => {
    expect(() => CoSectionSchema.parse({ ...base, code: 'WAC' })).toThrow();
  });
  test('meta requires the CRS edition and currency note', () => {
    expect(() =>
      CoCorpusFileSchema.parse({
        meta: {
          state: 'CO', capturedAt: '2026-08-28', currentThrough: '2026-08-28',
          sourceNote: 'x', sourceUrl: 'https://leg.colorado.gov',
        },
        sections: [base],
      }),
    ).toThrow(); // missing crsEdition/crsCurrencyNote
  });
  test('every prefix-map topic is a known topic', () => {
    const known = new Set<string>(CO_TOPICS);
    for (const topics of Object.values(CO_CITE_PREFIX_TOPICS)) {
      for (const t of topics) expect(known.has(t)).toBe(true);
    }
  });
  test('baseline topics resolve by longest prefix', () => {
    expect(baselineTopics('10-4-120')).toContain('steering');
    expect(baselineTopics('702-5-1-14')).toContain('prompt_payment');
    expect(baselineTopics('99-99-999')).toEqual([]);
  });
});
