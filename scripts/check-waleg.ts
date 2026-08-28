/**
 * Unattended drift checker for the Washington law corpus — the WA analog of
 * the DEG weekly sync's monitoring half, minus any writing. It fetches every
 * manifest chapter from leg.wa.gov (politely, ~20 requests), parses and
 * assembles them exactly the way capture-waleg.ts would (same shared code, so
 * the two cannot disagree about what "changed" means), and diffs the result
 * against the corpus we actually serve.
 *
 * It never touches the corpus. Its whole job is to make forgetting
 * impossible: laws change on Olympia's schedule, not ours, and WAC rulemaking
 * runs year-round, so this runs every four weeks from Windows Task Scheduler
 * (task "RepairMCP WA Law Check") and leaves evidence a human will trip over.
 *
 * Outputs:
 *   C:\degdata\logs\wa-check.log       one CSV line per run
 *   C:\degdata\WA-LAW-ATTENTION.txt    written when drift or failure is found,
 *                                      deleted on a clean run (clean means the
 *                                      served corpus matches upstream again)
 *
 * Exit codes: 0 clean, 1 failure (fetch/parse/template drift), 2 drift found.
 *
 * Usage:
 *   bun scripts/check-waleg.ts                    # what the Scheduler runs
 *   bun scripts/check-waleg.ts --from-dir <dir>   # offline, against saved pages
 *   bun scripts/check-waleg.ts --out-dir <dir>    # redirect log + attention file
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assembleSections,
  chapterKey,
  diffCorpus,
  groupByChapter,
  isCleanDiff,
  type CorpusDiff,
} from '../packages/state-wa/src/capture.js';
import { parseLegChapterHtml, type ParsedWaChapter } from '../packages/state-wa/src/parse.js';
import { WaCorpusFileSchema } from '../packages/state-wa/src/schema.js';
import { WA_CAPTURE_SOURCES, chapterUrl } from '../packages/state-wa/src/sources.js';

const CORPUS_PATH = resolve(import.meta.dirname, '../packages/state-wa/data/wa-law-corpus.json');
const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.com)';
const FETCH_DELAY_MS = 2000;
const DEFAULT_OUT_DIR = 'C:\\degdata';
const ATTENTION_NAME = 'WA-LAW-ATTENTION.txt';
const LIST_CAP = 40;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function htmlFileName(code: string, chapter: string): string {
  return `${code.toLowerCase()}-${chapter.replace(/\./g, '_')}.html`;
}

function capped(list: readonly string[]): string {
  if (list.length === 0) return 'none';
  const head = list.slice(0, LIST_CAP).join(', ');
  return list.length > LIST_CAP ? `${head}, and ${list.length - LIST_CAP} more` : head;
}

interface Paths {
  logFile: string;
  attentionFile: string;
}

function outPaths(outDir: string): Paths {
  const logDir = join(outDir, 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  return {
    logFile: join(logDir, 'wa-check.log'),
    attentionFile: join(outDir, ATTENTION_NAME),
  };
}

function logLine(paths: Paths, status: string, diff: CorpusDiff | null, note: string): void {
  const line = [
    new Date().toISOString(),
    status,
    diff ? diff.added.length : '',
    diff ? diff.removed.length : '',
    diff ? diff.changedText.length : '',
    note.replaceAll(',', ';'),
  ].join(',');
  appendFileSync(paths.logFile, `${line}\n`, 'utf8');
}

function writeAttention(paths: Paths, body: string): void {
  writeFileSync(
    paths.attentionFile,
    `${body}\n\nTo refresh the corpus:\n` +
      `  1. cd C:\\dev\\repairmcp\n` +
      `  2. npx tsx scripts/capture-waleg.ts        (re-captures every chapter)\n` +
      `  3. cd packages\\state-wa && bun test        (annotation + demo suites are the gate;\n` +
      `     a renumbered or reworded section fails here and needs a human eye)\n` +
      `  4. cd ..\\..\\apps\\state-wa-server && npx wrangler deploy\n` +
      `  5. curl -s https://wa.repairmcp.com/health  (confirm the new capture date)\n` +
      `  6. commit the corpus + any annotation fixes\n` +
      `\nThis file is deleted automatically once a check finds the served corpus\n` +
      `matching leg.wa.gov again.\n`,
    'utf8',
  );
}

async function fetchChapter(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
  if (!res.ok) throw new Error(`leg.wa.gov responded ${res.status} for ${url}`);
  return await res.text();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const argValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const fromDir = argValue('--from-dir');
  const outDir = argValue('--out-dir') ?? DEFAULT_OUT_DIR;
  const paths = outPaths(outDir);

  try {
    const served = WaCorpusFileSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, 'utf8')));

    const groups = groupByChapter(WA_CAPTURE_SOURCES);
    const parsedByChapter = new Map<string, ParsedWaChapter>();
    let isFirstFetch = true;
    for (const group of groups) {
      let html: string;
      if (fromDir) {
        html = readFileSync(join(fromDir, htmlFileName(group.code, group.chapter)), 'utf8');
      } else {
        if (!isFirstFetch) await sleep(FETCH_DELAY_MS);
        html = await fetchChapter(chapterUrl(group.code, group.chapter));
      }
      isFirstFetch = false;
      parsedByChapter.set(
        chapterKey(group),
        parseLegChapterHtml(html, { code: group.code, chapter: group.chapter }),
      );
      console.log(`checked ${chapterKey(group)}`);
    }

    const upstream = assembleSections(parsedByChapter, groups);
    const diff = diffCorpus(served.sections, upstream);

    if (isCleanDiff(diff)) {
      console.log(
        `clean: ${upstream.length} sections upstream match the served corpus ` +
          `(captured ${served.meta.capturedAt}).`,
      );
      logLine(paths, 'OK', diff, `corpus ${served.meta.capturedAt} matches upstream`);
      if (existsSync(paths.attentionFile)) rmSync(paths.attentionFile);
      return;
    }

    const summary =
      `Washington law drift detected ${new Date().toISOString().slice(0, 10)} — ` +
      `leg.wa.gov no longer matches the corpus served at wa.repairmcp.com ` +
      `(captured ${served.meta.capturedAt}).\n\n` +
      `  added upstream:   ${capped(diff.added)}\n` +
      `  removed upstream: ${capped(diff.removed)}\n` +
      `  text changed:     ${capped(diff.changedText)}`;
    console.log(summary);
    writeAttention(paths, summary);
    logLine(paths, 'CHANGED', diff, 'drift found; see WA-LAW-ATTENTION.txt');
    process.exitCode = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check failed: ${message}`);
    writeAttention(paths, `Washington law check FAILED: ${message}\n\nA failure here usually means leg.wa.gov changed its page template (the parser's anchor cross-check trips on purpose) or the fetch was blocked. Run the check by hand to see it:\n  bun scripts/check-waleg.ts`);
    logLine(paths, 'FAIL', null, message);
    process.exitCode = 1;
  }
}

await main();
