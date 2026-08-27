import type { SpawnResult } from './weekly.js';

/**
 * Remote corpus push — the previously-manual steps 2–4 of "a corpus refresh
 * touches four places" (CLAUDE.md), run automatically after a clean weekly
 * sync so the served freshness statement ("current through …, synced …")
 * moves with every database update instead of drifting until someone
 * remembers:
 *
 *   1. regenerate migrations 0002/0005 from the served JSON (build-d1-sql.ts)
 *   2. re-import remote D1, 0001 → 0005 (documented idempotent: 0001 drops
 *      and recreates `inquiry`, 0003 rebuilds FTS from scratch)
 *   3. bump CORPUS_VERSION in apps/deg-server/wrangler.jsonc — the cache key —
 *      and deploy the Worker
 *   4. update the record count and "current through <Month Year>" line on the
 *      site, run the copy linter, and deploy the site
 *
 * Then read /health back over the wire and refuse to report OK unless the edge
 * states the exact records / syncedAt / currentThrough this push produced.
 *
 * The push runs even on a week with zero content changes: Tier-1 stamps
 * lastSeenAt on every listed record, so `syncedAt` (the "we checked as of"
 * date every tool description quotes) moves on every successful sync. Skipping
 * quiet weeks would leave the public server claiming a sync date weeks old.
 *
 * Every subprocess is injected so the orchestration is testable the same way
 * weekly.ts is. Nothing here is best-effort: any failed step returns ok:false
 * and the caller writes the attention flag, because a half-applied import
 * (0001 dropped the table, 0002 failed) leaves the public server broken until
 * someone looks.
 */

export interface BuildSqlSummary {
  records: number;
  currentThrough: string;
  syncedAt: string;
}

/** Parsed out of build-d1-sql.ts's own generation summary. */
export function parseBuildSqlSummary(stdout: string): BuildSqlSummary | null {
  const records = stdout.match(/^Records:\s+(\d+)\s*$/m)?.[1];
  const currentThrough = stdout.match(/^Corpus current through:\s+(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  const syncedAt = stdout.match(/^Corpus last synced:\s+(\d{4}-\d{2}-\d{2})/m)?.[1];
  if (records === undefined || currentThrough === undefined || syncedAt === undefined) return null;
  return { records: parseInt(records, 10), currentThrough, syncedAt };
}

const CORPUS_VERSION_RE = /("CORPUS_VERSION":\s*")([^"]*)(")/g;

/**
 * Rewrite the CORPUS_VERSION var in wrangler.jsonc. Throws unless the key
 * appears exactly once — zero means the config moved and this function is
 * silently editing nothing, two means it would edit something it does not
 * understand. Both deserve a loud stop, not a deploy.
 */
export function bumpCorpusVersion(jsonc: string, syncedAt: string): string {
  const matches = [...jsonc.matchAll(CORPUS_VERSION_RE)];
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one "CORPUS_VERSION" assignment in wrangler.jsonc, found ${matches.length}. ` +
        'The config shape changed; update bumpCorpusVersion in push-remote.ts to match.',
    );
  }
  return jsonc.replace(CORPUS_VERSION_RE, `$1${syncedAt}$3`);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** '2026-08-25' → 'August 2026'. Pure string math — no Date, no timezone. */
export function monthYearUtc(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  const year = m?.[1];
  const month = m?.[2];
  if (year === undefined || month === undefined) {
    throw new Error(`not an ISO date: ${isoDate}`);
  }
  const name = MONTHS[parseInt(month, 10) - 1];
  if (name === undefined) throw new Error(`not a month: ${isoDate}`);
  return `${name} ${year}`;
}

/**
 * The one exact-count + "current through" pair on the site, anchored to the
 * stat label's own copy so the regex cannot touch any other number on the
 * page. The rest of the site deliberately says "more than 22,000", which does
 * not go stale week to week.
 */
const SITE_FRESHNESS_RE =
  /(<p class="stat-n">)[\d,]+(<\/p>\s*<p class="stat-l">resolved and pending inquiries, current through )[A-Za-z]+ \d{4}(<\/p>)/g;

export function updateSiteFreshness(html: string, records: number, currentThrough: string): string {
  const matches = [...html.matchAll(SITE_FRESHNESS_RE)];
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one stat-grid freshness pair in index.html, found ${matches.length}. ` +
        'The stat copy changed; update SITE_FRESHNESS_RE in push-remote.ts to match it.',
    );
  }
  const n = records.toLocaleString('en-US');
  return html.replace(SITE_FRESHNESS_RE, `$1${n}$2${monthYearUtc(currentThrough)}$3`);
}

export interface HealthExpectation {
  records: number;
  syncedAt: string;
  currentThrough: string;
}

/** Empty array = the edge states exactly what this push produced. */
export function verifyHealthBody(body: string, expected: HealthExpectation): string[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return [`/health did not return JSON: ${body.slice(0, 200)}`];
  }
  const problems: string[] = [];
  if (parsed['ok'] !== true) problems.push(`ok=${String(parsed['ok'])}`);
  if (parsed['records'] !== expected.records) {
    problems.push(`records=${String(parsed['records'])}, expected ${expected.records}`);
  }
  if (parsed['corpusSyncedAt'] !== expected.syncedAt) {
    problems.push(`corpusSyncedAt=${String(parsed['corpusSyncedAt'])}, expected ${expected.syncedAt}`);
  }
  if (parsed['corpusCurrentThrough'] !== expected.currentThrough) {
    problems.push(
      `corpusCurrentThrough=${String(parsed['corpusCurrentThrough'])}, expected ${expected.currentThrough}`,
    );
  }
  if (parsed['corpusVersionStale'] !== false) {
    problems.push(`corpusVersionStale=${String(parsed['corpusVersionStale'])}, expected false`);
  }
  return problems;
}

/** Order matters and is the documented one: 0001 → 0005. */
export const MIGRATION_FILES = [
  '0001_schema.sql',
  '0002_data.sql',
  '0003_fts.sql',
  '0004_meta.sql',
  '0005_meta_data.sql',
] as const;

export interface PushRemoteDeps {
  runBuildSql: () => Promise<SpawnResult>;
  runD1Migration: (file: string) => Promise<SpawnResult>;
  runDeployWorker: () => Promise<SpawnResult>;
  runCopyLint: () => Promise<SpawnResult>;
  runDeploySite: () => Promise<SpawnResult>;
  /** Body text of GET https://deg.repairmcp.com/health. May throw on network error. */
  fetchHealth: () => Promise<string>;
  readFile: (path: string) => string;
  writeFile: (path: string, text: string) => void;
  wranglerJsoncPath: string;
  siteHtmlPath: string;
  log: (line: string) => void;
  /** Health readback retries — a deploy takes a few seconds to roll to the edge. */
  healthAttempts?: number;
  healthDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface PushRemoteResult {
  ok: boolean;
  reason: string | null;
  summary: BuildSqlSummary | null;
}

const PARTIAL_STATE_NOTE =
  'Remote D1 may be mid-import and the public server broken or stale until a successful ' +
  're-run. Re-run `bun run weekly` (or apply apps/deg-server/migrations 0001→0005 by hand) ' +
  'once the cause is fixed.';

function stderrSlice(r: SpawnResult): string {
  const text = r.stderr.trim() !== '' ? r.stderr : r.stdout;
  return text.slice(0, 500);
}

export async function pushRemote(deps: PushRemoteDeps): Promise<PushRemoteResult> {
  const {
    log,
    healthAttempts = 3,
    healthDelayMs = 8000,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  } = deps;
  const fail = (reason: string, summary: BuildSqlSummary | null = null): PushRemoteResult => ({
    ok: false,
    reason,
    summary,
  });

  log('Remote push: regenerating migrations 0002/0005 from the served JSON');
  const build = await deps.runBuildSql();
  if (build.exitCode !== 0) {
    return fail(`build-d1-sql.ts exited ${build.exitCode}: ${stderrSlice(build)}`);
  }
  const summary = parseBuildSqlSummary(build.stdout);
  if (summary === null) {
    return fail('build-d1-sql.ts exited 0 but its summary could not be parsed; refusing to push blind.');
  }
  log(
    `Remote push: corpus is ${summary.records} records, current through ${summary.currentThrough}, ` +
      `synced ${summary.syncedAt}`,
  );

  for (const file of MIGRATION_FILES) {
    log(`Remote push: applying ${file} to remote D1`);
    const applied = await deps.runD1Migration(file);
    if (applied.exitCode !== 0) {
      return fail(
        `wrangler d1 execute ${file} exited ${applied.exitCode}: ${stderrSlice(applied)}. ${PARTIAL_STATE_NOTE}`,
        summary,
      );
    }
  }

  try {
    const jsonc = deps.readFile(deps.wranglerJsoncPath);
    deps.writeFile(deps.wranglerJsoncPath, bumpCorpusVersion(jsonc, summary.syncedAt));
  } catch (e) {
    return fail(`could not bump CORPUS_VERSION: ${String(e)}. ${PARTIAL_STATE_NOTE}`, summary);
  }
  log(`Remote push: CORPUS_VERSION -> ${summary.syncedAt}, deploying Worker`);
  const workerDeploy = await deps.runDeployWorker();
  if (workerDeploy.exitCode !== 0) {
    return fail(
      `wrangler deploy (deg-server) exited ${workerDeploy.exitCode}: ${stderrSlice(workerDeploy)}. ${PARTIAL_STATE_NOTE}`,
      summary,
    );
  }

  const expectation: HealthExpectation = {
    records: summary.records,
    syncedAt: summary.syncedAt,
    currentThrough: summary.currentThrough,
  };
  let problems: string[] = ['never checked'];
  for (let attempt = 1; attempt <= healthAttempts; attempt++) {
    if (attempt > 1) await sleep(healthDelayMs);
    try {
      problems = verifyHealthBody(await deps.fetchHealth(), expectation);
    } catch (e) {
      problems = [`/health unreachable: ${String(e)}`];
    }
    if (problems.length === 0) break;
    log(`Remote push: health readback attempt ${attempt}/${healthAttempts}: ${problems.join('; ')}`);
  }
  if (problems.length !== 0) {
    return fail(
      `deployed, but /health does not state what this push produced: ${problems.join('; ')}`,
      summary,
    );
  }
  log('Remote push: /health confirms the new corpus on the wire');

  try {
    const html = deps.readFile(deps.siteHtmlPath);
    deps.writeFile(
      deps.siteHtmlPath,
      updateSiteFreshness(html, summary.records, summary.currentThrough),
    );
  } catch (e) {
    return fail(`could not update the site's record count: ${String(e)}`, summary);
  }
  const lint = await deps.runCopyLint();
  if (lint.exitCode !== 0) {
    return fail(
      `site copy linter failed after the count update (exit ${lint.exitCode}): ${stderrSlice(lint)}`,
      summary,
    );
  }
  log('Remote push: site count updated and linted, deploying site');
  const siteDeploy = await deps.runDeploySite();
  if (siteDeploy.exitCode !== 0) {
    return fail(
      `wrangler deploy (site) exited ${siteDeploy.exitCode}: ${stderrSlice(siteDeploy)}`,
      summary,
    );
  }

  return { ok: true, reason: null, summary };
}
