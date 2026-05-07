import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  tokenize,
  bigramsOf,
  detectIp,
  scoreInquiry,
} from '../src/scoring';
import { DEGAdapter } from '../src/adapter';
import { DEGInquirySchema, type DEGInquiry } from '../src/schema';

const FIXED_NOW = new Date('2026-05-07T12:00:00Z');

const SAMPLE_PATH = join(import.meta.dir, '..', '..', '..', 'apps', 'deg-server', 'data', 'sample-inquiries.json');

function loadCorpus(): DEGAdapter | null {
  if (!existsSync(SAMPLE_PATH)) return null;
  const raw = JSON.parse(readFileSync(SAMPLE_PATH, 'utf-8'));
  const arr = (DEGInquirySchema.array().parse(raw)) as DEGInquiry[];
  return new DEGAdapter(arr);
}

// ──────────────────────────────────────────────────────────────────────
// Pure scoring primitives
// ──────────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  test('lowercases, strips punctuation, drops stopwords + short tokens', () => {
    expect(tokenize('R&I rear bumper for refinish on adjacent panel')).toEqual([
      'ri',
      'rear',
      'bumper',
      'refinish',
      'adjacent',
      'panel',
    ]);
  });

  test('hyphens collapse to spaces', () => {
    expect(tokenize('two-tone refinish')).toEqual(['two', 'tone', 'refinish']);
  });

  test('empty/whitespace input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('bigramsOf', () => {
  test('produces n-1 bigrams', () => {
    expect(bigramsOf(['a', 'b', 'c', 'd'])).toEqual(['a b', 'b c', 'c d']);
  });

  test('zero or one token → no bigrams', () => {
    expect(bigramsOf([])).toEqual([]);
    expect(bigramsOf(['solo'])).toEqual([]);
  });
});

describe('detectIp', () => {
  test('CCC keywords → CCC', () => {
    expect(detectIp('Per the MOTOR GTE pages, CCC needs to update...')).toBe('CCC');
  });

  test('Mitchell keywords (no DBRM) → Mitchell', () => {
    expect(detectIp('Mitchell MWS update needed')).toBe('Mitchell');
  });

  test('Audatex keywords → Audatex', () => {
    expect(detectIp('Audatex DBRM Section 4 Solera Qapter')).toBe('Audatex');
  });

  test('no IP keywords → null', () => {
    expect(detectIp('blend two tone refinish on adjacent panel')).toBeNull();
  });

  test('tie between providers → null (no opinion)', () => {
    // 1 mitchell hit + 1 dbrm (audatex) hit → tied → null
    expect(detectIp('Mitchell DBRM')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// scoreInquiry against a synthesized inquiry
// ──────────────────────────────────────────────────────────────────────

function fakeInquiry(overrides: Partial<DEGInquiry> = {}): DEGInquiry {
  const base: DEGInquiry = {
    id: '99999',
    title: '2024 Honda Accord — Refinish Operations: Front Door',
    url: 'https://degweb.org/inquiries/99999/',
    lastUpdated: new Date('2025-08-15T00:00:00Z'),
    metadata: {},
    inquiryNumber: '99999',
    ip: 'CCC',
    inquiryType: 'Refinish Operations',
    areaOfVehicle: 'Front Door',
    vehicleYear: 2024,
    vehicleMake: 'Honda',
    vehicleModel: 'Accord',
    body: 'Sedan',
    issueSummary: 'Two tone blend refinish time is missing for adjacent panel.',
    suggestedAction: 'Add blend time for two tone refinish operations.',
    resolution: 'Per the MOTOR GTE Pages, blend time is included in base refinish.',
    status: 'resolved',
    submittedAt: new Date('2025-08-15T00:00:00Z'),
    resolvedAt: new Date('2025-09-15T00:00:00Z'),
  };
  return { ...base, ...overrides };
}

describe('scoreInquiry — components', () => {
  test('text score blends bigram + unigram (clamped to 1)', () => {
    const inq = fakeInquiry();
    const { breakdown } = scoreInquiry('blend two tone refinish', inq, { now: FIXED_NOW });
    // bigrams: blend two, two tone, tone refinish — synthesized issueSummary contains
    // "two tone blend refinish" → "two tone" yes, "tone refinish" depends on adjacency.
    expect(breakdown.bigram).toBeGreaterThan(0);
    expect(breakdown.unigram).toBe(1); // all 4 tokens present
    expect(breakdown.text).toBeGreaterThan(0.5);
    expect(breakdown.text).toBeLessThanOrEqual(1);
  });

  test('IP boost when query implies inquiry IP', () => {
    const inq = fakeInquiry({ ip: 'CCC' });
    const withCcc = scoreInquiry('CCC needs MOTOR update', inq, { now: FIXED_NOW });
    const noIp = scoreInquiry('generic refinish question', inq, { now: FIXED_NOW });
    expect(withCcc.breakdown.ip).toBe(0.15);
    expect(noIp.breakdown.ip).toBe(0);
  });

  test('IP boost not applied on mismatch', () => {
    const inq = fakeInquiry({ ip: 'Audatex' });
    const r = scoreInquiry('CCC MOTOR update', inq, { now: FIXED_NOW });
    expect(r.breakdown.ip).toBe(0);
  });

  test('vehicle boost is additive up to 0.30', () => {
    const inq = fakeInquiry({ vehicleYear: 2024, vehicleMake: 'Honda', vehicleModel: 'Accord' });
    const all = scoreInquiry('refinish', inq, {
      now: FIXED_NOW,
      vehicleYear: 2024,
      vehicleMake: 'Honda',
      vehicleModel: 'Accord',
    });
    expect(all.breakdown.vehicle).toBeCloseTo(0.3, 5);

    const onlyMake = scoreInquiry('refinish', inq, { now: FIXED_NOW, vehicleMake: 'Honda' });
    expect(onlyMake.breakdown.vehicle).toBeCloseTo(0.1, 5);
  });

  test('operation match: query token in inquiryType', () => {
    const inq = fakeInquiry({ inquiryType: 'Refinish Operations' });
    const r = scoreInquiry('refinish blend time', inq, { now: FIXED_NOW });
    expect(r.breakdown.operation).toBe(0.1);
  });

  test('no operation match when no token in inquiryType', () => {
    const inq = fakeInquiry({ inquiryType: 'Body Operations' });
    const r = scoreInquiry('refinish', inq, { now: FIXED_NOW });
    expect(r.breakdown.operation).toBe(0);
  });

  test('recency boost only within last 24 months', () => {
    const recent = fakeInquiry({ resolvedAt: new Date('2026-04-01T00:00:00Z') });
    const old = fakeInquiry({
      submittedAt: new Date('2014-01-01T00:00:00Z'),
      resolvedAt: new Date('2014-06-01T00:00:00Z'),
    });
    expect(scoreInquiry('refinish', recent, { now: FIXED_NOW }).breakdown.recency).toBe(0.05);
    expect(scoreInquiry('refinish', old, { now: FIXED_NOW }).breakdown.recency).toBe(0);
  });

  test('total is clamped to [0, 1]', () => {
    const inq = fakeInquiry();
    const r = scoreInquiry(
      'blend two tone refinish CCC MOTOR Refinish operations',
      inq,
      { now: FIXED_NOW, vehicleYear: 2024, vehicleMake: 'Honda', vehicleModel: 'Accord' },
    );
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Corpus integration: against the real sample-inquiries.json
// ──────────────────────────────────────────────────────────────────────

describe('findSupporting — corpus integration', () => {
  const adapter = loadCorpus();

  test.skipIf(adapter === null)('"blend two-tone refinish" ranks #40990 #1 with confidence > 0.7', () => {
    if (!adapter) throw new Error('corpus not available');
    const results = adapter.findSupporting({
      lineItemText: 'blend two-tone refinish',
      now: FIXED_NOW,
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0]!;
    expect(top.inquiry.id).toBe('40990');
    expect(top.score).toBeGreaterThan(0.7);
  });

  test.skipIf(adapter === null)('vehicle filter pushes Ford inquiries higher', () => {
    if (!adapter) throw new Error('corpus not available');
    const noFilter = adapter.findSupporting({
      lineItemText: 'labor time refinish',
      now: FIXED_NOW,
      limit: 10,
    });
    const withFord = adapter.findSupporting({
      lineItemText: 'labor time refinish',
      now: FIXED_NOW,
      vehicleMake: 'Ford',
      limit: 10,
    });
    // The Ford-filtered query's top hit should have a Ford make.
    const top = withFord[0];
    if (top) {
      expect((top.inquiry.vehicleMake ?? '').toLowerCase()).toContain('ford');
      // And its score should be at least as high as the same inquiry would score
      // without the filter (vehicle boost is additive).
      const sameInUnfiltered = noFilter.find((r) => r.inquiry.id === top.inquiry.id);
      if (sameInUnfiltered) {
        expect(top.score).toBeGreaterThanOrEqual(sameInUnfiltered.score);
      }
    }
  });

  test.skipIf(adapter === null)('IP-implying query boosts CCC inquiries', () => {
    if (!adapter) throw new Error('corpus not available');
    const results = adapter.findSupporting({
      lineItemText: 'MOTOR GTE pages refinish question',
      now: FIXED_NOW,
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    // At least the top 3 should have CCC IP (since query has explicit CCC signal).
    const topIps = results.slice(0, 3).map((r) => r.inquiry.ip);
    const cccCount = topIps.filter((ip) => ip === 'CCC').length;
    expect(cccCount).toBeGreaterThanOrEqual(2);
  });

  test.skipIf(adapter === null)('results are sorted by score descending', () => {
    if (!adapter) throw new Error('corpus not available');
    const results = adapter.findSupporting({
      lineItemText: 'rear bumper refinish adjacent panel',
      now: FIXED_NOW,
      limit: 10,
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  test.skipIf(adapter === null)('limit respected', () => {
    if (!adapter) throw new Error('corpus not available');
    const r = adapter.findSupporting({ lineItemText: 'refinish', now: FIXED_NOW, limit: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
  });

  test.skipIf(adapter === null)('breakdown components sum approximately to score (modulo clamping)', () => {
    if (!adapter) throw new Error('corpus not available');
    const r = adapter.findSupporting({
      lineItemText: 'blend two-tone refinish',
      now: FIXED_NOW,
      limit: 1,
    });
    const top = r[0];
    if (!top) throw new Error('expected at least one result');
    const b = top.breakdown;
    const expected = Math.min(1, b.text + b.ip + b.vehicle + b.operation + b.recency);
    expect(top.score).toBeCloseTo(expected, 5);
  });
});
