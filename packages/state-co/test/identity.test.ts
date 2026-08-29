import { describe, expect, test } from 'bun:test';
import {
  CRS_EDITION, coStateIdentity, displayCite, formatCoCitation, parseCoId,
  resolveCoCitationQuery,
} from '../src/identity.js';
import type { CoSection } from '../src/schema.js';

const sec = (over: Partial<CoSection>): CoSection => ({
  cite: '10-4-120', code: 'CRS', chapter: '10-4',
  chapterTitle: 'Property and Casualty Insurance',
  heading: 'Unfair or discriminatory trade practices.',
  text: 'body', domain: 'insurance',
  sourceUrl: 'https://olls.info/crs/crs2026-title-10.htm', ...over,
});

describe('resolveCoCitationQuery', () => {
  test('bare hyphen triples are CRS', () => {
    expect(resolveCoCitationQuery('10-4-120')).toEqual({ kind: 'section', code: 'CRS', cite: '10-4-120' });
    expect(resolveCoCitationQuery('CRS 8-4-109')).toEqual({ kind: 'section', code: 'CRS', cite: '8-4-109' });
  });
  test('CRS point-five sections resolve', () => {
    expect(resolveCoCitationQuery('42-9-108.5')).toEqual({ kind: 'section', code: 'CRS', cite: '42-9-108.5' });
    expect(resolveCoCitationQuery('crs 42-9-108.5')).toEqual({ kind: 'section', code: 'CRS', cite: '42-9-108.5' });
  });
  test('CRS chapters (title-article)', () => {
    expect(resolveCoCitationQuery('42-9')).toEqual({ kind: 'chapter', code: 'CRS', chapter: '42-9' });
  });
  test('full CCR cites resolve to their title code', () => {
    expect(resolveCoCitationQuery('3 CCR 702-5-1-14')).toEqual({ kind: 'section', code: '3 CCR', cite: '702-5-1-14' });
    expect(resolveCoCitationQuery('4 ccr 723-6-6511')).toEqual({ kind: 'section', code: '4 CCR', cite: '723-6-6511' });
    expect(resolveCoCitationQuery('7 CCR 1103-1-5.2')).toEqual({ kind: 'section', code: '7 CCR', cite: '1103-1-5.2' });
  });
  test('DOI regulation shorthand maps into 702-5', () => {
    expect(resolveCoCitationQuery('Reg 5-1-14')).toEqual({ kind: 'section', code: '3 CCR', cite: '702-5-1-14' });
    expect(resolveCoCitationQuery('regulation 5-2-15')).toEqual({ kind: 'section', code: '3 CCR', cite: '702-5-2-15' });
  });
  test('COMPS rules resolve by dotted rule number alone', () => {
    expect(resolveCoCitationQuery('2.4.1')).toEqual({ kind: 'section', code: '7 CCR', cite: '1103-1-2.4.1' });
    expect(resolveCoCitationQuery('COMPS Rule 5.2')).toEqual({ kind: 'section', code: '7 CCR', cite: '1103-1-5.2' });
  });
  test('bulletin forms', () => {
    expect(resolveCoCitationQuery('B-5.04')).toEqual({ kind: 'section', code: 'Colorado DOI Bulletin', cite: 'B-5.04' });
    expect(resolveCoCitationQuery('bulletin b-5.04')).toEqual({ kind: 'section', code: 'Colorado DOI Bulletin', cite: 'B-5.04' });
  });
  test('known CCR series as bare chapters', () => {
    expect(resolveCoCitationQuery('702-5')).toEqual({ kind: 'chapter', code: '3 CCR', chapter: '702-5' });
    expect(resolveCoCitationQuery('1103-1')).toEqual({ kind: 'chapter', code: '7 CCR', chapter: '1103-1' });
  });
  test('prose is not a citation', () => {
    expect(resolveCoCitationQuery('steering to a network shop')).toBeNull();
  });
});

describe('display and citation forms', () => {
  test('display cites match the kickoff contract', () => {
    expect(displayCite(sec({}))).toBe('CRS 10-4-120');
    expect(displayCite(sec({ code: '3 CCR', cite: '702-5-1-14' }))).toBe('3 CCR 702-5-1-14');
    expect(displayCite(sec({ code: 'Colorado DOI Bulletin', cite: 'B-5.04' }))).toBe('Colorado DOI Bulletin B-5.04');
  });
  test('CRS citations carry the edition, never a date', () => {
    const c = formatCoCitation(sec({}));
    expect(c.shortForm).toBe('CRS 10-4-120, 2026 edition');
    expect(c.publishedAt).toBeUndefined();
  });
  test('CCR citations carry the real effective date', () => {
    const c = formatCoCitation(sec({ code: '3 CCR', cite: '702-5-1-14', chapter: '702-5', effectiveDate: '2025-12-30' }));
    expect(c.shortForm).toBe('3 CCR 702-5-1-14, effective 12/30/2025');
  });
  test('bulletin citations say issued', () => {
    const c = formatCoCitation(sec({ code: 'Colorado DOI Bulletin', cite: 'B-5.04', chapter: 'B-5', effectiveDate: '2016-09-19' }));
    expect(c.shortForm).toBe('Colorado DOI Bulletin B-5.04, issued 9/19/2016');
  });
  test('ids round-trip, including space-bearing codes', () => {
    expect(parseCoId(coStateIdentity.id('3 CCR', '702-5-1-14'))).toEqual({ code: '3 CCR', cite: '702-5-1-14' });
    expect(parseCoId('crs:10-4-120')).toEqual({ code: 'CRS', cite: '10-4-120' });
    expect(parseCoId(coStateIdentity.id('Colorado DOI Bulletin', 'B-5.04'))).toEqual({ code: 'Colorado DOI Bulletin', cite: 'B-5.04' });
  });
  test('the edition pin exists for the rollover tripwire', () => {
    expect(CRS_EDITION).toBe('Colorado Revised Statutes 2026');
  });
});
