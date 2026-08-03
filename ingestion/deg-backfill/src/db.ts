import { Database } from 'bun:sqlite';

export interface MetadataRow {
  dbId: number;
  database: string;
  inquiryType: string;
  status: string;
  resolutionStatus: 'pending' | 'resolved';
  year: number | null;
  make: string | null;
  model: string | null;
  submissionDate: string;
  resolutionDate: string;
  sourceUrl: string;
  lastSeenAt: string;
}

export interface ParsedBody {
  inquiryType: string | null;
  areaOfVehicle: string | null;
  oemPartNumber: string | null;
  issueSummary: string | null;
  suggestedAction: string | null;
  resolution: string;
  resolutionStatus: 'pending' | 'resolved';
  year: number | null;
  make: string | null;
  model: string | null;
  vehicleBody: string | null;
  submittedDatetime: string | null;
}

export function openDb(path: string): Database {
  const db = new Database(path);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  return db;
}

export function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS inquiry (
      db_id             INTEGER PRIMARY KEY,
      database          TEXT,
      inquiry_type      TEXT,
      status            TEXT,
      resolution_status TEXT,
      year              INTEGER,
      make              TEXT,
      model             TEXT,
      body              TEXT,
      area_of_vehicle   TEXT,
      oem_part_number   TEXT,
      issue_summary     TEXT,
      suggested_action  TEXT,
      resolution        TEXT,
      submission_date   TEXT,
      resolution_date   TEXT,
      submitted_datetime TEXT,
      source_url        TEXT,
      body_fetched_at   TEXT,
      last_seen_at      TEXT,
      content_hash      TEXT,
      delisted_at       TEXT,
      dead_suspected_at TEXT,
      dead_at           TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inquiry_body_pending ON inquiry(body_fetched_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inquiry_resolution_status ON inquiry(resolution_status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inquiry_database ON inquiry(database)`);
}

export function upsertMetadata(db: Database, rows: MetadataRow[]): void {
  const upsertSql = `
    INSERT INTO inquiry
      (db_id, database, inquiry_type, status, resolution_status,
       year, make, model, submission_date, resolution_date, source_url, last_seen_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(db_id) DO UPDATE SET
      database          = excluded.database,
      inquiry_type      = excluded.inquiry_type,
      status            = excluded.status,
      resolution_status = excluded.resolution_status,
      submission_date   = excluded.submission_date,
      resolution_date   = excluded.resolution_date,
      source_url        = excluded.source_url,
      last_seen_at      = excluded.last_seen_at,
      year  = COALESCE(inquiry.year,  excluded.year),
      make  = COALESCE(inquiry.make,  excluded.make),
      model = COALESCE(inquiry.model, excluded.model),
      body_fetched_at   = CASE
        WHEN excluded.status       != inquiry.status
          OR excluded.resolution_date != inquiry.resolution_date
        THEN NULL
        ELSE inquiry.body_fetched_at
      END
  `;

  const stmt = db.prepare(upsertSql);
  const run = db.transaction(() => {
    for (const row of rows) {
      stmt.run(
        row.dbId,
        row.database,
        row.inquiryType,
        row.status,
        row.resolutionStatus,
        row.year,
        row.make,
        row.model,
        row.submissionDate,
        row.resolutionDate,
        row.sourceUrl,
        row.lastSeenAt,
      );
    }
  });
  run();
}

export function markBodyFetched(
  db: Database,
  dbId: number,
  body: ParsedBody | null,
): void {
  const now = new Date().toISOString();
  if (body === null) {
    db.run('UPDATE inquiry SET body_fetched_at = ? WHERE db_id = ?', [now, dbId]);
    return;
  }
  db.run(
    `UPDATE inquiry SET
      body_fetched_at  = ?,
      inquiry_type     = COALESCE(inquiry_type, ?),
      area_of_vehicle  = ?,
      oem_part_number  = ?,
      issue_summary    = ?,
      suggested_action = ?,
      resolution       = ?,
      resolution_status = ?,
      year  = COALESCE(year,  ?),
      make  = COALESCE(make,  ?),
      model = COALESCE(model, ?),
      body  = COALESCE(body,  ?),
      submitted_datetime = ?
    WHERE db_id = ?`,
    [
      now,
      body.inquiryType,
      body.areaOfVehicle,
      body.oemPartNumber,
      body.issueSummary,
      body.suggestedAction,
      body.resolution,
      body.resolutionStatus,
      body.year,
      body.make,
      body.model,
      body.vehicleBody,
      body.submittedDatetime,
      dbId,
    ],
  );
}

export function getPendingIds(db: Database, limit?: number): number[] {
  const sql =
    limit !== undefined
      ? 'SELECT db_id FROM inquiry WHERE body_fetched_at IS NULL ORDER BY db_id ASC LIMIT ?'
      : 'SELECT db_id FROM inquiry WHERE body_fetched_at IS NULL ORDER BY db_id ASC';
  const rows =
    limit !== undefined
      ? db.prepare(sql).all<{ db_id: number }>(limit) ?? []
      : db.prepare(sql).all<{ db_id: number }>() ?? [];
  return rows.map((r) => r.db_id);
}

export function getRow(db: Database, dbId: number): Record<string, unknown> | null {
  return (
    db
      .prepare('SELECT * FROM inquiry WHERE db_id = ?')
      .get<Record<string, unknown>>(dbId) ?? null
  );
}

/**
 * Refresh-mode write: straight overwrite, no COALESCE.
 *
 * markBodyFetched() coalesces because during backfill the index-derived
 * year/make/model were often better than the page. On a refresh that is
 * backwards — it would silently discard an upstream correction.
 *
 * The null-preservation that COALESCE used to provide now happens one level up,
 * in mergeParsedBody() (sync.ts), so that the value hashed is exactly the value
 * stored. Callers must pass an already-merged ParsedBody and must have rejected
 * degenerate parses via isSuspectParse().
 *
 * resolution_status is NOT written here. It belongs to tier-1, derived from the
 * index status; writing a page-derived value too made the column oscillate on
 * every run (see HASHED_FIELDS in hash.ts).
 */
export function writeRefreshedBody(
  db: Database,
  dbId: number,
  body: ParsedBody,
  contentHash: string,
): void {
  db.run(
    `UPDATE inquiry SET
      body_fetched_at   = ?,
      inquiry_type      = ?,
      area_of_vehicle   = ?,
      oem_part_number   = ?,
      issue_summary     = ?,
      suggested_action  = ?,
      resolution        = ?,
      year              = ?,
      make              = ?,
      model             = ?,
      body              = ?,
      submitted_datetime = ?,
      content_hash      = ?
    WHERE db_id = ?`,
    [
      new Date().toISOString(),
      body.inquiryType,
      body.areaOfVehicle,
      body.oemPartNumber,
      body.issueSummary,
      body.suggestedAction,
      body.resolution,
      body.year,
      body.make,
      body.model,
      body.vehicleBody,
      body.submittedDatetime,
      contentHash,
      dbId,
    ],
  );
}

/**
 * Content matched — record the hash so the next run can short-circuit, without
 * touching any content field.
 */
export function setContentHash(db: Database, dbId: number, contentHash: string): void {
  db.run('UPDATE inquiry SET content_hash = ? WHERE db_id = ?', [contentHash, dbId]);
}

export interface IndexComparable {
  status: string | null;
  resolutionDate: string | null;
}

/** Every held row's index-visible state, for diffing against the live index. */
export function getIndexComparableRows(db: Database): Map<number, IndexComparable> {
  const rows =
    db
      .prepare('SELECT db_id, status, resolution_date FROM inquiry')
      .all<{ db_id: number; status: string | null; resolution_date: string | null }>() ?? [];
  const out = new Map<number, IndexComparable>();
  for (const row of rows) {
    out.set(row.db_id, { status: row.status, resolutionDate: row.resolution_date });
  }
  return out;
}

/**
 * Inquiries we hold as unresolved. Highest-yield refresh cohort: a pending
 * inquiry that has since resolved is exactly the update a shop needs.
 */
export function getUnresolvedIds(db: Database): number[] {
  const rows =
    db
      .prepare(
        `SELECT db_id FROM inquiry
         WHERE delisted_at IS NULL AND dead_at IS NULL
           AND (resolution_status = 'pending' OR status = 'Submitted to IP')
         ORDER BY db_id ASC`,
      )
      .all<{ db_id: number }>() ?? [];
  return rows.map((r) => r.db_id);
}

/** How far back a blank resolution is still considered worth re-checking. */
export const RESOLVED_BLANK_WINDOW_DAYS = 365;

function defaultResolvedBlankCutoff(): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RESOLVED_BLANK_WINDOW_DAYS);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Inquiries DEG's index calls Resolved but whose detail page carries no
 * resolution text — the parser stores the 'Awaiting resolution' placeholder.
 *
 * Serving these would assert a resolved inquiry with nothing to show for it, so
 * they stay on the refresh list until real text lands, and drop out the moment
 * it does.
 *
 * Measured on the wire 2026-08-02: 83 corpus-wide (47 "Resolved (DEG Response)",
 * 22 "IP Change", 14 "No IP Change") — sporadic data entry, not a workflow rule,
 * since only 1.7% of DEG Response inquiries are blank. But 31 of the 83 were
 * resolved before 2024 and are never going to gain text, so the cohort is
 * bounded by recency; without that it would re-fetch settled 2008 records on
 * every run forever and never drain.
 *
 * Rows with no resolution_date at all are kept regardless of the window —
 * resolved with neither a date nor resolution text is the case most worth
 * re-checking, and there is exactly one (36927).
 */
export function getResolvedWithoutResolutionIds(db: Database, cutoffDate?: string): number[] {
  const cutoff = cutoffDate ?? defaultResolvedBlankCutoff();
  const rows =
    db
      .prepare(
        `SELECT db_id FROM inquiry
         WHERE delisted_at IS NULL AND dead_at IS NULL
           AND status LIKE 'Resolved%'
           AND (resolution IS NULL OR resolution = '' OR resolution = 'Awaiting resolution')
           AND (resolution_date IS NULL OR resolution_date = '' OR resolution_date >= ?)
         ORDER BY db_id ASC`,
      )
      .all<{ db_id: number }>(cutoff) ?? [];
  return rows.map((r) => r.db_id);
}

/** The trailing re-verify window: the newest `n` held db_ids. */
export function getTrailingIds(db: Database, n: number): number[] {
  if (n <= 0) return [];
  const rows =
    db
      .prepare(
        `SELECT db_id FROM inquiry
         WHERE delisted_at IS NULL AND dead_at IS NULL
         ORDER BY db_id DESC LIMIT ?`,
      )
      .all<{ db_id: number }>(n) ?? [];
  return rows.map((r) => r.db_id).sort((a, b) => a - b);
}

export function getAllDbIds(db: Database): Set<number> {
  const rows = db.prepare('SELECT db_id FROM inquiry').all<{ db_id: number }>() ?? [];
  return new Set(rows.map((r) => r.db_id));
}

/**
 * Stamp rows that have disappeared from the live index. The row is kept for
 * audit; scripts/transform-deg-sqlite.ts filters it out of the served JSON.
 */
export function markDelisted(db: Database, dbIds: number[], at: string): void {
  if (dbIds.length === 0) return;
  const stmt = db.prepare(
    'UPDATE inquiry SET delisted_at = ? WHERE db_id = ? AND delisted_at IS NULL',
  );
  const run = db.transaction(() => {
    for (const dbId of dbIds) stmt.run(at, dbId);
  });
  run();
}

/** A previously delisted inquiry reappeared upstream — un-stamp it. */
export function clearDelisted(db: Database, dbIds: number[]): void {
  if (dbIds.length === 0) return;
  const stmt = db.prepare('UPDATE inquiry SET delisted_at = NULL WHERE db_id = ?');
  const run = db.transaction(() => {
    for (const dbId of dbIds) stmt.run(dbId);
  });
  run();
}

export interface MakeRepairResult {
  repaired: number;
  byMake: Array<[string, number]>;
}

/**
 * Un-split makes that the index's whitespace parse truncated.
 *
 * Pure reversal of a known parse bug: it only moves the first token of `model`
 * back onto `make` when the two together spell a known multi-word make, so it
 * introduces no information that was not already in the row. Stored casing is
 * preserved ('LAND' + 'Rover' -> 'LAND Rover') rather than normalized to the
 * canonical form — the corpus already carries Ford/FORD/ford and normalization
 * belongs at query time, not here.
 *
 * Idempotent: once a row reads 'Land Rover' its model no longer starts with
 * 'Rover', so it stops matching.
 */
export function repairTruncatedMakes(db: Database, makes: readonly string[]): MakeRepairResult {
  const byMake: Array<[string, number]> = [];
  let repaired = 0;

  const run = db.transaction(() => {
    for (const full of makes) {
      const space = full.indexOf(' ');
      if (space === -1) continue;
      const first = full.slice(0, space);
      const rest = full.slice(space + 1);

      const rows =
        db
          .prepare(
            `SELECT db_id, make, model FROM inquiry
             WHERE LOWER(make) = LOWER(?)
               AND (LOWER(model) = LOWER(?) OR LOWER(model) LIKE LOWER(?) || ' %')`,
          )
          .all<{ db_id: number; make: string; model: string }>(first, rest, rest) ?? [];

      if (rows.length === 0) continue;

      const stmt = db.prepare('UPDATE inquiry SET make = ?, model = ? WHERE db_id = ?');
      for (const row of rows) {
        const modelHead = row.model.slice(0, rest.length);
        const remainder = row.model.slice(rest.length).trim();
        stmt.run(`${row.make} ${modelHead}`, remainder === '' ? null : remainder, row.db_id);
      }
      byMake.push([full, rows.length]);
      repaired += rows.length;
    }
  });
  run();

  return { repaired, byMake };
}

/**
 * A record whose page 404s while the index still lists it.
 *
 * Distinct from delisting: `delisted_at` means DEG dropped the inquiry from
 * its index, which is directly observable and trusted on sight. This is the
 * opposite case — the index still advertises the record but the detail page
 * redirects to /deg-database/. Confirmed instances: 38943 (Travis 2026-06-30)
 * and 41179 (found in run 1 batch 2). Both were previously handled by a
 * hardcoded EXCLUDED_IDS entry in the transform, which does not scale.
 *
 * A single 404 is not enough — degweb.org has an instability history and a
 * transient soft-404 would otherwise evict a good record permanently. So the
 * first sighting only raises suspicion; a second sighting on a later pass
 * confirms. A successful fetch clears the suspicion outright.
 */
export function markDeadSuspected(db: Database, dbId: number, at: string): void {
  db.run(
    'UPDATE inquiry SET dead_suspected_at = ? WHERE db_id = ? AND dead_suspected_at IS NULL',
    [at, dbId],
  );
}

export function confirmDead(db: Database, dbId: number, at: string): void {
  db.run('UPDATE inquiry SET dead_at = ? WHERE db_id = ? AND dead_at IS NULL', [at, dbId]);
}

/** The page came back — whatever we saw before was transient. */
export function clearDeadSuspicion(db: Database, dbId: number): void {
  db.run(
    'UPDATE inquiry SET dead_suspected_at = NULL, dead_at = NULL WHERE db_id = ? AND (dead_suspected_at IS NOT NULL OR dead_at IS NOT NULL)',
    [dbId],
  );
}

export function isDeadSuspected(db: Database, dbId: number): boolean {
  const row = db
    .prepare('SELECT dead_suspected_at FROM inquiry WHERE db_id = ?')
    .get<{ dead_suspected_at: string | null }>(dbId);
  return row?.dead_suspected_at != null;
}

export function getDeadIds(db: Database): number[] {
  const rows =
    db
      .prepare('SELECT db_id FROM inquiry WHERE dead_at IS NOT NULL ORDER BY db_id ASC')
      .all<{ db_id: number }>() ?? [];
  return rows.map((r) => r.db_id);
}

export function getSuspectedDeadIds(db: Database): number[] {
  const rows =
    db
      .prepare(
        `SELECT db_id FROM inquiry
         WHERE dead_suspected_at IS NOT NULL AND dead_at IS NULL
         ORDER BY db_id ASC`,
      )
      .all<{ db_id: number }>() ?? [];
  return rows.map((r) => r.db_id);
}

export function getDelistedIds(db: Database): number[] {
  const rows =
    db
      .prepare('SELECT db_id FROM inquiry WHERE delisted_at IS NOT NULL ORDER BY db_id ASC')
      .all<{ db_id: number }>() ?? [];
  return rows.map((r) => r.db_id);
}

export function countByResolutionStatus(db: Database): {
  resolved: number;
  pending: number;
  total: number;
} {
  const row = db
    .prepare(
      `SELECT
        SUM(CASE WHEN resolution_status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN resolution_status = 'pending'  THEN 1 ELSE 0 END) AS pending,
        COUNT(*) AS total
      FROM inquiry`,
    )
    .get<{ resolved: number; pending: number; total: number }>();
  return { resolved: row?.resolved ?? 0, pending: row?.pending ?? 0, total: row?.total ?? 0 };
}
