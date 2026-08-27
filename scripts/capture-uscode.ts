/**
 * Capture 49 U.S.C. Chapter 301 (Motor Vehicle Safety) from the OLRC
 * (uscode.house.gov) into packages/nhtsa/data/uscode-title49-ch301.json.
 *
 * One polite request; the OLRC chapter view returns the whole chapter in a
 * single document. Re-run manually when the law changes — the corpus states
 * its own currency (OLRC's `currentthrough` marker), and the capture
 * hard-fails if that marker is missing rather than writing a corpus that
 * cannot say how current it is.
 *
 * Usage:
 *   npx tsx scripts/capture-uscode.ts --dry-run          # fetch + parse + report, no write
 *   npx tsx scripts/capture-uscode.ts                    # write the JSON
 *   npx tsx scripts/capture-uscode.ts --from-file p.html # parse a saved copy
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseChapterHtml } from '../packages/nhtsa/src/laws/parse.js';
import { NhtsaLawCorpusFileSchema } from '../packages/nhtsa/src/laws/schema.js';

const CHAPTER_URL =
  'https://uscode.house.gov/view.xhtml?path=/prelim@title49/subtitle6/partA/chapter301&edition=prelim';
const OUT_PATH = resolve(import.meta.dirname, '../packages/nhtsa/data/uscode-title49-ch301.json');
const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.com)';

async function loadHtml(fromFile: string | undefined): Promise<string> {
  if (fromFile) {
    console.log(`reading ${fromFile}`);
    return readFileSync(fromFile, 'utf8');
  }
  console.log(`fetching ${CHAPTER_URL}`);
  const res = await fetch(CHAPTER_URL, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
  });
  if (!res.ok) {
    throw new Error(`OLRC responded ${res.status} — not capturing.`);
  }
  return await res.text();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fromFileIdx = args.indexOf('--from-file');
  const fromFile = fromFileIdx >= 0 ? args[fromFileIdx + 1] : undefined;

  const html = await loadHtml(fromFile);
  const parsed = parseChapterHtml(html);

  const file = NhtsaLawCorpusFileSchema.parse({
    meta: {
      title: 49,
      chapter: 301,
      chapterName: parsed.chapterName,
      currentThrough: parsed.currentThrough,
      publicLaw: parsed.publicLaw,
      capturedAt: today(),
      sourceUrl: CHAPTER_URL,
    },
    sections: parsed.sections,
  });

  console.log(`chapter: ${file.meta.chapterName}`);
  console.log(`current through: ${file.meta.currentThrough} (${file.meta.publicLaw})`);
  console.log(`sections with statute text: ${file.sections.length}`);
  const bytes = JSON.stringify(file).length;
  console.log(`serialized size: ${(bytes / 1024).toFixed(1)} KB`);

  if (existsSync(OUT_PATH)) {
    const prev = JSON.parse(readFileSync(OUT_PATH, 'utf8')) as {
      meta?: { currentThrough?: string };
      sections?: { section: string }[];
    };
    const prevSections = new Set((prev.sections ?? []).map((s) => s.section));
    const nextSections = new Set(file.sections.map((s) => s.section));
    const added = [...nextSections].filter((s) => !prevSections.has(s));
    const removed = [...prevSections].filter((s) => !nextSections.has(s));
    console.log(
      `vs existing (current through ${prev.meta?.currentThrough ?? 'unknown'}): ` +
        `+${added.length} sections [${added.join(', ') || 'none'}], ` +
        `-${removed.length} [${removed.join(', ') || 'none'}]`,
    );
  } else {
    console.log('no existing corpus file — this would be the first capture.');
  }

  if (dryRun) {
    console.log('dry run — nothing written.');
    return;
  }

  writeFileSync(OUT_PATH, `${JSON.stringify(file, null, 1)}\n`, 'utf8');
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
