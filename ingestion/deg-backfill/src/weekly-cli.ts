import { openDb } from './db.js';
import {
  buildHealthReport,
  appendHealthLogLine,
  writeAttentionFlag,
  clearAttentionFlag,
  runLogPath,
  DEFAULT_LOG_DIR,
} from './health.js';
import { runWeekly } from './weekly.js';
import type { SpawnResult } from './weekly.js';
import { pushRemote } from './push-remote.js';
import type { PushRemoteResult } from './push-remote.js';
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(PACKAGE_DIR, '..', '..');
const DEG_SERVER_DIR = join(REPO_ROOT, 'apps', 'deg-server');
const SITE_DIR = join(REPO_ROOT, 'apps', 'site');
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/**
 * scripts/transform-deg-sqlite.ts hardcodes this path; it has no --db flag.
 * If --db points somewhere else, the weekly job would sync one database and
 * serve another under a single "OK" result — refuse rather than do that.
 */
const TRANSFORM_DB_PATH = 'C:\\degdata\\deg.sqlite';

function flagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx === -1 ? undefined : argv[idx + 1];
}

async function spawnCapture(cmd: string[], cwd: string): Promise<SpawnResult> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/** Task Scheduler runs unattended at 3am with no logged-in session, so this often shows nothing; the durable signal is the flag file and health.log. */
async function notifyToastBestEffort(title: string, message: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$notify = New-Object System.Windows.Forms.NotifyIcon',
    '$notify.Icon = [System.Drawing.SystemIcons]::Warning',
    '$notify.Visible = $true',
    '$notify.ShowBalloonTip(10000, $env:TOAST_TITLE, $env:TOAST_MESSAGE, [System.Windows.Forms.ToolTipIcon]::Error)',
    'Start-Sleep -Seconds 4',
    '$notify.Dispose()',
  ].join('; ');
  try {
    const proc = Bun.spawn(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], {
      stdout: 'ignore',
      stderr: 'ignore',
      env: { ...process.env, TOAST_TITLE: title, TOAST_MESSAGE: message },
    });
    // The child is killed when this process calls process.exit, so main()
    // must await this before exiting or the toast never actually shows.
    await proc.exited;
  } catch {
    /* best effort only */
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dbPath = flagValue(argv, '--db') ?? process.env['DEG_DB_PATH'];
  const logDir = flagValue(argv, '--log-dir') ?? DEFAULT_LOG_DIR;
  // The remote push (D1 + Worker + site) runs by default so the public
  // server's stated cutoff moves with every database update. --no-push
  // restores the old local-only behaviour and prints the manual checklist.
  const noPush = argv.includes('--no-push');

  if (dbPath === undefined || dbPath === '') {
    process.stderr.write('Fatal: --db is required (or set DEG_DB_PATH).\n');
    process.exit(1);
  }

  if (resolve(dbPath) !== resolve(TRANSFORM_DB_PATH)) {
    process.stderr.write(
      `Fatal: --db "${dbPath}" does not match the corpus transform's fixed path ` +
        `(${TRANSFORM_DB_PATH}). scripts/transform-deg-sqlite.ts has no --db flag and always reads ` +
        'from that path, so a mismatch would sync one database and serve another under a single ' +
        `result. Pass --db "${TRANSFORM_DB_PATH}", or give the transform a --db flag first.\n`,
    );
    process.exit(1);
  }

  const runDate = new Date().toISOString().slice(0, 10);
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const runLog: string[] = [];
  const log = (line: string): void => {
    runLog.push(line);
    process.stdout.write(line + '\n');
  };

  log(`=== Weekly DEG sync, ${new Date().toISOString()} ===`);
  log(`Database: ${dbPath}`);

  const result = await runWeekly({
    // refresh-window 0 disables the 1000-item trailing sweep sync-cli.ts
    // otherwise defaults to. That sweep exists to catch silent content edits
    // with no status/resolution_date change, but running it every week forever
    // would be ~1000 fetches (~33 min) regardless of what actually changed,
    // which is not "tens per week, minutes of runtime." New, index-diff-changed,
    // unresolved, resolved-blank, and suspected-dead cohorts are unaffected.
    // A manual `bun run sync` catch-up (default window) is still the way to
    // periodically catch that narrower class of silent edit.
    // process.execPath is this already-running bun's own absolute path, so the
    // inner spawn never has to re-resolve 'bun' on PATH (Bun.spawn's handling
    // of bare command names against Windows .cmd shims is inconsistent).
    // --mode nightly distinguishes scheduled runs from manual ones in sync_run,
    // the table CLAUDE.md names as the place to look for what a run actually did.
    runSync: () =>
      spawnCapture(
        [
          process.execPath,
          'run',
          'sync',
          '--db',
          dbPath,
          '--drain',
          '--refresh-window',
          '0',
          '--mode',
          'nightly',
        ],
        PACKAGE_DIR,
      ),
    // npx has no equivalent "current process" shortcut, so the platform check
    // stays here. Only the npx invocation itself needs .cmd on Windows; 'tsx'
    // is a package name npx resolves internally, not a PATH lookup.
    runTransform: () =>
      spawnCapture(
        [process.platform === 'win32' ? 'npx.cmd' : 'npx', 'tsx', 'scripts/transform-deg-sqlite.ts'],
        REPO_ROOT,
      ),
  });

  log(result.ok ? 'Result: OK' : `Result: FAIL. ${result.reason}`);
  if (result.drainSummary !== null) {
    log(
      `Sync    : new=${result.drainSummary.newCount} written=${result.drainSummary.written} ` +
        `unchanged=${result.drainSummary.unchanged} skipped=${result.drainSummary.skipped}`,
    );
  }
  if (result.transformOutput !== null) log(`Transform:\n${result.transformOutput}`);

  const corpusGrew = (result.drainSummary?.newCount ?? 0) > 0 || (result.drainSummary?.written ?? 0) > 0;
  let pushResult: PushRemoteResult | null = null;
  if (result.ok && noPush) {
    if (corpusGrew) {
      log(
        'NEXT (manual): the local served JSON changed and --no-push skipped the remote push. ' +
          'Regenerate migrations 0002/0005, bump CORPUS_VERSION in apps/deg-server/wrangler.jsonc, ' +
          'and update the record count in apps/site/public/index.html when convenient. See ' +
          'CLAUDE.md, "A corpus refresh touches four places, not one."',
      );
    }
  } else if (result.ok) {
    pushResult = await pushRemote({
      runBuildSql: () => spawnCapture([NPX, 'tsx', 'scripts/build-d1-sql.ts'], REPO_ROOT),
      runD1Migration: (file) =>
        spawnCapture(
          [NPX, 'wrangler', 'd1', 'execute', 'repairmcp-deg', '--remote', '-y', `--file=migrations/${file}`],
          DEG_SERVER_DIR,
        ),
      runDeployWorker: () => spawnCapture([NPX, 'wrangler', 'deploy'], DEG_SERVER_DIR),
      runCopyLint: () => spawnCapture([process.execPath, 'run', 'test'], SITE_DIR),
      runDeploySite: () => spawnCapture([NPX, 'wrangler', 'deploy'], SITE_DIR),
      fetchHealth: async () => {
        const res = await fetch('https://deg.repairmcp.com/health');
        return res.text();
      },
      readFile: (p) => readFileSync(p, 'utf-8'),
      writeFile: (p, t) => writeFileSync(p, t, 'utf-8'),
      wranglerJsoncPath: join(DEG_SERVER_DIR, 'wrangler.jsonc'),
      siteHtmlPath: join(SITE_DIR, 'public', 'index.html'),
      log,
    });
    if (pushResult.ok && pushResult.summary !== null) {
      log(
        `Remote push OK: D1, the Worker, and the site now serve ${pushResult.summary.records} ` +
          `records (current through ${pushResult.summary.currentThrough}, synced ${pushResult.summary.syncedAt}).`,
      );
      log(
        'NOTE: apps/deg-server/wrangler.jsonc and apps/site/public/index.html were updated in the ' +
          'working tree by this push; commit them when convenient.',
      );
    } else {
      log(`Remote push FAILED: ${pushResult.reason ?? 'unknown'}`);
    }
  }

  let corpusTotal = 0;
  let healthReadError: string | null = null;
  try {
    const db = openDb(dbPath);
    corpusTotal = buildHealthReport(db, logDir).corpusTotal;
    db.close();
  } catch (e) {
    healthReadError = `could not read corpus for health report: ${String(e)}`;
    log(healthReadError);
  }

  const pushOk = pushResult === null || pushResult.ok;
  const overallOk = result.ok && healthReadError === null && pushOk;
  const reason =
    result.reason ??
    (pushOk ? null : `Remote push failed: ${pushResult?.reason ?? 'unknown'}`) ??
    healthReadError ??
    'unknown failure';

  appendFileSync(runLogPath(logDir, runDate), runLog.join('\n') + '\n', 'utf-8');

  appendHealthLogLine(logDir, {
    date: runDate,
    newCount: result.drainSummary?.newCount ?? 0,
    corpusTotal,
    errors: result.drainSummary?.skipped ?? 0,
    ok: overallOk,
  });

  if (overallOk) {
    clearAttentionFlag(logDir);
  } else {
    writeAttentionFlag(logDir, reason);
    await notifyToastBestEffort('DEG Sync FAILED', reason);
  }

  process.exit(overallOk ? 0 : 1);
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
