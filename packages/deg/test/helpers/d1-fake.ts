/**
 * A `D1Like` backed by bun:sqlite, loading the migration files the deployment
 * actually applies.
 *
 * The point is that the tests exercise the shipped DDL rather than a
 * hand-written approximation of it. If a column moves in `0001_schema.sql`, or
 * the bm25 weight vector in `0003_fts.sql` falls out of step with the column
 * order, these tests break here rather than in production.
 *
 * Verified working on bun's SQLite 3.51.2: FTS5, external-content tables,
 * `INSERT INTO fts(fts) VALUES('rebuild')`, and triggers with BEGIN…END bodies.
 */
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Like, D1PreparedLike } from '../../src/d1/types';
import { INQUIRY_COLUMNS, inquiryToRow } from '../../src/d1/sql';
import type { DEGInquiry } from '../../src/schema';

const MIGRATIONS_DIR = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'apps',
  'deg-server',
  'migrations',
);

function migration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf-8');
}

class BunPrepared implements D1PreparedLike {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedLike {
    return new BunPrepared(this.db, this.sql, values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const stmt = this.db.query(this.sql);
    return { results: stmt.all(...(this.params as never[])) as T[] };
  }

  async first<T>(): Promise<T | null> {
    const stmt = this.db.query(this.sql);
    return (stmt.get(...(this.params as never[])) as T | undefined) ?? null;
  }
}

export class FakeD1 implements D1Like {
  constructor(private readonly db: Database) {}

  prepare(sql: string): D1PreparedLike {
    return new BunPrepared(this.db, sql);
  }

  /** Escape hatch for assertions that need raw SQL. */
  raw(): Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Build an in-memory database from the real migrations, seeded with `inquiries`.
 *
 * Apply order mirrors deployment exactly — schema, then rows, then the FTS
 * index. Building the index after the rows land is the whole reason `0003` is a
 * separate migration, so the tests had better do it in that order too.
 */
export function makeFakeD1(inquiries: DEGInquiry[]): FakeD1 {
  const db = new Database(':memory:');
  db.run(migration('0001_schema.sql'));

  const placeholders = INQUIRY_COLUMNS.map(() => '?').join(',');
  const insert = db.prepare(
    `INSERT INTO inquiry (${INQUIRY_COLUMNS.join(',')}) VALUES (${placeholders})`,
  );

  db.transaction(() => {
    for (const inq of inquiries) {
      const row = inquiryToRow(inq);
      insert.run(...(INQUIRY_COLUMNS.map((c) => row[c]) as never[]));
    }
  })();

  db.run(migration('0003_fts.sql'));
  return new FakeD1(db);
}
