import { describe, expect, test } from 'bun:test';
import { scoreComplaintRelevance } from '../src/relevance.js';
import type { NhtsaComplaint } from '../src/schema.js';

function complaint(overrides: Partial<NhtsaComplaint>): NhtsaComplaint {
  return {
    odiNumber: '11184030',
    modelYear: 2021,
    make: 'TOYOTA',
    model: 'CAMRY',
    component: 'AIR BAGS',
    summary: 'Air bag warning light remained on after a crash.',
    sourceUrl: 'https://api.nhtsa.gov/complaints/odinumber?odinumber=11184030',
    allegationCaveat: 'Consumer complaint; not a defect finding.',
    ...overrides,
  };
}

describe('scoreComplaintRelevance', () => {
  test('scores collision safety terms highly', () => {
    const result = scoreComplaintRelevance(complaint({}), {
      keyword: 'air bag',
      now: new Date('2026-05-09T00:00:00Z'),
    });

    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.breakdown.keyword).toBe(0.5);
    expect(result.matchedTerms).toContain('air bag');
  });

  test('adds severity for crash, fire, injury, or death indicators', () => {
    const result = scoreComplaintRelevance(
      complaint({ crash: true, fire: true, injuryCount: 1 }),
      { now: new Date('2026-05-09T00:00:00Z') },
    );

    expect(result.breakdown.severity).toBe(0.2);
  });

  test('does not match EV inside ordinary words', () => {
    const result = scoreComplaintRelevance(
      complaint({
        component: 'UNKNOWN',
        summary: 'The vehicle never had previous severe issues.',
      }),
      { now: new Date('2026-05-09T00:00:00Z') },
    );

    expect(result.score).toBe(0);
    expect(result.matchedTerms).toEqual([]);
  });

  test('does not treat user keyword as a raw substring match', () => {
    const result = scoreComplaintRelevance(
      complaint({
        component: 'UNKNOWN',
        summary: 'The vehicle never had previous severe issues.',
      }),
      { keyword: 'ev', now: new Date('2026-05-09T00:00:00Z') },
    );

    expect(result.breakdown.keyword).toBe(0);
    expect(result.score).toBe(0);
  });

  test('treats complaints filed exactly 36 calendar months ago as recent', () => {
    const now = new Date('2026-05-09T00:00:00Z');
    const boundary = scoreComplaintRelevance(
      complaint({
        component: 'UNKNOWN',
        summary: 'No collision-related safety terms.',
        dateComplaintFiled: '2023-05-09T00:00:00Z',
      }),
      { now },
    );
    const olderThanBoundary = scoreComplaintRelevance(
      complaint({
        component: 'UNKNOWN',
        summary: 'No collision-related safety terms.',
        dateComplaintFiled: '2023-05-08T23:59:59Z',
      }),
      { now },
    );

    expect(boundary.breakdown.recency).toBe(0.05);
    expect(olderThanBoundary.breakdown.recency).toBe(0);
  });

  test('caps combined keyword and component score at one', () => {
    const result = scoreComplaintRelevance(
      complaint({
        crash: true,
        fire: true,
        injuryCount: 2,
        deathCount: 1,
        summary: 'Air bag seat belt ADAS camera radar fire crash injury.',
        dateComplaintFiled: '2026-05-01T00:00:00Z',
      }),
      { keyword: 'air bag', component: 'AIR BAGS', now: new Date('2026-05-09T00:00:00Z') },
    );

    expect(result.breakdown.keyword).toBe(1);
    expect(result.score).toBe(1);
  });
});
