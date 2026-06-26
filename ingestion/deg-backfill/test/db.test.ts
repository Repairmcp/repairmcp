import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createSchema, upsertMetadata, getPendingIds, getRow, countByResolutionStatus } from '../src/db.js';
import type { MetadataRow } from '../src/db.js';

function makeDb(): Database {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}

const BASE_ROW: MetadataRow = {
  dbId: 41477,
  database: 'CCC',
  inquiryType: 'Refinish Operations',
  status: 'Resolved (IP Change)',
  resolutionStatus: 'resolved',
  year: 2022,
  make: 'Toyota',
  model: '4 RUNNER',
  submissionDate: '2023-01-15',
  resolutionDate: '2023-01-17',
  sourceUrl: 'https://degweb.org/inquiries/41477/',
  lastSeenAt: '2026-06-26T00:00:00.000Z',
};

describe('createSchema', () => {
  test('creates the inquiry table', () => {
    const db = new Database(':memory:');
    createSchema(db);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inquiry'")
      .get<{ name: string }>();
    expect(table?.name).toBe('inquiry');
  });

  test('is idempotent', () => {
    const db = new Database(':memory:');
    createSchema(db);
    expect(() => createSchema(db)).not.toThrow();
  });
});

describe('upsertMetadata', () => {
  test('inserts a new row', () => {
    const db = makeDb();
    upsertMetadata(db, [BASE_ROW]);
    const row = db
      .prepare('SELECT db_id, database FROM inquiry WHERE db_id = 41477')
      .get<{ db_id: number; database: string }>();
    expect(row?.db_id).toBe(41477);
    expect(row?.database).toBe('CCC');
  });

  test('sets body_fetched_at to NULL on new rows', () => {
    const db = makeDb();
    upsertMetadata(db, [BASE_ROW]);
    const row = db
      .prepare('SELECT body_fetched_at FROM inquiry WHERE db_id = 41477')
      .get<{ body_fetched_at: string | null }>();
    expect(row?.body_fetched_at).toBeNull();
  });

  test('preserves body_fetched_at when status and resolution_date unchanged', () => {
    const db = makeDb();
    upsertMetadata(db, [BASE_ROW]);
    db.run("UPDATE inquiry SET body_fetched_at = '2026-06-26T01:00:00.000Z' WHERE db_id = 41477");
    upsertMetadata(db, [BASE_ROW]);
    const row = db
      .prepare('SELECT body_fetched_at FROM inquiry WHERE db_id = 41477')
      .get<{ body_fetched_at: string | null }>();
    expect(row?.body_fetched_at).toBe('2026-06-26T01:00:00.000Z');
  });

  test('clears body_fetched_at when status changes', () => {
    const db = makeDb();
    const pending: MetadataRow = {
      ...BASE_ROW,
      dbId: 101,
      status: 'Submitted to IP',
      resolutionStatus: 'pending',
      resolutionDate: '',
    };
    upsertMetadata(db, [pending]);
    db.run("UPDATE inquiry SET body_fetched_at = '2026-06-26T01:00:00.000Z' WHERE db_id = 101");
    upsertMetadata(db, [
      { ...pending, status: 'Resolved (IP Change)', resolutionStatus: 'resolved', resolutionDate: '2023-02-03' },
    ]);
    const row = db
      .prepare('SELECT body_fetched_at FROM inquiry WHERE db_id = 101')
      .get<{ body_fetched_at: string | null }>();
    expect(row?.body_fetched_at).toBeNull();
  });

  test('preserves non-null year/make/model on re-sync (Tier-2 values survive)', () => {
    const db = makeDb();
    upsertMetadata(db, [BASE_ROW]);
    db.run("UPDATE inquiry SET year = 2023, make = 'TOYOTA' WHERE db_id = 41477");
    upsertMetadata(db, [BASE_ROW]); // Tier-1 re-sync with year=2022
    const row = db
      .prepare('SELECT year, make FROM inquiry WHERE db_id = 41477')
      .get<{ year: number; make: string }>();
    expect(row?.year).toBe(2023);
    expect(row?.make).toBe('TOYOTA');
  });
});

describe('getPendingIds', () => {
  test('returns rows with body_fetched_at IS NULL', () => {
    const db = makeDb();
    upsertMetadata(db, [BASE_ROW, { ...BASE_ROW, dbId: 100, resolutionDate: '' }]);
    expect(getPendingIds(db)).toContain(41477);
    expect(getPendingIds(db)).toContain(100);
  });

  test('excludes rows with body_fetched_at set', () => {
    const db = makeDb();
    upsertMetadata(db, [BASE_ROW]);
    db.run("UPDATE inquiry SET body_fetched_at = '2026-06-26T01:00:00.000Z' WHERE db_id = 41477");
    expect(getPendingIds(db)).not.toContain(41477);
  });

  test('respects limit', () => {
    const db = makeDb();
    const rows: MetadataRow[] = Array.from({ length: 5 }, (_, i) => ({
      ...BASE_ROW,
      dbId: 1000 + i,
    }));
    upsertMetadata(db, rows);
    expect(getPendingIds(db, 3).length).toBe(3);
  });

  test('orders by db_id ASC', () => {
    const db = makeDb();
    upsertMetadata(db, [
      { ...BASE_ROW, dbId: 300 },
      { ...BASE_ROW, dbId: 100 },
      { ...BASE_ROW, dbId: 200 },
    ]);
    const ids = getPendingIds(db);
    expect(ids[0]).toBe(100);
    expect(ids[1]).toBe(200);
    expect(ids[2]).toBe(300);
  });
});

describe('countByResolutionStatus', () => {
  test('counts resolved and pending correctly', () => {
    const db = makeDb();
    upsertMetadata(db, [
      BASE_ROW,
      { ...BASE_ROW, dbId: 200, status: 'Submitted to IP', resolutionStatus: 'pending', resolutionDate: '' },
      { ...BASE_ROW, dbId: 300 },
    ]);
    const counts = countByResolutionStatus(db);
    expect(counts.resolved).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.total).toBe(3);
  });
});
