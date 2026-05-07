import { describe, test, expect } from 'bun:test';
import { buildCitation } from '../src/citation/formatter';

const baseInput = {
  sourceId: 'deg',
  sourceName: 'Database Enhancement Gateway',
  sourceShortName: 'DEG',
  itemId: '40990',
  url: 'https://degweb.org/inquiries/40990/',
  itemNoun: 'inquiry',
};

// 2026-01-01T00:00:00Z. Renders as "12/31/2025" in any UTC-negative zone (PT,
// MT, CT, ET, ...) under naive `.toLocaleDateString()`, and "1/1/2026" in UTC.
// This is the canonical reproducer for the TZ divergence bug.
const NEW_YEARS_UTC_MIDNIGHT = new Date('2026-01-01T00:00:00.000Z');

// Demonstrates that the difference exists at the platform level — sanity check
// that the test isn't asserting a tautology against a fixed-implementation OS.
describe('environment confirms PT vs UTC produce different formatted dates', () => {
  test('Intl.DateTimeFormat differs between PT and UTC for UTC midnight', () => {
    const pt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles' }).format(
      NEW_YEARS_UTC_MIDNIGHT,
    );
    const utc = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(
      NEW_YEARS_UTC_MIDNIGHT,
    );
    expect(pt).toBe('12/31/2025');
    expect(utc).toBe('1/1/2026');
  });
});

describe('buildCitation — UTC-locked formatting', () => {
  test('shortForm uses UTC date (1/1/2026) for UTC midnight publishedAt', () => {
    const c = buildCitation({ ...baseInput, publishedAt: NEW_YEARS_UTC_MIDNIGHT });
    expect(c.shortForm).toBe('DEG #40990 (1/1/2026)');
  });

  test('longForm with resolvedAt uses UTC date', () => {
    const c = buildCitation({
      ...baseInput,
      publishedAt: new Date('2025-12-15T00:00:00.000Z'),
      resolvedAt: NEW_YEARS_UTC_MIDNIGHT,
    });
    expect(c.longForm).toContain('1/1/2026');
    expect(c.longForm).not.toContain('12/31/2025');
    expect(c.shortForm).toContain('1/1/2026'); // shortForm prefers resolvedAt
  });

  test('longForm without resolvedAt does not embed a date', () => {
    const c = buildCitation({ ...baseInput, publishedAt: NEW_YEARS_UTC_MIDNIGHT });
    expect(c.longForm).toBe(
      'Database Enhancement Gateway inquiry #40990, https://degweb.org/inquiries/40990/',
    );
  });

  test('falls back to "date unknown" when no dates supplied', () => {
    const c = buildCitation({ ...baseInput });
    expect(c.shortForm).toBe('DEG #40990 (date unknown)');
  });

  test('output is invariant to process.env.TZ', () => {
    const beforeTz = process.env.TZ;
    const beforeNodeIcuTz = process.env.NODE_ICU_TZ;

    const refShort = buildCitation({ ...baseInput, publishedAt: NEW_YEARS_UTC_MIDNIGHT })
      .shortForm;
    const refLong = buildCitation({
      ...baseInput,
      resolvedAt: NEW_YEARS_UTC_MIDNIGHT,
    }).longForm;

    try {
      // Flip to a UTC-negative zone where the bug would manifest most visibly.
      process.env.TZ = 'America/Los_Angeles';
      process.env.NODE_ICU_TZ = 'America/Los_Angeles';
      const c1 = buildCitation({ ...baseInput, publishedAt: NEW_YEARS_UTC_MIDNIGHT });
      const c2 = buildCitation({ ...baseInput, resolvedAt: NEW_YEARS_UTC_MIDNIGHT });
      expect(c1.shortForm).toBe(refShort);
      expect(c2.longForm).toBe(refLong);

      // And to a UTC-positive zone for symmetry.
      process.env.TZ = 'Asia/Tokyo';
      process.env.NODE_ICU_TZ = 'Asia/Tokyo';
      const c3 = buildCitation({ ...baseInput, publishedAt: NEW_YEARS_UTC_MIDNIGHT });
      const c4 = buildCitation({ ...baseInput, resolvedAt: NEW_YEARS_UTC_MIDNIGHT });
      expect(c3.shortForm).toBe(refShort);
      expect(c4.longForm).toBe(refLong);
    } finally {
      if (beforeTz === undefined) delete process.env.TZ;
      else process.env.TZ = beforeTz;
      if (beforeNodeIcuTz === undefined) delete process.env.NODE_ICU_TZ;
      else process.env.NODE_ICU_TZ = beforeNodeIcuTz;
    }
  });

  test('non-UTC-midnight date still renders consistently in UTC', () => {
    // 2026-04-08T19:14:58Z — this is the actual submittedAt for inquiry 40990.
    // UTC date is 4/8/2026; CDT (Travis's local TZ in April) is also 4/8/2026.
    // Should render as 4/8/2026 in both contexts.
    const date = new Date('2026-04-08T19:14:58.000Z');
    const c = buildCitation({ ...baseInput, publishedAt: date });
    expect(c.shortForm).toBe('DEG #40990 (4/8/2026)');
  });
});
