/**
 * The Ohio pipeline: ten chapter pages and eight section pages from
 * codes.ohio.gov at the 10 s floor, parsed once, selected per manifest
 * cite. Hard-fails, all by name: a named cite absent from its chapter page,
 * a "[Repealed …]" status note on a named cite, a named cite with no body
 * text, a PDF-filed rule (the parser refuses it), and Number Not Found on a
 * section page. Any other status note ("Governor's veto not reflected …")
 * is recorded on the section and listed in the report so the capture log
 * prints it.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseOhChapterPage, parseOhSectionPage, type ParsedOhBlock } from './parse-codes.js';
import type { OhCode, OhDomain, OhSection } from './schema.js';
import { OH_MIN_DELAY_MS, chapterRawName, chapterUrl, sectionRawName, sectionUrl, type OhSource } from './sources.js';

export interface OhCaptureResult {
  sections: OhSection[];
  report: { warnings: string[]; statusNotes: string[] };
}

function toSection(
  block: ParsedOhBlock,
  meta: { code: OhCode; chapter: string; chapterTitle: string; domain: OhDomain; captureSource: 'chapter' | 'section' },
): OhSection {
  const label = `${meta.code} ${block.cite}`;
  if (block.statusNote && /^Repealed\b/i.test(block.statusNote)) {
    throw new Error(`${label} was requested by name but the site marks it "${block.statusNote}" — correct the manifest after reading the page.`);
  }
  if (!block.text) {
    throw new Error(`${label} captured no body text — the parser lost the section or the site changed; re-derive from the saved raw before capturing.`);
  }
  return {
    cite: block.cite,
    code: meta.code,
    chapter: meta.chapter,
    chapterTitle: meta.chapterTitle,
    heading: block.heading,
    text: block.text,
    effectiveDate: block.effectiveDate,
    domain: meta.domain,
    sourceUrl: sectionUrl(meta.code, block.cite),
    captureSource: meta.captureSource,
    ...(block.statusNote ? { statusNote: block.statusNote } : {}),
    ...(block.latestLegislation ? { latestLegislation: block.latestLegislation } : {}),
    ...(block.authorizedBy ? { authorizedBy: block.authorizedBy } : {}),
    ...(block.amplifies ? { amplifies: block.amplifies } : {}),
    ...(block.fiveYearReviewDate ? { fiveYearReviewDate: block.fiveYearReviewDate } : {}),
    ...(block.priorEffectiveDates ? { priorEffectiveDates: block.priorEffectiveDates } : {}),
  };
}

export async function captureOhio(io: CaptureIo, sources: readonly OhSource[]): Promise<OhCaptureResult> {
  const warnings: string[] = [];
  const statusNotes: string[] = [];
  const out: OhSection[] = [];
  for (const src of sources) {
    if (src.kind === 'chapter') {
      const html = await io.fetchText(chapterUrl(src.code, src.chapter), {
        rawName: chapterRawName(src.code, src.chapter),
        minDelayMs: OH_MIN_DELAY_MS,
      });
      const parsed = parseOhChapterPage(html, { code: src.code, chapter: src.chapter });
      const byCite = new Map(parsed.sections.map((s) => [s.cite, s]));
      for (const entry of src.sections) {
        const block = byCite.get(entry.cite);
        if (!block) {
          throw new Error(`${src.code} ${entry.cite} was requested by name but is absent from the chapter ${src.chapter} page — renumbered or repealed upstream; correct the manifest after reading the page.`);
        }
        const section = toSection(block, { code: src.code, chapter: src.chapter, chapterTitle: parsed.chapterTitle, domain: entry.domain, captureSource: 'chapter' });
        if (section.statusNote) statusNotes.push(`${src.code} ${section.cite}: ${section.statusNote}`);
        out.push(section);
      }
    } else {
      const html = await io.fetchText(sectionUrl(src.code, src.cite), {
        rawName: sectionRawName(src.code, src.cite),
        minDelayMs: OH_MIN_DELAY_MS,
      });
      const parsed = parseOhSectionPage(html, { code: src.code, cite: src.cite });
      if (parsed.chapter !== src.chapter) {
        throw new Error(`${src.code} ${src.cite}: the manifest says chapter ${src.chapter} but the page's breadcrumb says ${parsed.chapter} — fix the manifest.`);
      }
      const section = toSection(parsed, { code: src.code, chapter: parsed.chapter, chapterTitle: parsed.chapterTitle, domain: src.domain, captureSource: 'section' });
      if (section.statusNote) statusNotes.push(`${src.code} ${section.cite}: ${section.statusNote}`);
      out.push(section);
    }
  }
  for (const line of statusNotes) io.log(`status note: ${line}`);
  return { sections: out, report: { warnings, statusNotes } };
}
