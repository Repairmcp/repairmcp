/**
 * The CRS capture pipeline: fetch the OLLS download index (the currency
 * tripwire — a page that cannot state its currency hard-fails the capture),
 * resolve each needed title's href FROM the index (never derive the file
 * name — padding is the index's business), fetch each distinct title once,
 * parse, and select per manifest entry. Named cites hard-fail when absent
 * or repealed; article filters skip repealed sections with a report line.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { CRS_EDITION } from './identity.js';
import { parseCrsIndexCurrency, parseCrsTitleHtml, type ParsedCrsSection } from './parse-crs.js';
import type { CoSection } from './schema.js';
import { CRS_INDEX_URL, type CrsCaptureSource } from './sources-crs.js';

export interface CrsCaptureResult {
  sections: CoSection[];
  currencyNote: string;
  editionYear: string;
  report: { skippedEmpty: string[]; warnings: string[] };
}

export async function captureCrs(
  io: CaptureIo,
  sources: readonly CrsCaptureSource[],
): Promise<CrsCaptureResult> {
  const skippedEmpty: string[] = [];
  const warnings: string[] = [];

  const indexHtml = await io.fetchText(CRS_INDEX_URL, { rawName: 'crs-index.html' });
  const index = parseCrsIndexCurrency(indexHtml);

  const pinnedYear = CRS_EDITION.match(/\d{4}/)?.[0];
  if (index.editionYear !== pinnedYear) {
    warnings.push(
      `CRS edition rollover: the index states ${index.editionYear} but the package pins ` +
        `"${CRS_EDITION}" — update CRS_EDITION in src/identity.ts (the pin test fails until you do).`,
    );
  }

  const titles = [...new Set(sources.map((s) => s.title))];
  const parsedByTitle = new Map<number, { url: string; sections: ParsedCrsSection[] }>();
  for (const title of titles) {
    const href = index.titleHrefs.get(title);
    if (!href) {
      throw new Error(
        `Title ${title} has no .htm link on the CRS download index` +
          (title === 8 ? ' — check the PDF-only supplement crs2026-statute-pdfs.zip (kickoff §9.1).' : '.'),
      );
    }
    const url = href.startsWith('http') ? href : `https://olls.info${href.startsWith('/') ? '' : '/'}${href}`;
    const html = await io.fetchText(url, { rawName: `crs-title-${title}.htm` });
    const parsed = parseCrsTitleHtml(html, { title });
    warnings.push(...parsed.warnings.map((w) => `title ${title}: ${w}`));
    parsedByTitle.set(title, { url, sections: parsed.sections });
  }

  const out: CoSection[] = [];
  for (const source of sources) {
    const parsed = parsedByTitle.get(source.title)!;
    const byCite = new Map(parsed.sections.map((s) => [s.cite, s]));

    let wanted: ParsedCrsSection[];
    if (source.filter.kind === 'sections') {
      wanted = source.filter.cites.map((cite) => {
        const section = byCite.get(cite);
        if (!section) {
          throw new Error(
            `CRS ${cite} was requested by name but is absent from the title ${source.title} file` +
              (source.title === 8
                ? ' — the Wage Act sections may live in the PDF-only supplement crs2026-statute-pdfs.zip (kickoff §9.1).'
                : '.'),
          );
        }
        if (section.repealed) {
          throw new Error(`CRS ${cite} was requested by name but its catchline reads Repealed.`);
        }
        return section;
      });
    } else {
      wanted = parsed.sections.filter((s) => s.cite.startsWith(`${source.chapterKey}-`));
      for (const s of wanted.filter((w) => w.repealed)) {
        io.log(`  CRS ${source.chapterKey}: skipping repealed ${s.cite}`);
        skippedEmpty.push(s.cite);
      }
      wanted = wanted.filter((w) => !w.repealed);
      if (wanted.length === 0) {
        throw new Error(`CRS article ${source.chapterKey} matched no live sections — wrong chapterKey?`);
      }
    }

    for (const section of wanted) {
      out.push({
        cite: section.cite,
        code: 'CRS',
        chapter: source.chapterKey,
        chapterTitle: source.chapterTitle,
        heading: section.heading,
        text: section.text,
        // CRS states no per-section effective dates — currency is the edition.
        ...(section.historyNote ? { historyNote: section.historyNote } : {}),
        domain: source.domain,
        sourceUrl: parsed.url,
      });
    }
  }

  return { sections: out, currencyNote: index.currencyNote, editionYear: index.editionYear, report: { skippedEmpty, warnings } };
}
