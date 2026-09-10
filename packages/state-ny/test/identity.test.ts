import { describe, expect, test } from 'bun:test';
import { NY_CITE_CODES, NY_CR82_EDITION, displayCite, formatNyCitation, nyId, parseNyId, resolveNyCitationQuery } from '../src/identity.js';
import type { NySection } from '../src/schema.js';

const statute: NySection = { cite: '2610', code: 'N.Y. Ins. Law', chapter: 'art. 26', chapterTitle: 'Unfair Claim Settlement Practices; Other Misconduct', heading: 'Collision or comprehensive coverage on motor vehicles; claims; repairs', text: '§ 2610. …', effectiveDate: '2017-06-23', domain: 'insurance', sourceUrl: 'https://www.nysenate.gov/legislation/laws/ISC/2610', captureSource: 'senate' };
const reg: NySection = { ...statute, cite: '216.7', code: '11 NYCRR', chapter: 'Part 216', chapterTitle: 'Reg 64', heading: 'Standards …', effectiveDate: '2021-06-09', sourceUrl: 'https://www.law.cornell.edu/regulations/new-york/11-NYCRR-216.7', captureSource: 'lii' };
const part82: NySection = { ...statute, cite: '82.5', code: '15 NYCRR', chapter: 'Part 82', chapterTitle: 'Repair shops', heading: 'Obligations of the repair shop.', effectiveDate: undefined, historyNote: 'CR-82 (5/26)', domain: 'repair_law', sourceUrl: 'https://dmv.ny.gov/forms/cr82.pdf', captureSource: 'dmv' };
const dfs: NySection = { ...statute, cite: 'Circular Letter 16 (2000)', code: 'DFS Guidance', chapter: 'Circular letters', chapterTitle: 'Insurance circular letters (guidance, not law)', heading: 'Application of Section 2610(b)', effectiveDate: '2000-05-10', sourceUrl: 'https://www.dfs.ny.gov/industry_guidance/circular_letters/cl2000_16', captureSource: 'dfs', dfsStatus: 'withdrawn', dfsWithdrawnDate: '2003-12-04' };

describe('resolveNyCitationQuery', () => {
  test('worded statute cites in every common spelling', () => {
    for (const q of ['N.Y. Ins. Law 2610', 'Ins. Law § 2610', 'Insurance Law 2610', 'ISC 2610', 'NY Ins Law 2610', 'Section 2610 of the Insurance Law']) {
      expect(resolveNyCitationQuery(q), q).toEqual({ kind: 'section', code: 'N.Y. Ins. Law', cite: '2610' });
    }
    expect(resolveNyCitationQuery('VTL 398-d')).toEqual({ kind: 'section', code: 'N.Y. Veh. & Traf. Law', cite: '398-D' });
    expect(resolveNyCitationQuery('Labor Law 191')).toEqual({ kind: 'section', code: 'N.Y. Lab. Law', cite: '191' });
    expect(resolveNyCitationQuery('GBL 349')).toEqual({ kind: 'section', code: 'N.Y. Gen. Bus. Law', cite: '349' });
    expect(resolveNyCitationQuery('Lien Law 184')).toEqual({ kind: 'section', code: 'N.Y. Lien Law', cite: '184' });
    expect(resolveNyCitationQuery("Workers' Compensation Law 2")).toEqual({ kind: 'section', code: "N.Y. Workers' Comp. Law", cite: '2' });
    expect(resolveNyCitationQuery('WCL § 52')).toEqual({ kind: 'section', code: "N.Y. Workers' Comp. Law", cite: '52' });
  });
  test('regulation cites, worded and bare, are unique by shape', () => {
    for (const q of ['11 NYCRR 216.7', '11 N.Y.C.R.R. § 216.7', 'Reg 64 § 216.7', '216.7']) expect(resolveNyCitationQuery(q), q).toEqual({ kind: 'section', code: '11 NYCRR', cite: '216.7' });
    expect(resolveNyCitationQuery('82.5')).toEqual({ kind: 'section', code: '15 NYCRR', cite: '82.5' });
    expect(resolveNyCitationQuery('12 NYCRR 142-2.4')).toEqual({ kind: 'section', code: '12 NYCRR', cite: '142-2.4' });
    expect(resolveNyCitationQuery('142-2.4')).toEqual({ kind: 'section', code: '12 NYCRR', cite: '142-2.4' });
  });
  test('guidance cites', () => {
    for (const q of ['OGC Opinion 04-06-03', 'OGC 04-06-03', 'OGC Opinion No. 04-06-03']) expect(resolveNyCitationQuery(q), q).toEqual({ kind: 'section', code: 'DFS Guidance', cite: 'OGC Opinion 04-06-03' });
    for (const q of ['Circular Letter 16 (2000)', 'Circular Letter No. 16 (2000)', 'CL 16 (2000)']) expect(resolveNyCitationQuery(q), q).toEqual({ kind: 'section', code: 'DFS Guidance', cite: 'Circular Letter 16 (2000)' });
  });
  test('bare statute numbers resolve only when one code claims them', () => {
    expect(NY_CITE_CODES['2610']).toEqual(['N.Y. Ins. Law']);
    expect(resolveNyCitationQuery('2610')).toEqual({ kind: 'section', code: 'N.Y. Ins. Law', cite: '2610' });
    expect(resolveNyCitationQuery('398-d')).toEqual({ kind: 'section', code: 'N.Y. Veh. & Traf. Law', cite: '398-D' });
    // '2' is Workers' Comp. Law 2 today; if a second code ever claims it, this must become null.
    const claimants = NY_CITE_CODES['2'] ?? [];
    expect(resolveNyCitationQuery('2')).toEqual(claimants.length === 1 ? { kind: 'section', code: claimants[0]!, cite: '2' } : null);
    expect(resolveNyCitationQuery('9999')).toBeNull();
  });
  test('named aliases list their chapters', () => {
    expect(resolveNyCitationQuery('Regulation 64')).toEqual({ kind: 'chapter', code: '11 NYCRR', chapter: 'Part 216' });
    expect(resolveNyCitationQuery('Reg. 64')).toEqual({ kind: 'chapter', code: '11 NYCRR', chapter: 'Part 216' });
    expect(resolveNyCitationQuery('Repair Shop Registration Act')).toEqual({ kind: 'chapter', code: 'N.Y. Veh. & Traf. Law', chapter: 'art. 12-A' });
    expect(resolveNyCitationQuery('Article 12-A')).toEqual({ kind: 'chapter', code: 'N.Y. Veh. & Traf. Law', chapter: 'art. 12-A' });
    expect(resolveNyCitationQuery('Part 82')).toEqual({ kind: 'chapter', code: '15 NYCRR', chapter: 'Part 82' });
    expect(resolveNyCitationQuery('Minimum Wage Order')).toEqual({ kind: 'chapter', code: '12 NYCRR', chapter: 'Part 142' });
  });
  test('id forms round-trip', () => {
    expect(nyId('N.Y. Ins. Law', '2610')).toBe('n.y. ins. law:2610');
    expect(parseNyId('n.y. ins. law:2610')).toEqual({ code: 'N.Y. Ins. Law', cite: '2610' });
    expect(parseNyId('dfs guidance:Circular Letter 16 (2000)')).toEqual({ code: 'DFS Guidance', cite: 'Circular Letter 16 (2000)' });
    expect(resolveNyCitationQuery('11 nycrr:216.7')).toEqual({ kind: 'section', code: '11 NYCRR', cite: '216.7' });
    expect(parseNyId('fla. stat.:1')).toBeNull();
  });
  test('prose is not a citation', () => {
    for (const q of ['the adjuster will not come out', 'weekly pay for painters', '']) expect(resolveNyCitationQuery(q)).toBeNull();
  });
});

describe('formatNyCitation', () => {
  test('statutes carry the revision date', () => {
    expect(formatNyCitation(statute).shortForm).toBe('N.Y. Ins. Law 2610, revised 6/23/2017');
    expect(formatNyCitation(statute).publishedAt?.toISOString()).toBe('2017-06-23T00:00:00.000Z');
  });
  test('Reg 64 carries the newest effective date; Part 82 carries the pinned edition; DFS carries issue and withdrawal', () => {
    expect(formatNyCitation(reg).shortForm).toBe('11 NYCRR 216.7, effective 6/9/2021');
    expect(formatNyCitation(part82).shortForm).toBe(`15 NYCRR 82.5, ${NY_CR82_EDITION}`);
    expect(formatNyCitation(dfs).shortForm).toBe('DFS Guidance Circular Letter 16 (2000), issued 5/10/2000, withdrawn 12/4/2003');
    expect(formatNyCitation({ ...dfs, dfsStatus: 'current', dfsWithdrawnDate: undefined }).shortForm).toBe('DFS Guidance Circular Letter 16 (2000), issued 5/10/2000');
  });
  test('displayCite', () => {
    expect(displayCite(statute)).toBe('N.Y. Ins. Law 2610');
    expect(displayCite(dfs)).toBe('DFS Guidance Circular Letter 16 (2000)');
  });
});
