import { openDb, createSchema, countByResolutionStatus, getPendingIds, getRow } from './db.js';
import { syncIndex } from './tier1.js';
import { runBackfill } from './tier2.js';
import { ProgressTracker } from './progress.js';

const DB_PATH = process.env['DEG_DB_PATH'] ?? 'C:\\degdata\\deg.sqlite';

function parseArgs(argv: string[]): { limit?: number; inspectId?: number } {
  const limitIdx = argv.indexOf('--limit');
  const inspectIdx = argv.indexOf('--inspect');
  return {
    limit: limitIdx !== -1 ? parseInt(argv[limitIdx + 1] ?? '', 10) : undefined,
    inspectId: inspectIdx !== -1 ? parseInt(argv[inspectIdx + 1] ?? '', 10) : undefined,
  };
}

function printSampleRows(db: ReturnType<typeof openDb>, ids: number[]): void {
  process.stdout.write('\n=== Sample rows ===\n');
  for (const id of ids) {
    const row = getRow(db, id);
    process.stdout.write(`--- db_id ${id} ---\n`);
    process.stdout.write(JSON.stringify(row, null, 2) + '\n');
  }
}

async function main(): Promise<void> {
  const { limit, inspectId } = parseArgs(process.argv.slice(2));

  const db = openDb(DB_PATH, { create: process.argv.includes('--create') });
  createSchema(db);

  if (inspectId !== undefined) {
    const row = getRow(db, inspectId);
    if (row === null) {
      process.stderr.write(`No row found for db_id=${inspectId}\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(row, null, 2) + '\n');
    return;
  }

  process.stdout.write(`Database: ${DB_PATH}\n`);

  // Tier-1: always sync the index first
  process.stdout.write('--- Tier-1: syncing index ---\n');
  const syncResult = await syncIndex(db);
  const counts = countByResolutionStatus(db);
  process.stdout.write(`Tier-1 complete: ${syncResult.total} entries\n`);
  process.stdout.write(`  resolved : ${counts.resolved}\n`);
  process.stdout.write(`  pending  : ${counts.pending}\n`);
  process.stdout.write(`  total    : ${counts.total}\n`);

  // Tier-2: fetch pending detail pages
  const ids = getPendingIds(db, limit);
  if (ids.length === 0) {
    process.stdout.write('Tier-2: nothing to do (all rows already have body_fetched_at set).\n');
    return;
  }

  const limitNote = limit !== undefined ? ` (limited to ${limit})` : '';
  process.stdout.write(`--- Tier-2: backfilling ${ids.length} detail pages${limitNote} ---\n`);
  process.stdout.write('Rate: 2s per request. ETA is approximate.\n');

  const tracker = new ProgressTracker(ids.length);
  await runBackfill(db, ids, tracker);

  process.stdout.write(`\nTier-2 complete: ${ids.length} rows processed.\n`);

  if (limit !== undefined) {
    // Print 5 sample rows for Phase B validation
    const sampleIds = ids.slice(0, 5);
    printSampleRows(db, sampleIds);
    process.stdout.write('\nPhase B complete. Inspect the sample rows above, then run without --limit for the full backfill.\n');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
