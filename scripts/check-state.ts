/**
 * The multi-state drift checker — the generic successor to check-waleg.ts,
 * run every four weeks by the Windows Scheduled Task "RepairMCP State Law
 * Check". With no --state flag it checks EVERY registered state, each in its
 * own try/catch: one state's parse failure must not hide another state's
 * drift.
 *
 * Per state: read the served corpus → captureAll (live fetches; a profile
 * may use stored hashes to skip unchanged documents) → diff → one CSV line
 * in C:\degdata\logs\state-law-check.log (ISO,STATE,STATUS,added,removed,
 * changed,note). Drift or failure writes C:\degdata\<ST>-LAW-ATTENTION.txt
 * with the state's refresh checklist; a clean run deletes only that state's
 * flag (clean means the served corpus matches upstream again).
 *
 * Exit codes: 1 if any state FAILED, else 2 if any state CHANGED, else 0.
 * The refresh stays a human action on purpose: changed law can renumber
 * annotated sections or shift demo rankings, and the per-state test suites
 * are the gate that needs eyes.
 *
 * Usage:
 *   bun scripts/check-state.ts                    # what the Scheduler runs (all states)
 *   bun scripts/check-state.ts --state wa
 *   bun scripts/check-state.ts --from-dir <dir> --out-dir <dir>
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  diffCorpus,
  isCleanDiff,
  makeCaptureIo,
  type CorpusDiff,
  type StateCaptureProfile,
} from '../packages/state-law/src/index.js';
import { STATE_PROFILES } from './state-registry.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.com)';
const DEFAULT_OUT_DIR = 'C:\\degdata';
const LIST_CAP = 40;

function capped(list: readonly string[]): string {
  if (list.length === 0) return 'none';
  const head = list.slice(0, LIST_CAP).join(', ');
  return list.length > LIST_CAP ? `${head}, and ${list.length - LIST_CAP} more` : head;
}

interface Paths {
  logFile: string;
  attentionFile: (profile: StateCaptureProfile) => string;
}

function outPaths(outDir: string): Paths {
  const logDir = join(outDir, 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  return {
    logFile: join(logDir, 'state-law-check.log'),
    attentionFile: (profile) => join(outDir, profile.attentionFileName),
  };
}

function logLine(
  paths: Paths,
  state: string,
  status: string,
  diff: CorpusDiff | null,
  note: string,
): void {
  const line = [
    new Date().toISOString(),
    state,
    status,
    diff ? diff.added.length : '',
    diff ? diff.removed.length : '',
    diff ? diff.changedText.length : '',
    note.replaceAll(',', ';'),
  ].join(',');
  appendFileSync(paths.logFile, `${line}\n`, 'utf8');
}

function writeAttention(paths: Paths, profile: StateCaptureProfile, body: string): void {
  writeFileSync(
    paths.attentionFile(profile),
    `${body}\n\nTo refresh the corpus:\n${profile.refreshChecklist}\n` +
      `\nThis file is deleted automatically once a check finds the served corpus\n` +
      `matching the official source again.\n`,
    'utf8',
  );
}

type StateStatus = 'OK' | 'CHANGED' | 'FAIL';

async function checkOne(
  profile: StateCaptureProfile,
  paths: Paths,
  fromDir: string | undefined,
): Promise<StateStatus> {
  try {
    const corpusPath = resolve(REPO_ROOT, profile.corpusPath);
    const served = profile.corpusFileSchema.parse(JSON.parse(readFileSync(corpusPath, 'utf8')));

    const io = makeCaptureIo({
      userAgent: USER_AGENT,
      ...(fromDir
        ? {
            readRaw: (name: string) => {
              const path = join(fromDir, name);
              return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
            },
          }
        : {}),
      log: (line: string) => console.log(`[${profile.state}] ${line}`),
    });

    const outcome = await profile.captureAll(io, { previous: served });
    const diff = diffCorpus(served.sections, outcome.file.sections);

    if (isCleanDiff(diff)) {
      console.log(
        `[${profile.state}] clean: ${outcome.file.sections.length} sections upstream match ` +
          `the served corpus (captured ${served.meta.capturedAt}).`,
      );
      logLine(paths, profile.state, 'OK', diff, `corpus ${served.meta.capturedAt} matches upstream`);
      if (existsSync(paths.attentionFile(profile))) rmSync(paths.attentionFile(profile));
      return 'OK';
    }

    const summary =
      `${profile.displayName} law drift detected ${new Date().toISOString().slice(0, 10)} — ` +
      `the official source no longer matches the served corpus ` +
      `(captured ${served.meta.capturedAt}).\n\n` +
      `  added upstream:   ${capped(diff.added)}\n` +
      `  removed upstream: ${capped(diff.removed)}\n` +
      `  text changed:     ${capped(diff.changedText)}`;
    console.log(summary);
    writeAttention(paths, profile, summary);
    logLine(paths, profile.state, 'CHANGED', diff, `drift found; see ${profile.attentionFileName}`);
    return 'CHANGED';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${profile.state}] check failed: ${message}`);
    writeAttention(
      paths,
      profile,
      `${profile.displayName} law check FAILED: ${message}\n\nA failure here usually means the ` +
        `source changed its page or API shape (the capture tripwires throw on purpose) or the ` +
        `fetch was blocked. Run the check by hand to see it:\n  bun scripts/check-state.ts --state ${profile.state.toLowerCase()}`,
    );
    logLine(paths, profile.state, 'FAIL', null, message);
    return 'FAIL';
  }
}

export async function runCheck(args: string[]): Promise<void> {
  const argValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const stateFlag = argValue('--state')?.toLowerCase();
  const fromDir = argValue('--from-dir');
  const outDir = argValue('--out-dir') ?? DEFAULT_OUT_DIR;
  const paths = outPaths(outDir);

  const profiles = stateFlag
    ? [STATE_PROFILES[stateFlag] ?? null]
    : Object.values(STATE_PROFILES);
  if (profiles.some((p) => p === null)) {
    throw new Error(`Unknown --state; registered: ${Object.keys(STATE_PROFILES).join(', ')}.`);
  }

  const statuses: StateStatus[] = [];
  for (const profile of profiles as StateCaptureProfile[]) {
    statuses.push(await checkOne(profile, paths, fromDir));
  }

  if (statuses.includes('FAIL')) process.exitCode = 1;
  else if (statuses.includes('CHANGED')) process.exitCode = 2;
}

const isEntry = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntry) {
  runCheck(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
