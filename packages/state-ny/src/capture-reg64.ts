import type { CaptureIo } from '@repairmcp/state-law';
import { parseLiiNycrrHtml, parseLiiNycrrPartIndex } from './parse-lii-nycrr.js';
import type { NySection } from './schema.js';
import { LII_NYCRR_CRAWL_DELAY_MS, liiNycrrPartUrl, liiNycrrSectionUrl, type NyReg64Source } from './sources-reg64.js';

/**
 * Regulation 64 capture at LII's requested 10-second crawl delay: the part
 * index first (manifest completeness both ways), then one page per cite
 * with the parser's title/cite cross-check. A section reading (Repealed)
 * hard-fails; a section with no Register history warns and carries no date.
 */
export async function captureNyReg64(io: CaptureIo, source: NyReg64Source): Promise<{ sections: NySection[]; report: { warnings: string[] } }> {
  const warnings: string[] = [];
  const delay = { minDelayMs: LII_NYCRR_CRAWL_DELAY_MS };

  const indexHtml = await io.fetchText(liiNycrrPartUrl(source.title, source.chapterRoman, source.part), { rawName: `ny-lii-part-${source.part}.html`, ...delay });
  const listed = parseLiiNycrrPartIndex(indexHtml);
  if (listed.length === 0) throw new Error(`11 NYCRR Part ${source.part}: the LII part index lists no sections — template drift.`);
  if (!indexHtml.includes(source.expectPartTitle)) {
    throw new Error(`11 NYCRR Part ${source.part}: the index page does not name "${source.expectPartTitle}".`);
  }
  const listedCites = new Set(listed.map((l) => l.cite));
  for (const cite of source.cites) {
    if (!listedCites.has(cite)) throw new Error(`11 NYCRR ${cite} is in the manifest but no longer listed on the mirror's part index — repealed or renumbered upstream.`);
  }
  for (const item of listed) {
    if (!source.cites.includes(item.cite) && !/\(Repealed\)/i.test(item.title)) {
      throw new Error(`11 NYCRR ${item.cite} ("${item.title}") is live upstream but not in the manifest — read it and add it (or record why not).`);
    }
  }

  const sections: NySection[] = [];
  for (const cite of source.cites) {
    const url = liiNycrrSectionUrl(source.title, cite);
    const html = await io.fetchText(url, { rawName: `ny-lii-11-nycrr-${cite}.html`, ...delay });
    const parsed = parseLiiNycrrHtml(html, { title: source.title, cite });
    if (parsed.repealed) throw new Error(`11 NYCRR ${cite} was requested by name but its heading reads (Repealed).`);
    if (!parsed.hierarchy.some((h) => h.includes(`pt. ${source.part}`))) {
      throw new Error(`11 NYCRR ${cite}: the breadcrumb (${parsed.hierarchy.join(' > ')}) does not place it in pt. ${source.part}.`);
    }
    if (!parsed.historyNote) warnings.push(`11 NYCRR ${cite}: no Register history on the page; no effective date carried.`);
    sections.push({
      cite, code: source.code, chapter: source.chapter, chapterTitle: source.chapterTitle,
      heading: parsed.heading, text: parsed.text,
      ...(parsed.effectiveDate ? { effectiveDate: parsed.effectiveDate } : {}),
      ...(parsed.historyNote ? { historyNote: parsed.historyNote } : {}),
      domain: source.domain, sourceUrl: url, captureSource: 'lii',
    });
  }
  return { sections, report: { warnings } };
}
