import { openDb, createSchema, countByResolutionStatus } from './db.js';
import { syncIndex } from './tier1.js';
import { join } from 'node:path';

const DB_PATH = process.env['DEG_DB_PATH'] ?? join(process.cwd(), 'deg.sqlite');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inspectIdx = args.indexOf('--inspect');

  const db = openDb(DB_PATH);
  createSchema(db);

  if (inspectIdx !== -1) {
    const idStr = args[inspectIdx + 1];
    if (!idStr) {
      process.stderr.write('--inspect requires a db_id argument\n');
      process.exit(1);
    }
    const { getRow } = await import('./db.js');
    const row = getRow(db, parseInt(idStr, 10));
    process.stdout.write(JSON.stringify(row, null, 2) + '\n');
    return;
  }

  process.stdout.write(`Database: ${DB_PATH}\n`);
  process.stdout.write('--- Phase A: Tier-1 sync ---\n');
  const result = await syncIndex(db);
  const counts = countByResolutionStatus(db);
  process.stdout.write(`Tier-1 complete: ${result.total} entries processed\n`);
  process.stdout.write(`  resolved : ${counts.resolved}\n`);
  process.stdout.write(`  pending  : ${counts.pending}\n`);
  process.stdout.write(`  total    : ${counts.total}\n`);
  process.stdout.write('Phase A complete. Awaiting sign-off before Tier-2.\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
