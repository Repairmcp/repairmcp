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
      last_seen_at      TEXT
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
