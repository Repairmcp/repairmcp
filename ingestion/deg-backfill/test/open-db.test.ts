import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, createSchema } from '../src/db.js';

/**
 * Every case here uses a throwaway directory. Nothing in this file may touch
 * C:\degdata\deg.sqlite.
 */
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deg-opendb-'));
});

afterEach(() => {
  // Windows keeps a handle on the -wal/-shm sidecars for a moment after
  // close(), so a first rm can hit EBUSY. Retry, and never let teardown fail a
  // test — a leftover directory under the OS temp dir is not a defect.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  } catch {
    /* best effort */
  }
});

describe('openDb — refuses anything that is not already a corpus', () => {
  test('refuses a path that does not exist, and names it', () => {
    const missing = join(dir, 'typo.sqlite');
    expect(() => openDb(missing)).toThrow(/Refusing to open/);
    expect(() => openDb(missing)).toThrow(new RegExp(missing.replace(/\\/g, '\\\\')));
  });

  test('does not create the file it refused to open', () => {
    // The whole point: `new Database(path)` would have created it, leaving an
    // empty corpus that looks valid and returns nothing.
    const missing = join(dir, 'never-created.sqlite');
    expect(() => openDb(missing)).toThrow();
    expect(existsSync(missing)).toBe(false);
  });

  test('refuses a zero-byte file', () => {
    const empty = join(dir, 'empty.sqlite');
    writeFileSync(empty, '');
    expect(() => openDb(empty)).toThrow(/no 'inquiry' table/);
    expect(() => openDb(empty)).toThrow(new RegExp(empty.replace(/\\/g, '\\\\')));
  });

  test('refuses a real SQLite database that has no inquiry table', () => {
    const wrong = join(dir, 'someone-elses.sqlite');
    const other = new Database(wrong);
    other.run('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
    other.close();

    expect(() => openDb(wrong)).toThrow(/no 'inquiry' table/);
  });

  test('the refusal explains how to proceed deliberately', () => {
    const empty = join(dir, 'empty.sqlite');
    writeFileSync(empty, '');
    expect(() => openDb(empty)).toThrow(/--create/);
  });

  test('a non-corpus file is left intact after a refusal', () => {
    const wrong = join(dir, 'someone-elses.sqlite');
    const other = new Database(wrong);
    other.run('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
    other.run('INSERT INTO unrelated (id) VALUES (7)');
    other.close();

    expect(() => openDb(wrong)).toThrow();

    const reopened = new Database(wrong);
    const row = reopened
      .prepare<{ id: number }, []>('SELECT id FROM unrelated')
      .get();
    expect(row?.id).toBe(7);
    reopened.close();
  });
});

describe('openDb — opens a genuine corpus', () => {
  test('opens a database that has an inquiry table', () => {
    const good = join(dir, 'corpus.sqlite');
    const seed = openDb(good, { create: true });
    createSchema(seed);
    seed.close();

    const db = openDb(good);
    expect(db.prepare<{ n: number }, []>('SELECT COUNT(*) AS n FROM inquiry').get()?.n).toBe(0);
    db.close();
  });

  test('in-memory databases need no ceremony — they cannot be a typo', () => {
    const db = openDb(':memory:');
    createSchema(db);
    expect(db.prepare<{ n: number }, []>('SELECT COUNT(*) AS n FROM inquiry').get()?.n).toBe(0);
    db.close();
  });
});

describe('openDb — creating is explicit', () => {
  test('create: true initialises a new file', () => {
    const fresh = join(dir, 'fresh.sqlite');
    expect(existsSync(fresh)).toBe(false);

    const db = openDb(fresh, { create: true });
    createSchema(db);
    db.close();

    expect(existsSync(fresh)).toBe(true);
    // And it is a real corpus afterwards, so a bare open now succeeds.
    const reopened = openDb(fresh);
    reopened.close();
  });

  test('create: true also accepts an existing non-corpus file', () => {
    // Deliberate re-initialisation of a file that is not yet a corpus.
    const wrong = join(dir, 'adopt-me.sqlite');
    writeFileSync(wrong, '');
    const db = openDb(wrong, { create: true });
    createSchema(db);
    db.close();
    openDb(wrong).close();
  });

  test('create: false is the same as omitting it', () => {
    const missing = join(dir, 'nope.sqlite');
    expect(() => openDb(missing, { create: false })).toThrow(/Refusing to open/);
  });

  test('WAL pragmas still applied on the create path', () => {
    const fresh = join(dir, 'pragma.sqlite');
    const db = openDb(fresh, { create: true });
    const mode = db.prepare<{ journal_mode: string }, []>('PRAGMA journal_mode').get();
    expect(mode?.journal_mode.toLowerCase()).toBe('wal');
    db.close();
  });
});
