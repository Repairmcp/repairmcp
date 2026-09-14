import { describe, expect, test } from 'bun:test';
import { PA_CODES, PA_DOMAINS, PaCorpusFileSchema, PaSectionSchema } from '../src/schema.js';

const base = {
  cite: '62.3', code: '31 Pa. Code', chapter: 'Chapter 62', chapterTitle: 'Motor Vehicle Physical Damage Appraisers',
  heading: 'Applicable standards for appraisal.', text: '(a) The appraisal shall: …',
  effectiveDate: '1999-10-23', domain: 'insurance',
  sourceUrl: 'https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/031/chapter62/s62.3.html&d=reduce',
  captureSource: 'pacode', headingSource: 'source',
};

describe('PA schema', () => {
  test('ten codes, three domains, no safety', () => {
    expect(PA_CODES.length).toBe(10);
    expect(PA_DOMAINS).toEqual(['insurance', 'repair_law', 'employment']);
  });
  test('a regulation section parses; captureSource and headingSource are required; foreign codes are refused', () => {
    expect(PaSectionSchema.parse(base).captureSource).toBe('pacode');
    expect(() => PaSectionSchema.parse({ ...base, captureSource: undefined })).toThrow();
    expect(() => PaSectionSchema.parse({ ...base, headingSource: undefined })).toThrow();
    expect(() => PaSectionSchema.parse({ ...base, code: 'N.Y. Ins. Law' })).toThrow();
  });
  test('actSection is present exactly on P.S. sections', () => {
    const act = { ...base, code: '43 P.S.', cite: '260.5', chapter: 'Wage Payment and Collection Law', captureSource: 'legis', actSection: '5', dateKind: 'amended' };
    expect(PaSectionSchema.parse(act).actSection).toBe('5');
    expect(() => PaSectionSchema.parse({ ...act, actSection: undefined })).toThrow(/actSection/);
    expect(() => PaSectionSchema.parse({ ...base, actSection: '5' })).toThrow(/actSection/);
  });
  test('dateKind is required on P.S. sections and forbidden elsewhere', () => {
    const act = { ...base, code: '63 P.S.', cite: '861', chapter: 'Motor Vehicle Physical Damage Appraiser Act', captureSource: 'legis', actSection: '11' };
    expect(() => PaSectionSchema.parse(act)).toThrow(/dateKind/);
    expect(PaSectionSchema.parse({ ...act, dateKind: 'enacted' }).dateKind).toBe('enacted');
    expect(() => PaSectionSchema.parse({ ...base, dateKind: 'amended' })).toThrow(/dateKind/);
  });
  test('corpus meta requires the Pennsylvania Code currency sentence', () => {
    const meta = { state: 'PA', capturedAt: '2026-09-14', currentThrough: '2026-09-14', sourceNote: 'x', sourceUrl: 'https://www.legis.state.pa.us/', paCodeEffectiveThrough: '56 Pa.B. 4026 (July 4, 2026)' };
    expect(PaCorpusFileSchema.parse({ meta, sections: [base] }).meta.paCodeEffectiveThrough).toBe('56 Pa.B. 4026 (July 4, 2026)');
    expect(() => PaCorpusFileSchema.parse({ meta: { ...meta, paCodeEffectiveThrough: undefined }, sections: [base] })).toThrow();
  });
});
