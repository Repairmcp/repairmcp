/**
 * Capture the Washington law corpus from app.leg.wa.gov into
 * packages/state-wa/data/wa-law-corpus.json.
 *
 * One polite request per chapter (~20 fetches, 2 s apart, RepairMCP-Bot UA);
 * two manifest entries sharing a chapter share one fetch. All capture goes
 * through CHAPTER pages — the single-section template has no anchors, so
 * "single section" and "part subset" are anchor filters over a chapter fetch
 * (see packages/state-wa/src/sources.ts, the capture manifest).
 *
 * leg.wa.gov states no site-level currency marker, so the corpus's honest
 * currency claim is the capture date: the legislature's site publishes current
 * law, and we captured it on `capturedAt`. Per-section effective dates come
 * from the bracketed history notes; a note that won't parse yields silence,
 * never a guess.
 *
 * leg.wa.gov/disclaimer: the Statute Law Committee claims copyright on the
 * codes and asks resellers to contact them; RepairMCP quotes law with
 * attribution and does not resell the code. No robots.txt exists (404).
 *
 * Usage:
 *   npx tsx scripts/capture-waleg.ts --dry-run                    # fetch + parse + report, no write
 *   npx tsx scripts/capture-waleg.ts                              # write the JSON
 *   npx tsx scripts/capture-waleg.ts --save-html <dir>            # also save raw pages for offline re-parse
 *   npx tsx scripts/capture-waleg.ts --from-dir <dir>             # re-parse saved pages, no network
 *   npx tsx scripts/capture-waleg.ts --only 284-30                # refetch one chapter, merge over existing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assembleSections,
  chapterKey,
  groupByChapter,
  type ChapterFetchGroup,
} from '../packages/state-wa/src/capture.js';
import { parseLegChapterHtml, type ParsedWaChapter } from '../packages/state-wa/src/parse.js';
import {
  WaCorpusFileSchema,
  type WaCorpusFile,
  type WaSection,
} from '../packages/state-wa/src/schema.js';
import { WA_CAPTURE_SOURCES, chapterUrl } from '../packages/state-wa/src/sources.js';

const OUT_PATH = resolve(import.meta.dirname, '../packages/state-wa/data/wa-law-corpus.json');
const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.com)';
const FETCH_DELAY_MS = 2000;
const SOURCE_NOTE =
  "Captured from app.leg.wa.gov, the Washington State Legislature's publication of current law. " +
  'The site states no currency marker of its own, so currency is the capture date.';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function htmlFileName(code: string, chapter: string): string {
  return `${code.toLowerCase()}-${chapter.replace(/\./g, '_')}.html`;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function loadChapterHtml(
  group: ChapterFetchGroup,
  opts: { fromDir?: string; saveDir?: string; isFirstFetch: boolean },
): Promise<string> {
  const fileName = htmlFileName(group.code, group.chapter);
  if (opts.fromDir) {
    const path = join(opts.fromDir, fileName);
    console.log(`reading ${path}`);
    return readFileSync(path, 'utf8');
  }
  if (!opts.isFirstFetch) await sleep(FETCH_DELAY_MS);
  const url = chapterUrl(group.code, group.chapter);
  console.log(`fetching ${url}`);
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
  if (!res.ok) {
    throw new Error(`leg.wa.gov responded ${res.status} for ${group.code} ${group.chapter} — not capturing.`);
  }
  const html = await res.text();
  if (opts.saveDir) {
    if (!existsSync(opts.saveDir)) mkdirSync(opts.saveDir, { recursive: true });
    writeFileSync(join(opts.saveDir, fileName), html, 'utf8');
  }
  return html;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const argValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const fromDir = argValue('--from-dir');
  const saveDir = argValue('--save-html');
  const only = argValue('--only');

  let groups = groupByChapter(WA_CAPTURE_SOURCES);
  if (only) {
    groups = groups.filter((g) => g.chapter === only);
    if (groups.length === 0) throw new Error(`--only ${only} matches no manifest chapter.`);
  }

  const parsedByChapter = new Map<string, ParsedWaChapter>();
  let isFirstFetch = true;

  for (const group of groups) {
    const html = await loadChapterHtml(group, { fromDir, saveDir, isFirstFetch });
    isFirstFetch = false;

    const parsed = parseLegChapterHtml(html, { code: group.code, chapter: group.chapter });
    parsedByChapter.set(chapterKey(group), parsed);
    const withDates = parsed.sections.filter((s) => s.effectiveDate).length;
    console.log(
      `  ${group.code} ${group.chapter}: ${parsed.sections.length} sections, ` +
        `${withDates} with effective dates`,
    );
    if (parsed.skippedEmpty.length > 0) {
      console.log(`    skipped empty part-heads: ${parsed.skippedEmpty.join(', ')}`);
    }
    if (parsed.duplicates.length > 0) {
      console.log(`    duplicate anchors (first kept): ${parsed.duplicates.join(', ')}`);
    }
    for (const warning of parsed.warnings) console.log(`    warning: ${warning}`);
  }

  let sections = assembleSections(parsedByChapter, groups);
  let meta: WaCorpusFile['meta'] = {
    state: 'WA',
    capturedAt: today(),
    currentThrough: today(),
    sourceNote: SOURCE_NOTE,
    sourceUrl: 'https://app.leg.wa.gov',
  };

  const previous = existsSync(OUT_PATH)
    ? (JSON.parse(readFileSync(OUT_PATH, 'utf8')) as WaCorpusFile)
    : undefined;

  if (only) {
    if (!previous) throw new Error('--only needs an existing corpus file to merge over.');
    const kept = previous.sections.filter((s) => s.chapter !== only);
    sections = [...kept, ...sections];
    // Understate, never overstate: the untouched chapters were captured on the
    // old date, so the merged file keeps the old currency claim.
    meta = previous.meta;
    console.log(
      `--only merge: kept ${kept.length} sections from other chapters; ` +
        `meta dates stay ${previous.meta.capturedAt} (untouched chapters were captured then).`,
    );
  }

  const file = WaCorpusFileSchema.parse({ meta, sections });

  const domainCounts = new Map<string, number>();
  for (const s of file.sections) domainCounts.set(s.domain, (domainCounts.get(s.domain) ?? 0) + 1);
  console.log(`total sections: ${file.sections.length}`);
  for (const [domain, count] of [...domainCounts.entries()].sort()) {
    console.log(`  ${domain}: ${count}`);
  }
  const bytes = JSON.stringify(file).length;
  console.log(`serialized size: ${(bytes / 1024).toFixed(1)} KB`);

  if (previous && !only) {
    const prevKeys = new Set(previous.sections.map((s) => `${s.code}:${s.cite}`));
    const nextKeys = new Set(file.sections.map((s) => `${s.code}:${s.cite}`));
    const added = [...nextKeys].filter((k) => !prevKeys.has(k));
    const removed = [...prevKeys].filter((k) => !nextKeys.has(k));
    const prevText = new Map(previous.sections.map((s) => [`${s.code}:${s.cite}`, s.text]));
    const changed = file.sections.filter(
      (s) => prevText.has(`${s.code}:${s.cite}`) && prevText.get(`${s.code}:${s.cite}`) !== s.text,
    ).length;
    console.log(
      `vs existing (captured ${previous.meta.capturedAt}): +${added.length} [${added.join(', ') || 'none'}], ` +
        `-${removed.length} [${removed.join(', ') || 'none'}], ${changed} with changed text`,
    );
    if (removed.length > 0) {
      console.log('  REMOVALS ABOVE — verify against the live site before accepting this capture.');
    }
  } else if (!previous) {
    console.log('no existing corpus file — this would be the first capture.');
  }

  if (dryRun) {
    console.log('dry run — nothing written.');
    return;
  }

  const outDir = resolve(OUT_PATH, '..');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(file, null, 1)}\n`, 'utf8');
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
