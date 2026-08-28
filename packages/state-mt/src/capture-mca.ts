/**
 * The MCA capture pipeline: two-tier, index-then-detail. Every manifest
 * entry fetches its part's sections_index.html, resolves cites to slot URLs,
 * and fetches each live section page. Tripwires: a named cite absent from
 * the index (or present but reserved/repealed) hard-fails; every page must
 * state its own cite (the slot-URL race guard) and the edition marker; all
 * pages must agree on ONE edition.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseMcaIndexPage, parseMcaSectionPage } from './parse-mca.js';
import type { MtSection } from './schema.js';
import { mcaPartIndexUrl, mcaSectionUrl, type McaCaptureSource } from './sources-mca.js';

export interface McaCaptureResult {
  sections: MtSection[];
  edition: string;
  report: { skippedEmpty: string[]; warnings: string[] };
}

export async function captureMca(
  io: CaptureIo,
  sources: readonly McaCaptureSource[],
): Promise<McaCaptureResult> {
  const sections: MtSection[] = [];
  const skippedEmpty: string[] = [];
  const warnings: string[] = [];
  let edition: string | undefined;

  for (const source of sources) {
    const indexHtml = await io.fetchText(mcaPartIndexUrl(source), {
      rawName: `mca-${source.chapterKey}-p${source.part}-index.html`,
    });
    const index = parseMcaIndexPage(indexHtml);

    let wanted: typeof index.entries;
    if (source.filter.kind === 'part') {
      wanted = index.entries;
      if (index.skipped.length > 0) {
        io.log(
          `  MCA ${source.chapterKey} part ${source.part}: skipping dead slots ${index.skipped.join(', ')}`,
        );
        skippedEmpty.push(...index.skipped);
      }
    } else {
      wanted = source.filter.cites.map((cite) => {
        const entry = index.entries.find((e) => e.cite === cite);
        if (!entry) {
          const dead = index.skipped.includes(cite);
          throw new Error(
            `MCA ${cite} was requested by name but is ${dead ? 'reserved/repealed' : 'absent'} ` +
              `in the ${source.chapterKey} part ${source.part} index.`,
          );
        }
        return entry;
      });
    }

    for (const entry of wanted) {
      const pageUrl = mcaSectionUrl(source, entry.href);
      const pageHtml = await io.fetchText(pageUrl, { rawName: `mca-${entry.cite}.html` });
      const parsed = parseMcaSectionPage(pageHtml, { expectedCite: entry.cite });

      if (edition === undefined) edition = parsed.edition;
      else if (parsed.edition !== edition) {
        throw new Error(
          `MCA edition mismatch: ${entry.cite} states "${parsed.edition}" but earlier pages ` +
            `stated "${edition}" — a mid-capture edition rollover; re-run the capture.`,
        );
      }

      if (parsed.repealed) {
        if (source.filter.kind === 'sections') {
          throw new Error(`MCA ${entry.cite} was requested by name but its page reads Repealed.`);
        }
        warnings.push(`${entry.cite}: index lists it live but the page reads Repealed — skipped.`);
        skippedEmpty.push(entry.cite);
        continue;
      }

      if (
        parsed.pageChapterTitle &&
        parsed.pageChapterTitle.toLowerCase() !== source.chapterTitle.toLowerCase()
      ) {
        warnings.push(
          `${entry.cite}: page chapter title "${parsed.pageChapterTitle}" differs from config ` +
            `"${source.chapterTitle}" — eyeball and align the manifest.`,
        );
      }

      sections.push({
        cite: parsed.cite,
        code: 'MCA',
        chapter: source.chapterKey,
        chapterTitle: source.chapterTitle,
        heading: parsed.heading,
        text: parsed.text,
        // MCA never states per-section effective dates — history lines carry
        // session laws. Silence over a guess; currency is the edition.
        ...(parsed.historyNote ? { historyNote: parsed.historyNote } : {}),
        domain: source.domain,
        sourceUrl: pageUrl,
      });
    }
  }

  if (!edition || sections.length === 0) {
    throw new Error('MCA capture produced no sections — refusing to write an empty corpus.');
  }

  return { sections, edition, report: { skippedEmpty, warnings } };
}
