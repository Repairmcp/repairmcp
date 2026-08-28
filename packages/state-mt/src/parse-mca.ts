/**
 * Parser for mca.legmt.gov pages (Montana Code Annotated, the Legislature's
 * publication). Verified against raw bytes 2026-08-27.
 *
 * Section pages: `<h1>Montana Code Annotated 2025</h1>` (the EDITION marker —
 * Montana's analog of OLRC's currentthrough; a page without it hard-fails),
 * a classed section-header, then `<div class="section-content">` holding
 * `<p class="line-indent">` paragraphs whose FIRST paragraph carries the
 * catchline inline: `<span class="catchline"><span class="citation">
 * 33-18-201</span>.&#8195;Heading.</span> opening text…`. The history line
 * lives in a SIBLING `history-doc` div, so bounding at section-content keeps
 * it and the footer out of the text. The citation-span cross-check is the
 * slot-URL tripwire: MCA section URLs are per-part slot numbers resolved
 * from an index, and a stale or racing index would serve the wrong section.
 *
 * Part indexes: `<li class="line"><a href="./section_0240/…"><span
 * class="citation">33-18-224</span>&nbsp;Title</a>` rows. Reserved and
 * repealed slots appear as rows whose title says so — they are skipped and
 * reported, the index-level analog of Washington's disposition-table
 * discard.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class McaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McaParseError';
  }
}

export interface ParsedMcaSection {
  cite: string;
  heading: string;
  text: string;
  historyNote?: string;
  edition: string;
  pageChapterTitle?: string;
  repealed: boolean;
}

export interface McaIndexEntry {
  cite: string;
  title: string;
  href: string;
}

/** Strip tags from one fragment and normalize whitespace, keeping link text. */
function stripToText(html: string): string {
  const spaced = html.replace(/<\/(td|th|tr)>/gi, ' ');
  const noTags = spaced.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

const EDITION_PATTERN = /<h1>\s*(Montana Code Annotated \d{4})\s*<\/h1>/;

export function parseMcaSectionPage(
  html: string,
  opts: { expectedCite: string },
): ParsedMcaSection {
  const editionMatch = EDITION_PATTERN.exec(html);
  if (!editionMatch) {
    throw new McaParseError(
      `Section ${opts.expectedCite}: no "Montana Code Annotated <year>" edition marker — ` +
        'refusing to capture a page that cannot state its own currency.',
    );
  }
  const edition = editionMatch[1]!;

  const chapterTitleMatch = /<h3 class="section-chapter-title">([\s\S]*?)<\/h3>/.exec(html);
  const chapterTitleRaw = chapterTitleMatch ? stripToText(chapterTitleMatch[1] ?? '') : undefined;
  const pageChapterTitle = chapterTitleRaw?.replace(/^CHAPTER\s+\d+[A-Z]?\.\s*/, '');

  const contentStart = html.indexOf('class="section-content"');
  if (contentStart < 0) {
    throw new McaParseError(`Section ${opts.expectedCite}: no section-content region — template drift.`);
  }
  const historyStart = html.indexOf('class="history-doc"', contentStart);
  const footerStart = html.indexOf('class="mca-footer"', contentStart);
  const contentEnd =
    historyStart >= 0 ? historyStart : footerStart >= 0 ? footerStart : html.length;
  const contentHtml = html.slice(contentStart, contentEnd);

  const paragraphs: string[] = [];
  for (const match of contentHtml.matchAll(/<p class="line-indent">([\s\S]*?)<\/p>/g)) {
    const text = stripToText(match[1] ?? '');
    if (text) paragraphs.push(text);
  }
  if (paragraphs.length === 0) {
    throw new McaParseError(`Section ${opts.expectedCite}: no paragraphs in section-content.`);
  }

  const citeMatch = /<span class="citation">([^<]+)<\/span>/.exec(contentHtml);
  const cite = (citeMatch?.[1] ?? '').trim();
  if (cite !== opts.expectedCite) {
    throw new McaParseError(
      `Section page states cite "${cite}" but ${opts.expectedCite} was requested — ` +
        'the slot-URL index is stale or the template drifted.',
    );
  }

  // The catchline span nests exactly one span (the citation), so capture the
  // citation span whole plus the text after it, stopping at the catchline's
  // own close. Heading = catchline text minus the leading cite.
  const catchlineMatch =
    /<span class="catchline">([\s\S]*?<\/span>[\s\S]*?)<\/span>/.exec(contentHtml);
  const catchlineText = catchlineMatch ? stripToText(catchlineMatch[1] ?? '') : paragraphs[0]!;
  const heading = catchlineText.replace(/^\S+\.\s*/, '').trim();
  if (!heading) {
    throw new McaParseError(`Section ${opts.expectedCite}: empty catchline heading.`);
  }

  let historyNote: string | undefined;
  if (historyStart >= 0) {
    const historyEnd = footerStart >= 0 ? footerStart : html.length;
    const historyHtml = html.slice(historyStart, historyEnd);
    const historyMatch = /<p class="line-indent">([\s\S]*?)<\/p>/.exec(historyHtml);
    if (historyMatch) historyNote = stripToText(historyMatch[1] ?? '');
  }

  return {
    cite,
    heading,
    text: paragraphs.join('\n'),
    ...(historyNote ? { historyNote } : {}),
    edition,
    ...(pageChapterTitle ? { pageChapterTitle } : {}),
    repealed: /^repealed\b/i.test(heading),
  };
}

/** Index rows whose title marks a dead slot rather than a live section. */
const DEAD_SLOT_PATTERN = /(^|\s)(reserved|repealed|renumbered|terminated)\b/i;

export function parseMcaIndexPage(html: string): {
  entries: McaIndexEntry[];
  skipped: string[];
} {
  const entries: McaIndexEntry[] = [];
  const skipped: string[] = [];
  const rowPattern =
    /<li class="line">\s*<a href="([^"]+)">\s*<span class="citation">([^<]+)<\/span>&nbsp;([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(rowPattern)) {
    const href = match[1] ?? '';
    const cite = (match[2] ?? '').trim();
    const title = stripToText(match[3] ?? '');
    if (DEAD_SLOT_PATTERN.test(title)) {
      skipped.push(cite);
      continue;
    }
    entries.push({ cite, title, href });
  }
  if (entries.length === 0 && skipped.length === 0) {
    throw new McaParseError('No section rows found in the part index — template drift.');
  }
  return { entries, skipped };
}
