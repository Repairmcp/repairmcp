import { describe, expect, test } from 'bun:test';
import {
  TX_CHAPTER_CODES,
  TX_STATUTES_CURRENCY,
  displayCite,
  formatTxCitation,
  parseTxId,
  resolveTxCitationQuery,
  txId,
} from '../src/identity.js';
import type { TxSection } from '../src/schema.js';
import { TX_STATUTE_SOURCES } from '../src/sources-statutes.js';
import { TX_TAC_SOURCES } from '../src/sources-tac.js';

const SECTION: TxSection = {
  cite: '1952.301',
  code: 'Tex. Ins. Code',
  chapter: '1952',
  chapterTitle: 'Policy Provisions and Forms for Automobile Insurance',
  heading: 'LIMITATION ON PARTS, PRODUCTS, OR REPAIR PERSONS OR FACILITIES PROHIBITED.',
  text: '(a) …',
  effectiveDate: '2007-04-01',
  domain: 'insurance',
  sourceUrl: 'https://statutes.capitol.texas.gov/Docs/IN/htm/IN.1952.htm',
};

describe('resolveTxCitationQuery', () => {
  test('code-worded statute cites in several spellings', () => {
    for (const q of [
      'Tex. Ins. Code 1952.301',
      'Texas Insurance Code 1952.301',
      'Insurance Code §1952.301',
      'Ins. Code Sec. 1952.301',
    ]) {
      expect(resolveTxCitationQuery(q)).toEqual({
        kind: 'section',
        code: 'Tex. Ins. Code',
        cite: '1952.301',
      });
    }
    expect(resolveTxCitationQuery('Labor Code 61.014')).toEqual({
      kind: 'section',
      code: 'Tex. Lab. Code',
      cite: '61.014',
    });
    expect(resolveTxCitationQuery('Bus. & Com. Code 17.46')).toEqual({
      kind: 'section',
      code: 'Tex. Bus. & Com. Code',
      cite: '17.46',
    });
    expect(resolveTxCitationQuery('Transportation Code 501.091')).toEqual({
      kind: 'section',
      code: 'Tex. Transp. Code',
      cite: '501.091',
    });
  });

  test('bare dotted cites resolve by chapter — the disjoint-chapter guarantee', () => {
    expect(resolveTxCitationQuery('1952.301')).toEqual({
      kind: 'section', code: 'Tex. Ins. Code', cite: '1952.301',
    });
    expect(resolveTxCitationQuery('5.501')).toEqual({
      kind: 'section', code: '28 TAC', cite: '5.501',
    });
    expect(resolveTxCitationQuery('21.203')).toEqual({
      kind: 'section', code: '28 TAC', cite: '21.203',
    });
    expect(resolveTxCitationQuery('70.001')).toEqual({
      kind: 'section', code: 'Tex. Prop. Code', cite: '70.001',
    });
    // An unknown chapter is not a citation — fuzzy scoring handles it.
    expect(resolveTxCitationQuery('999.001')).toBeNull();
  });

  test('TAC forms', () => {
    for (const q of ['28 TAC 5.501', 'TAC 5.501', '28 Tex. Admin. Code §5.501', '§5.501']) {
      expect(resolveTxCitationQuery(q)).toEqual({ kind: 'section', code: '28 TAC', cite: '5.501' });
    }
  });

  test('bulletin forms normalize to the zero-padded number', () => {
    for (const q of ['B-0031-10', 'B-31-10', 'Bulletin B-0031-10', 'TDI Bulletin # B-0031-10']) {
      expect(resolveTxCitationQuery(q)).toEqual({
        kind: 'section', code: 'TDI Bulletin', cite: 'B-0031-10',
      });
    }
  });

  test('bare chapter numbers list the chapter', () => {
    expect(resolveTxCitationQuery('1952')).toEqual({
      kind: 'chapter', code: 'Tex. Ins. Code', chapter: '1952',
    });
    expect(resolveTxCitationQuery('Insurance Code chapter 542')).toEqual({
      kind: 'chapter', code: 'Tex. Ins. Code', chapter: '542',
    });
  });

  test('id forms round-trip', () => {
    expect(resolveTxCitationQuery('tex. ins. code:1952.301')).toEqual({
      kind: 'section', code: 'Tex. Ins. Code', cite: '1952.301',
    });
    expect(resolveTxCitationQuery('28 tac:5.501')).toEqual({
      kind: 'section', code: '28 TAC', cite: '5.501',
    });
  });

  test('prose is not a citation', () => {
    expect(resolveTxCitationQuery('adjuster steering my customer')).toBeNull();
    expect(resolveTxCitationQuery('')).toBeNull();
  });
});

describe('ids and citations', () => {
  test('txId/parseTxId round-trip every code', () => {
    const id = txId('Tex. Ins. Code', '1952.301');
    expect(id).toBe('tex. ins. code:1952.301');
    expect(parseTxId(id)).toEqual({ code: 'Tex. Ins. Code', cite: '1952.301' });
    expect(parseTxId('28 tac:5.501')).toEqual({ code: '28 TAC', cite: '5.501' });
    expect(parseTxId('tdi bulletin:B-0031-10')).toEqual({ code: 'TDI Bulletin', cite: 'B-0031-10' });
    expect(parseTxId('nonsense')).toBeNull();
  });

  test('displayCite and the statute citation carry the effective date', () => {
    expect(displayCite(SECTION)).toBe('Tex. Ins. Code 1952.301');
    const citation = formatTxCitation(SECTION);
    expect(citation.shortForm).toBe('Tex. Ins. Code 1952.301, effective 4/1/2007');
    expect(citation.url).toBe(SECTION.sourceUrl);
  });

  test('a bulletin citation reads issued, not effective', () => {
    const citation = formatTxCitation({
      ...SECTION,
      code: 'TDI Bulletin',
      cite: 'B-0031-10',
      chapter: 'Auto',
      chapterTitle: "TDI Commissioner's Bulletins, Automobile",
      heading: 'Automobile Repair Facilities',
      effectiveDate: '2010-08-02',
    });
    expect(citation.shortForm).toBe('TDI Bulletin B-0031-10, issued 8/2/2010');
  });

  test('the currency pin names the 89th Legislature session', () => {
    expect(TX_STATUTES_CURRENCY).toContain('89th');
  });
});

describe('the chapter map covers the manifest and nothing collides', () => {
  test('every manifest chapter resolves to its manifest code', () => {
    for (const source of TX_STATUTE_SOURCES) {
      expect(TX_CHAPTER_CODES[source.chapter]).toBe(source.code);
    }
    for (const source of TX_TAC_SOURCES) {
      expect(TX_CHAPTER_CODES[source.chapter]).toBe('28 TAC');
    }
  });
});
