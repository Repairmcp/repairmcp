import { describe, expect, test } from 'bun:test';
import { IL_CAPTURE_SOURCES, IL_CODES, IL_DOMAINS, IlCorpusFileSchema, IlSectionSchema } from '../src/schema.js';

export const actSection = {
  cite: '815 ILCS 308/15', code: 'ILCS', chapter: '815 ILCS 308', chapterTitle: 'Automotive Collision Repair Act',
  heading: 'Disclosure to consumers; estimates.', headingSource: 'section',
  text: '(a) No work for compensation that exceeds $100 shall be commenced without specific authorization from the consumer after the disclosure set forth in this Section.',
  effectiveDate: '2004-01-01', domain: 'repair_law', captureSource: 'act',
  sourceUrl: 'https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2500&ChapterID=67',
  sourceNote: 'P.A. 93-565, eff. 1-1-04.', publicActs: ['P.A. 93-565'],
};
export const articleSection = {
  cite: '820 ILCS 115/9', code: 'ILCS', chapter: '820 ILCS 115', chapterTitle: 'Illinois Wage Payment and Collection Act',
  heading: 'Deductions from wages or final compensation', headingSource: 'manifest',
  text: 'Except as hereinafter provided, deductions by employers from wages or final compensation are prohibited unless …',
  effectiveDate: '2026-06-01', domain: 'employment', captureSource: 'act',
  sourceUrl: 'https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2402&ChapterID=68',
  sourceNote: 'P.A. 104-457, eff. 6-1-26.', publicActs: ['P.A. 104-457'], formerCite: 'from Ch. 48, par. 39m-9',
  printedVersions: [
    { label: 'before amendment by P.A. 104-457', publicActs: ['P.A. 97-120'], effectiveDate: '2012-01-01' },
    { label: 'after amendment by P.A. 104-457', publicActs: ['P.A. 104-457'], effectiveDate: '2026-06-01' },
  ],
  versionNote: 'Printed in 2 versions on ilga.gov at capture: before amendment by P.A. 104-457; after amendment by P.A. 104-457 — this corpus carries "after amendment by P.A. 104-457".',
};
export const partSection = {
  cite: '56 Ill. Adm. Code 210.440', code: 'Ill. Adm. Code', chapter: '56 Ill. Adm. Code 210', chapterTitle: 'Minimum Wage Law',
  heading: 'Overtime – General', headingSource: 'section',
  text: 'a) The Act does not require that an employee be paid overtime compensation for hours in excess of eight per day …',
  effectiveDate: '1995-05-02', domain: 'employment', captureSource: 'part',
  sourceUrl: 'https://www.ilga.gov/commission/jcar/admincode/056/056002100D04400R.html',
  sourceNote: 'Adopted at 19 Ill. Reg. 6576, effective May 2, 1995; amended at 20 Ill. Reg. 15312, effective November 15, 1996', dateSource: 'part',
};

describe('IL schema', () => {
  test('two codes, four domains, three capture surfaces', () => {
    expect(IL_CODES).toEqual(['ILCS', 'Ill. Adm. Code']);
    expect(IL_DOMAINS).toEqual(['insurance', 'repair_law', 'employment', 'safety']);
    expect(IL_CAPTURE_SOURCES).toEqual(['act', 'article', 'part']);
  });
  test('the three shapes parse; effectiveDate is optional (the silence path); foreign codes are refused', () => {
    expect(IlSectionSchema.parse(actSection).captureSource).toBe('act');
    expect(IlSectionSchema.parse(articleSection).printedVersions?.length).toBe(2);
    expect(IlSectionSchema.parse(partSection).dateSource).toBe('part');
    expect(IlSectionSchema.parse({ ...actSection, effectiveDate: undefined }).effectiveDate).toBeUndefined();
    expect(() => IlSectionSchema.parse({ ...actSection, captureSource: undefined })).toThrow();
    expect(() => IlSectionSchema.parse({ ...actSection, headingSource: undefined })).toThrow();
    expect(() => IlSectionSchema.parse({ ...actSection, sourceNote: '' })).toThrow();
    expect(() => IlSectionSchema.parse({ ...actSection, code: 'ORC' })).toThrow();
  });
  test('publicActs is present exactly on ILCS sections; the version fields are ILCS-only', () => {
    expect(() => IlSectionSchema.parse({ ...actSection, publicActs: undefined })).toThrow(/publicActs/);
    expect(() => IlSectionSchema.parse({ ...partSection, publicActs: [] })).toThrow(/publicActs/);
    expect(() => IlSectionSchema.parse({ ...partSection, formerCite: 'x' })).toThrow(/ILCS/);
    expect(() => IlSectionSchema.parse({ ...articleSection, versionNote: undefined })).toThrow(/travel together/);
  });
  test('dateSource is present exactly on Adm. Code sections and an inherited date must exist', () => {
    expect(() => IlSectionSchema.parse({ ...partSection, dateSource: undefined })).toThrow(/dateSource/);
    expect(() => IlSectionSchema.parse({ ...actSection, dateSource: 'section' })).toThrow(/dateSource/);
    expect(() => IlSectionSchema.parse({ ...partSection, effectiveDate: undefined })).toThrow(/inherited/);
    expect(() => IlSectionSchema.parse({ ...actSection, illRegCite: '1 Ill. Reg. 1' })).toThrow(/illRegCite/);
  });
  test('corpus meta requires state IL, the newest effective date, and the dual-print record', () => {
    const meta = { state: 'IL', capturedAt: '2026-09-15', currentThrough: '2026-09-15', sourceNote: 'x', sourceUrl: 'https://www.ilga.gov/', newestEffectiveDate: '2026-06-01', dualPrinted: [] };
    expect(IlCorpusFileSchema.parse({ meta, sections: [actSection] }).meta.newestEffectiveDate).toBe('2026-06-01');
    expect(() => IlCorpusFileSchema.parse({ meta: { ...meta, dualPrinted: undefined }, sections: [actSection] })).toThrow();
    expect(() => IlCorpusFileSchema.parse({ meta: { ...meta, state: 'OH' }, sections: [actSection] })).toThrow();
  });
});
