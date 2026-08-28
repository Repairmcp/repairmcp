/**
 * Capture one state's law corpus from its official publisher(s), via the
 * state's StateCaptureProfile. The state-generic successor to
 * capture-waleg.ts — the per-state fetch shapes (Washington's chapter pages,
 * Montana's two-tier MCA crawl + ARM API) live behind profile.captureAll.
 *
 * Usage:
 *   bun scripts/capture-state.ts --state wa --dry-run       # fetch + parse + report, no write
 *   bun scripts/capture-state.ts --state wa                 # write the corpus JSON
 *   bun scripts/capture-state.ts --state wa --save-raw <dir>
 *   bun scripts/capture-state.ts --state wa --from-dir <dir>
 *   bun scripts/capture-state.ts --state wa --only 284-30   # where the profile supports it
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { diffCorpus, makeCaptureIo } from '../packages/state-law/src/index.js';
import { STATE_PROFILES } from './state-registry.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.com)';

export async function runCapture(args: string[]): Promise<void> {
  const argValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const state = argValue('--state')?.toLowerCase();
  const profile = state ? STATE_PROFILES[state] : undefined;
  if (!profile) {
    throw new Error(
      `--state is required and must be one of: ${Object.keys(STATE_PROFILES).join(', ')}.`,
    );
  }
  const dryRun = args.includes('--dry-run');
  const fromDir = argValue('--from-dir');
  const saveDir = argValue('--save-raw');
  const only = argValue('--only');
  if (only && !profile.supportsOnly) {
    throw new Error(`--only is not supported for ${profile.displayName}.`);
  }

  const corpusPath = resolve(REPO_ROOT, profile.corpusPath);
  const previous = existsSync(corpusPath)
    ? profile.corpusFileSchema.parse(JSON.parse(readFileSync(corpusPath, 'utf8')))
    : undefined;

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
    ...(saveDir
      ? {
          saveRaw: (name: string, body: string) => {
            if (!existsSync(saveDir)) mkdirSync(saveDir, { recursive: true });
            writeFileSync(join(saveDir, name), body, 'utf8');
          },
        }
      : {}),
  });

  const outcome = await profile.captureAll(io, { previous, only });
  for (const warning of outcome.report.warnings) console.log(`  warning: ${warning}`);
  const file = profile.corpusFileSchema.parse(outcome.file);

  const domainCounts = new Map<string, number>();
  for (const s of file.sections) domainCounts.set(s.domain, (domainCounts.get(s.domain) ?? 0) + 1);
  console.log(`total sections: ${file.sections.length}`);
  for (const [domain, count] of [...domainCounts.entries()].sort()) {
    console.log(`  ${domain}: ${count}`);
  }
  const bytes = JSON.stringify(file).length;
  console.log(`serialized size: ${(bytes / 1024).toFixed(1)} KB`);

  if (previous && !only) {
    const diff = diffCorpus(previous.sections, file.sections);
    const changed = diff.changedText.length;
    console.log(
      `vs existing (captured ${previous.meta.capturedAt}): +${diff.added.length} [${diff.added.join(', ') || 'none'}], ` +
        `-${diff.removed.length} [${diff.removed.join(', ') || 'none'}], ${changed} with changed text`,
    );
    if (diff.removed.length > 0) {
      console.log('  REMOVALS ABOVE — verify against the live source before accepting this capture.');
    }
  } else if (!previous) {
    console.log('no existing corpus file — this would be the first capture.');
  }

  if (dryRun) {
    console.log('dry run — nothing written.');
    return;
  }

  const outDir = resolve(corpusPath, '..');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(corpusPath, `${JSON.stringify(file, null, 1)}\n`, 'utf8');
  console.log(`wrote ${corpusPath}`);
}

const isEntry = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntry) {
  runCapture(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
