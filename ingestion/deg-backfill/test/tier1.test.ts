import { describe, test, expect } from 'bun:test';
import type { FetchLike } from '../src/tier2.js';
import { Database as MakeRepairDb } from 'bun:sqlite';
import type { SQLQueryBindings } from 'bun:sqlite';
import { createSchema as createSchemaForRepair, repairTruncatedMakes } from '../src/db.js';
import { MULTI_WORD_MAKES } from '../src/tier1.js';

describe('parseVehicleData — multi-word makes', () => {
  test('keeps a two-word make intact instead of splitting it into the model', async () => {
    const { parseVehicleData } = await import('../src/tier1.js');
    expect(parseVehicleData('2022 Land Rover Range Rover Sport')).toEqual({
      year: 2022,
      make: 'Land Rover',
      model: 'Range Rover Sport',
    });
  });

  test('still splits ordinary single-word makes at the first token', async () => {
    const { parseVehicleData } = await import('../src/tier1.js');
    expect(parseVehicleData('2022 Toyota Camry SE')).toEqual({
      year: 2022,
      make: 'Toyota',
      model: 'Camry SE',
    });
  });

  test('matches a multi-word make case-insensitively', async () => {
    const { parseVehicleData } = await import('../src/tier1.js');
    expect(parseVehicleData('2020 MERCEDES BENZ C300')).toEqual({
      year: 2020,
      make: 'MERCEDES BENZ',
      model: 'C300',
    });
  });

  test('handles a two-word make with no model left over', async () => {
    const { parseVehicleData } = await import('../src/tier1.js');
    expect(parseVehicleData('2021 Alfa Romeo')).toEqual({
      year: 2021,
      make: 'Alfa Romeo',
      model: null,
    });
  });
});

describe('repairTruncatedMakes', () => {
  function seed(rows: Array<[number, string, string | null]>): MakeRepairDb {
    const db = new MakeRepairDb(':memory:');
    createSchemaForRepair(db);
    for (const [id, make, model] of rows) {
      db.run('INSERT INTO inquiry (db_id, make, model) VALUES (?, ?, ?)', [id, make, model]);
    }
    return db;
  }

  test('moves the stranded token back onto the make', () => {
    const db = seed([[1, 'Land', 'Rover Range Rover Sport']]);
    const result = repairTruncatedMakes(db, MULTI_WORD_MAKES);
    expect(result.repaired).toBe(1);
    const row = db.query('SELECT make, model FROM inquiry WHERE db_id = 1').get() as {
      make: string;
      model: string;
    };
    expect(row.make).toBe('Land Rover');
    expect(row.model).toBe('Range Rover Sport');
  });

  test('preserves stored casing rather than normalizing to the canonical form', () => {
    const db = seed([[1, 'LAND', 'Rover Defender']]);
    repairTruncatedMakes(db, MULTI_WORD_MAKES);
    const row = db.query('SELECT make FROM inquiry WHERE db_id = 1').get() as { make: string };
    expect(row.make).toBe('LAND Rover');
  });

  test('leaves the model null when nothing remains after the make', () => {
    const db = seed([[1, 'Alfa', 'Romeo']]);
    repairTruncatedMakes(db, MULTI_WORD_MAKES);
    const row = db.query('SELECT make, model FROM inquiry WHERE db_id = 1').get() as {
      make: string;
      model: string | null;
    };
    expect(row.make).toBe('Alfa Romeo');
    expect(row.model).toBeNull();
  });

  test('does not touch an unrelated make that merely shares a prefix word', () => {
    const db = seed([[1, 'Land', 'Cruiser'], [2, 'Toyota', 'Camry']]);
    const result = repairTruncatedMakes(db, MULTI_WORD_MAKES);
    expect(result.repaired).toBe(0);
    const row = db.query('SELECT make, model FROM inquiry WHERE db_id = 1').get() as {
      make: string;
      model: string;
    };
    expect(row.make).toBe('Land');
    expect(row.model).toBe('Cruiser');
  });

  test('is idempotent — a second pass changes nothing', () => {
    const db = seed([[1, 'Land', 'Rover Defender']]);
    expect(repairTruncatedMakes(db, MULTI_WORD_MAKES).repaired).toBe(1);
    expect(repairTruncatedMakes(db, MULTI_WORD_MAKES).repaired).toBe(0);
    const row = db.query('SELECT make, model FROM inquiry WHERE db_id = 1').get() as {
      make: string;
      model: string;
    };
    expect(row.make).toBe('Land Rover');
    expect(row.model).toBe('Defender');
  });
});

import { Database } from 'bun:sqlite';
import { createSchema, countByResolutionStatus } from '../src/db.js';
import { parseVehicleData, deriveResolutionStatus, syncIndex } from '../src/tier1.js';

describe('parseVehicleData', () => {
  test('parses standard format: year make model', () => {
    expect(parseVehicleData('2022 Toyota 4 RUNNER')).toEqual({
      year: 2022,
      make: 'Toyota',
      model: '4 RUNNER',
    });
  });

  test('parses two-word vehicle: year make model', () => {
    expect(parseVehicleData('2019 Honda Civic')).toEqual({
      year: 2019,
      make: 'Honda',
      model: 'Civic',
    });
  });

  test('returns nulls when no leading 4-digit year', () => {
    expect(parseVehicleData('Toyota Camry')).toEqual({ year: null, make: null, model: null });
  });

  test('returns year only when single token year', () => {
    expect(parseVehicleData('2022')).toEqual({ year: 2022, make: null, model: null });
  });

  test('returns nulls on empty string', () => {
    expect(parseVehicleData('')).toEqual({ year: null, make: null, model: null });
  });
});

describe('deriveResolutionStatus', () => {
  test('"Resolved (IP Change)" -> resolved', () => {
    expect(deriveResolutionStatus('Resolved (IP Change)')).toBe('resolved');
  });

  test('"Resolved (No IP Change)" -> resolved', () => {
    expect(deriveResolutionStatus('Resolved (No IP Change)')).toBe('resolved');
  });

  test('"Resolved (DEG Response)" -> resolved', () => {
    expect(deriveResolutionStatus('Resolved (DEG Response)')).toBe('resolved');
  });

  test('"Submitted to IP" -> pending', () => {
    expect(deriveResolutionStatus('Submitted to IP')).toBe('pending');
  });

  test('unknown status -> pending', () => {
    expect(deriveResolutionStatus('Under Review')).toBe('pending');
  });
});

describe('syncIndex', () => {
  test('upserts all entries from a mocked /grid/get/all response', async () => {
    const db = new Database(':memory:');
    createSchema(db);

    const mockResponse = {
      count: 2,
      data: [
        {
          db_id: '41477',
          post_id: '99999',
          database: 'CCC',
          InquiryType: 'Refinish Operations',
          VehicleData: '2022 Toyota 4 RUNNER',
          status: 'Resolved (IP Change)',
          SubmissionDate: '2023-01-15',
          ResolutionDate: '2023-01-17',
          ResolveTime: '48h',
          more: null,
        },
        {
          db_id: '41500',
          post_id: '99998',
          database: 'Mitchell',
          InquiryType: 'Parts',
          VehicleData: '2021 Honda Civic',
          status: 'Submitted to IP',
          SubmissionDate: '2026-06-25',
          ResolutionDate: '',
          ResolveTime: '',
          more: null,
        },
      ],
    };

    const mockFetch: FetchLike = async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await syncIndex(db, mockFetch);

    expect(result.total).toBe(2);
    const counts = countByResolutionStatus(db);
    expect(counts.resolved).toBe(1);
    expect(counts.pending).toBe(1);
    expect(counts.total).toBe(2);
  });

  test('sets source_url to https://degweb.org/inquiries/{db_id}/', async () => {
    const db = new Database(':memory:');
    createSchema(db);

    const mockResponse = {
      count: 1,
      data: [
        {
          db_id: '12345',
          post_id: '1',
          database: 'CCC',
          InquiryType: 'Parts',
          VehicleData: '2020 Ford F-150',
          status: 'Submitted to IP',
          SubmissionDate: '2026-01-01',
          ResolutionDate: '',
          ResolveTime: '',
          more: null,
        },
      ],
    };

    const mockFetch: FetchLike = async () =>
      new Response(JSON.stringify(mockResponse), { status: 200 });

    await syncIndex(db, mockFetch);

    const row = db
      .prepare<{ source_url: string }, SQLQueryBindings[]>('SELECT source_url FROM inquiry WHERE db_id = 12345')
      .get();
    expect(row?.source_url).toBe('https://degweb.org/inquiries/12345/');
  });

  test('throws on non-200 response', async () => {
    const db = new Database(':memory:');
    createSchema(db);
    const mockFetch: FetchLike = async () =>
      new Response('Server Error', { status: 500 });
    await expect(syncIndex(db, mockFetch)).rejects.toThrow('Tier-1 fetch failed: 500');
  });
});
