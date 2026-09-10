import { describe, expect, test } from 'bun:test';
import { NY_CODES, NY_DOMAINS, NyCorpusFileSchema, NySectionSchema } from '../src/schema.js';

const base = {
  cite: '2610', code: 'N.Y. Ins. Law', chapter: 'art. 26', chapterTitle: 'Unfair Claim Settlement Practices; Other Misconduct',
  heading: 'Collision or comprehensive coverage on motor vehicles; claims; repairs', text: '(a) Whenever …',
  effectiveDate: '2017-06-23', domain: 'insurance', sourceUrl: 'https://www.nysenate.gov/legislation/laws/ISC/2610', captureSource: 'senate',
};

describe('NY schema', () => {
  test('ten codes, three domains, no safety', () => {
    expect(NY_CODES.length).toBe(10);
    expect(NY_DOMAINS).toEqual(['insurance', 'repair_law', 'employment']);
  });
  test('a statute section parses; captureSource is required; foreign codes are refused', () => {
    expect(NySectionSchema.parse(base).captureSource).toBe('senate');
    expect(() => NySectionSchema.parse({ ...base, captureSource: undefined })).toThrow();
    expect(() => NySectionSchema.parse({ ...base, code: 'Fla. Stat.' })).toThrow();
  });
  test('dfsWithdrawnDate is present exactly when dfsStatus is withdrawn', () => {
    const dfs = { ...base, code: 'DFS Guidance', cite: 'Circular Letter 16 (2000)', captureSource: 'dfs', dfsStatus: 'withdrawn', dfsWithdrawnDate: '2003-12-04' };
    expect(NySectionSchema.parse(dfs).dfsWithdrawnDate).toBe('2003-12-04');
    expect(() => NySectionSchema.parse({ ...dfs, dfsStatus: 'current' })).toThrow(/withdrawn/);
    expect(() => NySectionSchema.parse({ ...dfs, dfsWithdrawnDate: undefined })).toThrow(/withdrawn/);
  });
  test('corpus meta requires the CR-82 edition and the Part 142 amendment date', () => {
    const meta = { state: 'NY', capturedAt: '2026-09-10', currentThrough: '2026-09-10', sourceNote: 'x', sourceUrl: 'https://www.nysenate.gov/legislation/laws', cr82Edition: 'CR-82 (5/26)', part142EffectiveDate: '2020-06-24' };
    expect(NyCorpusFileSchema.parse({ meta, sections: [base] }).meta.cr82Edition).toBe('CR-82 (5/26)');
    expect(() => NyCorpusFileSchema.parse({ meta: { ...meta, cr82Edition: undefined }, sections: [base] })).toThrow();
  });
});
