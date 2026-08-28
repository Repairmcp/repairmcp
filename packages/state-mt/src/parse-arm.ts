/**
 * ARM ACCESSIBLE_HTML document → verbatim text. The document body is
 * `<div id="documentBody">` holding paragraph tags; the first paragraph
 * carries `<span citation-id="6.6.1701">6.6.1701</span> RULE NAME` — the
 * cross-check anchor. Paragraph split follows the house never-lose-text
 * rule: split on closing tags, strip per piece, so nested structure can add
 * line breaks but can never drop words. Spacer paragraphs (the
 * -aw-import:ignore nbsp lines) strip to empty and fall out.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class ArmParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArmParseError';
  }
}

export interface ParsedArmDocument {
  cite: string;
  text: string;
}

function stripToText(html: string): string {
  const spaced = html.replace(/<\/(td|th|tr)>/gi, ' ');
  const noTags = spaced.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

export function parseArmDocument(
  html: string,
  opts: { expectedCite: string },
): ParsedArmDocument {
  const bodyStart = html.indexOf('id="documentBody"');
  if (bodyStart < 0) {
    throw new ArmParseError(
      `Rule ${opts.expectedCite}: no documentBody in the ACCESSIBLE_HTML document — API drift.`,
    );
  }
  // Slice from the END of the opening tag, or the partial tag's remnant
  // would survive tag-stripping as text.
  const bodyHtml = html.slice(html.indexOf('>', bodyStart) + 1);

  const citeMatch = /citation-id="([^"]+)"/.exec(bodyHtml);
  const cite = (citeMatch?.[1] ?? '').trim();
  if (cite !== opts.expectedCite) {
    throw new ArmParseError(
      `Document states citation-id "${cite}" but ${opts.expectedCite} was requested.`,
    );
  }

  const lines: string[] = [];
  for (const piece of bodyHtml.split(/<\/p>/i)) {
    const text = stripToText(piece);
    if (text) lines.push(text);
  }
  if (lines.length === 0) {
    throw new ArmParseError(`Rule ${opts.expectedCite}: document parsed to no text.`);
  }

  return { cite, text: lines.join('\n') };
}
