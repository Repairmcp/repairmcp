/**
 * The Pennsylvania Code pipeline: one chapter page per manifest chapter at
 * the 10 s floor, parsed once, selected per cite. The first page's currency
 * sentence sets the value every later page must repeat (the FL edition
 * rule); the value is RECORDED in meta, not pinned — it rolls weekly.
 * Effective date: the section's own Source lines, else the chapter-level
 * adoption line, else silence (kickoff §3.3). A named cite that captures no
 * body text hard-fails, the same rule the consolidated and act pipelines
 * carry: an unnamed section may legitimately be empty, a NAMED one never is.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { newestPacodeEffectiveDate } from './history-dates.js';
import { parsePacodeChapterHtml } from './parse-pacode.js';
import type { PaSection } from './schema.js';
import {
  PACODE_MIN_DELAY_MS, pacodeChapterUrl, pacodeRawName, pacodeSectionUrl, type PaPacodeCaptureSource,
} from './sources-pacode.js';

export async function capturePacode(
  io: CaptureIo,
  sources: readonly PaPacodeCaptureSource[],
): Promise<{ sections: PaSection[]; currency: string; report: { warnings: string[] } }> {
  const warnings: string[] = [];
  const out: PaSection[] = [];
  let currency: { value: string; from: string } | undefined;
  for (const src of sources) {
    const html = await io.fetchText(pacodeChapterUrl(src.title, src.chapter), {
      rawName: pacodeRawName(src.title, src.chapter),
      minDelayMs: PACODE_MIN_DELAY_MS,
    });
    const parsed = parsePacodeChapterHtml(html, { title: src.title, chapter: src.chapter });
    if (!currency) currency = { value: parsed.currency, from: src.chapterKey };
    else if (parsed.currency !== currency.value) {
      throw new Error(`${src.chapterKey} states "${parsed.currency}" but ${currency.from} stated "${currency.value}" — the site rolled mid-capture; re-run.`);
    }
    const chapterDate = newestPacodeEffectiveDate(parsed.chapterSourceLines);
    const chapterLine = parsed.chapterSourceLines.find((l) => /\b(adopted|amended)\b/.test(l));
    const byCite = new Map(parsed.sections.map((s) => [s.cite, s]));
    for (const cite of src.cites) {
      const label = `${src.code} ${cite}`;
      const s = byCite.get(cite);
      if (!s) throw new Error(`${label} was requested by name but is absent from the ${src.chapterKey} page — renumbered or reserved upstream; correct the manifest after reading the page.`);
      if (s.reserved) throw new Error(`${label} was requested by name but its heading reads "${s.heading}" (Reserved).`);
      if (!s.text) {
        throw new Error(`${label} captured no body text from the ${src.chapterKey} page — the parser lost the section; re-derive from the saved raw before capturing.`);
      }
      const own = newestPacodeEffectiveDate(s.sourceLines);
      const effectiveDate = own ?? chapterDate;
      const historyNote = s.sourceLines.length > 0 ? s.sourceLines.join(' ') : own === undefined && chapterDate ? chapterLine : undefined;
      out.push({
        cite, code: src.code, chapter: src.chapterKey, chapterTitle: src.chapterTitle,
        heading: s.heading, text: s.text,
        ...(effectiveDate ? { effectiveDate } : {}),
        ...(historyNote ? { historyNote } : {}),
        domain: src.domain, sourceUrl: pacodeSectionUrl(src.title, src.chapter, cite),
        captureSource: 'pacode', headingSource: 'source',
      });
    }
  }
  if (!currency) throw new Error('No Pennsylvania Code chapters in the manifest.');
  return { sections: out, currency: currency.value, report: { warnings } };
}
