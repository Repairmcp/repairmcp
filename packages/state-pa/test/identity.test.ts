import { describe, expect, test } from 'bun:test';
import { PA_CITE_CODES, displayCite, formatPaCitation, paId, paStateIdentity, parsePaId, resolvePaCitationQuery } from '../src/identity.js';
import type { PaSection } from '../src/schema.js';
import { PA_CITE_TOPICS } from '../src/taxonomy.js';

const reg: PaSection = { cite: '62.3', code: '31 Pa. Code', chapter: 'Chapter 62', chapterTitle: 'Motor Vehicle Physical Damage Appraisers', heading: 'Applicable standards for appraisal.', text: '(a) …', effectiveDate: '1999-10-23', domain: 'insurance', sourceUrl: 'https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/031/chapter62/s62.3.html&d=reduce', captureSource: 'pacode', headingSource: 'source' };
const cons: PaSection = { ...reg, cite: '8371', code: '42 Pa.C.S.', chapter: 'ch. 83, subch. G', chapterTitle: 'Special Damages', heading: 'Actions on insurance policies.', effectiveDate: '1990-07-01', sourceUrl: 'https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/42/00.083.071.000..HTM', captureSource: 'legis' };
const amended: PaSection = { ...reg, cite: '260.5', code: '43 P.S.', chapter: 'Wage Payment and Collection Law', chapterTitle: 'Act 329 of 1961', heading: 'Employes Who Are Separated from Payroll before Paydays.', effectiveDate: '1977-07-14', domain: 'employment', sourceUrl: 'https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/1961/0/0329..HTM', captureSource: 'legis', actSection: '5', dateKind: 'amended' };
const enacted: PaSection = { ...amended, cite: '851', code: '63 P.S.', chapter: 'Motor Vehicle Physical Damage Appraiser Act', actSection: '1', effectiveDate: '1972-12-29', dateKind: 'enacted' };
const undated: PaSection = { ...reg, cite: '301.5', code: '37 Pa. Code', chapter: 'Chapter 301', effectiveDate: undefined, domain: 'repair_law' };

describe('resolvePaCitationQuery', () => {
  test('worded consolidated cites', () => {
    for (const q of ['42 Pa.C.S. § 8371', '42 Pa. C.S.A. 8371', '42 Pa.C.S.A. § 8371', '42 PaCS 8371', 'Section 8371 of Title 42']) expect(resolvePaCitationQuery(q), q).toEqual({ kind: 'section', code: '42 Pa.C.S.', cite: '8371' });
    expect(resolvePaCitationQuery('75 Pa.C.S. 1165.1')).toEqual({ kind: 'section', code: '75 Pa.C.S.', cite: '1165.1' });
  });
  test('worded P.S. cites in every common spelling', () => {
    for (const q of ['43 P.S. 260.5', '43 P.S. § 260.5', '43 Pa. Stat. § 260.5', '43 Pa. Stat. Ann. 260.5', '43 PS 260.5']) expect(resolvePaCitationQuery(q), q).toEqual({ kind: 'section', code: '43 P.S.', cite: '260.5' });
    expect(resolvePaCitationQuery('40 P.S. 1171.5')).toEqual({ kind: 'section', code: '40 P.S.', cite: '1171.5' });
    expect(resolvePaCitationQuery('73 P.S. § 201-9.2')).toEqual({ kind: 'section', code: '73 P.S.', cite: '201-9.2' });
    expect(resolvePaCitationQuery('43 P.S. 260.2a')).toEqual({ kind: 'section', code: '43 P.S.', cite: '260.2a' });
    expect(resolvePaCitationQuery('77 P.S. 481')).toEqual({ kind: 'section', code: '77 P.S.', cite: '481' });
  });
  test('worded Pa. Code cites', () => {
    for (const q of ['31 Pa. Code § 62.3', '31 Pa.Code 62.3', '31 PA CODE 62.3', '31 Pa. Code 62.3']) expect(resolvePaCitationQuery(q), q).toEqual({ kind: 'section', code: '31 Pa. Code', cite: '62.3' });
    expect(resolvePaCitationQuery('34 Pa. Code 231.43')).toEqual({ kind: 'section', code: '34 Pa. Code', cite: '231.43' });
  });
  test('act-section forms resolve through the manifest P.S. maps', () => {
    expect(resolvePaCitationQuery('UIPA § 5')).toEqual({ kind: 'section', code: '40 P.S.', cite: '1171.5' });
    expect(resolvePaCitationQuery('section 5 of the Unfair Insurance Practices Act')).toEqual({ kind: 'section', code: '40 P.S.', cite: '1171.5' });
    expect(resolvePaCitationQuery('WPCL section 10')).toEqual({ kind: 'section', code: '43 P.S.', cite: '260.10' });
    expect(resolvePaCitationQuery('Appraiser Act section 11')).toEqual({ kind: 'section', code: '63 P.S.', cite: '861' });
    expect(resolvePaCitationQuery('WCA § 305')).toEqual({ kind: 'section', code: '77 P.S.', cite: '501' });
    expect(resolvePaCitationQuery('UIPA § 99')).toBeNull();
  });
  test('named aliases list their chapters', () => {
    expect(resolvePaCitationQuery('UIPA')).toEqual({ kind: 'chapter', code: '40 P.S.', chapter: 'Unfair Insurance Practices Act' });
    expect(resolvePaCitationQuery('the Unfair Insurance Practices Act')).toEqual({ kind: 'chapter', code: '40 P.S.', chapter: 'Unfair Insurance Practices Act' });
    expect(resolvePaCitationQuery('Appraiser Act')).toEqual({ kind: 'chapter', code: '63 P.S.', chapter: 'Motor Vehicle Physical Damage Appraiser Act' });
    expect(resolvePaCitationQuery('UTPCPL')).toEqual({ kind: 'chapter', code: '73 P.S.', chapter: 'Unfair Trade Practices and Consumer Protection Law' });
    expect(resolvePaCitationQuery('WPCL')).toEqual({ kind: 'chapter', code: '43 P.S.', chapter: 'Wage Payment and Collection Law' });
    expect(resolvePaCitationQuery('Minimum Wage Act')).toEqual({ kind: 'chapter', code: '43 P.S.', chapter: 'The Minimum Wage Act of 1968' });
    expect(resolvePaCitationQuery("Workers' Compensation Act")).toEqual({ kind: 'chapter', code: '77 P.S.', chapter: "Workers' Compensation Act" });
    expect(resolvePaCitationQuery('Chapter 146')).toEqual({ kind: 'chapter', code: '31 Pa. Code', chapter: 'Chapter 146' });
    expect(resolvePaCitationQuery('Unfair Claims Settlement Practices')).toEqual({ kind: 'chapter', code: '31 Pa. Code', chapter: 'Chapter 146' });
    expect(resolvePaCitationQuery('Chapter 301')).toEqual({ kind: 'chapter', code: '37 Pa. Code', chapter: 'Chapter 301' });
    expect(resolvePaCitationQuery('Automotive Industry Trade Practices')).toEqual({ kind: 'chapter', code: '37 Pa. Code', chapter: 'Chapter 301' });
    expect(resolvePaCitationQuery('abandoned vehicles')).toEqual({ kind: 'chapter', code: '75 Pa.C.S.', chapter: 'ch. 73, subch. A' });
  });
  test('bare cites resolve by exact match through the manifest map; no cite is claimed twice', () => {
    for (const [cite, codes] of Object.entries(PA_CITE_CODES)) expect(codes.length, cite).toBe(1);
    expect(resolvePaCitationQuery('62.3')).toEqual({ kind: 'section', code: '31 Pa. Code', cite: '62.3' });
    expect(resolvePaCitationQuery('§ 1171.5')).toEqual({ kind: 'section', code: '40 P.S.', cite: '1171.5' });
    expect(resolvePaCitationQuery('8371')).toEqual({ kind: 'section', code: '42 Pa.C.S.', cite: '8371' });
    expect(resolvePaCitationQuery('260.5')).toEqual({ kind: 'section', code: '43 P.S.', cite: '260.5' });
    expect(resolvePaCitationQuery('9999')).toBeNull();
  });
  test('every topic key is a manifest cite', () => {
    for (const cite of Object.keys(PA_CITE_TOPICS)) expect(PA_CITE_CODES[cite], cite).toBeDefined();
  });
  test('id forms round-trip', () => {
    expect(paId('31 Pa. Code', '62.3')).toBe('31 pa. code:62.3');
    expect(parsePaId('31 pa. code:62.3')).toEqual({ code: '31 Pa. Code', cite: '62.3' });
    expect(parsePaId('43 p.s.:260.5')).toEqual({ code: '43 P.S.', cite: '260.5' });
    expect(resolvePaCitationQuery('42 pa.c.s.:8371')).toEqual({ kind: 'section', code: '42 Pa.C.S.', cite: '8371' });
    expect(parsePaId('n.y. ins. law:2610')).toBeNull();
    expect(paStateIdentity.parseId('43 p.s.:260.5')).toEqual({ code: '43 P.S.', cite: '260.5' });
  });
  test('prose is not a citation', () => {
    for (const q of ['the adjuster will not come out', 'tech quit friday', '']) expect(resolvePaCitationQuery(q)).toBeNull();
  });
});

describe('formatPaCitation', () => {
  test('consolidated and Pa. Code carry effective dates; P.S. carries amended or enacted; silence without a date', () => {
    expect(formatPaCitation(cons).shortForm).toBe('42 Pa.C.S. 8371, effective 7/1/1990');
    expect(formatPaCitation(reg).shortForm).toBe('31 Pa. Code 62.3, effective 10/23/1999');
    expect(formatPaCitation(amended).shortForm).toBe('43 P.S. 260.5, amended 7/14/1977');
    expect(formatPaCitation(enacted).shortForm).toBe('63 P.S. 851, enacted 12/29/1972');
    expect(formatPaCitation(undated).shortForm).toBe('37 Pa. Code 301.5');
    expect(formatPaCitation(cons).publishedAt?.toISOString()).toBe('1990-07-01T00:00:00.000Z');
  });
  test('displayCite', () => {
    expect(displayCite(amended)).toBe('43 P.S. 260.5');
    expect(displayCite(reg)).toBe('31 Pa. Code 62.3');
  });
});
