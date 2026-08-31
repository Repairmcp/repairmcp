/**
 * Parser for the OLLS whole-title CRS files (olls.info/crs/crsYYYY-title-NN.htm)
 * and the download index page that states currency. One page per TITLE, no
 * per-section anchors: sections are identified by the text convention
 * `NN-N-NNN.  Catchline.` at the start of a paragraph (the OLRC-style shape
 * capture-uscode.ts parses, not WA/MT's anchor shape). Statutory text runs to
 * the `Source:` history paragraph; annotation blocks after it (Editor's
 * notes, cross references, ANNOTATION) are non-statutory chrome and are
 * dropped, bounded by the next section start.
 *
 * VERIFIED against the real files 2026-08-31 (titles 6, 8, 10, 42 — 7.6 MB of
 * Word-filtered HTML each). Two assumptions from the research pass did not
 * survive contact:
 *
 *  1. The files are windows-1252, and the server declares that ONLY in a meta
 *     tag. Fixed one level up in makeCaptureIo (decodeResponseBytes): the
 *     non-breaking space that separates a section number from its catchline
 *     arrived as U+FFFD, and the splitter matched nothing at all.
 *  2. Every section number appears TWICE — once in its article's
 *     table of contents and once as the section head — and the TOCs are
 *     interleaved between articles, not gathered at the front. Each title
 *     parsed to exactly double the real section count. The document's own
 *     distinction is typographic and consistent: a section HEAD prints its
 *     number in bold, a TOC entry does not. That is what isSectionHead reads.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class CrsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrsParseError';
  }
}

export interface ParsedCrsSection {
  cite: string;
  heading: string;
  text: string;
  historyNote?: string;
  repealed: boolean;
}

function stripToText(html: string): string {
  const spaced = html.replace(/<\/(td|th|tr)>/gi, ' ');
  const noTags = spaced.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/**
 * Never-lose-text: split on closing block tags, strip per piece. The piece's
 * own markup is kept alongside its text because the TOC/section-head
 * distinction lives in the markup, not the words — the two render identical
 * text.
 */
function toLines(html: string): { text: string; html: string }[] {
  const lines: { text: string; html: string }[] = [];
  for (const piece of html.split(/<\/(?:p|div|h\d)>/i)) {
    const text = stripToText(piece);
    if (text) lines.push({ text, html: piece });
  }
  return lines;
}

const SECTION_START = /^(\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?)\.\s+(.+)$/;
const SOURCE_LINE = /^Source:\s/;
const ANNOTATION_BLOCK = /^(Editor's note|Cross references|Law reviews|ANNOTATION|I\. General Consideration)/i;
/**
 * `(Repealed)` is the ONLY marker the OLLS uses (642 occurrences across the
 * four captured titles, no dated or qualified variants), but it is not always
 * the whole catchline: the research pass assumed `10-8-301. (Repealed)` and
 * missed the far commoner `10-1-143. Study on homeowner's insurance - repeal.
 * (Repealed)`, where it is appended to a surviving catchline. Anchoring only
 * at the start flagged 3 of title 10's 87 repealed sections, and the other 84
 * would have been captured as live sections with empty text.
 */
const REPEALED_CATCHLINE = /\(Repealed\)\s*$/i;

/**
 * A section HEAD prints its number in bold: `<b><span …>42-9-104.</span></b>`.
 * The article table of contents prints the very same number and catchline with
 * no emphasis at all. Both produce identical stripped text, so the markup is
 * the only thing that can tell them apart — and it has to, because the TOCs
 * are interleaved between articles: without this, every title parsed to double
 * its real section count and the whole-article filters produced duplicate
 * cites. The lookahead is bounded so a bold run far away in the paragraph can
 * never be stitched onto a number it does not introduce.
 */
function isSectionHead(pieceHtml: string, cite: string): boolean {
  const escaped = cite.replace(/[.]/g, '\\.');
  return new RegExp(`<b\\b[^>]*>(?:(?!</b>)[\\s\\S]){0,300}?${escaped}\\.`, 'i').test(pieceHtml);
}

export function parseCrsTitleHtml(
  html: string,
  opts: { title: number },
): { sections: ParsedCrsSection[]; warnings: string[] } {
  const lines = toLines(html);
  const sections: ParsedCrsSection[] = [];
  const warnings: string[] = [];
  let tocEntries = 0;

  let current: ParsedCrsSection | null = null;
  let inAnnotations = false;

  const push = (): void => {
    if (!current) return;
    if (!current.text && !current.repealed) {
      warnings.push(`${current.cite}: no body text captured.`);
    }
    sections.push(current);
    current = null;
  };

  for (const line of lines) {
    const start = SECTION_START.exec(line.text);
    if (start) {
      const cite = start[1]!;
      // A table-of-contents entry: not a head, and never body text either.
      if (!isSectionHead(line.html, cite)) {
        tocEntries++;
        continue;
      }
      if (!cite.startsWith(`${opts.title}-`)) {
        throw new CrsParseError(
          `Section ${cite} does not belong to title ${opts.title} — wrong file or template drift.`,
        );
      }
      push();
      const heading = start[2]!.trim();
      current = {
        cite,
        heading,
        text: '',
        repealed: REPEALED_CATCHLINE.test(heading),
      };
      inAnnotations = false;
      continue;
    }
    if (!current || inAnnotations) continue;
    if (SOURCE_LINE.test(line.text)) {
      current.historyNote = line.text;
      inAnnotations = true;
      continue;
    }
    if (ANNOTATION_BLOCK.test(line.text)) {
      inAnnotations = true;
      continue;
    }
    current.text = current.text ? `${current.text}\n${line.text}` : line.text;
  }
  push();

  if (sections.length === 0) {
    throw new CrsParseError(`Title ${opts.title}: no sections found — template drift or wrong file.`);
  }
  if (tocEntries === 0) {
    throw new CrsParseError(
      `Title ${opts.title}: not one table-of-contents entry was recognised, so the bold ` +
        'section-head convention no longer holds and every TOC line would be captured as a ' +
        'section. Re-derive isSectionHead from the saved raw before capturing.',
    );
  }
  // Title 6 prints two different texts for several part-17 sections (an
  // amendment with a delayed effective date, published alongside the current
  // text). That is the source's own ambiguity, not a parse failure — but a
  // caller selecting by cite must be told, because it decides which one wins.
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.cite)) duplicates.add(section.cite);
    seen.add(section.cite);
  }
  if (duplicates.size > 0) {
    warnings.push(
      `title ${opts.title} prints ${duplicates.size} cite(s) more than once as a section head ` +
        `(${[...duplicates].slice(0, 8).join(', ')}${duplicates.size > 8 ? ', …' : ''}) — ` +
        'the source publishes two texts for them; the later one is captured.',
    );
  }
  return { sections, warnings };
}

/**
 * The one sentence on the index that states currency. VERIFIED against the
 * live page 2026-08-29:
 *
 *   "Current with the changes made by amendments, additions, and repeals to
 *    Colorado Revised Statutes by the Seventy-fifth General Assembly at its
 *    Second Regular Session in 2026."
 *
 * The research pass assumed a "The statutes are current with…" lead-in and a
 * lower-case "current"; the real page has neither. The lead-in is now
 * optional and the match is case-insensitive. What is anchored on is only the
 * stable core — the currency wording, "General Assembly", and a four-digit
 * year. The gaps are BOUNDED so a distant stray "General Assembly" in the
 * site chrome (the masthead says "Second Regular Session | 75th General
 * Assembly") can never be stitched into a false currency sentence.
 */
const CURRENCY_PATTERN =
  /(?:the statutes are\s+)?current with the changes[\s\S]{0,400}?General Assembly[\s\S]{0,200}?\b(\d{4})\b\.?/i;

export function parseCrsIndexCurrency(html: string): {
  currencyNote: string;
  editionYear: string;
  titleHrefs: Map<number, string>;
} {
  const text = stripToText(html);
  const match = CURRENCY_PATTERN.exec(text);
  if (!match) {
    throw new CrsParseError(
      'The CRS download index no longer states its currency sentence — refusing to capture a corpus that cannot state its own currency.',
    );
  }
  // The sentence IS the match: the surrounding page is navigation soup with
  // no sentence punctuation to scan back to, so a backward scan for a period
  // would swallow the entire menu. Report what the page actually said.
  const currencyNote = match[0].replace(/\s+/g, ' ').trim();

  const titleHrefs = new Map<number, string>();
  for (const m of html.matchAll(/href="([^"]*crs\d{4}-title-0*(\d+)\.htm)"/gi)) {
    titleHrefs.set(Number(m[2]), m[1]!);
  }
  return { currencyNote, editionYear: match[1]!, titleHrefs };
}
