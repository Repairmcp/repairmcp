import { describe, test, expect } from 'bun:test';
import { printDrainSummary, parseDrainSummary } from '../src/drain-summary.js';
import type { DrainSummary } from '../src/drain-summary.js';

const SUMMARY: DrainSummary = {
  ok: true,
  exitReason: 'completed',
  indexSynced: true,
  newCount: 2,
  written: 5,
  unchanged: 10,
  skipped: 1,
  queued: 0,
  sanityFailures: [],
};

describe('drain summary round trip', () => {
  test('parses the summary line back out of surrounding output', () => {
    const lines: string[] = [];
    lines.push('=== Plan ===');
    lines.push('Live index : 22665 unique db_ids, max 41800');
    printDrainSummary((s) => lines.push(s.trimEnd()), SUMMARY);
    const stdout = lines.join('\n');
    expect(parseDrainSummary(stdout)).toEqual(SUMMARY);
  });

  test('finds the last summary line when more than one is present', () => {
    const lines: string[] = [];
    printDrainSummary((s) => lines.push(s.trimEnd()), { ...SUMMARY, ok: false });
    printDrainSummary((s) => lines.push(s.trimEnd()), SUMMARY);
    expect(parseDrainSummary(lines.join('\n'))).toEqual(SUMMARY);
  });

  test('returns null when no summary line is present', () => {
    expect(parseDrainSummary('nothing here\nor here\n')).toBeNull();
  });

  test('returns null on a malformed summary line rather than throwing', () => {
    expect(parseDrainSummary('SYNC_DRAIN_SUMMARY_JSON:{not json')).toBeNull();
  });
});
