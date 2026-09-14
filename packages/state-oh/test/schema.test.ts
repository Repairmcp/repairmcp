import { describe, expect, test } from 'bun:test';
import { OH_CODES, OH_DOMAINS, OhCorpusFileSchema, OhSectionSchema } from '../src/schema.js';

const orc = {
  cite: '4505.101', code: 'ORC', chapter: '4505', chapterTitle: 'Certificate Of Motor Vehicle Title Law',
  heading: 'Certificate of title to unclaimed motor vehicle.', text: '(A)(1) Any repair garage or place of storage …',
  effectiveDate: '2023-04-07', domain: 'repair_law',
  sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-4505.101',
  captureSource: 'chapter', latestLegislation: 'House Bill 507 - 134th General Assembly',
};
const oac = {
  cite: '3901-1-54', code: 'OAC', chapter: '3901-1', chapterTitle: 'General Provisions',
  heading: 'Unfair property/casualty claims settlement practices.', text: '(A) Purpose …',
  effectiveDate: '2022-02-14', domain: 'insurance',
  sourceUrl: 'https://codes.ohio.gov/ohio-administrative-code/rule-3901-1-54',
  captureSource: 'chapter', authorizedBy: '3901.041', amplifies: '3901.19 to 3901.26',
  fiveYearReviewDate: '2027-02-27', priorEffectiveDates: ['1993-09-01', '2004-11-12', '2007-04-05', '2016-11-03'],
};
const constitution = {
  cite: 'art. II, § 34a', code: 'Ohio Const.', chapter: 'art. II', chapterTitle: 'Legislative',
  heading: 'Minimum Wage', text: 'Except as provided in this section, every employer shall pay …',
  effectiveDate: '2006-12-08', domain: 'employment',
  sourceUrl: 'https://codes.ohio.gov/ohio-constitution/section-2.34a',
  captureSource: 'section',
};

describe('OH schema', () => {
  test('three codes, four domains including safety', () => {
    expect(OH_CODES).toEqual(['ORC', 'OAC', 'Ohio Const.']);
    expect(OH_DOMAINS).toEqual(['insurance', 'repair_law', 'employment', 'safety']);
  });
  test('the three shapes parse; captureSource and effectiveDate are required; foreign codes are refused', () => {
    expect(OhSectionSchema.parse(orc).captureSource).toBe('chapter');
    expect(OhSectionSchema.parse(oac).priorEffectiveDates?.length).toBe(4);
    expect(OhSectionSchema.parse(constitution).cite).toBe('art. II, § 34a');
    expect(() => OhSectionSchema.parse({ ...orc, captureSource: undefined })).toThrow();
    expect(() => OhSectionSchema.parse({ ...orc, effectiveDate: undefined })).toThrow();
    expect(() => OhSectionSchema.parse({ ...orc, code: '31 Pa. Code' })).toThrow();
  });
  test('latestLegislation is present exactly on ORC sections', () => {
    expect(() => OhSectionSchema.parse({ ...orc, latestLegislation: undefined })).toThrow(/latestLegislation/);
    expect(() => OhSectionSchema.parse({ ...oac, latestLegislation: 'x' })).toThrow(/latestLegislation/);
    expect(() => OhSectionSchema.parse({ ...constitution, latestLegislation: 'x' })).toThrow(/latestLegislation/);
  });
  test('the Supplemental Information fields are OAC-only', () => {
    expect(() => OhSectionSchema.parse({ ...orc, priorEffectiveDates: ['2000-01-01'] })).toThrow(/OAC/);
    expect(() => OhSectionSchema.parse({ ...orc, fiveYearReviewDate: '2030-01-01' })).toThrow(/OAC/);
    expect(OhSectionSchema.parse({ ...oac, priorEffectiveDates: undefined, fiveYearReviewDate: undefined }).cite).toBe('3901-1-54');
  });
  test('statusNote is optional on any code', () => {
    expect(OhSectionSchema.parse({ ...orc, statusNote: "Governor's veto not reflected; see H.B. 434 status report" }).statusNote).toContain('veto');
  });
  test('corpus meta requires state OH and the newest effective date', () => {
    const meta = { state: 'OH', capturedAt: '2026-09-14', currentThrough: '2026-09-14', sourceNote: 'x', sourceUrl: 'https://codes.ohio.gov/', newestEffectiveDate: '2026-03-21' };
    expect(OhCorpusFileSchema.parse({ meta, sections: [orc] }).meta.newestEffectiveDate).toBe('2026-03-21');
    expect(() => OhCorpusFileSchema.parse({ meta: { ...meta, newestEffectiveDate: undefined }, sections: [orc] })).toThrow();
    expect(() => OhCorpusFileSchema.parse({ meta: { ...meta, state: 'PA' }, sections: [orc] })).toThrow();
  });
});
