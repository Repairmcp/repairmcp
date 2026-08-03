import { describe, test, expect } from 'bun:test';
import type { FetchLike } from '../src/tier2.js';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSchema, getRow, getDelistedIds, markDelisted } from '../src/db.js';
import type { ParsedBody } from '../src/db.js';
import {
  migrateSyncSchema,
  createRun,
  enqueueItems,
  getQueuedItems,
  countQueued,
  getRunSummary,
  getChangedFieldHistogram,
  getHighWater,
  getHighWaterInfo,
  setHighWater,
} from '../src/state.js';
import {
  planSync,
  materializePlan,
  runBatch,
  mergeParsedBody,
  isSuspectParse,
  isImplausibleMake,
  checkPlanSanity,
  DEFAULT_SANITY,
} from '../src/sync.js';
import type { SyncPlan } from '../src/sync.js';
import type { IndexEntry } from '../src/tier1.js';

const FIXTURES = join(import.meta.dir, 'fixtures');
const RESOLVED_HTML = readFileSync(join(FIXTURES, 'inquiry-resolved.html'), 'utf-8');

/** Exactly what parseDetailHtml yields for inquiry-resolved.html. */
const RESOLVED_ROW = {
  inquiry_type: 'Refinish Operations',
  area_of_vehicle: 'Hood',
  oem_part_number: '90189A0002 and 7539535070',
  issue_summary: 'Is blend time included for two-tone refinish?',
  suggested_action: 'Include blend time per P-pages.',
  resolution: 'CCC confirmed blend time is included per P-pages.',
  resolution_status: 'resolved',
  year: 2022,
  make: 'Toyota',
  model: 'Camry',
  body: 'Sedan',
  submitted_datetime: '2023-01-15 10:30:00',
};

function makeDb(): Database {
  const db = new Database(':memory:');
  createSchema(db);
  migrateSyncSchema(db);
  return db;
}

/**
 * Relative rather than a pinned literal: the resolved-blank cohort is bounded to
 * a rolling 365 days, so a hardcoded date would silently age out of the window
 * and flip these assertions a year from now.
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function insertRow(db: Database, dbId: number, overrides: Record<string, unknown> = {}): void {
  const row: Record<string, unknown> = {
    db_id: dbId,
    database: 'CCC',
    status: 'Resolved (IP Change)',
    resolution_date: '2023-01-17',
    submission_date: '2023-01-15',
    source_url: `https://degweb.org/inquiries/${dbId}/`,
    last_seen_at: '2026-06-26T00:00:00.000Z',
    body_fetched_at: '2026-06-26T00:00:00.000Z',
    content_hash: null,
    delisted_at: null,
    ...RESOLVED_ROW,
    ...overrides,
  };
  const cols = Object.keys(row);
  db.run(
    `INSERT INTO inquiry (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map((c) => row[c] as string | number | null),
  );
}

function entry(dbId: number, overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    db_id: String(dbId),
    post_id: String(dbId + 50000),
    database: 'CCC',
    InquiryType: 'Refinish Operations',
    VehicleData: '2022 Toyota Camry',
    status: 'Resolved (IP Change)',
    SubmissionDate: '2023-01-15',
    ResolutionDate: '2023-01-17',
    ResolveTime: '2',
    more: null,
    ...overrides,
  };
}

function okFetch(html: string): FetchLike {
  return async (url: string | URL | Request) =>
    ({
      ok: true,
      status: 200,
      url: String(url),
      text: async () => html,
    }) as unknown as Response;
}

const FAST = { initialBackoffMs: 1, maxRetries: 1 };

describe('planSync — cohort selection', () => {
  test('flags ids in the live index that we do not hold as NEW', () => {
    const db = makeDb();
    insertRow(db, 41480);
    const plan = planSync(db, [entry(41480), entry(41745)], { refreshWindow: 0 });
    expect(plan.newIds).toEqual([41745]);
  });

  test('catches a gap below the high-water mark, not just ids above it', () => {
    const db = makeDb();
    insertRow(db, 40071);
    insertRow(db, 41481);
    setHighWater(db, 41481);
    // 40072 exists upstream but was never ingested — the real gap found on the wire.
    const plan = planSync(db, [entry(40071), entry(40072), entry(41481)], { refreshWindow: 0 });
    expect(plan.newIds).toEqual([40072]);
  });

  test('flags a held row whose live status moved', () => {
    const db = makeDb();
    insertRow(db, 41477, { status: 'Submitted to IP', resolution_date: '' });
    const plan = planSync(db, [entry(41477)], { refreshWindow: 0 });
    expect(plan.indexChangedIds).toEqual([41477]);
  });

  test('flags a held row whose live ResolutionDate moved', () => {
    const db = makeDb();
    insertRow(db, 41477, { resolution_date: '2023-01-17' });
    const plan = planSync(db, [entry(41477, { ResolutionDate: '2023-02-01' })], {
      refreshWindow: 0,
    });
    expect(plan.indexChangedIds).toEqual([41477]);
  });

  test('does not flag an unchanged row', () => {
    const db = makeDb();
    insertRow(db, 41477);
    const plan = planSync(db, [entry(41477)], { refreshWindow: 0 });
    expect(plan.indexChangedIds).toEqual([]);
    expect(plan.queue).toEqual([]);
  });

  test('index-diff catches a change far outside any trailing window', () => {
    const db = makeDb();
    // 36927 really did change while sitting ~4,500 ids behind the high-water mark.
    insertRow(db, 36927, { status: 'Submitted to IP' });
    for (let id = 41470; id <= 41481; id++) insertRow(db, id);
    const plan = planSync(db, [entry(36927), ...Array.from({ length: 12 }, (_, i) => entry(41470 + i))], {
      refreshWindow: 5,
    });
    expect(plan.indexChangedIds).toContain(36927);
    expect(plan.trailingIds).not.toContain(36927);
    expect(plan.queue.map((q) => q.dbId)).toContain(36927);
  });

  test('unresolved rows join the refresh cohort', () => {
    const db = makeDb();
    insertRow(db, 41477, { status: 'Submitted to IP', resolution_status: 'pending', resolution_date: '' });
    const plan = planSync(db, [entry(41477, { status: 'Submitted to IP', ResolutionDate: '' })], {
      refreshWindow: 0,
    });
    expect(plan.indexChangedIds).toEqual([]);
    expect(plan.unresolvedIds).toEqual([41477]);
    expect(plan.queue).toEqual([{ dbId: 41477, pass: 'refresh' }]);
  });

  test('a recently Resolved row with no resolution text stays on the refresh list', () => {
    const db = makeDb();
    // 41487 on the wire: index says Resolved (DEG Response), page is blank.
    insertRow(db, 41487, {
      status: 'Resolved (DEG Response)',
      resolution_date: daysAgo(30),
      resolution: 'Awaiting resolution',
      resolution_status: 'pending',
    });
    const plan = planSync(
      db,
      [entry(41487, { status: 'Resolved (DEG Response)', ResolutionDate: daysAgo(30) })],
      { refreshWindow: 0 },
    );
    expect(plan.resolvedBlankIds).toEqual([41487]);
    expect(plan.queue).toEqual([{ dbId: 41487, pass: 'refresh' }]);
  });

  test('the cohort is self-clearing once real resolution text lands', () => {
    const db = makeDb();
    insertRow(db, 41487, {
      status: 'Resolved (DEG Response)',
      resolution_date: daysAgo(30),
      resolution: 'CCC added 0.4 to the blend allowance.',
    });
    const plan = planSync(
      db,
      [entry(41487, { status: 'Resolved (DEG Response)', ResolutionDate: daysAgo(30) })],
      { refreshWindow: 0 },
    );
    expect(plan.resolvedBlankIds).toEqual([]);
    expect(plan.queue).toEqual([]);
  });

  test('a long-settled blank resolution falls outside the recency window', () => {
    const db = makeDb();
    // db_id 924, resolved 2008-12-01, blank ever since. Never going to change.
    insertRow(db, 924, {
      status: 'Resolved (IP Change)',
      resolution_date: '2008-12-01',
      resolution: 'Awaiting resolution',
    });
    const plan = planSync(db, [entry(924, { ResolutionDate: '2008-12-01' })], {
      refreshWindow: 0,
    });
    expect(plan.resolvedBlankIds).toEqual([]);
  });

  test('a blank resolution with no date at all is kept regardless of the window', () => {
    const db = makeDb();
    // db_id 36927: resolved, no resolution_date, no resolution text.
    insertRow(db, 36927, {
      status: 'Resolved (IP Change)',
      resolution_date: '',
      resolution: 'Awaiting resolution',
    });
    const plan = planSync(db, [entry(36927, { ResolutionDate: '' })], { refreshWindow: 0 });
    expect(plan.resolvedBlankIds).toEqual([36927]);
  });

  test('a genuinely pending row is not in the resolved-blank cohort', () => {
    const db = makeDb();
    insertRow(db, 41513, {
      status: 'Submitted to IP',
      resolution: 'Awaiting resolution',
      resolution_status: 'pending',
    });
    const plan = planSync(db, [entry(41513, { status: 'Submitted to IP' })], {
      refreshWindow: 0,
    });
    expect(plan.resolvedBlankIds).toEqual([]);
  });

  test('trailing window takes the newest n held ids', () => {
    const db = makeDb();
    for (let id = 100; id < 110; id++) insertRow(db, id);
    const plan = planSync(db, Array.from({ length: 10 }, (_, i) => entry(100 + i)), {
      refreshWindow: 3,
    });
    expect(plan.trailingIds).toEqual([107, 108, 109]);
  });

  test('indexDiffOnly drops the trailing and unresolved cohorts', () => {
    const db = makeDb();
    insertRow(db, 41477, { status: 'Submitted to IP', resolution_status: 'pending' });
    const plan = planSync(db, [entry(41477, { status: 'Submitted to IP' })], {
      refreshWindow: 1000,
      indexDiffOnly: true,
    });
    expect(plan.trailingIds).toEqual([]);
    expect(plan.unresolvedIds).toEqual([]);
  });

  test('an id is never queued twice, and NEW wins over refresh', () => {
    const db = makeDb();
    for (let id = 100; id < 105; id++) insertRow(db, id);
    const entries = [...Array.from({ length: 5 }, (_, i) => entry(100 + i)), entry(200)];
    const plan = planSync(db, entries, { refreshWindow: 100 });
    const ids = plan.queue.map((q) => q.dbId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.queue.filter((q) => q.pass === 'new')).toEqual([{ dbId: 200, pass: 'new' }]);
  });

  test('a suspected-dead row is always re-queued so the verdict resolves', () => {
    const db = makeDb();
    insertRow(db, 41179, { dead_suspected_at: '2026-08-02T00:00:00.000Z' });
    const plan = planSync(db, [entry(41179)], { refreshWindow: 0, indexDiffOnly: true });
    expect(plan.suspectedDeadIds).toEqual([41179]);
    expect(plan.queue).toEqual([{ dbId: 41179, pass: 'refresh' }]);
  });

  test('a confirmed-dead row is never fetched again', () => {
    const db = makeDb();
    insertRow(db, 41179, {
      dead_suspected_at: '2026-08-02T00:00:00.000Z',
      dead_at: '2026-08-03T00:00:00.000Z',
    });
    const plan = planSync(db, [entry(41179)], { refreshWindow: 1000 });
    expect(plan.queue).toEqual([]);
  });

  test('detects a row that disappeared upstream', () => {
    const db = makeDb();
    insertRow(db, 38906);
    insertRow(db, 41477);
    const plan = planSync(db, [entry(41477)], { refreshWindow: 0 });
    expect(plan.delistedIds).toEqual([38906]);
  });

  test('delisted rows are never queued for fetching', () => {
    const db = makeDb();
    insertRow(db, 38906);
    const plan = planSync(db, [], { refreshWindow: 1000 });
    expect(plan.queue).toEqual([]);
  });

  test('detects a previously delisted row that came back', () => {
    const db = makeDb();
    insertRow(db, 38906);
    markDelisted(db, [38906], '2026-08-01T00:00:00.000Z');
    const plan = planSync(db, [entry(38906)], { refreshWindow: 0 });
    expect(plan.reappearedIds).toEqual([38906]);
    expect(plan.delistedIds).toEqual([]);
  });

  test('reports the live index max and count', () => {
    const db = makeDb();
    const plan = planSync(db, [entry(7), entry(41745)], { refreshWindow: 0 });
    expect(plan.indexMaxDbId).toBe(41745);
    expect(plan.indexCount).toBe(2);
  });
});

describe('checkPlanSanity', () => {
  function planWith(indexCount: number, delisted: number[]): SyncPlan {
    return {
      newIds: [],
      indexChangedIds: [],
      unresolvedIds: [],
      resolvedBlankIds: [],
      suspectedDeadIds: [],
      trailingIds: [],
      delistedIds: delisted,
      reappearedIds: [],
      queue: [],
      indexCount,
      indexMaxDbId: 41745,
      highWaterBefore: 0,
    };
  }

  test('passes on a complete index', () => {
    expect(checkPlanSanity(22661, planWith(22661, [38906])).ok).toBe(true);
  });

  test('rejects the exact 2026-08-02 collapse: 200 rows against 22,661 held', () => {
    const result = checkPlanSanity(22661, planWith(200, Array.from({ length: 22461 }, (_, i) => i)));
    expect(result.ok).toBe(false);
    // Both tripwires should fire on this one.
    expect(result.failures.length).toBe(2);
    expect(result.failures[0]).toContain('200');
    expect(result.failures[0]).toContain('22661');
  });

  test('rejects an index just under the 90% floor', () => {
    expect(checkPlanSanity(1000, planWith(899, [])).ok).toBe(false);
    expect(checkPlanSanity(1000, planWith(900, [])).ok).toBe(true);
  });

  test('rejects a mass delisting even when the index size looks fine', () => {
    // 100% index coverage, but 51 delistings — the subtler partial response.
    const result = checkPlanSanity(1000, planWith(1000, Array.from({ length: 51 }, (_, i) => i)));
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('51');
  });

  test('allows a delisting run right at the cap', () => {
    expect(
      checkPlanSanity(1000, planWith(1000, Array.from({ length: 50 }, (_, i) => i))).ok,
    ).toBe(true);
  });

  test('does not divide by zero on an empty corpus', () => {
    expect(checkPlanSanity(0, planWith(0, [])).ok).toBe(true);
  });

  test('thresholds are overridable for testing without weakening the default', () => {
    expect(DEFAULT_SANITY).toEqual({ minIndexRatio: 0.9, maxDelistPerRun: 50 });
    expect(
      checkPlanSanity(1000, planWith(500, []), { minIndexRatio: 0.4, maxDelistPerRun: 50 }).ok,
    ).toBe(true);
  });
});

describe('mergeParsedBody', () => {
  const parsed: ParsedBody = {
    inquiryType: null,
    areaOfVehicle: 'Hood',
    oemPartNumber: null,
    issueSummary: null,
    suggestedAction: 'Include blend time.',
    resolution: 'CCC confirmed.',
    resolutionStatus: 'resolved',
    year: null,
    make: 'TOYOTA',
    model: null,
    vehicleBody: null,
    submittedDatetime: null,
  };

  test('fills nulls from the stored row', () => {
    const merged = mergeParsedBody(
      { inquiry_type: 'Refinish Operations', issue_summary: 'stored summary', year: 2022 },
      parsed,
    );
    expect(merged.inquiryType).toBe('Refinish Operations');
    expect(merged.issueSummary).toBe('stored summary');
    expect(merged.year).toBe(2022);
  });

  test('the page wins wherever it has a value — an upstream correction is adopted', () => {
    const merged = mergeParsedBody({ make: 'Toyota', area_of_vehicle: 'Fender' }, parsed);
    expect(merged.make).toBe('TOYOTA');
    expect(merged.areaOfVehicle).toBe('Hood');
  });

  test('passes the parse through untouched when there is no stored row', () => {
    expect(mergeParsedBody(null, parsed)).toEqual(parsed);
  });
});

describe('isImplausibleMake', () => {
  test('rejects the whole vehicle string leaking into the Make cell', () => {
    // db_id 37429 on the wire, typos and all.
    expect(isImplausibleMake('2020 Rang Rover Ecoque P250')).toBe(true);
  });

  test('rejects placeholder tokens', () => {
    for (const v of ['NA', 'n/a', 'Other', 'other', 'Unknown', 'none', '', '   ']) {
      expect(isImplausibleMake(v)).toBe(true);
    }
  });

  test('rejects an over-long value', () => {
    expect(isImplausibleMake('A'.repeat(21))).toBe(true);
  });

  test('accepts genuine makes, including the long multi-word ones', () => {
    for (const v of ['Toyota', 'FORD', 'Land Rover', 'Mercedes Benz', 'Aston Martin']) {
      expect(isImplausibleMake(v)).toBe(false);
    }
  });
});

describe('mergeParsedBody — make guard', () => {
  const base: ParsedBody = {
    inquiryType: null,
    areaOfVehicle: null,
    oemPartNumber: null,
    issueSummary: null,
    suggestedAction: null,
    resolution: 'x',
    resolutionStatus: 'resolved',
    year: null,
    make: null,
    model: null,
    vehicleBody: null,
    submittedDatetime: null,
  };

  test('keeps the stored make when the page value is junk', () => {
    const merged = mergeParsedBody(
      { make: 'Other' },
      { ...base, make: '2020 Rang Rover Ecoque P250' },
    );
    expect(merged.make).toBe('Other');
  });

  test('keeps the stored make rather than downgrading to a placeholder', () => {
    expect(mergeParsedBody({ make: 'Other' }, { ...base, make: 'NA' }).make).toBe('Other');
    expect(mergeParsedBody({ make: 'Other' }, { ...base, make: 'other' }).make).toBe('Other');
  });

  test('still adopts a legitimate page correction', () => {
    // The 33 Land Rover rows the live refresh fixed must keep working.
    expect(mergeParsedBody({ make: 'Land' }, { ...base, make: 'Land Rover' }).make).toBe(
      'Land Rover',
    );
  });
});

describe('isSuspectParse', () => {
  const empty: ParsedBody = {
    inquiryType: null,
    areaOfVehicle: null,
    oemPartNumber: null,
    issueSummary: null,
    suggestedAction: null,
    resolution: 'Awaiting resolution',
    resolutionStatus: 'pending',
    year: null,
    make: null,
    model: null,
    vehicleBody: null,
    submittedDatetime: null,
  };

  test('an empty parse against a populated row is suspect', () => {
    expect(isSuspectParse({ issue_summary: 'real content' }, empty)).toBe(true);
  });

  test('an empty parse against an empty row is not suspect', () => {
    expect(isSuspectParse({ issue_summary: null }, empty)).toBe(false);
  });

  test('a genuinely pending new inquiry is not suspect', () => {
    expect(isSuspectParse(null, empty)).toBe(false);
  });

  test('a parse with any content is not suspect', () => {
    expect(isSuspectParse({ issue_summary: 'real' }, { ...empty, issueSummary: 'new' })).toBe(false);
  });
});

describe('runBatch', () => {
  function seedRun(db: Database, ids: Array<{ dbId: number; pass: 'new' | 'refresh' }>): number {
    const runId = createRun(db, {
      mode: 'catchup',
      refreshWindow: 0,
      indexMaxDbId: 41745,
      indexCount: 1,
    });
    enqueueItems(db, runId, ids);
    return runId;
  }

  test('identical content is recorded unchanged and seeds the hash — no false positives on first run', async () => {
    const db = makeDb();
    insertRow(db, 41477);
    const runId = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(RESOLVED_HTML), ...FAST },
    });

    expect(result.unchanged).toBe(1);
    expect(result.written).toBe(0);
    expect(getRow(db, 41477)?.['content_hash']).toBeTruthy();
  });

  test('a resolution edit is written and the changed field is named', async () => {
    const db = makeDb();
    insertRow(db, 41477, { resolution: 'Awaiting resolution', resolution_status: 'pending' });
    const runId = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(RESOLVED_HTML), ...FAST },
    });

    expect(result.written).toBe(1);
    const row = getRow(db, 41477);
    expect(row?.['resolution']).toBe('CCC confirmed blend time is included per P-pages.');

    const histogram = getChangedFieldHistogram(db, runId);
    const fields = histogram.map(([f]) => f);
    expect(fields).toContain('resolution');
    // The refresh must NOT touch resolution_status — tier-1 owns it, derived
    // from the index status. Writing a page-derived value here is what made
    // the column oscillate on every run.
    expect(fields).not.toContain('resolution_status');
    expect(row?.['resolution_status']).toBe('pending');
  });

  test('a blank Resolution page no longer reports a phantom resolution_status change', async () => {
    const db = makeDb();
    // The 83-row shape: index says Resolved, page Resolution cell is empty,
    // tier-1 has already set resolution_status='resolved'.
    insertRow(db, 41487, {
      status: 'Resolved (DEG Response)',
      resolution: 'Awaiting resolution',
      resolution_status: 'resolved',
      inquiry_type: null,
      area_of_vehicle: null,
      oem_part_number: null,
      issue_summary: null,
      suggested_action: null,
      year: null,
      make: null,
      model: null,
      body: null,
      submitted_datetime: null,
    });
    const runId = seedRun(db, [{ dbId: 41487, pass: 'refresh' }]);

    const blankPage = RESOLVED_HTML.replace(
      '<tr><td>Resolution</td><td>CCC confirmed blend time is included per P-pages.</td></tr>',
      '<tr><td>Resolution</td><td></td></tr>',
    );

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(blankPage), ...FAST },
    });

    expect(getChangedFieldHistogram(db, runId).map(([f]) => f)).not.toContain('resolution_status');
    expect(getRow(db, 41487)?.['resolution_status']).toBe('resolved');
    expect(result.written + result.unchanged).toBe(1);
  });

  test('a second run over unchanged content short-circuits on the stored hash', async () => {
    const db = makeDb();
    insertRow(db, 41477);
    const first = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);
    await runBatch(db, first, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(RESOLVED_HTML), ...FAST },
    });

    const second = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);
    const result = await runBatch(db, second, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(RESOLVED_HTML), ...FAST },
    });
    expect(result.unchanged).toBe(1);
    expect(result.written).toBe(0);
  });

  test('a transient failure leaves the item queued for the next run', async () => {
    const db = makeDb();
    insertRow(db, 41477);
    const runId = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);

    const fetch503: FetchLike = (async (url: string | URL | Request) =>
      ({ ok: false, status: 503, url: String(url) }) as unknown as Response);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: fetch503, ...FAST },
    });

    expect(result.transient).toBe(1);
    expect(countQueued(db, runId)).toBe(1);
  });

  test('a first 404 only suspects — the record keeps being served', async () => {
    const db = makeDb();
    insertRow(db, 41179);
    const runId = seedRun(db, [{ dbId: 41179, pass: 'refresh' }]);

    const gone: FetchLike = (async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/deg-database/',
        text: async () => '<html></html>',
      }) as unknown as Response);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: gone, ...FAST },
    });

    expect(result.suspectedDead).toEqual([41179]);
    expect(result.confirmedDead).toEqual([]);
    expect(getRow(db, 41179)?.['dead_suspected_at']).toBeTruthy();
    // Still servable — one sighting is not proof.
    expect(getRow(db, 41179)?.['dead_at']).toBeNull();
  });

  test('a second 404 on a later pass confirms the record dead', async () => {
    const db = makeDb();
    insertRow(db, 41179);
    const gone: FetchLike = (async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/deg-database/',
        text: async () => '<html></html>',
      }) as unknown as Response);

    const first = seedRun(db, [{ dbId: 41179, pass: 'refresh' }]);
    await runBatch(db, first, { limit: 10, rateDelayMs: 0, fetchOpts: { fetchImpl: gone, ...FAST } });

    const second = seedRun(db, [{ dbId: 41179, pass: 'refresh' }]);
    const result = await runBatch(db, second, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: gone, ...FAST },
    });

    expect(result.confirmedDead).toEqual([41179]);
    expect(getRow(db, 41179)?.['dead_at']).toBeTruthy();
  });

  test('a page that comes back clears the suspicion — no eviction on a blip', async () => {
    const db = makeDb();
    insertRow(db, 41179);
    const gone: FetchLike = (async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/deg-database/',
        text: async () => '<html></html>',
      }) as unknown as Response);

    const first = seedRun(db, [{ dbId: 41179, pass: 'refresh' }]);
    await runBatch(db, first, { limit: 10, rateDelayMs: 0, fetchOpts: { fetchImpl: gone, ...FAST } });
    expect(getRow(db, 41179)?.['dead_suspected_at']).toBeTruthy();

    const second = seedRun(db, [{ dbId: 41179, pass: 'refresh' }]);
    await runBatch(db, second, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(RESOLVED_HTML), ...FAST },
    });

    expect(getRow(db, 41179)?.['dead_suspected_at']).toBeNull();
    expect(getRow(db, 41179)?.['dead_at']).toBeNull();
  });

  test('a parse error is never mistaken for a gone page', async () => {
    const db = makeDb();
    insertRow(db, 41179);
    const runId = seedRun(db, [{ dbId: 41179, pass: 'refresh' }]);

    // 200 on the right URL, but unparseable — the page exists.
    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch('<html><body><form></form></body></html>'), ...FAST },
    });

    expect(result.suspectedDead).toEqual([]);
    expect(getRow(db, 41179)?.['dead_suspected_at']).toBeNull();
  });

  test('a definitive 404 is skipped and never retried', async () => {
    const db = makeDb();
    insertRow(db, 41477);
    const runId = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);

    const fetch404: FetchLike = (async () =>
      ({ ok: false, status: 404 }) as unknown as Response);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: fetch404, ...FAST },
    });

    expect(result.skipped).toBe(1);
    expect(countQueued(db, runId)).toBe(0);
  });

  test('a soft-404 redirect is skipped, not written', async () => {
    const db = makeDb();
    insertRow(db, 41482);
    const runId = seedRun(db, [{ dbId: 41482, pass: 'refresh' }]);

    const softFetch: FetchLike = (async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/deg-database/',
        text: async () => '<html></html>',
      }) as unknown as Response);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: softFetch, ...FAST },
    });

    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
  });

  test('a page that parses to nothing does not erase a populated row', async () => {
    const db = makeDb();
    insertRow(db, 41477);
    const runId = seedRun(db, [{ dbId: 41477, pass: 'refresh' }]);

    const result = await runBatch(db, runId, {
      limit: 10,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch('<html><body><form></form></body></html>'), ...FAST },
    });

    expect(result.suspect).toEqual([41477]);
    expect(result.written).toBe(0);
    expect(getRow(db, 41477)?.['issue_summary']).toBe(
      'Is blend time included for two-tone refinish?',
    );
  });

  test('the circuit breaker trips after 10 consecutive transient failures', async () => {
    const db = makeDb();
    const ids: Array<{ dbId: number; pass: 'refresh' }> = [];
    for (let i = 0; i < 15; i++) {
      insertRow(db, 41400 + i);
      ids.push({ dbId: 41400 + i, pass: 'refresh' });
    }
    const runId = seedRun(db, ids);

    const fetch500: FetchLike = (async (url: string | URL | Request) =>
      ({ ok: false, status: 500, url: String(url) }) as unknown as Response);

    const result = await runBatch(db, runId, {
      limit: 15,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: fetch500, ...FAST },
    });

    expect(result.breakerTripped).toBe(true);
    expect(result.processed).toBe(10);
    expect(countQueued(db, runId)).toBe(15);
  });

  test('a success resets the consecutive-failure counter', async () => {
    const db = makeDb();
    for (let i = 0; i < 15; i++) insertRow(db, 41400 + i);
    const runId = seedRun(
      db,
      Array.from({ length: 15 }, (_, i) => ({ dbId: 41400 + i, pass: 'refresh' as const })),
    );

    let call = 0;
    const flaky: FetchLike = (async (url: string | URL | Request) => {
      call++;
      // Fail 9, succeed once, fail 9 again — must not trip.
      if (call === 10) {
        return { ok: true, status: 200, url: String(url), text: async () => RESOLVED_HTML } as unknown as Response;
      }
      return { ok: false, status: 500, url: String(url) } as unknown as Response;
    });

    const result = await runBatch(db, runId, {
      limit: 15,
      rateDelayMs: 0,
      circuitBreakerThreshold: 10,
      fetchOpts: { fetchImpl: flaky, maxRetries: 0, initialBackoffMs: 1 },
    });

    expect(result.breakerTripped).toBe(false);
    expect(result.processed).toBe(15);
  });

  test('honours the batch limit and leaves the rest queued', async () => {
    const db = makeDb();
    for (let i = 0; i < 10; i++) insertRow(db, 41400 + i);
    const runId = seedRun(
      db,
      Array.from({ length: 10 }, (_, i) => ({ dbId: 41400 + i, pass: 'refresh' as const })),
    );

    const result = await runBatch(db, runId, {
      limit: 4,
      rateDelayMs: 0,
      fetchOpts: { fetchImpl: okFetch(RESOLVED_HTML), ...FAST },
    });

    expect(result.processed).toBe(4);
    expect(countQueued(db, runId)).toBe(6);
  });

  test('resume drains only what is still queued and re-fetches nothing', async () => {
    const db = makeDb();
    for (let i = 0; i < 10; i++) insertRow(db, 41400 + i);
    const runId = seedRun(
      db,
      Array.from({ length: 10 }, (_, i) => ({ dbId: 41400 + i, pass: 'refresh' as const })),
    );

    let fetches = 0;
    const counting: FetchLike = (async (url: string | URL | Request) => {
      fetches++;
      return { ok: true, status: 200, url: String(url), text: async () => RESOLVED_HTML } as unknown as Response;
    });

    await runBatch(db, runId, { limit: 4, rateDelayMs: 0, fetchOpts: { fetchImpl: counting, ...FAST } });
    expect(fetches).toBe(4);

    await runBatch(db, runId, { limit: 100, rateDelayMs: 0, fetchOpts: { fetchImpl: counting, ...FAST } });
    expect(fetches).toBe(10);

    expect(countQueued(db, runId)).toBe(0);
    expect(getRunSummary(db, runId).total).toBe(10);
  });
});

describe('queue ordering and state plumbing', () => {
  test('the NEW pass drains before the refresh pass', () => {
    const db = makeDb();
    const runId = createRun(db, { mode: 'catchup', refreshWindow: 0, indexMaxDbId: 1, indexCount: 1 });
    enqueueItems(db, runId, [
      { dbId: 100, pass: 'refresh' },
      { dbId: 41745, pass: 'new' },
      { dbId: 101, pass: 'refresh' },
      { dbId: 41746, pass: 'new' },
    ]);
    expect(getQueuedItems(db, runId).map((i) => i.dbId)).toEqual([41745, 41746, 100, 101]);
  });

  test('enqueue is idempotent — materializing twice does not duplicate work', () => {
    const db = makeDb();
    const runId = createRun(db, { mode: 'catchup', refreshWindow: 0, indexMaxDbId: 1, indexCount: 1 });
    const plan = planSync(db, [], { refreshWindow: 0 });
    plan.queue.push({ dbId: 41745, pass: 'new' });
    materializePlan(db, runId, plan);
    materializePlan(db, runId, plan);
    expect(countQueued(db, runId)).toBe(1);
  });

  test('high-water falls back to the corpus max before any run is recorded', () => {
    const db = makeDb();
    insertRow(db, 41481);
    expect(getHighWater(db)).toBe(41481);
    setHighWater(db, 41745);
    expect(getHighWater(db)).toBe(41745);
  });

  test('the fallback is labelled so it cannot be read as a recorded mark', () => {
    const db = makeDb();
    insertRow(db, 41481);
    expect(getHighWaterInfo(db)).toEqual({ value: 41481, source: 'corpus-max' });

    // The trap: ingesting new rows moves MAX(db_id), so the unrecorded mark
    // appears to advance on its own. Exactly what happened during run 1.
    insertRow(db, 41745);
    expect(getHighWaterInfo(db)).toEqual({ value: 41745, source: 'corpus-max' });

    setHighWater(db, 41745);
    expect(getHighWaterInfo(db)).toEqual({ value: 41745, source: 'stored' });
  });

  test('migrateSyncSchema is idempotent on an existing corpus', () => {
    const db = makeDb();
    insertRow(db, 41477);
    migrateSyncSchema(db);
    migrateSyncSchema(db);
    expect(getRow(db, 41477)?.['db_id']).toBe(41477);
    expect(getDelistedIds(db)).toEqual([]);
  });
});
