import { describe, expect, test } from 'bun:test';
import { IAC_CITE_SHAPE, ILCS_CITE_SHAPE, IL_CITE_TOKENS, IL_TOKEN_COLLISIONS, displayCite, formatIlCitation, ilId, ilStateIdentity, parseIlId, resolveIlCitationQuery } from '../src/identity.js';
import type { IlSection } from '../src/schema.js';
import { manifestCites } from '../src/sources.js';
import { IL_CITE_TOPICS, IL_TOPICS } from '../src/taxonomy.js';

const act: IlSection = { cite: '815 ILCS 308/15', code: 'ILCS', chapter: '815 ILCS 308', chapterTitle: 'Automotive Collision Repair Act', heading: 'Disclosure to consumers; estimates.', headingSource: 'section', text: '(a) …', effectiveDate: '2004-01-01', domain: 'repair_law', sourceUrl: 'https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2500&ChapterID=67', captureSource: 'act', sourceNote: 'P.A. 93-565, eff. 1-1-04.', publicActs: ['P.A. 93-565'] };
const undated: IlSection = { cite: '215 ILCS 5/155.29', code: 'ILCS', chapter: '215 ILCS 5', chapterTitle: 'Illinois Insurance Code', heading: 'Aftermarket crash parts', headingSource: 'manifest', text: '(a) …', domain: 'insurance', sourceUrl: 'https://www.ilga.gov/legislation/ILCS/details?ActID=1249&ChapterID=22&SeqStart=51000000&SeqEnd=67200000', captureSource: 'article', sourceNote: 'P.A. 86-1234; 86-1475.', publicActs: ['P.A. 86-1234', 'P.A. 86-1475'], formerCite: 'from Ch. 73, par. 767.29' };
const rule: IlSection = { cite: '50 Ill. Adm. Code 919.80', code: 'Ill. Adm. Code', chapter: '50 Ill. Adm. Code 919', chapterTitle: 'Improper Claims Practice', heading: 'Required Claim Practices – Private Passenger Automobile – Property and Casualty Companies', headingSource: 'section', text: 'a) …', effectiveDate: '2002-07-22', domain: 'insurance', sourceUrl: 'https://www.ilga.gov/commission/jcar/admincode/050/050009190000800R.html', captureSource: 'part', sourceNote: 'Amended at 26 Ill. Reg. 11915, effective July 22, 2002', dateSource: 'section', illRegCite: '26 Ill. Reg. 11915' };

const S = (cite: string) => ({ kind: 'section', code: cite.includes('Adm. Code') ? 'Ill. Adm. Code' : 'ILCS', cite });
const C = (chapter: string) => ({ kind: 'chapter', code: chapter.includes('Adm. Code') ? 'Ill. Adm. Code' : 'ILCS', chapter });

describe('resolveIlCitationQuery', () => {
  test('full ILCS cites in every common spelling, with a subsection stripped', () => {
    for (const q of ['815 ILCS 308/15', '815 ILCS 308/15(b)', '815 ILCS 308/15(b)(2)', 'section 815 ILCS 308/15', '§ 815 ILCS 308/15', '815 ilcs 308/15', '815 ILCS 308 / 15']) {
      expect(resolveIlCitationQuery(q), q).toEqual(S('815 ILCS 308/15'));
    }
    expect(resolveIlCitationQuery('215 ILCS 5/154.6(j)')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('625 ILCS 5/3-117.1')).toEqual(S('625 ILCS 5/3-117.1'));
    expect(resolveIlCitationQuery('815 ILCS 505/10a')).toEqual(S('815 ILCS 505/10a'));
    expect(resolveIlCitationQuery('770 ILCS 45/1.5')).toEqual(S('770 ILCS 45/1.5'));
  });
  test('an act cite alone lists the act; an unknown act is null', () => {
    expect(resolveIlCitationQuery('815 ILCS 308')).toEqual(C('815 ILCS 308'));
    expect(resolveIlCitationQuery('815 ILCS 308/')).toEqual(C('815 ILCS 308'));
    expect(resolveIlCitationQuery('820 ILCS 115')).toEqual(C('820 ILCS 115'));
    expect(resolveIlCitationQuery('815 ILCS 999')).toBeNull();
  });
  test('Administrative Code cites in every spelling; a Part alone lists the Part', () => {
    for (const q of ['50 Ill. Adm. Code 919.80', '50 Ill. Admin. Code 919.80', '50 Illinois Administrative Code 919.80', '50 IAC 919.80', '50 Ill. Adm. Code 919.80(d)(6)', 'section 50 Ill. Adm. Code 919.80']) {
      expect(resolveIlCitationQuery(q), q).toEqual(S('50 Ill. Adm. Code 919.80'));
    }
    expect(resolveIlCitationQuery('50 Ill. Adm. Code 919.EXHIBIT A')).toEqual(S('50 Ill. Adm. Code 919.EXHIBIT A'));
    expect(resolveIlCitationQuery('35 Ill. Adm. Code 218.780')).toEqual(S('35 Ill. Adm. Code 218.780'));
    expect(resolveIlCitationQuery('50 Ill. Adm. Code 919')).toEqual(C('50 Ill. Adm. Code 919'));
    expect(resolveIlCitationQuery('50 Ill. Adm. Code Part 919')).toEqual(C('50 Ill. Adm. Code 919'));
    expect(resolveIlCitationQuery('56 Ill. Adm. Code 300')).toEqual(C('56 Ill. Adm. Code 300'));
    expect(resolveIlCitationQuery('50 Ill. Adm. Code 300')).toBeNull();
  });
  test('"Section N of the Act" forms', () => {
    expect(resolveIlCitationQuery('Section 154.6 of the Insurance Code')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('Section 9 of the Wage Payment and Collection Act')).toEqual(S('820 ILCS 115/9'));
    expect(resolveIlCitationQuery('§ 15 of the Automotive Collision Repair Act')).toEqual(S('815 ILCS 308/15'));
    expect(resolveIlCitationQuery('Section 5-301 of the Vehicle Code')).toEqual(S('625 ILCS 5/5-301'));
  });
  test('bare tokens resolve by exact match; collisions resolve to null; act-qualified forms resolve when the act number is unique', () => {
    expect(resolveIlCitationQuery('154.6')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('Sec. 154.6')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('919.80')).toEqual(S('50 Ill. Adm. Code 919.80'));
    expect(resolveIlCitationQuery('3-117.1')).toEqual(S('625 ILCS 5/3-117.1'));
    expect(resolveIlCitationQuery('5-301')).toEqual(S('625 ILCS 5/5-301'));
    expect(resolveIlCitationQuery('10a')).toEqual(S('815 ILCS 505/10a'));
    expect(resolveIlCitationQuery('9.5')).toEqual(S('820 ILCS 115/9.5'));
    expect(resolveIlCitationQuery('300.820')).toEqual(S('56 Ill. Adm. Code 300.820'));
    expect(resolveIlCitationQuery('15')).toBeNull();
    expect(resolveIlCitationQuery('2')).toBeNull();
    expect(resolveIlCitationQuery('308/15')).toEqual(S('815 ILCS 308/15'));
    expect(resolveIlCitationQuery('115/9')).toEqual(S('820 ILCS 115/9'));
    expect(resolveIlCitationQuery('5/154.6')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('5/3-117.1')).toEqual(S('625 ILCS 5/3-117.1'));
    expect(resolveIlCitationQuery('5')).toBeNull();
    expect(resolveIlCitationQuery('5/2')).toBeNull();
  });
  test('the collision list is exactly the tokens the manifest claims twice', () => {
    expect(IL_TOKEN_COLLISIONS).toEqual(['1', '1.5', '10', '15', '2', '3', '4', '5', '70', '75', '80']);
    expect(IL_CITE_TOKENS.get('15')).toBeNull();
    expect(IL_CITE_TOKENS.get('154.6')).toBe('215 ILCS 5/154.6');
  });
  test('named aliases', () => {
    expect(resolveIlCitationQuery('Automotive Collision Repair Act')).toEqual(C('815 ILCS 308'));
    expect(resolveIlCitationQuery('the Automotive Repair Act')).toEqual(C('815 ILCS 306'));
    expect(resolveIlCitationQuery('Consumer Fraud Act')).toEqual(C('815 ILCS 505'));
    expect(resolveIlCitationQuery('improper claims practice')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('Part 919')).toEqual(C('50 Ill. Adm. Code 919'));
    expect(resolveIlCitationQuery('Exhibit A')).toEqual(S('50 Ill. Adm. Code 919.EXHIBIT A'));
    expect(resolveIlCitationQuery('aftermarket crash parts')).toEqual(S('215 ILCS 5/155.29'));
    expect(resolveIlCitationQuery('Section 155')).toEqual(S('215 ILCS 5/155'));
    expect(resolveIlCitationQuery('paint and materials cap')).toEqual(S('215 ILCS 5/154.6'));
    expect(resolveIlCitationQuery('repairer license')).toEqual(S('625 ILCS 5/5-301'));
    expect(resolveIlCitationQuery('Labor and Storage Lien Act')).toEqual(C('770 ILCS 45'));
    expect(resolveIlCitationQuery('Small Amount Act')).toEqual(C('770 ILCS 50'));
    expect(resolveIlCitationQuery('IWPCA')).toEqual(C('820 ILCS 115'));
    expect(resolveIlCitationQuery('Minimum Wage Law')).toEqual(C('820 ILCS 105'));
    expect(resolveIlCitationQuery('ODRISA')).toEqual(C('820 ILCS 140'));
    expect(resolveIlCitationQuery('PLAWA')).toEqual(S('820 ILCS 192/15'));
    expect(resolveIlCitationQuery('Freedom to Work Act')).toEqual(S('820 ILCS 90/10'));
    expect(resolveIlCitationQuery("Workers' Compensation Act")).toEqual(S('820 ILCS 305/4'));
    expect(resolveIlCitationQuery('Workers’ Comp')).toEqual(S('820 ILCS 305/4'));
    expect(resolveIlCitationQuery('refinishing rule')).toEqual(C('35 Ill. Adm. Code 218'));
    expect(resolveIlCitationQuery('Metro East refinishing rule')).toEqual(C('35 Ill. Adm. Code 219'));
  });
  test('id forms round-trip', () => {
    expect(ilId('ILCS', '815 ILCS 308/15')).toBe('ilcs:815-308/15');
    expect(ilId('Ill. Adm. Code', '50 Ill. Adm. Code 919.80')).toBe('iac:50-919.80');
    expect(ilId('Ill. Adm. Code', '50 Ill. Adm. Code 919.EXHIBIT A')).toBe('iac:50-919.EXHIBIT A');
    expect(parseIlId('ilcs:815-308/15')).toEqual({ code: 'ILCS', cite: '815 ILCS 308/15' });
    expect(parseIlId('ilcs:625-5/3-117.1')).toEqual({ code: 'ILCS', cite: '625 ILCS 5/3-117.1' });
    expect(parseIlId('iac:50-919.80')).toEqual({ code: 'Ill. Adm. Code', cite: '50 Ill. Adm. Code 919.80' });
    expect(parseIlId('iac:50-919.EXHIBIT A')).toEqual({ code: 'Ill. Adm. Code', cite: '50 Ill. Adm. Code 919.EXHIBIT A' });
    expect(parseIlId('orc:4505.101')).toBeNull();
    expect(resolveIlCitationQuery('ilcs:815-308/15')).toEqual(S('815 ILCS 308/15'));
    expect(ilStateIdentity.parseId('iac:56-300.820')).toEqual({ code: 'Ill. Adm. Code', cite: '56 Ill. Adm. Code 300.820' });
    expect(ilStateIdentity.id('ILCS', '820 ILCS 115/9')).toBe('ilcs:820-115/9');
  });
  test('prose and foreign cites are not citations', () => {
    for (const q of ['the adjuster will not come out', 'tech quit friday', '', 'ORC 4505.101', 'WAC 284-30-330', '31 Pa. Code 62.3', '99999']) expect(resolveIlCitationQuery(q), q).toBeNull();
    // A well-shaped cite the corpus does not hold still resolves — the corpus reports the miss by name.
    expect(resolveIlCitationQuery('815 ILCS 308/999')).toEqual(S('815 ILCS 308/999'));
  });
  test('the manifest is shape-clean and every cite is unique across codes', () => {
    const seen = new Set<string>();
    for (const c of manifestCites()) {
      if (c.code === 'ILCS') expect(ILCS_CITE_SHAPE.test(c.cite), c.cite).toBe(true);
      else expect(IAC_CITE_SHAPE.test(c.cite), c.cite).toBe(true);
      expect(seen.has(c.cite), c.cite).toBe(false);
      seen.add(c.cite);
    }
  });
  test('every topic key is a manifest cite and every manifest cite has topics', () => {
    const cites = new Set(manifestCites().map((c) => c.cite));
    for (const cite of Object.keys(IL_CITE_TOPICS)) expect(cites.has(cite), cite).toBe(true);
    for (const cite of cites) expect((IL_CITE_TOPICS[cite] ?? []).length, cite).toBeGreaterThan(0);
    for (const topics of Object.values(IL_CITE_TOPICS)) for (const t of topics) expect((IL_TOPICS as readonly string[]).includes(t), t).toBe(true);
  });
});

describe('formatIlCitation', () => {
  test('short forms carry the effective date when the section has one and are bare when it does not', () => {
    expect(formatIlCitation(act).shortForm).toBe('815 ILCS 308/15, effective 1/1/2004');
    expect(formatIlCitation(undated).shortForm).toBe('215 ILCS 5/155.29');
    expect(formatIlCitation(rule).shortForm).toBe('50 Ill. Adm. Code 919.80, effective 7/22/2002');
    expect(formatIlCitation(act).publishedAt?.toISOString()).toBe('2004-01-01T00:00:00.000Z');
    expect(formatIlCitation(undated).publishedAt).toBeUndefined();
    expect(formatIlCitation(act).longForm).toBe('Illinois Compiled Statutes 815 ILCS 308/15 (Disclosure to consumers; estimates.), Automotive Collision Repair Act, effective 1/1/2004, https://www.ilga.gov/Legislation/ILCS/Articles?ActID=2500&ChapterID=67');
    expect(formatIlCitation(undated).longForm).toBe('Illinois Compiled Statutes 215 ILCS 5/155.29 (Aftermarket crash parts), Illinois Insurance Code, https://www.ilga.gov/legislation/ILCS/details?ActID=1249&ChapterID=22&SeqStart=51000000&SeqEnd=67200000');
    expect(formatIlCitation(rule).itemId).toBe('iac:50-919.80');
    expect(formatIlCitation(act).sourceId).toBe('state-il');
  });
  test('displayCite is the cite itself', () => {
    expect(displayCite(act)).toBe('815 ILCS 308/15');
    expect(displayCite(rule)).toBe('50 Ill. Adm. Code 919.80');
    expect(ilStateIdentity.displayCite(undated)).toBe('215 ILCS 5/155.29');
  });
});
