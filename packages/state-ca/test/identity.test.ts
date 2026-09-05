import { describe, expect, test } from 'bun:test';
import {
  CA_CITE_CODES,
  caId,
  displayCite,
  formatCaCitation,
  parseCaId,
  resolveCaCitationQuery,
} from '../src/identity.js';
import type { CaSection } from '../src/schema.js';
import { CA_DIR_SOURCES, CA_LII_SOURCES } from '../src/sources-regs.js';
import { CA_STATUTE_SOURCES } from '../src/sources-statutes.js';

const SECTION: CaSection = {
  cite: '758.5',
  code: 'Cal. Ins. Code',
  chapter: '1, art. 5.1 (Div. 1, Pt. 2)',
  chapterTitle: 'Unlawful Practices',
  heading: 'Choice of automotive repair dealer',
  text: '(a) No insurer shall require …',
  effectiveDate: '2010-01-01',
  domain: 'insurance',
  sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=INS&sectionNum=758.5.',
  captureSource: 'leginfo',
  headingSource: 'manifest',
};

describe('resolveCaCitationQuery', () => {
  test('code-worded statute cites in several spellings', () => {
    for (const q of [
      'Cal. Ins. Code 758.5',
      'California Insurance Code 758.5',
      'Insurance Code §758.5',
      'Ins. Code Sec. 758.5',
      'Ins. Code Section 758.5.',
    ]) {
      expect(resolveCaCitationQuery(q)).toEqual({ kind: 'section', code: 'Cal. Ins. Code', cite: '758.5' });
    }
    for (const q of ['B&P 9884.9', 'BPC 9884.9', 'Bus. & Prof. Code 9884.9', 'Business and Professions Code § 9884.9']) {
      expect(resolveCaCitationQuery(q)).toEqual({ kind: 'section', code: 'Cal. Bus. & Prof. Code', cite: '9884.9' });
    }
    expect(resolveCaCitationQuery('Labor Code 226.2')).toEqual({ kind: 'section', code: 'Cal. Lab. Code', cite: '226.2' });
    expect(resolveCaCitationQuery('Civ. Code 3068')).toEqual({ kind: 'section', code: 'Cal. Civ. Code', cite: '3068' });
    expect(resolveCaCitationQuery('Vehicle Code 11515')).toEqual({ kind: 'section', code: 'Cal. Veh. Code', cite: '11515' });
  });

  test('CCR forms, titled and untitled', () => {
    for (const q of ['10 CCR 2695.8', 'Title 10 CCR § 2695.8', 'Cal. Code Regs. tit. 10, § 2695.8', '10 C.C.R. 2695.8', 'CCR 2695.8']) {
      expect(resolveCaCitationQuery(q)).toEqual({ kind: 'section', code: '10 CCR', cite: '2695.8' });
    }
    expect(resolveCaCitationQuery('16 CCR 3365')).toEqual({ kind: 'section', code: '16 CCR', cite: '3365' });
    expect(resolveCaCitationQuery('8 CCR 5446')).toEqual({ kind: 'section', code: '8 CCR', cite: '5446' });
    // A titled CCR cite for a section this corpus does not hold is still a
    // citation-shaped query (the corpus reports the miss); an untitled one
    // resolves only through the captured map.
    expect(resolveCaCitationQuery('10 CCR 2695.9')).toEqual({ kind: 'section', code: '10 CCR', cite: '2695.9' });
    expect(resolveCaCitationQuery('CCR 2695.9')).toBeNull();
  });

  test('bare cites resolve by exact section number — the uniqueness guarantee', () => {
    expect(resolveCaCitationQuery('758.5')).toEqual({ kind: 'section', code: 'Cal. Ins. Code', cite: '758.5' });
    expect(resolveCaCitationQuery('9884.9')).toEqual({ kind: 'section', code: 'Cal. Bus. & Prof. Code', cite: '9884.9' });
    expect(resolveCaCitationQuery('2695.81')).toEqual({ kind: 'section', code: '10 CCR', cite: '2695.81' });
    expect(resolveCaCitationQuery('5446')).toEqual({ kind: 'section', code: '8 CCR', cite: '5446' });
    expect(resolveCaCitationQuery('544')).toEqual({ kind: 'section', code: 'Cal. Veh. Code', cite: '544' });
    expect(resolveCaCitationQuery('§ 226.2')).toEqual({ kind: 'section', code: 'Cal. Lab. Code', cite: '226.2' });
    // An unknown number is not a citation — fuzzy scoring handles it.
    expect(resolveCaCitationQuery('999.9')).toBeNull();
    expect(resolveCaCitationQuery('labor rate survey')).toBeNull();
  });

  test('named aliases list chapters or fetch sections', () => {
    expect(resolveCaCitationQuery('Automotive Repair Act')).toEqual({
      kind: 'chapter', code: 'Cal. Bus. & Prof. Code', chapter: '20.3 (Div. 3)',
    });
    expect(resolveCaCitationQuery('the Fair Claims Settlement Practices Regulations')).toEqual({
      kind: 'chapter', code: '10 CCR', chapter: '5, subch. 7.5, art. 1 (Tit. 10)',
    });
    expect(resolveCaCitationQuery('Wage Order 9')).toEqual({ kind: 'section', code: '8 CCR', cite: '11090' });
    expect(resolveCaCitationQuery('IWC Wage Order No. 9-2001')).toEqual({ kind: 'section', code: '8 CCR', cite: '11090' });
    expect(resolveCaCitationQuery('Auto Body Repair Consumer Bill of Rights')).toEqual({ kind: 'section', code: '10 CCR', cite: '2695.85' });
  });

  test('id forms round-trip through the mixed-case code names', () => {
    expect(caId('Cal. Ins. Code', '758.5')).toBe('cal. ins. code:758.5');
    expect(parseCaId('cal. ins. code:758.5')).toEqual({ code: 'Cal. Ins. Code', cite: '758.5' });
    expect(parseCaId('cal. bus. & prof. code:9884.9')).toEqual({ code: 'Cal. Bus. & Prof. Code', cite: '9884.9' });
    expect(parseCaId('10 ccr:2695.8')).toEqual({ code: '10 CCR', cite: '2695.8' });
    expect(resolveCaCitationQuery('cal. ins. code:758.5')).toEqual({ kind: 'section', code: 'Cal. Ins. Code', cite: '758.5' });
    expect(resolveCaCitationQuery('8 ccr:5446')).toEqual({ kind: 'section', code: '8 CCR', cite: '5446' });
    expect(parseCaId('nope:1')).toBeNull();
  });
});

describe('CA_CITE_CODES', () => {
  test('covers every manifest cite exactly once — no number belongs to two codes', () => {
    const expected = new Map<string, string>();
    for (const source of CA_STATUTE_SOURCES) for (const s of source.sections) expected.set(s.cite, source.code);
    for (const source of CA_LII_SOURCES) expected.set(source.cite, source.code);
    for (const source of CA_DIR_SOURCES) expected.set(source.cite, '8 CCR');
    expect(Object.keys(CA_CITE_CODES).sort()).toEqual([...expected.keys()].sort());
    for (const [cite, code] of expected) expect(CA_CITE_CODES[cite]).toBe(code as never);
    // Prefix sharing across codes is real (Veh. Code 544 vs 8 CCR 5446) and
    // is exactly why resolution is by exact number, never by prefix.
    expect(CA_CITE_CODES['544']).toBe('Cal. Veh. Code');
    expect(CA_CITE_CODES['5446']).toBe('8 CCR');
  });
});

describe('formatCaCitation', () => {
  test('statute short form carries the effective date; long form the long code name and the chapter path', () => {
    const c = formatCaCitation(SECTION);
    expect(c.shortForm).toBe('Cal. Ins. Code 758.5, effective 1/1/2010');
    expect(c.longForm).toContain('California Insurance Code section 758.5 (Choice of automotive repair dealer)');
    expect(c.longForm).toContain('chapter 1, art. 5.1 (Div. 1, Pt. 2) Cal. Ins. Code (Unlawful Practices)');
    expect(c.longForm).toContain('effective 1/1/2010');
    expect(c.itemId).toBe('cal. ins. code:758.5');
    expect(c.publishedAt?.toISOString()).toBe('2010-01-01T00:00:00.000Z');
    expect(displayCite(SECTION)).toBe('Cal. Ins. Code 758.5');
  });

  test('a section with no stated date stays silent — no guessed clause', () => {
    const { effectiveDate: _omit, ...undated } = SECTION;
    const c = formatCaCitation({ ...undated, cite: '200', code: 'Cal. Lab. Code' });
    expect(c.shortForm).toBe('Cal. Lab. Code 200');
    expect(c.publishedAt).toBeUndefined();
  });

  test('a regulation cites its title code', () => {
    const c = formatCaCitation({
      ...SECTION,
      cite: '3365',
      code: '16 CCR',
      chapter: '1, art. 8 (Tit. 16, Div. 33)',
      chapterTitle: 'Bureau of Automotive Repair: Accepted Trade Standards',
      heading: 'Auto Body and Frame Repairs',
      effectiveDate: '1997-11-19',
      captureSource: 'lii',
      headingSource: 'source',
    });
    expect(c.shortForm).toBe('16 CCR 3365, effective 11/19/1997');
    expect(c.longForm).toContain('California Code of Regulations, Title 16, section 3365 (Auto Body and Frame Repairs)');
  });
});
