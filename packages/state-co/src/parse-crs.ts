/**
 * Parser for the OLLS whole-title CRS files (olls.info/crs/crsYYYY-title-NN.htm)
 * and the download index page that states currency. One page per TITLE, no
 * per-section anchors: sections are identified by the text convention
 * `NN-N-NNN.  Catchline.` at the start of a paragraph (the OLRC-style shape
 * capture-uscode.ts parses, not WA/MT's anchor shape). Statutory text runs to
 * the `Source:` history paragraph; annotation blocks after it (Editor's
 * notes, cross references, ANNOTATION) are non-statutory chrome and are
 * dropped, bounded by the next section start. ADJUST AGAINST REAL FILES in
 * task 10 — this shape is from the research pass, and the first --save-raw
 * capture is the authority.
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

/** Never-lose-text: split on closing block tags, strip per piece. */
function toLines(html: string): string[] {
  const lines: string[] = [];
  for (const piece of html.split(/<\/(?:p|div|h\d)>/i)) {
    const text = stripToText(piece);
    if (text) lines.push(text);
  }
  return lines;
}

const SECTION_START = /^(\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?)\.\s+(.+)$/;
const SOURCE_LINE = /^Source:\s/;
const ANNOTATION_BLOCK = /^(Editor's note|Cross references|Law reviews|ANNOTATION|I\. General Consideration)/i;

export function parseCrsTitleHtml(
  html: string,
  opts: { title: number },
): { sections: ParsedCrsSection[]; warnings: string[] } {
  const lines = toLines(html);
  const sections: ParsedCrsSection[] = [];
  const warnings: string[] = [];

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
    const start = SECTION_START.exec(line);
    if (start) {
      const cite = start[1]!;
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
        repealed: /^\(?Repealed/i.test(heading),
      };
      inAnnotations = false;
      continue;
    }
    if (!current || inAnnotations) continue;
    if (SOURCE_LINE.test(line)) {
      current.historyNote = line;
      inAnnotations = true;
      continue;
    }
    if (ANNOTATION_BLOCK.test(line)) {
      inAnnotations = true;
      continue;
    }
    current.text = current.text ? `${current.text}\n${line}` : line;
  }
  push();

  if (sections.length === 0) {
    throw new CrsParseError(`Title ${opts.title}: no sections found — template drift or wrong file.`);
  }
  return { sections, warnings };
}

const CURRENCY_PATTERN = /current with the changes[\s\S]*?General Assembly[\s\S]*?\b(\d{4})\b[.]?/;

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
  const sentenceStart = text.lastIndexOf('The statutes', match.index) >= 0
    ? text.lastIndexOf('The statutes', match.index)
    : match.index;
  const sentenceEnd = text.indexOf('.', match.index + match[0].length - 1);
  const currencyNote = text.slice(sentenceStart, sentenceEnd >= 0 ? sentenceEnd + 1 : undefined).trim();

  const titleHrefs = new Map<number, string>();
  for (const m of html.matchAll(/href="([^"]*crs\d{4}-title-0*(\d+)\.htm)"/gi)) {
    titleHrefs.set(Number(m[2]), m[1]!);
  }
  return { currencyNote, editionYear: match[1]!, titleHrefs };
}
