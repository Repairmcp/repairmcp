import { afterAll, describe, expect, test } from 'bun:test';
import {
  MCA_EDITION,
  MCA_EDITION_NOTE,
  displayCite,
  formatMtCitation,
  mtId,
  parseMtId,
  resolveMtCitationQuery,
} from '../src/identity.js';
import type { MtSection } from '../src/schema.js';

const MCA_SECTION: MtSection = {
  cite: '33-18-224',
  code: 'MCA',
  chapter: '33-18',
  chapterTitle: 'Unfair Trade Practices',
  heading: 'Designation of specific automobile body repair businesses prohibited.',
  text: 'Filler source text for citation validation only.',
  historyNote: 'History: En. Sec. 1, Ch. 471, L. 1991.',
  domain: 'insurance',
  sourceUrl:
    'https://mca.legmt.gov/bills/mca/title_0330/chapter_0180/part_0020/section_0240/0330-0180-0020-0240.html',
};

const ARM_SECTION: MtSection = {
  cite: '6.6.1701',
  code: 'ARM',
  chapter: '6.6',
  chapterTitle: 'Insurance Department',
  heading: 'GENERAL BUSINESS PRACTICE OR GENERAL COURSE OF BUSINESS PRACTICE',
  text: 'Filler source text for citation validation only.',
  effectiveDate: '1983-10-28',
  historyNote: 'NEW, 1983 MAR p. 1533, Eff. 10/28/83.',
  domain: 'insurance',
  sourceUrl: 'https://rules.mt.gov/browse/collections/c/policies/p',
  sourceHash: 'a'.repeat(64),
};

describe('id namespace', () => {
  test('round-trips both codes', () => {
    expect(mtId('MCA', '33-18-224')).toBe('mca:33-18-224');
    expect(mtId('ARM', '6.6.1701')).toBe('arm:6.6.1701');
    expect(parseMtId('mca:33-18-224')).toEqual({ code: 'MCA', cite: '33-18-224' });
    expect(parseMtId(' arm:6.6.1701 ')).toEqual({ code: 'ARM', cite: '6.6.1701' });
  });

  test('rejects junk and other states\' ids', () => {
    expect(parseMtId('wac:284-30-330')).toBeNull();
    expect(parseMtId('33-18-224')).toBeNull();
    expect(parseMtId('')).toBeNull();
  });
});

describe('resolveMtCitationQuery', () => {
  test('bare separators are the OPPOSITE of Washington: hyphens are MCA, dots are ARM', () => {
    expect(resolveMtCitationQuery('33-18-224')).toEqual({
      kind: 'section',
      code: 'MCA',
      cite: '33-18-224',
    });
    expect(resolveMtCitationQuery('6.6.1701')).toEqual({
      kind: 'section',
      code: 'ARM',
      cite: '6.6.1701',
    });
  });

  test('code words and id forms resolve', () => {
    expect(resolveMtCitationQuery('MCA 33-18-224')).toEqual({
      kind: 'section',
      code: 'MCA',
      cite: '33-18-224',
    });
    expect(resolveMtCitationQuery('arm 23.19.203')).toEqual({
      kind: 'section',
      code: 'ARM',
      cite: '23.19.203',
    });
    expect(resolveMtCitationQuery('mca:33-18-201')).toEqual({
      kind: 'section',
      code: 'MCA',
      cite: '33-18-201',
    });
  });

  test('two groups resolve as a chapter', () => {
    expect(resolveMtCitationQuery('MCA 33-18')).toEqual({
      kind: 'chapter',
      code: 'MCA',
      chapter: '33-18',
    });
    expect(resolveMtCitationQuery('23.19')).toEqual({
      kind: 'chapter',
      code: 'ARM',
      chapter: '23.19',
    });
  });

  test('plain language is not a citation', () => {
    expect(resolveMtCitationQuery('unfair claim settlement practices')).toBeNull();
    expect(resolveMtCitationQuery('what does MCA 33-18-224 say about steering')).toBeNull();
  });
});

describe('formatMtCitation', () => {
  test('MCA citations carry the edition, never a fabricated date', () => {
    const citation = formatMtCitation(MCA_SECTION);
    expect(citation.shortForm).toBe('MCA 33-18-224, 2025 edition');
    expect(citation.publishedAt).toBeUndefined();
    expect(citation.longForm).toBe(
      'Montana Code Annotated 33-18-224 (Designation of specific automobile body repair businesses prohibited.), ' +
        'chapter 33-18 MCA (Unfair Trade Practices), 2025 edition, ' +
        MCA_SECTION.sourceUrl,
    );
    expect(citation.itemId).toBe('mca:33-18-224');
  });

  test('ARM citations carry the real effective date', () => {
    const citation = formatMtCitation(ARM_SECTION);
    expect(citation.shortForm).toBe('ARM 6.6.1701, effective 10/28/1983');
    expect(citation.publishedAt?.toISOString()).toBe('1983-10-28T00:00:00.000Z');
  });

  test('the edition note derives from the pinned MCA_EDITION constant', () => {
    expect(MCA_EDITION).toBe('Montana Code Annotated 2025');
    expect(MCA_EDITION_NOTE).toBe('2025 edition');
  });

  test('display cites pair code and cite', () => {
    expect(displayCite(MCA_SECTION)).toBe('MCA 33-18-224');
    expect(displayCite(ARM_SECTION)).toBe('ARM 6.6.1701');
  });
});

describe('timezone invariance', () => {
  const originalTz = process.env.TZ;
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  test('the ARM effective date renders identically in Pacific and Tokyo time', () => {
    process.env.TZ = 'America/Los_Angeles';
    const pacific = formatMtCitation(ARM_SECTION).shortForm;
    process.env.TZ = 'Asia/Tokyo';
    const tokyo = formatMtCitation(ARM_SECTION).shortForm;
    expect(pacific).toBe('ARM 6.6.1701, effective 10/28/1983');
    expect(tokyo).toBe(pacific);
  });
});
