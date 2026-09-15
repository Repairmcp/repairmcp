import { describe, expect, test } from 'bun:test';
import { OAC_CITE_SHAPE, ORC_CITE_SHAPE, displayCite, formatOhCitation, ohId, ohStateIdentity, parseOhId, resolveOhCitationQuery } from '../src/identity.js';
import type { OhSection } from '../src/schema.js';
import { OH_CONST_CITE, manifestCites } from '../src/sources.js';
import { OH_CITE_TOPICS, OH_TOPICS } from '../src/taxonomy.js';

const orc: OhSection = { cite: '4505.101', code: 'ORC', chapter: '4505', chapterTitle: 'Certificate Of Motor Vehicle Title Law', heading: 'Certificate of title to unclaimed motor vehicle.', text: '(A)(1) …', effectiveDate: '2023-04-07', domain: 'repair_law', sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-4505.101', captureSource: 'chapter', latestLegislation: 'House Bill 507 - 134th General Assembly' };
const oac: OhSection = { cite: '3901-1-54', code: 'OAC', chapter: '3901-1', chapterTitle: 'General Provisions', heading: 'Unfair property/casualty claims settlement practices.', text: '(A) …', effectiveDate: '2022-02-14', domain: 'insurance', sourceUrl: 'https://codes.ohio.gov/ohio-administrative-code/rule-3901-1-54', captureSource: 'chapter' };
const constitution: OhSection = { cite: OH_CONST_CITE, code: 'Ohio Const.', chapter: 'art. II', chapterTitle: 'Legislative', heading: 'Minimum Wage', text: 'Except …', effectiveDate: '2006-12-08', domain: 'employment', sourceUrl: 'https://codes.ohio.gov/ohio-constitution/section-2.34a', captureSource: 'section' };

describe('resolveOhCitationQuery', () => {
  test('worded Revised Code cites in every common spelling', () => {
    for (const q of ['R.C. 4505.101', 'R.C. § 4505.101', 'RC 4505.101', 'ORC 4505.101', 'O.R.C. 4505.101', 'Ohio Rev. Code § 4505.101', 'Ohio Revised Code 4505.101', 'Ohio Rev. Code Ann. 4505.101', 'ORC section 4505.101', 'section 4505.101']) {
      expect(resolveOhCitationQuery(q), q).toEqual({ kind: 'section', code: 'ORC', cite: '4505.101' });
    }
    expect(resolveOhCitationQuery('ORC 4111.031')).toEqual({ kind: 'section', code: 'ORC', cite: '4111.031' });
  });
  test('worded Administrative Code cites, with and without colons', () => {
    for (const q of ['OAC 3901-1-54', 'O.A.C. 3901-1-54', 'Ohio Adm.Code 3901-1-54', 'Ohio Admin. Code 3901-1-54', 'Ohio Administrative Code 3901-1-54', 'OAC rule 3901-1-54', 'rule 3901-1-54']) {
      expect(resolveOhCitationQuery(q), q).toEqual({ kind: 'section', code: 'OAC', cite: '3901-1-54' });
    }
    expect(resolveOhCitationQuery('OAC 109:4-3-13')).toEqual({ kind: 'section', code: 'OAC', cite: '109:4-3-13' });
    expect(resolveOhCitationQuery('Ohio Adm.Code 4123:1-5-17')).toEqual({ kind: 'section', code: 'OAC', cite: '4123:1-5-17' });
  });
  test('the Constitution in its spellings', () => {
    for (const q of ['Ohio Const. art. II, § 34a', 'Ohio Constitution Article II, Section 34a', 'Article II, Section 34a', 'Ohio Const. art. 2, sec. 34a', 'Section 34a', '§ 34a', 'minimum wage amendment']) {
      expect(resolveOhCitationQuery(q), q).toEqual({ kind: 'section', code: 'Ohio Const.', cite: OH_CONST_CITE });
    }
  });
  test('bare numbers resolve by shape; chapters resolve by shape', () => {
    expect(resolveOhCitationQuery('4505.101')).toEqual({ kind: 'section', code: 'ORC', cite: '4505.101' });
    expect(resolveOhCitationQuery('3901-1-54')).toEqual({ kind: 'section', code: 'OAC', cite: '3901-1-54' });
    expect(resolveOhCitationQuery('109:4-3-13')).toEqual({ kind: 'section', code: 'OAC', cite: '109:4-3-13' });
    expect(resolveOhCitationQuery('Chapter 4505')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '4505' });
    expect(resolveOhCitationQuery('ORC Chapter 1345')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '1345' });
    expect(resolveOhCitationQuery('OAC Chapter 3901-1')).toEqual({ kind: 'chapter', code: 'OAC', chapter: '3901-1' });
    expect(resolveOhCitationQuery('Chapter 4123:1-5')).toEqual({ kind: 'chapter', code: 'OAC', chapter: '4123:1-5' });
  });
  test('named aliases', () => {
    expect(resolveOhCitationQuery('CSPA')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '1345' });
    expect(resolveOhCitationQuery('the Consumer Sales Practices Act')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '1345' });
    expect(resolveOhCitationQuery('unfair claims settlement')).toEqual({ kind: 'section', code: 'OAC', cite: '3901-1-54' });
    expect(resolveOhCitationQuery('claims settlement rule')).toEqual({ kind: 'section', code: 'OAC', cite: '3901-1-54' });
    expect(resolveOhCitationQuery('motor vehicle repair rule')).toEqual({ kind: 'section', code: 'OAC', cite: '109:4-3-13' });
    expect(resolveOhCitationQuery("AG repair rule")).toEqual({ kind: 'section', code: 'OAC', cite: '109:4-3-13' });
    expect(resolveOhCitationQuery('aftermarket crash parts')).toEqual({ kind: 'section', code: 'ORC', cite: '1345.81' });
    expect(resolveOhCitationQuery('VSSR')).toEqual({ kind: 'chapter', code: 'OAC', chapter: '4123:1-5' });
    expect(resolveOhCitationQuery('specific safety requirements')).toEqual({ kind: 'chapter', code: 'OAC', chapter: '4123:1-5' });
    expect(resolveOhCitationQuery('VSSR statute')).toEqual({ kind: 'section', code: 'ORC', cite: '4121.47' });
    expect(resolveOhCitationQuery('permit-by-rule')).toEqual({ kind: 'section', code: 'OAC', cite: '3745-31-30' });
    expect(resolveOhCitationQuery('abandoned vehicles')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '4513' });
    expect(resolveOhCitationQuery("Workers' Compensation Act")).toEqual({ kind: 'chapter', code: 'ORC', chapter: '4123' });
    expect(resolveOhCitationQuery('Workers’ Comp')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '4123' });
    expect(resolveOhCitationQuery('Minimum Fair Wage Standards Act')).toEqual({ kind: 'chapter', code: 'ORC', chapter: '4111' });
  });
  test('id forms round-trip, including the colon-bearing rule numbers and the Constitution', () => {
    expect(ohId('ORC', '4505.101')).toBe('orc:4505.101');
    expect(ohId('OAC', '109:4-3-13')).toBe('oac:109:4-3-13');
    expect(parseOhId('orc:4505.101')).toEqual({ code: 'ORC', cite: '4505.101' });
    expect(parseOhId('oac:109:4-3-13')).toEqual({ code: 'OAC', cite: '109:4-3-13' });
    expect(parseOhId(`ohio const.:${OH_CONST_CITE}`)).toEqual({ code: 'Ohio Const.', cite: OH_CONST_CITE });
    expect(parseOhId('31 pa. code:62.3')).toBeNull();
    expect(resolveOhCitationQuery('oac:3901-1-54')).toEqual({ kind: 'section', code: 'OAC', cite: '3901-1-54' });
    expect(ohStateIdentity.parseId('orc:4113.15')).toEqual({ code: 'ORC', cite: '4113.15' });
  });
  test('prose and foreign cites are not citations', () => {
    for (const q of ['the adjuster will not come out', 'tech quit friday', '', '31 Pa. Code 62.3', 'WAC 284-30-330', 'ORC 99999.1']) expect(resolveOhCitationQuery(q), q).toBeNull();
  });
  test('the manifest is shape-disjoint: every ORC cite is dotted, every OAC cite is hyphenated, no string is claimed twice', () => {
    const byCite = new Map<string, Set<string>>();
    for (const c of manifestCites()) {
      if (c.code === 'ORC') expect(ORC_CITE_SHAPE.test(c.cite), c.cite).toBe(true);
      if (c.code === 'OAC') expect(OAC_CITE_SHAPE.test(c.cite), c.cite).toBe(true);
      (byCite.get(c.cite) ?? byCite.set(c.cite, new Set()).get(c.cite)!).add(c.code);
    }
    for (const [cite, codes] of byCite) expect(codes.size, cite).toBe(1);
  });
  test('every topic key is a manifest cite and every manifest cite has topics', () => {
    const cites = new Set(manifestCites().map((c) => c.cite));
    for (const cite of Object.keys(OH_CITE_TOPICS)) expect(cites.has(cite), cite).toBe(true);
    for (const cite of cites) expect((OH_CITE_TOPICS[cite] ?? []).length, cite).toBeGreaterThan(0);
    for (const topics of Object.values(OH_CITE_TOPICS)) for (const t of topics) expect((OH_TOPICS as readonly string[]).includes(t), t).toBe(true);
  });
});

describe('formatOhCitation', () => {
  test('short forms carry the effective date on every code', () => {
    expect(formatOhCitation(orc).shortForm).toBe('ORC 4505.101, effective 4/7/2023');
    expect(formatOhCitation(oac).shortForm).toBe('OAC 3901-1-54, effective 2/14/2022');
    expect(formatOhCitation(constitution).shortForm).toBe('Ohio Const. art. II, § 34a, effective 12/8/2006');
    expect(formatOhCitation(orc).publishedAt?.toISOString()).toBe('2023-04-07T00:00:00.000Z');
    expect(formatOhCitation(orc).longForm).toContain('Ohio Revised Code section 4505.101 (Certificate of title to unclaimed motor vehicle.), chapter 4505 ORC (Certificate Of Motor Vehicle Title Law), effective 4/7/2023');
  });
  test('displayCite', () => {
    expect(displayCite(orc)).toBe('ORC 4505.101');
    expect(displayCite(oac)).toBe('OAC 3901-1-54');
    expect(displayCite(constitution)).toBe('Ohio Const. art. II, § 34a');
  });
});
