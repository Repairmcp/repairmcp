/**
 * Parser for leginfo.legislature.ca.gov, the Legislature's own publication
 * of the California codes. VERIFIED against the live site 2026-09-04 in
 * both of its views, which share one per-section markup:
 *
 *   text view   codes_displayText.xhtml?lawCode=BPC&division=3.&title=&part=&chapter=20.3.&article=
 *               wrapper <div id="manylawsections">, one <h6> head per section:
 *               <h6 style="float:left;"><a href="javascript:submitCodesValues('9884.9.',…)">9884.9.</a></h6>
 *   section view codes_displaySection.xhtml?lawCode=INS&sectionNum=758.5.
 *               wrapper <div id="codeLawSectionNoHead">, head <h6><b>758.5.  </b></h6>
 *
 * Above the heads sit the hierarchy headers — <h3> the code, <h4> DIVISION /
 * PART / CHAPTER, <h5> ARTICLE — each printed with its bracketed section
 * range ("CHAPTER 20.3. Automotive Repair [9880 - 9889.68]"). The body is a
 * run of <p> elements (some self-closing spacers); the history note is the
 * last <p> of the block, styled font-size:0.9em and wrapped in <i>:
 *
 *   (Amended by Stats. 2018, Ch. 503, Sec. 3.   (AB 3141)   Effective January 1, 2019.)
 *   (Repealed (in Sec. 4) and added by Stats. 2015, Ch. 754, Sec. 5. (AB 1513)
 *    Effective January 1, 2016. Section operative January 1, 2021, by its own provisions.)
 *   (Added by Stats. 1971, Ch. 1578.)
 *
 * effectiveDate is the NEWEST "Effective <Month D, YYYY>" or "operative
 * <Month D, YYYY>" the note states — an operative date is when the current
 * text actually took hold. A note stating neither (1937 enactments, chaptered
 * bills without an urgency clause) yields NO effectiveDate: silence over a
 * guess, always.
 *
 * California prints no catchlines, so this parser returns no heading — the
 * manifest supplies one (schema.ts explains headingSource).
 *
 * A section the site does not know returns HTTP 200 with an EMPTY
 * single_law_section div — no wrapper at all — which is how absence is
 * detected. A section the site prints in two versions (Lab. Code 226.7 in
 * 2026) 302s the section view to a JSF picker; the text view prints both
 * blocks, and the capture chooses (capture-statutes.ts).
 */
import { decodeEntities } from '@repairmcp/state-law';

export class CaStatuteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaStatuteParseError';
  }
}

export interface ParsedCaStatuteSection {
  cite: string;
  text: string;
  historyNote?: string;
  effectiveDate?: string;
}

export interface ParsedLeginfoPage {
  /** "Business and Professions Code - BPC" */
  codeTitle: string;
  /** The DIVISION / PART / CHAPTER / ARTICLE header lines, top-down, as printed. */
  hierarchy: string[];
  sections: ParsedCaStatuteSection[];
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function stripToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Newest "Effective <Month D, YYYY>" / "operative <Month D, YYYY>" in a history note, as ISO. */
export function newestStatuteEffectiveDate(historyNote: string): string | undefined {
  let best: string | undefined;
  for (const match of historyNote.matchAll(
    /\b(?:Effective|operative)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/g,
  )) {
    const month = MONTHS[match[1]!.toLowerCase()];
    if (!month) continue;
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
    if (!best || iso > best) best = iso;
  }
  return best;
}

const WRAPPER = /<div id="(?:manylawsections|codeLawSectionNoHead)">/;
const HEAD = /<h6[^>]*>\s*(?:<a [^>]*>|<b>)\s*([\d.]+?)\.?\s*(?:<\/a>|<\/b>)\s*<\/h6>/g;
/**
 * The history note is an <i>(…)</i> opening with a session-law verb. The
 * text view wraps it in a styled <p>; the section view prints the bare <i>
 * after the last </p> — so the <i> is what identifies it, and the LAST one
 * in the block is the note (a body paragraph never ends with one).
 */
const HISTORY =
  /<i>\s*(\((?:Added|Amended|Enacted|Repealed|Renumbered|Redesignated|Transferred|Relocated|Heading)[\s\S]*?\))\s*<\/i>/g;

export function parseLeginfoHtml(html: string): ParsedLeginfoPage {
  const wrapperMatch = WRAPPER.exec(html);
  if (!wrapperMatch) {
    throw new CaStatuteParseError(
      'No law-section wrapper on the page: leginfo answers an unknown section with an EMPTY ' +
        'single_law_section div (HTTP 200) — the requested section does not exist, or the ' +
        'template changed. Re-derive from the saved raw before capturing.',
    );
  }
  // The law text is an embedded HTML document that closes with </BODY>; the
  // JSF chrome after it (which repeats the code name) is not law.
  const embeddedEnd = /<\/body>/i.exec(html.slice(wrapperMatch.index));
  const body = html.slice(
    wrapperMatch.index,
    embeddedEnd ? wrapperMatch.index + embeddedEnd.index : undefined,
  );

  // The text view prints the code title in <h3>; the section view prints it
  // as the first <h4> ("Insurance Code - INS") ahead of the DIVISION line.
  // Either way it is the code title, not a hierarchy level.
  let codeTitle = stripToText(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(body)?.[1] ?? '');
  const hierarchy: string[] = [];
  const headerPositions: number[] = [];
  for (const match of body.matchAll(/<h[45][^>]*>\s*<b>([\s\S]*?)<\/b>\s*<\/h[45]>/g)) {
    const line = stripToText(match[1]!);
    if (!/^(?:DIVISION|PART|TITLE|CHAPTER|ARTICLE)\s/.test(line)) {
      if (!codeTitle) codeTitle = line;
      continue;
    }
    hierarchy.push(line);
    headerPositions.push(match.index!);
  }

  const heads = [...body.matchAll(HEAD)];
  if (heads.length === 0) {
    throw new CaStatuteParseError(
      'The page has a law-section wrapper but no <h6> section heads — template drift; ' +
        're-derive the parser from the saved raw before capturing.',
    );
  }

  const sections: ParsedCaStatuteSection[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i]!;
    const cite = head[1]!;
    const start = head.index! + head[0].length;
    // A block ends at the next section head OR at the next ARTICLE/CHAPTER
    // header, whichever comes first — an article heading printed between
    // two sections belongs to neither.
    const nextHead = i + 1 < heads.length ? heads[i + 1]!.index! : body.length;
    const nextHeader = headerPositions.find((pos) => pos > start) ?? body.length;
    const end = Math.min(nextHead, nextHeader);
    let block = body.slice(start, end);

    let historyNote: string | undefined;
    const notes = [...block.matchAll(HISTORY)];
    const history = notes[notes.length - 1];
    if (history) {
      historyNote = stripToText(history[1]!);
      block = block.slice(0, history.index) + block.slice(history.index + history[0].length);
    }

    const lines = block
      .split(/<\/p>|<p[^>]*\/>/i)
      .map(stripToText)
      .filter((line) => line.length > 0);
    const text = lines.join('\n');
    if (!text) warnings.push(`${cite}: no body text captured.`);

    const effectiveDate = historyNote ? newestStatuteEffectiveDate(historyNote) : undefined;
    sections.push({
      cite,
      text,
      ...(historyNote ? { historyNote } : {}),
      ...(effectiveDate ? { effectiveDate } : {}),
    });
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.cite)) duplicates.add(section.cite);
    seen.add(section.cite);
  }
  if (duplicates.size > 0) {
    warnings.push(
      `${duplicates.size} cite(s) printed more than once (${[...duplicates].slice(0, 8).join(', ')}` +
        `${duplicates.size > 8 ? ', …' : ''}) — the Legislature prints two texts for them ` +
        '(a version with a later operative date); the capture selects by date.',
    );
  }

  return { codeTitle, hierarchy, sections, warnings };
}
