/**
 * Parser for Online Sunshine (leg.state.fl.us), the Legislature's own
 * publication of the Florida Statutes. VERIFIED against the live site
 * 2026-09-09 on the single-section view
 * (index.cfm?App_mode=Display_Statute&Search_String=&URL=0500-0599/0559/Sections/0559.905.html):
 *
 *   <h2>The 2026 Florida Statutes …</h2>             the EDITION marker, outer page
 *   <div id="statutes"><font …><!DOCTYPE …><html>…  a SECOND complete HTML document
 *   <div class="Section">
 *     <span class="SectionNumber">559.905&#x2003;</span>
 *     <span class="Catchline"><span class="CatchlineText">Written motor vehicle repair
 *       estimate and disclosure statement required.</span><span class="EmDash">—</span></span>
 *     <span class="SectionBody">
 *       <div class="Subsection"><span class="Number">(1)&#x2003;</span><span class="Text Intro Justify">…</span>
 *         <div class="Paragraph"><span class="Number">(a)&#x2003;</span><span class="Text …">…</span></div>
 *         <p class="Flush SpaceAbove Justify">…</p>
 *       </div>
 *     </span>
 *     <div class="History"><span class="HistoryTitle">History.</span><span class="EmDash">—</span>
 *       <span class="HistoryText">s. 1, ch. 80-139; … s. 29, ch. 2024-137.</span></div>
 *     <div class="Note"><span class="NoteTitle">Note.</span>…<span class="Text …">Former s. 559.923.</span></div>
 *   </div>
 *
 * The catchline IS source text (Florida prints them). The history note is a
 * session-law list with NO effective dates, so this parser yields none —
 * currency is the edition (schema.ts). The edition phrase is captured whole,
 * including any special-session suffix Online Sunshine prints in the same
 * <h2>, so the capture's pin (FL_STATUTES_EDITION) fails loudly on either a
 * yearly rollover or a mid-year special session.
 *
 * Absence is HTTP 200 with "The statute you have selected cannot be found."
 * and no div.Section — detected by the missing wrapper, never by status.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class FlStatuteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlStatuteParseError';
  }
}

export interface ParsedFlStatutePage {
  /** "The 2026 Florida Statutes" — with any special-session suffix, normalized to one line. */
  edition: string;
  cite: string;
  /** The catchline as printed, trailing period kept. */
  heading: string;
  /** One paragraph per line, subsection numbering preserved. */
  text: string;
  /** "History.—s. 1, ch. 80-139; …", plus "Note.—…" on a new line when printed. */
  historyNote: string;
}

/** Hex numeric references first (decodeEntities handles only decimal), then the shared map. */
function decodeAll(html: string): string {
  return decodeEntities(
    html.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))),
  );
}

/**
 * Inline anchors (cross-references like <a …>713.78</a>(11)) vanish without
 * a space so "s. 713.78(11)" stays verbatim; every other tag becomes a space.
 */
function stripToText(html: string): string {
  return decodeAll(html.replace(/<\/?a\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EDITION = /<h2>\s*(The\s+\d{4}\s+Florida\s+Statutes[^<]*)/;
const ABSENT = /The statute you have selected cannot be found/;

export function parseOnlineSunshineHtml(html: string): ParsedFlStatutePage {
  const editionMatch = EDITION.exec(html);
  if (!editionMatch) {
    throw new FlStatuteParseError(
      'No "The NNNN Florida Statutes" edition marker on the page — template drift, or not an ' +
        'Online Sunshine statute page. Re-derive the parser from the saved raw before capturing.',
    );
  }
  const edition = editionMatch[1]!.replace(/\s+/g, ' ').trim();

  const sectionStart = html.indexOf('<div class="Section">');
  if (sectionStart < 0) {
    if (ABSENT.test(html)) {
      throw new FlStatuteParseError(
        'Online Sunshine answers "The statute you have selected cannot be found" (HTTP 200) — ' +
          'the requested section does not exist in this edition; renumbered or repealed upstream.',
      );
    }
    throw new FlStatuteParseError(
      'The page has an edition marker but no div.Section — template drift; re-derive the ' +
        'parser from the saved raw before capturing.',
    );
  }
  // The statute is an embedded document that closes with </body>; the outer
  // chrome after it (copyright, nav) is not law.
  const embeddedEnd = html.indexOf('</body>', sectionStart);
  const block = html.slice(sectionStart, embeddedEnd > 0 ? embeddedEnd : undefined);

  const cite = stripToText(/<span class="SectionNumber">([\s\S]*?)<\/span>/.exec(block)?.[1] ?? '');
  if (!/^\d+\.\d+$/.test(cite)) {
    throw new FlStatuteParseError(`No section number in span.SectionNumber (got "${cite}").`);
  }
  const heading = stripToText(/<span[^>]*class="CatchlineText">([\s\S]*?)<\/span>/.exec(block)?.[1] ?? '');
  if (!heading) {
    throw new FlStatuteParseError(`${cite}: no catchline in span.CatchlineText.`);
  }

  const bodyStart = block.indexOf('<span class="SectionBody">');
  const historyStart = block.indexOf('<div class="History">');
  if (bodyStart < 0 || historyStart < 0 || historyStart < bodyStart) {
    throw new FlStatuteParseError(`${cite}: span.SectionBody / div.History not in the expected order.`);
  }
  const body = block.slice(bodyStart, historyStart);
  const lines = body
    // Each numbered block and each prose <p> becomes its own line. A form
    // blank (span.HorizontalRule, a non-breaking space) prints as a rule so
    // the check-one disclosure in 559.905 keeps its shape.
    .replace(/<span class="HorizontalRule[^"]*">[\s\S]*?<\/span>/g, ' ______ ')
    .replace(/<div class="(?:Subsection|Paragraph|SubParagraph|SubSubParagraph|SubSubSubParagraph)">/g, '\n')
    .replace(/<p\b/g, '\n<p')
    .replace(/<\/p>/g, '\n')
    .split('\n')
    .map(stripToText)
    .filter((line) => line.length > 0);
  const text = lines.join('\n');
  if (!text) {
    throw new FlStatuteParseError(`${cite}: no body text captured from span.SectionBody.`);
  }

  const tail = block.slice(historyStart);
  const historyText = stripToText(/<span[^>]*class="HistoryText">([\s\S]*?)<\/span>/.exec(tail)?.[1] ?? '');
  let historyNote = `History.—${historyText}`;
  const noteMatch = /<div class="Note">([\s\S]*?)<\/div>/.exec(tail);
  if (noteMatch) {
    const noteText = stripToText(noteMatch[1]!.replace(/<span class="NoteTitle">[\s\S]*?<\/span>/, '').replace(/<span class="EmDash">[\s\S]*?<\/span>/, ''));
    if (noteText) historyNote += `\nNote.—${noteText}`;
  }

  return { edition, cite, heading, text, historyNote };
}
