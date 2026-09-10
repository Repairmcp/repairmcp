/**
 * Parser for the Senate's public statute pages (www.nysenate.gov/
 * legislation/laws/{LAW}/{SECTION}). VERIFIED 2026-09-10 across all 33
 * manifest cites. Drupal, fully server-rendered:
 *
 *   <div class="nys-openleg-history-published">Viewing most recent revision (from 2017-06-23)</div>
 *   <h2 class="nys-openleg-result-title-headline">SECTION 2610</h2>
 *   <h3 class="nys-openleg-result-title-short">Collision or comprehensive coverage …</h3>
 *   <h4 class="nys-openleg-result-title-location">Insurance (ISC) CHAPTER 28, ARTICLE 26</h4>
 *   <div class="nys-openleg-result-text">  &sect; 2610. Collision … repairs. (a) Whenever …<br />line<br /><br />(b) …</div>
 *
 * The text div carries the statute as the Legislative Bill Drafting
 * Commission prints it: one <br /> per source line, two for a paragraph
 * break. Single breaks join with a space; double breaks become the corpus's
 * one-paragraph-per-line form. The body opens with "§ <cite>. <catchline>."
 * — that lead is KEPT (it is source text) and cross-checked against the
 * headline so a URL can never deliver the wrong section. New York prints
 * catchlines; the h3 is source text and becomes the heading.
 *
 * The banner's date is the date of the current text (the site's history
 * select lists earlier versions) and is the section's effectiveDate. No
 * surface states a statewide currency line.
 *
 * Absence is HTTP 200 with "The requested entry could not be found." and
 * no result-text div — detected by the missing wrapper, never by status.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class NySenateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NySenateParseError';
  }
}

export interface ParsedSenatePage {
  /** As the headline prints it: "2610", "398-D", "198-C". */
  cite: string;
  /** The catchline (h3), source text. */
  heading: string;
  /** "Insurance (ISC) CHAPTER 28, ARTICLE 26" — the chapter is derived from this. */
  location: string;
  /** One paragraph per line; the "§ N. Catchline." lead kept on the first line. */
  text: string;
  /** ISO date from the revision banner. */
  revisionDate: string;
}

const ABSENT = /The requested entry could not be found/;
const BANNER = /nys-openleg-history-published">\s*Viewing most recent revision \(from (\d{4}-\d{2}-\d{2})\)/;
const HEADLINE = /nys-openleg-result-title-headline">\s*SECTION\s+([0-9A-Z-]+)\s*</;
const SHORT = /nys-openleg-result-title-short">([\s\S]*?)<\/h3>/;
const LOCATION = /nys-openleg-result-title-location">([\s\S]*?)<\/h4>/;
const TEXT = /<div class="nys-openleg-result-text">([\s\S]*?)<\/div>/;

function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseSenateHtml(html: string): ParsedSenatePage {
  const textMatch = TEXT.exec(html);
  if (!textMatch) {
    if (ABSENT.test(html)) {
      throw new NySenateParseError(
        'The Senate site answers "The requested entry could not be found" (HTTP 200) — the ' +
          'section does not exist under this law id and number; renumbered or repealed upstream.',
      );
    }
    throw new NySenateParseError('No nys-openleg-result-text div — template drift, or not a statute page.');
  }
  if (/<div/i.test(textMatch[1]!)) {
    throw new NySenateParseError(
      'The text region contains a nested <div> — template drift; re-derive the parser from the saved raw before capturing.',
    );
  }
  const banner = BANNER.exec(html);
  if (!banner) throw new NySenateParseError('No "Viewing most recent revision (from …)" banner — template drift.');
  const headline = HEADLINE.exec(html);
  if (!headline) throw new NySenateParseError('No "SECTION N" headline — template drift.');
  const cite = headline[1]!;
  const heading = clean(SHORT.exec(html)?.[1] ?? '');
  if (!heading) throw new NySenateParseError(`${cite}: no catchline in the title-short h3.`);
  const location = clean(LOCATION.exec(html)?.[1] ?? '');
  if (!location) throw new NySenateParseError(`${cite}: no location line.`);

  const text = textMatch[1]!
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .split('\n')
    .map(clean)
    .filter((line) => line.length > 0)
    .join('\n');
  if (!text) throw new NySenateParseError(`${cite}: empty text div.`);

  const lead = new RegExp(`^§\\s*${cite.replace(/-/g, '\\-')}\\.`, 'i');
  if (!lead.test(text)) {
    throw new NySenateParseError(
      `${cite}: the body opens with "${text.slice(0, 40)}" rather than "§ ${cite}." — the URL delivered a different section.`,
    );
  }
  return { cite, heading, location, text, revisionDate: banner[1]! };
}
