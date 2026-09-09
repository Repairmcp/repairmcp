import { describe, expect, test } from 'bun:test';
import {
  FL_CITE_CODES,
  FL_EDITION_NOTE,
  FL_STATUTES_EDITION,
  displayCite,
  flId,
  formatFlCitation,
  parseFlId,
  resolveFlCitationQuery,
} from '../src/identity.js';
import type { FlSection } from '../src/schema.js';
import { FL_FAC_SOURCES } from '../src/sources-fac.js';
import { FL_STATUTE_SOURCES, onlineSunshineSectionUrl } from '../src/sources-statutes.js';

const STATUTE: FlSection = {
  cite: '626.9743',
  code: 'Fla. Stat.',
  chapter: '626, pt. IX',
  chapterTitle: 'Unfair Insurance Trade Practices',
  heading: 'Claim settlement practices relating to motor vehicle insurance.',
  text: '(1) This section shall apply …',
  historyNote: 'History.—s. 9, ch. 2004-370; s. 154, ch. 2004-390.',
  domain: 'insurance',
  sourceUrl: onlineSunshineSectionUrl('626.9743'),
};

const RULE: FlSection = {
  cite: '69B-220.201',
  code: 'Fla. Admin. Code',
  chapter: '69B-220',
  chapterTitle: 'Adjusters',
  heading: 'Ethical Requirements for All Adjusters and Public Adjuster Apprentices.',
  text: '(1) Definitions. …',
  effectiveDate: '2025-04-21',
  historyNote: 'Rulemaking Authority 624.308 FS. History–New 6-2-93, Amended 4-21-25.',
  domain: 'insurance',
  sourceUrl: 'https://www.flrules.org/gateway/ruleNo.asp?id=69B-220.201',
  facNoticeId: '29438547',
};

describe('resolveFlCitationQuery', () => {
  test('statute cites in every common spelling', () => {
    for (const q of [
      'Fla. Stat. 626.9743',
      'Fla. Stat. § 626.9743',
      'Florida Statutes 626.9743',
      'Florida Statute s. 626.9743',
      'F.S. 626.9743',
      'FS 626.9743',
      's. 626.9743',
      '§ 626.9743',
      'Section 626.9743.',
      '626.9743',
    ]) {
      expect(resolveFlCitationQuery(q), q).toEqual({ kind: 'section', code: 'Fla. Stat.', cite: '626.9743' });
    }
  });
  test('FAC cites, worded and bare', () => {
    for (const q of [
      'Fla. Admin. Code 69B-220.201',
      'Fla. Admin. Code R. 69B-220.201',
      'Fla. Admin. Code Ann. r. 69B-220.201',
      'Florida Administrative Code 69B-220.201',
      'F.A.C. 69B-220.201',
      'FAC 69B-220.201',
      'Rule 69B-220.201',
      '69B-220.201',
      '69b-220.201',
    ]) {
      expect(resolveFlCitationQuery(q), q).toEqual({ kind: 'section', code: 'Fla. Admin. Code', cite: '69B-220.201' });
    }
    expect(resolveFlCitationQuery('69O-166.024')).toEqual({ kind: 'section', code: 'Fla. Admin. Code', cite: '69O-166.024' });
  });
  test('a worded cite for a section the corpus does not hold is still citation-shaped; a bare one is not', () => {
    expect(resolveFlCitationQuery('Fla. Stat. 627.736')).toEqual({ kind: 'section', code: 'Fla. Stat.', cite: '627.736' });
    expect(resolveFlCitationQuery('Rule 69O-175.003')).toEqual({ kind: 'section', code: 'Fla. Admin. Code', cite: '69O-175.003' });
    expect(resolveFlCitationQuery('627.736')).toBeNull();
  });
  test('id forms', () => {
    expect(resolveFlCitationQuery('fla. stat.:559.905')).toEqual({ kind: 'section', code: 'Fla. Stat.', cite: '559.905' });
    expect(resolveFlCitationQuery('fla. admin. code:69O-166.024')).toEqual({ kind: 'section', code: 'Fla. Admin. Code', cite: '69O-166.024' });
  });
  test('named acts list their chapters', () => {
    expect(resolveFlCitationQuery('Motor Vehicle Repair Act')).toEqual({ kind: 'chapter', code: 'Fla. Stat.', chapter: '559, pt. IX' });
    expect(resolveFlCitationQuery('the Florida Motor Vehicle Repair Act')).toEqual({ kind: 'chapter', code: 'Fla. Stat.', chapter: '559, pt. IX' });
    expect(resolveFlCitationQuery('FDUTPA')).toEqual({ kind: 'chapter', code: 'Fla. Stat.', chapter: '501, pt. II' });
    expect(resolveFlCitationQuery('Deceptive and Unfair Trade Practices Act')).toEqual({ kind: 'chapter', code: 'Fla. Stat.', chapter: '501, pt. II' });
    expect(resolveFlCitationQuery('Unfair Insurance Trade Practices Act')).toEqual({ kind: 'chapter', code: 'Fla. Stat.', chapter: '626, pt. IX' });
    expect(resolveFlCitationQuery("Workers' Compensation Law")).toEqual({ kind: 'chapter', code: 'Fla. Stat.', chapter: '440' });
    expect(resolveFlCitationQuery('Adjuster Code of Ethics')).toEqual({ kind: 'section', code: 'Fla. Admin. Code', cite: '69B-220.201' });
  });
  test('prose is not a citation', () => {
    expect(resolveFlCitationQuery('insurer cut off storage payments')).toBeNull();
    expect(resolveFlCitationQuery('total loss')).toBeNull();
    expect(resolveFlCitationQuery('')).toBeNull();
  });
});

describe('FL_CITE_CODES', () => {
  test('every manifest cite is claimed by exactly one code', () => {
    let count = 0;
    for (const source of FL_STATUTE_SOURCES) {
      for (const cite of source.cites) {
        expect(FL_CITE_CODES[cite]).toBe('Fla. Stat.');
        count++;
      }
    }
    for (const source of FL_FAC_SOURCES) {
      for (const rule of source.rules) {
        expect(FL_CITE_CODES[rule.cite]).toBe('Fla. Admin. Code');
        count++;
      }
    }
    expect(Object.keys(FL_CITE_CODES).length).toBe(count);
  });
  test('the manifests name no cite twice', () => {
    const all = [
      ...FL_STATUTE_SOURCES.flatMap((s) => s.cites),
      ...FL_FAC_SOURCES.flatMap((s) => s.rules.map((r) => r.cite)),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
  test('chapter values are unique per code', () => {
    const chapters = FL_STATUTE_SOURCES.map((s) => s.chapter);
    expect(new Set(chapters).size).toBe(chapters.length);
  });
});

describe('ids, display cites, citations', () => {
  test('id round trip with the mixed-case codes', () => {
    expect(flId('Fla. Stat.', '626.9743')).toBe('fla. stat.:626.9743');
    expect(parseFlId('fla. stat.:626.9743')).toEqual({ code: 'Fla. Stat.', cite: '626.9743' });
    expect(parseFlId('fla. admin. code:69B-220.201')).toEqual({ code: 'Fla. Admin. Code', cite: '69B-220.201' });
    expect(parseFlId('wac:284-30-330')).toBeNull();
  });
  test('display cites', () => {
    expect(displayCite(STATUTE)).toBe('Fla. Stat. 626.9743');
    expect(displayCite(RULE)).toBe('Fla. Admin. Code 69B-220.201');
  });
  test('statute citations carry the edition, rule citations the effective date', () => {
    expect(FL_EDITION_NOTE).toBe('2026 edition');
    expect(FL_STATUTES_EDITION).toMatch(/^The \d{4} Florida Statutes/);
    const s = formatFlCitation(STATUTE);
    expect(s.shortForm).toBe('Fla. Stat. 626.9743, 2026 edition');
    expect(s.longForm).toContain('Florida Statutes section 626.9743 (Claim settlement practices relating to motor vehicle insurance.), chapter 626, pt. IX Fla. Stat. (Unfair Insurance Trade Practices), 2026 edition');
    expect(s.publishedAt).toBeUndefined();
    const r = formatFlCitation(RULE);
    expect(r.shortForm).toBe('Fla. Admin. Code 69B-220.201, effective 4/21/2025');
    expect(r.publishedAt?.toISOString()).toBe('2025-04-21T00:00:00.000Z');
  });
  test('Online Sunshine URLs pad the chapter and range', () => {
    expect(onlineSunshineSectionUrl('626.9743')).toBe(
      'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0600-0699/0626/Sections/0626.9743.html',
    );
    expect(onlineSunshineSectionUrl('319.30')).toContain('URL=0300-0399/0319/Sections/0319.30.html');
    expect(onlineSunshineSectionUrl('559.9221')).toContain('URL=0500-0599/0559/Sections/0559.9221.html');
    expect(() => onlineSunshineSectionUrl('69B-220.201')).toThrow();
  });
});
