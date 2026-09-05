/**
 * The regulations capture pipelines: LII (10 CCR, 16 CCR, 8 CCR 11090) at
 * the mirror's requested 10-second crawl delay, and DIR (Title 8 Cal/OSHA)
 * at the io default. One fetch per section on both surfaces. Every page is
 * cross-checked against the manifest before its text is kept: the title and
 * cite in the page's own heading (parser), the breadcrumb level or Article
 * line (here), and the expected heading substring (here). A repealed
 * section, a mismatched heading, or a missing hierarchy line hard-fails —
 * a renumbered or repurposed cite can never ship as the old one.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseLiiCcrHtml } from './parse-ccr-lii.js';
import { parseDirTitle8Html } from './parse-dir.js';
import type { CaSection } from './schema.js';
import {
  dirSectionUrl,
  liiSectionUrl,
  type CaDirCaptureSource,
  type CaLiiCaptureSource,
} from './sources-regs.js';

/** robots.txt: "Crawl-delay: 10". */
export const LII_CRAWL_DELAY_MS = 10_000;

export interface CaRegsCaptureResult {
  sections: CaSection[];
  report: { warnings: string[] };
}

export async function captureCaLii(
  io: CaptureIo,
  sources: readonly CaLiiCaptureSource[],
): Promise<CaRegsCaptureResult> {
  const out: CaSection[] = [];
  const warnings: string[] = [];

  for (const source of sources) {
    const url = liiSectionUrl(source.title, source.cite);
    const html = await io.fetchText(url, {
      rawName: `lii-${source.title}-ccr-${source.cite}.html`,
      minDelayMs: LII_CRAWL_DELAY_MS,
    });
    const parsed = parseLiiCcrHtml(html, { title: source.title, cite: source.cite });
    const label = `${source.code} ${source.cite}`;

    if (parsed.repealed) {
      throw new Error(`${label} was requested by name but its heading reads [Repealed].`);
    }
    if (source.expectHeading && !parsed.heading.includes(source.expectHeading)) {
      throw new Error(
        `${label}: heading reads "${parsed.heading}", expected it to contain ` +
          `"${source.expectHeading}" — the cite was repurposed or renumbered. Reconcile the manifest.`,
      );
    }
    if (!parsed.hierarchy.includes(source.expectHierarchy)) {
      throw new Error(
        `${label}: the page's breadcrumb (${parsed.hierarchy.join(' > ')}) does not include ` +
          `"${source.expectHierarchy}" — the section moved, or the mirror's template changed.`,
      );
    }
    if (!parsed.historyNote) {
      warnings.push(`${label}: no Register history on the page; no effective date carried.`);
    }

    out.push({
      cite: parsed.cite,
      code: source.code,
      chapter: source.chapter,
      chapterTitle: source.chapterTitle,
      heading: parsed.heading,
      text: parsed.text,
      ...(parsed.effectiveDate ? { effectiveDate: parsed.effectiveDate } : {}),
      ...(parsed.historyNote ? { historyNote: parsed.historyNote } : {}),
      domain: source.domain,
      sourceUrl: url,
      captureSource: 'lii',
      headingSource: 'source',
    });
  }

  return { sections: out, report: { warnings } };
}

/**
 * "Subchapter 7. General Industry Safety Orders / Group 20. Flammable … /
 * Article 137. Spray Coating Operations" → chapter "art. 137 (Tit. 8,
 * subch. 7, group 20)", chapterTitle "Spray Coating Operations". Some
 * orders sit directly under a Group with no Article — 3203 (the IIPP) is in
 * Group 1's "Introduction" — and then the Group is the chapter: "group 1
 * (Tit. 8, subch. 7)", chapterTitle "General Physical Conditions and
 * Structures Orders: Introduction". A page with neither is template drift.
 */
export function dirChapterFromHierarchy(
  hierarchy: readonly string[],
): { chapter: string; chapterTitle: string } {
  const numbered = hierarchy
    .map((l) => /^(Subchapter|Group|Article)\s+([\d.]+)\.\s*(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);
  const subchapter = numbered.find((m) => m[1] === 'Subchapter');
  const group = numbered.find((m) => m[1] === 'Group');
  const article = numbered.find((m) => m[1] === 'Article');
  const decorate = (parts: Array<RegExpExecArray | undefined>): string => {
    const items = parts
      .filter((m): m is RegExpExecArray => m !== undefined)
      .map((m) => `${m[1] === 'Subchapter' ? 'subch.' : 'group'} ${m[2]}`);
    return `(Tit. 8${items.length ? `, ${items.join(', ')}` : ''})`;
  };
  if (article) {
    return {
      chapter: `art. ${article[2]} ${decorate([subchapter, group])}`,
      chapterTitle: article[3]!.trim(),
    };
  }
  if (group) {
    const trailing = hierarchy
      .filter((l) => !/^(Subchapter|Group|Article)\s+[\d.]+\./.test(l))
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return {
      chapter: `group ${group[2]} ${decorate([subchapter])}`,
      chapterTitle: trailing.length ? `${group[3]!.trim()}: ${trailing.join(', ')}` : group[3]!.trim(),
    };
  }
  throw new Error(
    `No "Article N." or "Group N." line in the page hierarchy (${hierarchy.join(' / ')}) — template drift.`,
  );
}

export async function captureCaDir(
  io: CaptureIo,
  sources: readonly CaDirCaptureSource[],
): Promise<CaRegsCaptureResult> {
  const out: CaSection[] = [];
  const warnings: string[] = [];

  for (const source of sources) {
    const url = dirSectionUrl(source.cite);
    const html = await io.fetchText(url, { rawName: `dir-title8-${source.cite}.html` });
    const parsed = parseDirTitle8Html(html, { cite: source.cite });
    const label = `8 CCR ${source.cite}`;

    if (source.expectHeading && !parsed.heading.includes(source.expectHeading)) {
      throw new Error(
        `${label}: heading reads "${parsed.heading}", expected it to contain ` +
          `"${source.expectHeading}" — the cite was repurposed or renumbered. Reconcile the manifest.`,
      );
    }
    const { chapter, chapterTitle } = dirChapterFromHierarchy(parsed.hierarchy);
    if (!parsed.historyNote) {
      warnings.push(`${label}: no Register history on the page; no effective date carried.`);
    }

    out.push({
      cite: parsed.cite,
      code: '8 CCR',
      chapter,
      chapterTitle,
      heading: parsed.heading,
      text: parsed.text,
      ...(parsed.effectiveDate ? { effectiveDate: parsed.effectiveDate } : {}),
      ...(parsed.historyNote ? { historyNote: parsed.historyNote } : {}),
      domain: source.domain,
      sourceUrl: url,
      captureSource: 'dir',
      headingSource: 'source',
    });
  }

  return { sections: out, report: { warnings } };
}
