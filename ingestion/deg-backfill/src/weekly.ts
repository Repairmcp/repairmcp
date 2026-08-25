import { parseDrainSummary } from './drain-summary.js';
import type { DrainSummary } from './drain-summary.js';

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface WeeklyOptions {
  runSync: () => Promise<SpawnResult>;
  runTransform: () => Promise<SpawnResult>;
}

export interface WeeklyResult {
  ok: boolean;
  reason: string | null;
  syncExitCode: number;
  drainSummary: DrainSummary | null;
  transformExitCode: number | null;
  transformOutput: string | null;
}

/** Above this error rate, the run is flagged even though every write was individually safe. */
const MAX_ERROR_RATE = 0.2;

/** Below this many attempted fetches, a single failure can swing the rate past MAX_ERROR_RATE on a genuinely quiet week; don't alarm on noise. */
const MIN_SAMPLE_FOR_ERROR_RATE = 25;

/** Parsed out of transform-deg-sqlite.ts's own summary line. */
export function parseTransformValidationErrors(stdout: string): number {
  const match = stdout.match(/Schema validation errors:\s+(\d+)/);
  const group = match?.[1];
  return group !== undefined ? parseInt(group, 10) : 0;
}

export async function runWeekly(opts: WeeklyOptions): Promise<WeeklyResult> {
  const syncResult = await opts.runSync();
  const drainSummary = parseDrainSummary(syncResult.stdout);

  if (syncResult.exitCode !== 0) {
    const reason =
      drainSummary?.exitReason === 'sanity-failed'
        ? `Tier-1 sanity check failed: ${drainSummary.sanityFailures.join('; ')}`
        : drainSummary?.exitReason === 'breaker-tripped'
          ? 'Circuit breaker tripped. degweb.org looks unhealthy.'
          : drainSummary?.exitReason === 'drain-cap-hit'
            ? 'Sync did not drain within the batch cap.'
            : `Sync exited with code ${syncResult.exitCode}: ${syncResult.stderr.slice(0, 500)}`;
    return {
      ok: false,
      reason,
      syncExitCode: syncResult.exitCode,
      drainSummary,
      transformExitCode: null,
      transformOutput: null,
    };
  }

  if (drainSummary === null) {
    return {
      ok: false,
      reason: 'Sync exited 0 but printed no drain summary. Cannot verify what happened.',
      syncExitCode: syncResult.exitCode,
      drainSummary: null,
      transformExitCode: null,
      transformOutput: null,
    };
  }

  if (drainSummary.indexSynced === false) {
    return {
      ok: false,
      reason:
        'Drain auto-resumed a stale queue without re-syncing the live index (likely a crashed or ' +
        'interrupted prior run). The corpus was not regenerated this run; the next scheduled run will ' +
        'plan fresh against the live index.',
      syncExitCode: syncResult.exitCode,
      drainSummary,
      transformExitCode: null,
      transformOutput: null,
    };
  }

  const attempted = drainSummary.written + drainSummary.unchanged + drainSummary.skipped;
  const errorRate = attempted > 0 ? drainSummary.skipped / attempted : 0;
  if (attempted >= MIN_SAMPLE_FOR_ERROR_RATE && errorRate > MAX_ERROR_RATE) {
    return {
      ok: false,
      reason:
        `Error rate ${(errorRate * 100).toFixed(1)}% (${drainSummary.skipped}/${attempted}) ` +
        `exceeds the 20% threshold.`,
      syncExitCode: syncResult.exitCode,
      drainSummary,
      transformExitCode: null,
      transformOutput: null,
    };
  }

  const transformResult = await opts.runTransform();
  if (transformResult.exitCode !== 0) {
    return {
      ok: false,
      reason: `Corpus transform failed (exit ${transformResult.exitCode}): ${transformResult.stderr.slice(0, 500)}`,
      syncExitCode: syncResult.exitCode,
      drainSummary,
      transformExitCode: transformResult.exitCode,
      transformOutput: transformResult.stdout,
    };
  }

  const validationErrors = parseTransformValidationErrors(transformResult.stdout);
  if (validationErrors > 0) {
    return {
      ok: false,
      reason: `Corpus transform completed but reported ${validationErrors} schema validation error(s); some inquiries could not be served.`,
      syncExitCode: syncResult.exitCode,
      drainSummary,
      transformExitCode: transformResult.exitCode,
      transformOutput: transformResult.stdout,
    };
  }

  return {
    ok: true,
    reason: null,
    syncExitCode: syncResult.exitCode,
    drainSummary,
    transformExitCode: transformResult.exitCode,
    transformOutput: transformResult.stdout,
  };
}
