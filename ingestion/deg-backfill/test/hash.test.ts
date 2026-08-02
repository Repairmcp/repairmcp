import { describe, test, expect } from 'bun:test';
import {
  normalizeForHash,
  contentHash,
  diffFields,
  contentFieldsFromRow,
  HASHED_FIELDS,
} from '../src/hash.js';
import type { ContentFields } from '../src/hash.js';

const BASE: ContentFields = {
  status: 'Resolved (IP Change)',
  resolution_date: '2023-01-17',
  inquiry_type: 'Refinish Operations',
  area_of_vehicle: 'Hood',
  oem_part_number: '90189A0002',
  issue_summary: 'Is blend time included for two-tone refinish?',
  suggested_action: 'Include blend time per P-pages.',
  resolution: 'CCC confirmed blend time is included per P-pages.',
  year: 2022,
  make: 'Toyota',
  model: 'Camry',
  body: 'Sedan',
  submitted_datetime: '2023-01-15 10:30:00',
};

describe('normalizeForHash', () => {
  test('null, undefined and empty string all collapse to the same value', () => {
    expect(normalizeForHash(null)).toBe('');
    expect(normalizeForHash(undefined)).toBe('');
    expect(normalizeForHash('')).toBe('');
  });

  test('collapses runs of whitespace and trims', () => {
    expect(normalizeForHash('  blend   time \n\t included  ')).toBe('blend time included');
  });

  test('preserves case — DEG make casing is dirty at the source and we keep fidelity', () => {
    expect(normalizeForHash('FORD')).toBe('FORD');
    expect(normalizeForHash('Ford')).toBe('Ford');
  });

  test('stringifies numbers', () => {
    expect(normalizeForHash(2022)).toBe('2022');
  });
});

describe('contentHash', () => {
  test('is stable across calls', () => {
    expect(contentHash(BASE)).toBe(contentHash(BASE));
  });

  test('a whitespace-only edit is NOT a change', () => {
    const reflowed: ContentFields = {
      ...BASE,
      issue_summary: 'Is blend time included    for two-tone\n refinish?',
    };
    expect(contentHash(reflowed)).toBe(contentHash(BASE));
  });

  test('NULL and empty string are NOT a change', () => {
    const withNull: ContentFields = { ...BASE, oem_part_number: null };
    const withEmpty: ContentFields = { ...BASE, oem_part_number: '' };
    expect(contentHash(withNull)).toBe(contentHash(withEmpty));
  });

  test('a real content edit IS a change', () => {
    const edited: ContentFields = { ...BASE, resolution: 'CCC declined to change the IP.' };
    expect(contentHash(edited)).not.toBe(contentHash(BASE));
  });

  test('a status transition IS a change', () => {
    const resolved: ContentFields = { ...BASE, status: 'Submitted to IP' };
    expect(contentHash(resolved)).not.toBe(contentHash(BASE));
  });

  test('a case change IS a change', () => {
    expect(contentHash({ ...BASE, make: 'TOYOTA' })).not.toBe(contentHash(BASE));
  });

  test('resolution_status is NOT hashed — it oscillates between tier-1 and tier-2', () => {
    expect(HASHED_FIELDS as readonly string[]).not.toContain('resolution_status');
    // The 83 resolved-blank rows differ only in this derived column between
    // the index upsert and the detail refresh; hashing it made every one of
    // them report a phantom change on every run.
    const withStatus = { ...BASE, resolution_status: 'resolved' } as ContentFields;
    const withoutStatus = { ...BASE, resolution_status: 'pending' } as ContentFields;
    expect(contentHash(withStatus)).toBe(contentHash(withoutStatus));
  });

  test('a value moving between fields is not hash-equivalent', () => {
    const a: ContentFields = { ...BASE, issue_summary: 'x', suggested_action: null };
    const b: ContentFields = { ...BASE, issue_summary: null, suggested_action: 'x' };
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  test('every hashed field participates in the digest', () => {
    for (const field of HASHED_FIELDS) {
      const mutated: ContentFields = { ...BASE, [field]: 'MUTATED-SENTINEL' };
      expect(contentHash(mutated)).not.toBe(contentHash(BASE));
    }
  });
});

describe('diffFields', () => {
  test('names only the fields that actually differ', () => {
    const after: ContentFields = {
      ...BASE,
      resolution: 'CCC declined.',
      status: 'Resolved (No IP Change)',
    };
    expect(diffFields(BASE, after).sort()).toEqual(['resolution', 'status']);
  });

  test('returns empty for a whitespace-only edit', () => {
    const after: ContentFields = { ...BASE, resolution: '  CCC confirmed blend time is included per P-pages. ' };
    expect(diffFields(BASE, after)).toEqual([]);
  });

  test('returns empty for identical input', () => {
    expect(diffFields(BASE, BASE)).toEqual([]);
  });
});

describe('contentFieldsFromRow', () => {
  test('projects a raw snake_case row onto the hashed field set', () => {
    const row = {
      db_id: 41477,
      status: 'Resolved (IP Change)',
      resolution_date: '2023-01-17',
      inquiry_type: 'Refinish Operations',
      area_of_vehicle: 'Hood',
      oem_part_number: '90189A0002',
      issue_summary: 'Is blend time included for two-tone refinish?',
      suggested_action: 'Include blend time per P-pages.',
      resolution: 'CCC confirmed blend time is included per P-pages.',
      resolution_status: 'resolved', // present on the row, absent from the hash
      year: 2022,
      make: 'Toyota',
      model: 'Camry',
      body: 'Sedan',
      submitted_datetime: '2023-01-15 10:30:00',
      // crawl bookkeeping — must NOT reach the hash
      body_fetched_at: '2026-06-26T20:42:56.617Z',
      last_seen_at: '2026-06-26T19:51:48.235Z',
      source_url: 'https://degweb.org/inquiries/41477/',
    };
    expect(contentHash(contentFieldsFromRow(row))).toBe(contentHash(BASE));
  });

  test('crawl bookkeeping changing does not move the hash', () => {
    const base = { status: 'x', last_seen_at: '2026-01-01' };
    const later = { status: 'x', last_seen_at: '2026-08-02' };
    expect(contentHash(contentFieldsFromRow(base))).toBe(
      contentHash(contentFieldsFromRow(later)),
    );
  });
});
