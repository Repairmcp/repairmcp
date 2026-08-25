import {
  openDb,
  createSchema,
  markDelisted,
  clearDelisted,
  repairTruncatedMakes,
  countNonDelistedRows,
} from './db.js';
import { fetchIndex, upsertIndexEntries, MULTI_WORD_MAKES } from './tier1.js';
import { planSync, materializePlan, runBatch, checkPlanSanity } from './sync.js';
import type { SyncPlan } from './sync.js';
import {
  migrateSyncSchema,
  createRun,
  finishRun,
  getResumableRun,
  getRun,
  getQueuedItems,
  countQueued,
  getRunSummary,
  getChangedFieldHistogram,
  getSkippedItems,
  getHighWaterInfo,
  setHighWater,
  setState,
  getState,
  STATE_LAST_INDEX_SYNC,
  STATE_MAKES_REPAIRED,
} from './state.js';
import type { SyncMode, HighWater } from './state.js';
import { buildHealthReport, formatHealthReport, DEFAULT_LOG_DIR } from './health.js';

const out = (s: string): void => void process.stdout.write(s);
const err = (s: string): void => void process.stderr.write(s);

interface Args {
  dbPath: string | undefined;
  batchSize: number;
  refreshWindow: number;
  resume: boolean;
  dryRun: boolean;
  forceNew: boolean;
  indexDiffOnly: boolean;
  create: boolean;
  mode: SyncMode;
  health: boolean;
  logDir: string;
}

function flagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseArgs(argv: string[]): Args {
  const batchSizeRaw = flagValue(argv, '--batch-size');
  const windowRaw = flagValue(argv, '--refresh-window');
  const modeRaw = flagValue(argv, '--mode');
  return {
    dbPath: flagValue(argv, '--db') ?? process.env['DEG_DB_PATH'],
    batchSize: batchSizeRaw !== undefined ? parseInt(batchSizeRaw, 10) : 500,
    refreshWindow: windowRaw !== undefined ? parseInt(windowRaw, 10) : 1000,
    resume: hasFlag(argv, '--resume'),
    dryRun: hasFlag(argv, '--dry-run'),
    forceNew: hasFlag(argv, '--force-new'),
    indexDiffOnly: hasFlag(argv, '--index-diff-only'),
    create: hasFlag(argv, '--create'),
    mode: modeRaw === 'nightly' ? 'nightly' : 'catchup',
    health: hasFlag(argv, '--health'),
    logDir: flagValue(argv, '--log-dir') ?? DEFAULT_LOG_DIR,
  };
}

const USAGE = `
DEG delta sync — catch-up and nightly.

  bun run sync --db <path> [options]

  --db <path>              REQUIRED. Path to the DEG SQLite corpus.
                           The live corpus is C:\\degdata\\deg.sqlite.
                           (ingestion/deg-backfill/deg.sqlite is a stale
                           partial from June 26 — pointing here re-crawls 22k
                           pages. Set DEG_DB_PATH to avoid retyping.)
  --dry-run                Plan and report, fetch no detail pages.
  --batch-size <n>         Detail pages per supervised batch. Default 500.
  --refresh-window <n>     Trailing re-verify sweep size in db_ids. Default 1000.
  --index-diff-only        Skip the trailing sweep and pending cohort.
  --resume                 Continue the open run's queue. No re-planning.
  --force-new              Start a new run even if one is still open.
  --create                 Initialise a new database at --db. Required only
                           when the file does not already hold a corpus; a
                           bare open refuses rather than creating one.
  --mode <catchup|nightly> Recorded on the run. Default catchup.
  --health                 Print a corpus health report and exit. No network calls.
  --log-dir <path>         Where health.log / ATTENTION-NEEDED.txt live. Default C:\\degdata\\logs.
`;

function printPlan(plan: SyncPlan, highWater: HighWater, args: Args): void {
  out('\n=== Plan ===\n');
  out(`Live index            : ${plan.indexCount} unique db_ids, max ${plan.indexMaxDbId}\n`);
  out(
    `High-water mark       : ${highWater.value}` +
      `${highWater.source === 'stored' ? ' (recorded)' : ' (NOT yet recorded — showing MAX(db_id))'}\n`,
  );
  out('\nCohorts\n');
  out(`  NEW (not held)      : ${plan.newIds.length}\n`);
  const below = plan.newIds.filter((id) => id <= highWater.value);
  if (below.length > 0) {
    out(`    ...of which gaps below the high-water mark: ${below.length} -> ${below.join(', ')}\n`);
  }
  out(`  index-diff changed  : ${plan.indexChangedIds.length}\n`);
  out(`  unresolved cohort   : ${plan.unresolvedIds.length}\n`);
  out(`  suspected dead      : ${plan.suspectedDeadIds.length}`);
  if (plan.suspectedDeadIds.length > 0 && plan.suspectedDeadIds.length <= 20) {
    out(` -> ${plan.suspectedDeadIds.join(', ')}`);
  }
  out('\n');
  out(`  resolved, no text   : ${plan.resolvedBlankIds.length}`);
  if (plan.resolvedBlankIds.length > 0 && plan.resolvedBlankIds.length <= 20) {
    out(` -> ${plan.resolvedBlankIds.join(', ')}`);
  }
  out('\n');
  out(`  trailing window     : ${plan.trailingIds.length}`);
  if (plan.trailingIds.length > 0) {
    out(` (${plan.trailingIds.at(0)}-${plan.trailingIds.at(-1)})`);
  }
  out('\n');
  out(`  ----------------------------------------\n`);
  out(`  QUEUE (deduped)     : ${plan.queue.length} detail fetches\n`);
  const etaMin = Math.round((plan.queue.length * 2) / 60);
  const batches = Math.ceil(plan.queue.length / args.batchSize);
  out(`  ETA @ 2s            : ~${etaMin} min across ${batches} batch(es) of ${args.batchSize}\n`);

  if (plan.delistedIds.length > 0) {
    out(`\nDelisted upstream     : ${plan.delistedIds.length} -> ${plan.delistedIds.join(', ')}\n`);
    out('  (stamped delisted_at, kept in SQLite, filtered out of the served JSON)\n');
  }
  if (plan.reappearedIds.length > 0) {
    out(`Reappeared upstream   : ${plan.reappearedIds.length} -> ${plan.reappearedIds.join(', ')}\n`);
  }
}

function printReport(
  db: ReturnType<typeof openDb>,
  runId: number,
  batch: Awaited<ReturnType<typeof runBatch>>,
): void {
  const summary = getRunSummary(db, runId);

  out('\n=== Batch report ===\n');
  out(`Fetched this batch    : ${batch.processed}\n`);
  out(`  written (changed)   : ${batch.written}\n`);
  out(`  unchanged           : ${batch.unchanged}\n`);
  out(`  skipped (definitive): ${batch.skipped}\n`);
  out(`  transient (requeued): ${batch.transient}\n`);

  if (batch.suspect.length > 0) {
    out(`\n  SUSPECT PARSES (not written, row preserved): ${batch.suspect.join(', ')}\n`);
    out('  Inspect these by hand — a markup change would look exactly like this.\n');
  }

  if (batch.suspectedDead.length > 0) {
    out(`\n  DEAD SUSPECTED (still served): ${batch.suspectedDead.join(', ')}\n`);
    out('  Page 404s but the index still lists it. One more pass confirms or clears.\n');
  }
  if (batch.confirmedDead.length > 0) {
    out(`\n  DEAD CONFIRMED (dropping from served JSON): ${batch.confirmedDead.join(', ')}\n`);
  }

  const histogram = getChangedFieldHistogram(db, runId);
  if (histogram.length > 0) {
    out('\nChanged fields (refresh pass, run to date)\n');
    for (const [field, count] of histogram) {
      out(`  ${field.padEnd(20)} ${count}\n`);
    }
  }

  const skipped = getSkippedItems(db, runId);
  if (skipped.length > 0) {
    out(`\nSkipped this run (${skipped.length})\n`);
    for (const item of skipped.slice(0, 25)) {
      out(`  ${item.dbId}  status=${item.httpStatus ?? '-'}  ${item.reason ?? ''}\n`);
    }
    if (skipped.length > 25) out(`  ... and ${skipped.length - 25} more\n`);
  }

  out('\n=== Run totals ===\n');
  out(`  written   : ${summary.written}\n`);
  out(`  unchanged : ${summary.unchanged}\n`);
  out(`  skipped   : ${summary.skipped}\n`);
  out(`  REMAINING : ${summary.queued}\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    out(USAGE);
    return;
  }

  const args = parseArgs(argv);

  if (args.dbPath === undefined || args.dbPath === '') {
    err('Fatal: --db is required (or set DEG_DB_PATH).\n');
    err(USAGE);
    process.exit(1);
  }
  if (isNaN(args.batchSize) || args.batchSize <= 0) {
    err('Fatal: --batch-size must be a positive integer.\n');
    process.exit(1);
  }
  if (isNaN(args.refreshWindow) || args.refreshWindow < 0) {
    err('Fatal: --refresh-window must be zero or a positive integer.\n');
    process.exit(1);
  }

  const db = openDb(args.dbPath, { create: args.create });
  createSchema(db);
  migrateSyncSchema(db);
  out(`Database: ${args.dbPath}\n`);

  if (args.health) {
    const report = buildHealthReport(db, args.logDir);
    out(formatHealthReport(report) + '\n');
    db.close();
    return;
  }

  // One-time data repair, guarded by sync_state so it runs on the next
  // invocation of any kind and never again. Fixing parseVehicleData only helps
  // rows ingested from here on; the existing corpus needs this pass.
  if (getState(db, STATE_MAKES_REPAIRED) === null) {
    const repair = repairTruncatedMakes(db, MULTI_WORD_MAKES);
    setState(db, STATE_MAKES_REPAIRED, new Date().toISOString());
    if (repair.repaired > 0) {
      out(`\nOne-time repair: un-split ${repair.repaired} truncated vehicle makes\n`);
      for (const [make, count] of repair.byMake) out(`  ${make.padEnd(16)} ${count}\n`);
    }
  }

  const open = getResumableRun(db);
  let runId: number;

  if (args.resume) {
    if (open === null) {
      err('Fatal: --resume passed but no open run exists. Drop --resume to plan a new one.\n');
      process.exit(1);
    }
    runId = open.runId;
    const remaining = countQueued(db, runId);
    out(`Resuming run ${runId} (${open.mode}, started ${open.startedAt}) — ${remaining} queued.\n`);
    if (remaining === 0) {
      out('Nothing queued. Finalizing.\n');
    }
  } else {
    if (open !== null && countQueued(db, open.runId) > 0 && !args.forceNew) {
      err(
        `Fatal: run ${open.runId} is still open with ${countQueued(db, open.runId)} queued items.\n` +
          '       Use --resume to continue it, or --force-new to abandon it.\n',
      );
      process.exit(1);
    }
    if (open !== null && !args.forceNew) {
      // Open but fully drained — close it out before planning a new one.
      finishRun(db, open.runId, 'completed');
    }

    err('Fetching live index...\n');
    const entries = await fetchIndex();
    const highWater = getHighWaterInfo(db);
    const plan = planSync(db, entries, {
      refreshWindow: args.refreshWindow,
      indexDiffOnly: args.indexDiffOnly,
    });
    printPlan(plan, highWater, args);

    // Before anything is written. Runs on --dry-run too — a dry run is exactly
    // when you want to be told the index is unusable.
    const sanity = checkPlanSanity(countNonDelistedRows(db), plan);
    if (!sanity.ok) {
      err('\n');
      err('*********************************************************\n');
      err('*** ABORTING — THE LIVE INDEX FAILED A SANITY CHECK   ***\n');
      err('*********************************************************\n\n');
      for (const failure of sanity.failures) err(`  ${failure}\n\n`);
      err('Nothing was written. No index upsert, no delisting, no fetches.\n');
      err('Re-check https://degweb.org/grid/get/all by hand before retrying;\n');
      err('proceeding on a partial index would delist most of the corpus.\n');
      db.close();
      process.exit(3);
    }

    if (args.dryRun) {
      out('\nDry run — no index upsert, no detail fetches, no run created.\n');
      db.close();
      return;
    }

    // Upsert the index only after the diff has been computed against the
    // pre-upsert state, then materialize the queue.
    upsertIndexEntries(db, entries);
    setState(db, STATE_LAST_INDEX_SYNC, new Date().toISOString());
    const now = new Date().toISOString();
    markDelisted(db, plan.delistedIds, now);
    clearDelisted(db, plan.reappearedIds);

    runId = createRun(db, {
      mode: args.mode,
      refreshWindow: args.refreshWindow,
      indexMaxDbId: plan.indexMaxDbId,
      indexCount: plan.indexCount,
    });
    materializePlan(db, runId, plan);
    out(`\nRun ${runId} created and queued.\n`);
  }

  const queuedNow = countQueued(db, runId);
  if (queuedNow > 0) {
    const toProcess = Math.min(args.batchSize, queuedNow);
    out(`\n--- Batch: ${toProcess} of ${queuedNow} queued (2s/request) ---\n`);

    const batch = await runBatch(db, runId, {
      limit: args.batchSize,
      onItem: (event) => {
        const tag =
          event.outcome === 'written'
            ? `WRITE ${event.changedFields?.join(',') ?? ''}`
            : event.outcome.toUpperCase();
        err(
          `[${event.index}/${event.total}] ${event.pass} ${event.dbId} ${tag}` +
            `${event.reason ? ` — ${event.reason}` : ''}\n`,
        );
      },
    });

    printReport(db, runId, batch);

    if (batch.breakerTripped) {
      finishRun(db, runId, 'interrupted');
      out('\n*** CIRCUIT BREAKER TRIPPED ***\n');
      out('10 consecutive transient failures — degweb.org looks unhealthy.\n');
      out('Nothing was lost: the failed items are still queued.\n');
      out(`Retry later with:  bun run sync --db "${args.dbPath}" --resume\n`);
      db.close();
      process.exit(2);
    }
  }

  const remaining = countQueued(db, runId);
  if (remaining > 0) {
    out(`\nBatch complete. ${remaining} items still queued.\n`);
    out(`Approve the next batch with:  bun run sync --db "${args.dbPath}" --resume\n`);
    db.close();
    return;
  }

  // Queue fully drained — finalize.
  const run = getRun(db, runId);
  const newPassRemaining = countQueued(db, runId, 'new');
  if (run?.indexMaxDbId != null && newPassRemaining === 0) {
    const before = getHighWaterInfo(db);
    setHighWater(db, run.indexMaxDbId);
    out(
      before.source === 'stored'
        ? `\nHigh-water mark advanced: ${before.value} -> ${run.indexMaxDbId}\n`
        : `\nHigh-water mark recorded for the first time: ${run.indexMaxDbId}` +
            ` (previously unrecorded — MAX(db_id) had been standing in)\n`,
    );
  } else {
    out('\nHigh-water mark NOT advanced — the new pass did not fully drain.\n');
  }
  finishRun(db, runId, 'completed');

  out('\nAll batches complete.\n');
  out('Next: regenerate the served corpus —\n');
  out('  npx tsx scripts/transform-deg-sqlite.ts\n');
  db.close();
}

main().catch((e: unknown) => {
  err(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
