import { describe, test, expect } from 'bun:test';
import { runWeekly } from '../src/weekly.js';
import { printDrainSummary } from '../src/drain-summary.js';
import type { DrainSummary } from '../src/drain-summary.js';

function stdoutWithSummary(summary: DrainSummary): string {
  const lines: string[] = [];
  printDrainSummary((s) => lines.push(s.trimEnd()), summary);
  return lines.join('\n');
}

const COMPLETED: DrainSummary = {
  ok: true,
  exitReason: 'completed',
  indexSynced: true,
  newCount: 2,
  written: 5,
  unchanged: 90,
  skipped: 1,
  queued: 0,
  sanityFailures: [],
};

describe('runWeekly', () => {
  test('succeeds end to end when sync drains cleanly and transform succeeds', async () => {
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(COMPLETED), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: 'Wrote 22665 inquiries', stderr: '' }),
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.drainSummary).toEqual(COMPLETED);
  });

  test('fails with the sanity reason when the index looked truncated', async () => {
    const summary: DrainSummary = {
      ...COMPLETED,
      ok: false,
      exitReason: 'sanity-failed',
      sanityFailures: ['index looks truncated'],
    };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 3, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('index looks truncated');
  });

  test('fails when the circuit breaker tripped', async () => {
    const summary: DrainSummary = { ...COMPLETED, ok: false, exitReason: 'breaker-tripped' };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 2, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('unhealthy');
  });

  test('fails when the drain cap was hit', async () => {
    const summary: DrainSummary = { ...COMPLETED, ok: false, exitReason: 'drain-cap-hit' };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 4, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('drain');
  });

  test('fails when the sync process exits nonzero with no parseable summary', async () => {
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 1, stdout: 'no summary here', stderr: 'boom' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('boom');
  });

  test('fails when the error rate exceeds 20 percent', async () => {
    // 6/26 ~= 23.1%, and 26 attempted clears the 25-sample floor.
    const summary: DrainSummary = { ...COMPLETED, written: 20, unchanged: 0, skipped: 6 };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('20%');
  });

  test('does not run the transform when the error rate is too high', async () => {
    const summary: DrainSummary = { ...COMPLETED, written: 0, unchanged: 0, skipped: 30 };
    let transformCalled = false;
    await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => {
        transformCalled = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(transformCalled).toBe(false);
  });

  test('fails without running the transform when the index was never re-synced (auto-resumed drain)', async () => {
    const summary: DrainSummary = { ...COMPLETED, indexSynced: false };
    let transformCalled = false;
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => {
        transformCalled = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('re-syncing');
    expect(transformCalled).toBe(false);
  });

  test('a small sample does not trip the error-rate gate even at a high nominal rate', async () => {
    const summary: DrainSummary = { ...COMPLETED, written: 1, unchanged: 0, skipped: 1 };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(true);
  });

  test('exactly 20 percent error rate passes (strict greater-than)', async () => {
    const summary: DrainSummary = { ...COMPLETED, written: 80, unchanged: 0, skipped: 20 };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(true);
  });

  test('fails when the transform reports schema validation errors despite exiting 0', async () => {
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(COMPLETED), stderr: '' }),
      runTransform: async () => ({
        exitCode: 0,
        stdout: 'Total raw rows: 100\nSchema validation errors: 3\nSuccessfully transformed: 97',
        stderr: '',
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('3');
  });

  test('fails when the transform itself fails', async () => {
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(COMPLETED), stderr: '' }),
      runTransform: async () => ({ exitCode: 1, stdout: '', stderr: 'schema validation errors' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('schema validation errors');
  });

  test('a zero-attempt run (nothing queued) does not divide by zero on error rate', async () => {
    const summary: DrainSummary = { ...COMPLETED, written: 0, unchanged: 0, skipped: 0 };
    const result = await runWeekly({
      runSync: async () => ({ exitCode: 0, stdout: stdoutWithSummary(summary), stderr: '' }),
      runTransform: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    expect(result.ok).toBe(true);
  });
});
