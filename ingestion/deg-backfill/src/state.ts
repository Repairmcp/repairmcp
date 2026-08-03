import type { Database } from 'bun:sqlite';

export type SyncMode = 'catchup' | 'nightly';
export type RunStatus = 'running' | 'interrupted' | 'completed';
export type ItemPass = 'new' | 'refresh';
export type ItemState = 'queued' | 'written' | 'unchanged' | 'skipped';

export interface SyncRun {
  runId: number;
  startedAt: string;
  finishedAt: string | null;
  mode: SyncMode;
  refreshWindow: number;
  indexMaxDbId: number | null;
  indexCount: number | null;
  status: RunStatus;
}

export interface QueuedItem {
  dbId: number;
  pass: ItemPass;
  attempts: number;
}

export interface RunSummary {
  written: number;
  unchanged: number;
  skipped: number;
  queued: number;
  total: number;
}

export const STATE_HIGH_WATER = 'high_water_db_id';
export const STATE_LAST_INDEX_SYNC = 'last_index_sync_at';
export const STATE_LAST_COMPLETED_RUN = 'last_completed_run_id';
export const STATE_MAKES_REPAIRED = 'makes_repaired_at';

/**
 * Idempotent. Safe to call on the existing 22k-row production DB — the ALTERs
 * are guarded because SQLite has no ADD COLUMN IF NOT EXISTS.
 */
export function migrateSyncSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_run (
      run_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at      TEXT NOT NULL,
      finished_at     TEXT,
      mode            TEXT NOT NULL,
      refresh_window  INTEGER NOT NULL,
      index_max_db_id INTEGER,
      index_count     INTEGER,
      status          TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_item (
      run_id         INTEGER NOT NULL,
      db_id          INTEGER NOT NULL,
      pass           TEXT NOT NULL,
      state          TEXT NOT NULL,
      attempts       INTEGER NOT NULL DEFAULT 0,
      http_status    INTEGER,
      reason         TEXT,
      changed        INTEGER NOT NULL DEFAULT 0,
      changed_fields TEXT,
      updated_at     TEXT,
      PRIMARY KEY (run_id, db_id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_sync_item_state ON sync_item(run_id, state)`);

  addColumnIfMissing(db, 'inquiry', 'content_hash', 'TEXT');
  addColumnIfMissing(db, 'inquiry', 'delisted_at', 'TEXT');
  addColumnIfMissing(db, 'inquiry', 'dead_suspected_at', 'TEXT');
  addColumnIfMissing(db, 'inquiry', 'dead_at', 'TEXT');
  db.run(`CREATE INDEX IF NOT EXISTS idx_inquiry_delisted ON inquiry(delisted_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_inquiry_dead ON inquiry(dead_at)`);
}

function addColumnIfMissing(
  db: Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>() ?? [];
  if (cols.some((c) => c.name === column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export function getState(db: Database, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM sync_state WHERE key = ?')
    .get<{ value: string | null }>(key);
  return row?.value ?? null;
}

export function setState(db: Database, key: string, value: string): void {
  db.run(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export interface HighWater {
  value: number;
  /**
   * 'stored'     — an actual recorded mark from a completed run.
   * 'corpus-max' — nothing recorded yet, so MAX(db_id) stands in.
   */
  source: 'stored' | 'corpus-max';
}

/**
 * The recorded high-water mark, or — on a DB that has never completed a sync —
 * the max db_id already present. Falling back to the corpus means a first run
 * does not re-crawl everything.
 *
 * The caller needs to know WHICH it got. The fallback tracks MAX(db_id), so it
 * moves the instant new rows are ingested: during run 1 it read 41481 before
 * the new pass and 41745 immediately after, making the mark look like it had
 * advanced when nothing had been recorded at all. Reporting the source keeps
 * "not yet recorded" from being mistaken for "recorded and up to date".
 */
export function getHighWaterInfo(db: Database): HighWater {
  const stored = getState(db, STATE_HIGH_WATER);
  if (stored !== null) {
    const parsed = parseInt(stored, 10);
    if (!Number.isNaN(parsed)) return { value: parsed, source: 'stored' };
  }
  const row = db.prepare('SELECT MAX(db_id) AS max_id FROM inquiry').get<{ max_id: number | null }>();
  return { value: row?.max_id ?? 0, source: 'corpus-max' };
}

export function getHighWater(db: Database): number {
  return getHighWaterInfo(db).value;
}

export function setHighWater(db: Database, dbId: number): void {
  setState(db, STATE_HIGH_WATER, String(dbId));
}

export function createRun(
  db: Database,
  opts: {
    mode: SyncMode;
    refreshWindow: number;
    indexMaxDbId: number | null;
    indexCount: number | null;
  },
): number {
  const row = db
    .prepare(
      `INSERT INTO sync_run
         (started_at, mode, refresh_window, index_max_db_id, index_count, status)
       VALUES (?, ?, ?, ?, ?, 'running')
       RETURNING run_id`,
    )
    .get<{ run_id: number }>(
      new Date().toISOString(),
      opts.mode,
      opts.refreshWindow,
      opts.indexMaxDbId,
      opts.indexCount,
    );
  if (!row) throw new Error('failed to create sync_run');
  return row.run_id;
}

export function finishRun(db: Database, runId: number, status: RunStatus): void {
  db.run('UPDATE sync_run SET status = ?, finished_at = ? WHERE run_id = ?', [
    status,
    new Date().toISOString(),
    runId,
  ]);
  if (status === 'completed') {
    setState(db, STATE_LAST_COMPLETED_RUN, String(runId));
  }
}

function toRun(row: {
  run_id: number;
  started_at: string;
  finished_at: string | null;
  mode: string;
  refresh_window: number;
  index_max_db_id: number | null;
  index_count: number | null;
  status: string;
}): SyncRun {
  return {
    runId: row.run_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    mode: row.mode as SyncMode,
    refreshWindow: row.refresh_window,
    indexMaxDbId: row.index_max_db_id,
    indexCount: row.index_count,
    status: row.status as RunStatus,
  };
}

/** Newest run that still has work — what `--resume` reopens. */
export function getResumableRun(db: Database): SyncRun | null {
  const row = db
    .prepare(
      `SELECT * FROM sync_run
       WHERE status IN ('running', 'interrupted')
       ORDER BY run_id DESC LIMIT 1`,
    )
    .get<Parameters<typeof toRun>[0]>();
  return row ? toRun(row) : null;
}

export function getRun(db: Database, runId: number): SyncRun | null {
  const row = db
    .prepare('SELECT * FROM sync_run WHERE run_id = ?')
    .get<Parameters<typeof toRun>[0]>(runId);
  return row ? toRun(row) : null;
}

export function enqueueItems(
  db: Database,
  runId: number,
  items: Array<{ dbId: number; pass: ItemPass }>,
): void {
  const stmt = db.prepare(
    `INSERT INTO sync_item (run_id, db_id, pass, state, updated_at)
     VALUES (?, ?, ?, 'queued', ?)
     ON CONFLICT(run_id, db_id) DO NOTHING`,
  );
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    for (const item of items) {
      stmt.run(runId, item.dbId, item.pass, now);
    }
  });
  run();
}

/**
 * Queued items, NEW pass first then refresh, ascending db_id within each.
 * Deterministic so resume is predictable, and front-loaded so the first batch
 * validates the parser against current markup before the long refresh tail.
 */
export function getQueuedItems(db: Database, runId: number, limit?: number): QueuedItem[] {
  const base = `SELECT db_id, pass, attempts FROM sync_item
                WHERE run_id = ? AND state = 'queued'
                ORDER BY CASE pass WHEN 'new' THEN 0 ELSE 1 END, db_id ASC`;
  const rows =
    limit !== undefined
      ? db
          .prepare(`${base} LIMIT ?`)
          .all<{ db_id: number; pass: string; attempts: number }>(runId, limit) ?? []
      : db
          .prepare(base)
          .all<{ db_id: number; pass: string; attempts: number }>(runId) ?? [];
  return rows.map((r) => ({ dbId: r.db_id, pass: r.pass as ItemPass, attempts: r.attempts }));
}

export function countQueued(db: Database, runId: number, pass?: ItemPass): number {
  const sql =
    pass !== undefined
      ? `SELECT COUNT(*) AS n FROM sync_item WHERE run_id = ? AND state = 'queued' AND pass = ?`
      : `SELECT COUNT(*) AS n FROM sync_item WHERE run_id = ? AND state = 'queued'`;
  const row =
    pass !== undefined
      ? db.prepare(sql).get<{ n: number }>(runId, pass)
      : db.prepare(sql).get<{ n: number }>(runId);
  return row?.n ?? 0;
}

/**
 * Terminal outcome for one item. Note there is no 'failed' state: a transient
 * failure deliberately leaves the item 'queued' (only bumping attempts) so the
 * next run retries it, matching the tier-2 convention from commit e8d0bd0.
 */
export function recordItemOutcome(
  db: Database,
  runId: number,
  dbId: number,
  outcome: {
    state: ItemState;
    httpStatus?: number;
    reason?: string;
    changed?: boolean;
    changedFields?: string[];
  },
): void {
  db.run(
    `UPDATE sync_item SET
       state          = ?,
       attempts       = attempts + 1,
       http_status    = ?,
       reason         = ?,
       changed        = ?,
       changed_fields = ?,
       updated_at     = ?
     WHERE run_id = ? AND db_id = ?`,
    [
      outcome.state,
      outcome.httpStatus ?? null,
      outcome.reason ?? null,
      outcome.changed === true ? 1 : 0,
      outcome.changedFields && outcome.changedFields.length > 0
        ? outcome.changedFields.join(',')
        : null,
      new Date().toISOString(),
      runId,
      dbId,
    ],
  );
}

export function getRunSummary(db: Database, runId: number): RunSummary {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN state = 'written'   THEN 1 ELSE 0 END) AS written,
         SUM(CASE WHEN state = 'unchanged' THEN 1 ELSE 0 END) AS unchanged,
         SUM(CASE WHEN state = 'skipped'   THEN 1 ELSE 0 END) AS skipped,
         SUM(CASE WHEN state = 'queued'    THEN 1 ELSE 0 END) AS queued,
         COUNT(*) AS total
       FROM sync_item WHERE run_id = ?`,
    )
    .get<RunSummary>(runId);
  return {
    written: row?.written ?? 0,
    unchanged: row?.unchanged ?? 0,
    skipped: row?.skipped ?? 0,
    queued: row?.queued ?? 0,
    total: row?.total ?? 0,
  };
}

/**
 * Field-name histogram for the report. Refresh pass only — a brand-new inquiry
 * "changes" every field by definition, which would drown out the signal we
 * actually care about: what DEG edited on records we already held.
 */
export function getChangedFieldHistogram(db: Database, runId: number): Array<[string, number]> {
  const rows =
    db
      .prepare(
        `SELECT changed_fields FROM sync_item
         WHERE run_id = ? AND pass = 'refresh' AND changed = 1 AND changed_fields IS NOT NULL`,
      )
      .all<{ changed_fields: string }>(runId) ?? [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const field of row.changed_fields.split(',')) {
      if (!field) continue;
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function getSkippedItems(
  db: Database,
  runId: number,
): Array<{ dbId: number; httpStatus: number | null; reason: string | null }> {
  const rows =
    db
      .prepare(
        `SELECT db_id, http_status, reason FROM sync_item
         WHERE run_id = ? AND state = 'skipped' ORDER BY db_id ASC`,
      )
      .all<{ db_id: number; http_status: number | null; reason: string | null }>(runId) ?? [];
  return rows.map((r) => ({ dbId: r.db_id, httpStatus: r.http_status, reason: r.reason }));
}
