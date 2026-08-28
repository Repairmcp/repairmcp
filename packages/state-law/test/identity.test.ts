import { describe, expect, test } from 'bun:test';
import { makeStateIdentity } from '../src/identity.js';
import type { StateSection } from '../src/schema.js';

/**
 * Direct tests of the identity factory with a synthetic two-code config —
 * the states exercise it through their wrappers (WA pins byte-exact strings,
 * MT pins the opposite bare-separator inference), so what belongs here is
 * the config-driven mechanics no single state shows: separator claims in
 * config order, per-code group shapes, and the citation-note default.
 */

const identity = makeStateIdentity({
  sourceId: 'state-xx',
  sourceName: 'Test State',
  sourceShortName: 'XX Law',
  sourceUrl: 'https://example.gov',
  description: 'test',
  itemNoun: 'section',
  itemNounPlural: 'law sections',
  codes: [
    { code: 'AAA', longName: 'Alpha Code', separator: '-', claimsBareSeparators: ['-'] },
    { code: 'BBB', longName: 'Beta Rules', separator: '.', claimsBareSeparators: ['.'] },
  ],
});

const SECTION: StateSection = {
  cite: '1-2-3',
  code: 'AAA',
  chapter: '1-2',
  chapterTitle: 'Test Chapter',
  heading: 'Test heading.',
  text: 'Text.',
  effectiveDate: '2020-05-01',
  domain: 'insurance',
  sourceUrl: 'https://example.gov/1-2-3',
};

describe('makeStateIdentity', () => {
  test('bare separators resolve to whichever code claims them, in config order', () => {
    expect(identity.resolveCitationQuery('1-2-3')).toEqual({
      kind: 'section',
      code: 'AAA',
      cite: '1-2-3',
    });
    expect(identity.resolveCitationQuery('1.2.3')).toEqual({
      kind: 'section',
      code: 'BBB',
      cite: '1.2.3',
    });
    // Mixed separators go to the first claimant in config order.
    expect(identity.resolveCitationQuery('1-2.3')).toEqual({
      kind: 'section',
      code: 'AAA',
      cite: '1-2-3',
    });
  });

  test('an explicit code word canonicalizes the separators', () => {
    expect(identity.resolveCitationQuery('BBB 1-2-3')).toEqual({
      kind: 'section',
      code: 'BBB',
      cite: '1.2.3',
    });
  });

  test('two groups are a chapter; one or four are nothing', () => {
    expect(identity.resolveCitationQuery('AAA 1-2')).toEqual({
      kind: 'chapter',
      code: 'AAA',
      chapter: '1-2',
    });
    expect(identity.resolveCitationQuery('AAA 1')).toBeNull();
    expect(identity.resolveCitationQuery('1-2-3-4')).toBeNull();
  });

  test('the default citation note is the effective-date clause, silent when absent', () => {
    expect(identity.formatCitation(SECTION).shortForm).toBe('AAA 1-2-3, effective 5/1/2020');
    const undated = { ...SECTION, effectiveDate: undefined };
    expect(identity.formatCitation(undated).shortForm).toBe('AAA 1-2-3');
    expect(identity.formatCitation(undated).publishedAt).toBeUndefined();
  });

  test('a per-code citationNote overrides the default', () => {
    const noted = makeStateIdentity({
      ...identity.config,
      codes: [
        {
          code: 'AAA',
          longName: 'Alpha Code',
          separator: '-',
          citationNote: () => 'special note',
        },
      ],
    });
    expect(noted.formatCitation(SECTION).shortForm).toBe('AAA 1-2-3, special note');
  });

  test('ids round-trip and junk is rejected', () => {
    expect(identity.id('AAA', '1-2-3')).toBe('aaa:1-2-3');
    expect(identity.parseId('bbb:1.2.3')).toEqual({ code: 'BBB', cite: '1.2.3' });
    expect(identity.parseId('ccc:1-2-3')).toBeNull();
  });
});
