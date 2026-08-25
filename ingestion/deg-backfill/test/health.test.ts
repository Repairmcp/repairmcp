import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSchema, upsertMetadata } from '../src/db.js';
import type { MetadataRow } from '../src/db.js';
import { setState, setHighWater, STATE_LAST_INDEX_SYNC, migrateSyncSchema } from '../src/state.js';
import {
  buildHealthReport,
  formatHealthReport,
  appendHealthLogLine,
  writeAttentionFlag,
  clearAttentionFlag,
  attentionFlagPath,
  healthLogPath,
} from '../src/health.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deg-health-'));
});

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  } catch {
    /* best effort */
  }
});

const ROW: MetadataRow = {
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

describe('buildHealthReport', () => {
  test('reports corpus counts, last sync, high water, and no attention flag', () => {
    const db = new Database(':memory:');
    createSchema(db);
    migrateSyncSchema(db);
    upsertMetadata(db, [
      ROW,
      { ...ROW, dbId: 200, status: 'Submitted to IP', resolutionStatus: 'pending', resolutionDate: '' },
    ]);
    setState(db, STATE_LAST_INDEX_SYNC, '2026-08-02T18:56:30.285Z');
    setHighWater(db, 41745);

    const report = buildHealthReport(db, dir);
    expect(report.corpusTotal).toBe(2);
    expect(report.resolved).toBe(1);
    expect(report.pending).toBe(1);
    expect(report.lastSuccessfulSync).toBe('2026-08-02T18:56:30.285Z');
    expect(report.highWater).toEqual({ value: 41745, source: 'stored' });
    expect(report.attentionFlag).toBeNull();
  });

  test('reports null last sync when none has ever completed', () => {
    const db = new Database(':memory:');
    createSchema(db);
    migrateSyncSchema(db);
    const report = buildHealthReport(db, dir);
    expect(report.lastSuccessfulSync).toBeNull();
  });

  test('surfaces the attention flag contents when one exists', () => {
    const db = new Database(':memory:');
    createSchema(db);
    migrateSyncSchema(db);
    writeAttentionFlag(dir, 'Tier-1 unreachable: fetch failed');

    const report = buildHealthReport(db, dir);
    expect(report.attentionFlag).toContain('Tier-1 unreachable: fetch failed');
  });
});

describe('formatHealthReport', () => {
  test('renders a human-readable report with no attention flag', () => {
    const text = formatHealthReport({
      corpusTotal: 22662,
      resolved: 22548,
      pending: 114,
      lastSuccessfulSync: '2026-08-02T18:56:30.285Z',
      highWater: { value: 41745, source: 'stored' },
      attentionFlag: null,
    });
    expect(text).toContain('Corpus total');
    expect(text).toContain('22662');
    expect(text).toContain('FAIL flag');
    expect(text).toContain('none');
  });

  test('surfaces the flag reason in the rendered report', () => {
    const text = formatHealthReport({
      corpusTotal: 100,
      resolved: 90,
      pending: 10,
      lastSuccessfulSync: null,
      highWater: { value: 0, source: 'corpus-max' },
      attentionFlag: '2026-08-25T03:00:00.000Z\nTier-1 unreachable\n',
    });
    expect(text).toContain('ATTENTION NEEDED');
    expect(text).toContain('Tier-1 unreachable');
    expect(text).toContain('never recorded');
  });
});

describe('attention flag lifecycle', () => {
  test('writeAttentionFlag creates the file and clearAttentionFlag removes it', () => {
    writeAttentionFlag(dir, 'zero rows returned from the index');
    expect(existsSync(attentionFlagPath(dir))).toBe(true);
    expect(readFileSync(attentionFlagPath(dir), 'utf-8')).toContain('zero rows returned');

    clearAttentionFlag(dir);
    expect(existsSync(attentionFlagPath(dir))).toBe(false);
  });

  test('clearAttentionFlag is a no-op when no flag exists', () => {
    expect(() => clearAttentionFlag(dir)).not.toThrow();
  });

  test('writeAttentionFlag creates the log directory if missing', () => {
    const nested = join(dir, 'nested', 'logs');
    writeAttentionFlag(nested, 'boom');
    expect(existsSync(attentionFlagPath(nested))).toBe(true);
  });
});

describe('appendHealthLogLine', () => {
  test('creates the log directory and appends a CSV line', () => {
    const emptyDir = join(dir, 'nested', 'logs');
    appendHealthLogLine(emptyDir, { date: '2026-08-25', newCount: 3, corpusTotal: 22665, errors: 0, ok: true });
    const contents = readFileSync(healthLogPath(emptyDir), 'utf-8');
    expect(contents).toBe('2026-08-25,3,22665,0,OK\n');
  });

  test('appends rather than overwriting on a second call', () => {
    appendHealthLogLine(dir, { date: '2026-08-25', newCount: 1, corpusTotal: 100, errors: 0, ok: true });
    appendHealthLogLine(dir, { date: '2026-09-01', newCount: 0, corpusTotal: 100, errors: 5, ok: false });
    const lines = readFileSync(healthLogPath(dir), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-09-01,0,100,5,FAIL');
  });
});
