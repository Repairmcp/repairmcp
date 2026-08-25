import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { countByResolutionStatus } from './db.js';
import { getHighWaterInfo, getState, STATE_LAST_INDEX_SYNC } from './state.js';
import type { HighWater } from './state.js';

export const DEFAULT_LOG_DIR = 'C:\\degdata\\logs';
export const ATTENTION_FILENAME = 'ATTENTION-NEEDED.txt';
export const HEALTH_LOG_FILENAME = 'health.log';

export function attentionFlagPath(logDir: string): string {
  return join(logDir, ATTENTION_FILENAME);
}

export function healthLogPath(logDir: string): string {
  return join(logDir, HEALTH_LOG_FILENAME);
}

export function runLogPath(logDir: string, isoDate: string): string {
  return join(logDir, `sync-${isoDate}.log`);
}

function ensureLogDir(logDir: string): void {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
}

export interface HealthReport {
  corpusTotal: number;
  resolved: number;
  pending: number;
  lastSuccessfulSync: string | null;
  highWater: HighWater;
  attentionFlag: string | null;
}

/** Read-only. Never writes; callers decide whether to log or flag. */
export function buildHealthReport(db: Database, logDir: string): HealthReport {
  const counts = countByResolutionStatus(db);
  const lastSuccessfulSync = getState(db, STATE_LAST_INDEX_SYNC);
  const highWater = getHighWaterInfo(db);
  const flagPath = attentionFlagPath(logDir);
  const attentionFlag = existsSync(flagPath) ? readFileSync(flagPath, 'utf-8') : null;
  return {
    corpusTotal: counts.total,
    resolved: counts.resolved,
    pending: counts.pending,
    lastSuccessfulSync,
    highWater,
    attentionFlag,
  };
}

export function formatHealthReport(report: HealthReport): string {
  const lines: string[] = [];
  lines.push('=== DEG Sync Health ===');
  lines.push(`Corpus total           : ${report.corpusTotal}`);
  lines.push(`  resolved             : ${report.resolved}`);
  lines.push(`  pending              : ${report.pending}`);
  lines.push(`Last successful sync   : ${report.lastSuccessfulSync ?? 'never recorded'}`);
  lines.push(
    `Last db_id (high water): ${report.highWater.value}` +
      `${report.highWater.source === 'stored' ? ' (recorded)' : ' (NOT yet recorded, showing MAX(db_id))'}`,
  );
  lines.push(
    report.attentionFlag === null
      ? 'FAIL flag              : none'
      : `FAIL flag              : ATTENTION NEEDED\n${report.attentionFlag}`,
  );
  return lines.join('\n');
}

export interface HealthLogEntry {
  date: string;
  newCount: number;
  corpusTotal: number;
  errors: number;
  ok: boolean;
}

/** One CSV line per run: date, new inquiries added, corpus total, errors, OK/FAIL. */
export function appendHealthLogLine(logDir: string, entry: HealthLogEntry): void {
  ensureLogDir(logDir);
  const line = `${entry.date},${entry.newCount},${entry.corpusTotal},${entry.errors},${entry.ok ? 'OK' : 'FAIL'}\n`;
  appendFileSync(healthLogPath(logDir), line, 'utf-8');
}

export function writeAttentionFlag(logDir: string, reason: string): void {
  ensureLogDir(logDir);
  writeFileSync(attentionFlagPath(logDir), `${new Date().toISOString()}\n${reason}\n`, 'utf-8');
}

/** Auto-clears on the next clean run. A stale flag from a self-healed failure would mislead more than it helps. */
export function clearAttentionFlag(logDir: string): void {
  const flagPath = attentionFlagPath(logDir);
  if (existsSync(flagPath)) rmSync(flagPath, { force: true });
}
