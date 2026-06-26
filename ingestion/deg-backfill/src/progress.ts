export class ProgressTracker {
  private total: number;
  private processed = 0;
  private startMs: number;

  constructor(total: number) {
    this.total = total;
    this.startMs = Date.now();
  }

  record(outcome: 'ok' | 'error', reason?: string): void {
    this.processed++;
    if (outcome === 'error') {
      process.stderr.write(`  SKIP db_id: ${reason ?? 'unknown error'}\n`);
    }
  }

  print(dbId: number): void {
    const remaining = this.total - this.processed;
    const elapsedMs = Date.now() - this.startMs;
    const ratePerMs = this.processed > 0 ? this.processed / elapsedMs : 0;
    const etaMs = ratePerMs > 0 ? remaining / ratePerMs : 0;
    const etaMin = Math.round(etaMs / 60_000);
    process.stdout.write(
      `[${this.processed} processed / ${remaining} remaining] id=${dbId} ETA: ~${etaMin}min\n`,
    );
  }
}
