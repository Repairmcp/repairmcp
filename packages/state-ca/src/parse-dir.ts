/**
 * Parser for Title 8 (Cal/OSHA) section pages as the Department of
 * Industrial Relations publishes them itself (dir.ca.gov/title8/{§}.html).
 * California HAS a state OSHA plan, so the safety domain returns here for
 * the first time since Washington. VERIFIED 2026-09-04: the pages come in
 * two markup generations that share a skeleton —
 *
 *   <div class="chapter-article">Subchapter 7. General Industry Safety Orders <br/>
 *     Group 20. Flammable Liquids, Gases and Vapors <br/> Article 137. Spray Coating Operations</div>
 *   <h1>&#167;5446. Spray Booths.</h1>
 *   old (5446, 5153): <P> (a) …  <P> (b) …  <P>NOTE: Authority cited: … <P> HISTORY <P>1. Amendment filed 7-16-76; effective thirtieth day thereafter (Register 76, No. 29).
 *   new (5144, 3203): <div class="co_paragraphText">(a) …</div> … <div class="co_paragraphText">Note: Authority cited: …</div>
 *                     <div class="co_headtext">HISTORY</div> <div class="co_paragraphText">1. Repealer and new section filed 7-12-74; …</div>
 *
 * A line-based read handles both: the h1 line names the section (the
 * identity tripwire), the body runs to the "Note: Authority cited" line, and
 * the numbered lines after "HISTORY" are the Register history. Explanatory
 * NOTEs inside the body ("NOTE: This does not preclude …") are regulation
 * text and stay. Register history rides history-dates.ts. The
 * chapter-article line is returned so the capture can cross-check the
 * manifest's article against the page.
 */
import { decodeEntities } from '@repairmcp/state-law';
import { newestRegulationEffectiveDate } from './history-dates.js';
import { CaRegulationParseError } from './parse-ccr-lii.js';

export interface ParsedDirSection {
  cite: string;
  heading: string;
  /** "Subchapter 7. General Industry Safety Orders / Group 20. … / Article 137. Spray Coating Operations" */
  hierarchy: string[];
  text: string;
  authorityNote?: string;
  historyNote?: string;
  effectiveDate?: string;
}

function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function linearize(html: string): string[] {
  return html
    .replace(/<(?:p|div|br|li|h\d|tr|hr)\b[^>]*>/gi, '\n$&')
    .replace(/<\/(?:p|div|li|h\d|tr)>/gi, '$&\n')
    .split('\n')
    .map(clean)
    .filter((line) => line.length > 0);
}

const HEAD = /^§\s*(\d+(?:\.\d+)?)\.\s*(.+?)\.?$/;

export function parseDirTitle8Html(html: string, expected: { cite: string }): ParsedDirSection {
  const crumb = /<div class="chapter-article">([\s\S]*?)<\/div>/i.exec(html);
  const hierarchy = crumb
    ? crumb[1]!
        .split(/<br\s*\/?>/i)
        .map(clean)
        .filter((c) => c.length > 0)
    : [];

  // Drop the link chrome DIR sometimes places under the h1 (a guide PDF) and
  // the navigation footer, neither of which is regulation text.
  const stripped = html
    .replace(/<div[^>]*>\s*<a [^>]*>[^<]*<\/a>\s*<\/div>/gi, ' ')
    .replace(/<a [^>]*>(?:\s*<img[^>]*>)?\s*(?:Go Back to|Return to index|New query)[^<]*<\/a>/gi, ' ');

  const lines = linearize(stripped);
  const headIndex = lines.findIndex((line) => HEAD.test(line));
  if (headIndex < 0) {
    throw new CaRegulationParseError(
      `8 CCR ${expected.cite}: no "§N. Heading." line on the page — the section does not ` +
        'exist at this URL, or the template changed. Re-derive from the saved raw.',
    );
  }
  const head = HEAD.exec(lines[headIndex]!)!;
  const cite = head[1]!;
  if (cite !== expected.cite) {
    throw new CaRegulationParseError(
      `Asked for 8 CCR ${expected.cite} but the page is §${cite} — the URL delivered a different section.`,
    );
  }
  const heading = head[2]!.trim();

  const body: string[] = [];
  const history: string[] = [];
  let authorityNote: string | undefined;
  let mode: 'body' | 'history' | 'done' = 'body';
  for (const line of lines.slice(headIndex + 1)) {
    if (mode === 'done') break;
    if (mode === 'body') {
      if (/^NOTE:\s*Authority cited/i.test(line)) {
        authorityNote = line;
        continue;
      }
      if (/^HISTORY$/i.test(line)) {
        mode = 'history';
        continue;
      }
      body.push(line);
      continue;
    }
    if (/^(?:Go Back|Return to|New query)/i.test(line)) {
      mode = 'done';
      continue;
    }
    history.push(line);
  }

  if (body.length === 0) {
    throw new CaRegulationParseError(`8 CCR ${cite}: no body text captured — template drift.`);
  }

  const effectiveDate = newestRegulationEffectiveDate(history);
  return {
    cite,
    heading,
    hierarchy,
    text: body.join('\n'),
    ...(authorityNote ? { authorityNote } : {}),
    ...(history.length > 0 ? { historyNote: history.join('\n') } : {}),
    ...(effectiveDate ? { effectiveDate } : {}),
  };
}
