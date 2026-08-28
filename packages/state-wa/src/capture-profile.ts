/**
 * Washington's StateCaptureProfile — the chapter-page pipeline behind the
 * generic capture/check scripts. NOT exported from the barrel: it is script
 * plumbing, and the scripts import it by path (the same way they import the
 * registry). Reproduces scripts/capture-waleg.ts's behavior exactly,
 * including the --only merge rule: understate, never overstate — a partial
 * re-capture keeps the OLD meta dates because the untouched chapters were
 * captured then.
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { assembleSections, chapterKey, groupByChapter } from './capture.js';
import { parseLegChapterHtml, type ParsedWaChapter } from './parse.js';
import { WaCorpusFileSchema, type WaSection } from './schema.js';
import { WA_CAPTURE_SOURCES, chapterUrl } from './sources.js';

const SOURCE_NOTE =
  "Captured from app.leg.wa.gov, the Washington State Legislature's publication of current law. " +
  'The site states no currency marker of its own, so currency is the capture date.';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function htmlFileName(code: string, chapter: string): string {
  return `${code.toLowerCase()}-${chapter.replace(/\./g, '_')}.html`;
}

export const WA_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'WA',
  displayName: 'Washington',
  corpusPath: 'packages/state-wa/data/wa-law-corpus.json',
  corpusFileSchema: WaCorpusFileSchema,
  attentionFileName: 'WA-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state wa      (re-captures every chapter)\n' +
    '  3. cd packages\\state-wa && bun test             (annotation + demo suites are the gate;\n' +
    '     a renumbered or reworded section fails here and needs a human eye)\n' +
    '  4. cd ..\\..\\apps\\state-wa-server && npx wrangler deploy\n' +
    '  5. curl -s https://wa.repairmcp.com/health       (confirm the new capture date)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: true,

  async captureAll(io: CaptureIo, opts = {}): Promise<CaptureOutcome> {
    let groups = groupByChapter(WA_CAPTURE_SOURCES);
    if (opts.only) {
      groups = groups.filter((g) => g.chapter === opts.only);
      if (groups.length === 0) {
        throw new Error(`--only ${opts.only} matches no manifest chapter.`);
      }
      if (!opts.previous) {
        throw new Error('--only needs an existing corpus file to merge over.');
      }
    }

    const parsedByChapter = new Map<string, ParsedWaChapter>();
    const skippedEmpty: string[] = [];
    const duplicates: string[] = [];
    const warnings: string[] = [];

    for (const group of groups) {
      const html = await io.fetchText(chapterUrl(group.code, group.chapter), {
        rawName: htmlFileName(group.code, group.chapter),
      });
      const parsed = parseLegChapterHtml(html, { code: group.code, chapter: group.chapter });
      parsedByChapter.set(chapterKey(group), parsed);

      const withDates = parsed.sections.filter((s) => s.effectiveDate).length;
      io.log(
        `  ${group.code} ${group.chapter}: ${parsed.sections.length} sections, ` +
          `${withDates} with effective dates`,
      );
      if (parsed.skippedEmpty.length > 0) {
        io.log(`    skipped empty part-heads: ${parsed.skippedEmpty.join(', ')}`);
      }
      if (parsed.duplicates.length > 0) {
        io.log(`    duplicate anchors (first kept): ${parsed.duplicates.join(', ')}`);
      }
      for (const warning of parsed.warnings) io.log(`    warning: ${warning}`);
      skippedEmpty.push(...parsed.skippedEmpty);
      duplicates.push(...parsed.duplicates);
      warnings.push(...parsed.warnings);
    }

    let sections: WaSection[] = assembleSections(parsedByChapter, groups);
    let meta = {
      state: 'WA' as const,
      capturedAt: today(),
      currentThrough: today(),
      sourceNote: SOURCE_NOTE,
      sourceUrl: 'https://app.leg.wa.gov',
    };

    if (opts.only && opts.previous) {
      const kept = (opts.previous.sections as WaSection[]).filter(
        (s) => s.chapter !== opts.only,
      );
      sections = [...kept, ...sections];
      meta = opts.previous.meta as typeof meta;
      io.log(
        `--only merge: kept ${kept.length} sections from other chapters; ` +
          `meta dates stay ${meta.capturedAt} (untouched chapters were captured then).`,
      );
    }

    return {
      file: { meta, sections },
      report: { fetches: groups.length, skippedEmpty, duplicates, warnings },
    };
  },
};
