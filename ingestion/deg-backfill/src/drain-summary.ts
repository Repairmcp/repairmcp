export const SUMMARY_MARKER = 'SYNC_DRAIN_SUMMARY_JSON:';

export type DrainExitReason = 'completed' | 'sanity-failed' | 'breaker-tripped' | 'drain-cap-hit';

export interface DrainSummary {
  ok: boolean;
  exitReason: DrainExitReason;
  indexSynced: boolean;
  newCount: number;
  written: number;
  unchanged: number;
  skipped: number;
  queued: number;
  sanityFailures: string[];
}

/** The last line of --drain output. Everything above it is for a human; this is for weekly-cli.ts. */
export function printDrainSummary(out: (s: string) => void, summary: DrainSummary): void {
  out(`${SUMMARY_MARKER}${JSON.stringify(summary)}\n`);
}

export function parseDrainSummary(stdout: string): DrainSummary | null {
  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line !== undefined && line.startsWith(SUMMARY_MARKER)) {
      try {
        return JSON.parse(line.slice(SUMMARY_MARKER.length)) as DrainSummary;
      } catch {
        return null;
      }
    }
  }
  return null;
}
