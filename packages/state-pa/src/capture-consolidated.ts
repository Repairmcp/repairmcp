/**
 * The consolidated-statute pipeline: one chapter page per distinct
 * (title, chapter) at the mirror's 5 s crawl delay, parsed once, selected
 * per manifest cite. Named cites hard-fail when absent, repealed, or
 * captured with no body text at all (the parser can only WARN on that —
 * see parse-consolidated.ts — because an unnamed section legitimately
 * being empty is not this package's business; a NAMED cite capturing
 * empty is always a parser bug, never a valid corpus row); the SUBCHAPTER
 * label each section sits under is cross-checked against the manifest so
 * a renumbered subchapter cannot ship under the wrong chapter value. The
 * effective date is the newest of the section's own notes, else the
 * inherited Enactment note's, else absent (silence).
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { newestConsolidatedEffectiveDate } from './history-dates.js';
import { parseConsolidatedChapterHtml, type ParsedConsolidatedSection } from './parse-consolidated.js';
import type { PaSection } from './schema.js';
import {
  LEGIS_MIN_DELAY_MS, consolidatedChapterUrl, consolidatedRawName, consolidatedSectionUrl,
  type PaConsolidatedCaptureSource,
} from './sources-consolidated.js';

export async function captureConsolidated(
  io: CaptureIo,
  sources: readonly PaConsolidatedCaptureSource[],
): Promise<{ sections: PaSection[]; report: { warnings: string[] } }> {
  const warnings: string[] = [];
  const parsed = new Map<string, ParsedConsolidatedSection[]>();
  for (const src of sources) {
    const key = `${src.title}/${src.chapter}`;
    if (parsed.has(key)) continue;
    const html = await io.fetchText(consolidatedChapterUrl(src.title, src.chapter), {
      rawName: consolidatedRawName(src.title, src.chapter),
      minDelayMs: LEGIS_MIN_DELAY_MS,
    });
    const r = parseConsolidatedChapterHtml(html, { title: src.title, chapter: src.chapter });
    warnings.push(...r.warnings.map((w) => `${src.code} ch. ${src.chapter}: ${w}`));
    parsed.set(key, r.sections);
  }

  const out: PaSection[] = [];
  for (const src of sources) {
    const key = `${src.title}/${src.chapter}`;
    // Populated by the fetch loop above for every source; a miss is a bug in
    // THIS file, not in the page, so it says so by name rather than throwing
    // on `undefined.map`.
    const chapterSections = parsed.get(key);
    if (!chapterSections) throw new Error(`Internal: chapter ${key} was not parsed`);
    const byCite = new Map(chapterSections.map((s) => [s.cite, s]));
    for (const cite of src.cites) {
      const label = `${src.code} ${cite}`;
      const s = byCite.get(cite);
      if (!s) throw new Error(`${label} was requested by name but is absent from the chapter ${src.chapter} page — renumbered or repealed upstream; correct the manifest after reading the page.`);
      if (s.repealed) throw new Error(`${label} was requested by name but its catchline reads "${s.heading}" (Repealed/Expired).`);
      if (!s.text) {
        throw new Error(`${label} captured no body text from the chapter ${src.chapter} page — the parser lost the section; re-derive from the saved raw before capturing.`);
      }
      if (s.subchapter !== src.subchapter) {
        throw new Error(`${label} sits under SUBCHAPTER ${s.subchapter ?? '(none)'} but the manifest expects ${src.subchapter}. Correct the manifest after reading the page.`);
      }
      const own = newestConsolidatedEffectiveDate(s.historyNotes);
      const inherited = s.inheritedEnactment ? newestConsolidatedEffectiveDate([s.inheritedEnactment]) : undefined;
      const effectiveDate = own ?? inherited;
      const historyNote = s.historyNotes.length > 0 ? s.historyNotes.join(' ') : s.inheritedEnactment;
      out.push({
        cite, code: src.code, chapter: src.chapterKey, chapterTitle: src.chapterTitle,
        heading: s.heading, text: s.text,
        ...(effectiveDate ? { effectiveDate } : {}),
        ...(historyNote ? { historyNote } : {}),
        domain: src.domain, sourceUrl: consolidatedSectionUrl(src.title, cite),
        captureSource: 'legis', headingSource: 'source',
      });
    }
  }
  return { sections: out, report: { warnings } };
}
