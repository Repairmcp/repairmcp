import { afterAll, describe, expect, test } from 'bun:test';
import {
  WA_IDENTITY,
  displayCite,
  formatWaCitation,
  parseWaId,
  resolveCitationQuery,
  waId,
} from '../src/identity.js';
import type { WaSection } from '../src/schema.js';

const SECTION: WaSection = {
  cite: '284-30-330',
  code: 'WAC',
  chapter: '284-30',
  chapterTitle: 'Trade practices',
  heading: 'Specific unfair claims settlement practices defined.',
  text: 'Filler source text for citation validation only.',
  effectiveDate: '2016-10-30',
  historyNote: '[Statutory Authority: RCW 48.02.060. WSR 16-20-050, filed 9/29/16, effective 10/30/16.]',
  domain: 'insurance',
  sourceUrl: 'https://app.leg.wa.gov/WAC/default.aspx?cite=284-30-330',
};

const RCW_SECTION: WaSection = {
  cite: '46.71.025',
  code: 'RCW',
  chapter: '46.71',
  chapterTitle: 'Automotive repair',
  heading: 'Written estimate required—Alternatives—Authorization to exceed—Exceptions.',
  text: 'Filler source text for citation validation only.',
  domain: 'repair_law',
  sourceUrl: 'https://app.leg.wa.gov/RCW/default.aspx?cite=46.71.025',
};

describe('id namespace', () => {
  test('round-trips both codes', () => {
    expect(waId('WAC', '284-30-330')).toBe('wac:284-30-330');
    expect(waId('RCW', '46.71.025')).toBe('rcw:46.71.025');
    expect(parseWaId('wac:284-30-330')).toEqual({ code: 'WAC', cite: '284-30-330' });
    expect(parseWaId(' rcw:46.71.025 ')).toEqual({ code: 'RCW', cite: '46.71.025' });
  });

  test('rejects junk ids', () => {
    expect(parseWaId('usc:30122')).toBeNull();
    expect(parseWaId('284-30-330')).toBeNull();
    expect(parseWaId('')).toBeNull();
  });
});

describe('resolveCitationQuery', () => {
  test('section cites resolve with or without the code word', () => {
    expect(resolveCitationQuery('WAC 284-30-330')).toEqual({
      kind: 'section',
      code: 'WAC',
      cite: '284-30-330',
    });
    expect(resolveCitationQuery('284-30-330')).toEqual({
      kind: 'section',
      code: 'WAC',
      cite: '284-30-330',
    });
    expect(resolveCitationQuery('rcw 46.71.025')).toEqual({
      kind: 'section',
      code: 'RCW',
      cite: '46.71.025',
    });
    expect(resolveCitationQuery('46.71.025')).toEqual({
      kind: 'section',
      code: 'RCW',
      cite: '46.71.025',
    });
  });

  test('branch-style normalized ids still resolve', () => {
    // The May branch normalized ids as wac-284-30-390 / rcw-48-30-015;
    // packets built against it may still carry them.
    expect(resolveCitationQuery('wac-284-30-390')).toEqual({
      kind: 'section',
      code: 'WAC',
      cite: '284-30-390',
    });
    expect(resolveCitationQuery('rcw-48-30-015')).toEqual({
      kind: 'section',
      code: 'RCW',
      cite: '48.30.015',
    });
  });

  test('letter chapters uppercase (Title 50A)', () => {
    expect(resolveCitationQuery('rcw 50a.05.010')).toEqual({
      kind: 'section',
      code: 'RCW',
      cite: '50A.05.010',
    });
  });

  test('chapter-shaped queries resolve as chapters, not misses', () => {
    // The May branch hard-zeroed anything cite-shaped that missed; a chapter
    // query must instead constrain, so "WAC 284-30" lists the chapter.
    expect(resolveCitationQuery('WAC 284-30')).toEqual({
      kind: 'chapter',
      code: 'WAC',
      chapter: '284-30',
    });
    expect(resolveCitationQuery('46.71')).toEqual({
      kind: 'chapter',
      code: 'RCW',
      chapter: '46.71',
    });
  });

  test('plain language is not a citation', () => {
    expect(resolveCitationQuery('unfair claims settlement practices')).toBeNull();
    expect(resolveCitationQuery('what does WAC 284-30-330 say about delays')).toBeNull();
    expect(resolveCitationQuery('')).toBeNull();
  });
});

describe('formatWaCitation', () => {
  test('short form carries the effective date, rendered UTC-locked', () => {
    const citation = formatWaCitation(SECTION);
    expect(citation.shortForm).toBe('WAC 284-30-330, effective 10/30/2016');
    expect(citation.itemId).toBe('wac:284-30-330');
    expect(citation.url).toBe(SECTION.sourceUrl);
    expect(citation.sourceId).toBe(WA_IDENTITY.sourceId);
    expect(citation.publishedAt?.toISOString()).toBe('2016-10-30T00:00:00.000Z');
  });

  test('no effective date omits the clause — the normal RCW case, never a guess', () => {
    const citation = formatWaCitation(RCW_SECTION);
    expect(citation.shortForm).toBe('RCW 46.71.025');
    expect(citation.publishedAt).toBeUndefined();
  });

  test('long form names the code, heading, chapter title, and official URL', () => {
    const citation = formatWaCitation(SECTION);
    expect(citation.longForm).toBe(
      'Washington Administrative Code 284-30-330 (Specific unfair claims settlement practices defined.), ' +
        'chapter 284-30 WAC (Trade practices), effective 10/30/2016, ' +
        'https://app.leg.wa.gov/WAC/default.aspx?cite=284-30-330',
    );
  });

  test('display cite pairs code and cite', () => {
    expect(displayCite(SECTION)).toBe('WAC 284-30-330');
    expect(displayCite(RCW_SECTION)).toBe('RCW 46.71.025');
  });
});

describe('timezone invariance', () => {
  // TZ mutation takes effect mid-process on bun (tzset) — the same proof
  // pattern as packages/core/test/citation.test.ts and nhtsa's identity test.
  const originalTz = process.env.TZ;
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  test('the effective date renders identically in Pacific and Tokyo time', () => {
    process.env.TZ = 'America/Los_Angeles';
    const pacific = formatWaCitation(SECTION).shortForm;
    process.env.TZ = 'Asia/Tokyo';
    const tokyo = formatWaCitation(SECTION).shortForm;
    expect(pacific).toBe('WAC 284-30-330, effective 10/30/2016');
    expect(tokyo).toBe(pacific);
  });
});
