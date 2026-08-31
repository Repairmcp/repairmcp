/**
 * Parser for the Texas statutes whole-chapter HTML files served by the
 * statutes SPA's own backend (tcss.legis.texas.gov/resources/{ABBR}/htm/
 * {ABBR}.{chapter}.htm — kickoff §3.1). VERIFIED against the real files
 * 2026-08-31 across seven chapters spanning six codes; the markup is
 * identical everywhere:
 *
 *   <a name="1952.301"></a><a name="92728.82916"></a></p>
 *   <p …><a … href="…#1952.301" style="color:inherit;font-weight:bold;">
 *     Sec. 1952.301.  HEADING IN CAPS.</a>  (a)  First body text…</p>
 *   <p …>(1)  more body…</p>
 *   <p class="left">Added by Acts 2005, 79th Leg., Ch. 727 (H.B. 2017),
 *     Sec. 2, eff. April 1, 2007.</p>
 *
 * The heading lives INSIDE the bold self-link; the first body text follows
 * it in the same <p>. History paragraphs begin "Acts 19xx" (original
 * enactment), "Added by Acts", "Amended by:" (followed by one bare "Acts …"
 * paragraph per act, whose bill-number links interrupt the text — strip tags
 * first), "Renumbered from", or similar. The newest "eff. <date>" across the
 * history note is the section's effectiveDate (the WA newest-effective rule);
 * dates appear in both full ("September 1, 2025") and abbreviated
 * ("Sept. 1, 1993") month forms. A history note with no parseable eff date
 * yields NO effectiveDate — silence over a guess, always.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class TxStatuteParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TxStatuteParseError';
  }
}

export interface ParsedTxStatuteSection {
  cite: string;
  heading: string;
  text: string;
  historyNote?: string;
  effectiveDate?: string;
  repealed: boolean;
}

function stripToText(html: string): string {
  const noTags = html.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/**
 * The head <p> is identified by its bold self-link. The lookahead is bounded
 * to the <a> element so a bold run elsewhere cannot be stitched onto a
 * section number it does not introduce.
 */
const HEAD_LINK =
  /<a[^>]+href="[^"]*#(\d+[A-Z]?\.\d+[A-Za-z-]*)"[^>]*font-weight:\s*bold[^>]*>([\s\S]*?)<\/a>/;

const HEAD_TEXT = /^Sec\.\s+(\d+[A-Z]?\.\d+[A-Za-z-]*)\.\s+(.+)$/;

const HISTORY_START =
  /^(Acts \d{4},|Added by Acts|Amended by|Renumbered from|Redesignated from|Transferred|Repealed by Acts|Reenacted)/;

const SUBCHAPTER_HEAD = /^SUBCHAPTER [A-Z]+(?:-\d+)?\.\s/;
/**
 * A center "Text of section as amended by Acts …" note precedes each copy of
 * a section the Legislature amended twice without reconciling (BC 17.56 is
 * the live example). It belongs to the NEXT section, so it terminates the
 * current one rather than polluting its body.
 */
const VERSION_NOTE = /^Text of (?:section|article|subsection)\b/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Newest "eff. <Month D, YYYY>" in a history note, as ISO — or undefined. */
export function newestEffectiveDate(historyNote: string): string | undefined {
  let best: string | undefined;
  for (const match of historyNote.matchAll(/eff\.\s+([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/g)) {
    const month = MONTHS[match[1]!.toLowerCase().slice(0, 4)] ?? MONTHS[match[1]!.toLowerCase().slice(0, 3)];
    if (!month) continue;
    const iso = `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
    if (!best || iso > best) best = iso;
  }
  return best;
}

export function parseTxChapterHtml(
  html: string,
  opts: { chapter: string },
): { sections: ParsedTxStatuteSection[]; warnings: string[] } {
  const sections: ParsedTxStatuteSection[] = [];
  const warnings: string[] = [];

  let current: ParsedTxStatuteSection | null = null;
  let historyLines: string[] = [];
  let inHistory = false;

  const push = (): void => {
    if (!current) return;
    if (historyLines.length > 0) {
      current.historyNote = historyLines.join('\n');
      const effective = newestEffectiveDate(current.historyNote);
      if (effective) current.effectiveDate = effective;
    }
    if (!current.text && !current.repealed) {
      warnings.push(`${current.cite}: no body text captured.`);
    }
    sections.push(current);
    current = null;
    historyLines = [];
    inHistory = false;
  };

  for (const piece of html.split(/<\/p>/i)) {
    const text = stripToText(piece);
    if (!text) continue;

    const headLink = HEAD_LINK.exec(piece);
    if (headLink) {
      const cite = headLink[1]!;
      const headText = stripToText(headLink[2]!);
      const head = HEAD_TEXT.exec(headText);
      if (!head || head[1] !== cite) {
        throw new TxStatuteParseError(
          `Chapter ${opts.chapter}: the bold self-link for ${cite} does not read ` +
            `"Sec. ${cite}. …" (got "${headText.slice(0, 80)}") — template drift; ` +
            're-derive the parser from the saved raw before capturing.',
        );
      }
      if (!cite.startsWith(`${opts.chapter}.`)) {
        throw new TxStatuteParseError(
          `Section ${cite} does not belong to chapter ${opts.chapter} — wrong file or template drift.`,
        );
      }
      push();
      const heading = head[2]!.trim();
      // The first body text shares the head's <p>, after the </a>.
      const afterLink = stripToText(piece.slice(piece.indexOf(headLink[0]) + headLink[0].length));
      current = {
        cite,
        heading,
        text: afterLink,
        repealed: /^\(?Repealed\b/i.test(heading) || /\bRepealed\.?\)?$/i.test(heading),
      };
      continue;
    }

    if (!current) continue;
    if (SUBCHAPTER_HEAD.test(text) || VERSION_NOTE.test(text)) {
      push();
      continue;
    }
    if (inHistory || HISTORY_START.test(text)) {
      inHistory = true;
      historyLines.push(text);
      continue;
    }
    current.text = current.text ? `${current.text}\n${text}` : text;
  }
  push();

  if (sections.length === 0) {
    throw new TxStatuteParseError(
      `Chapter ${opts.chapter}: no sections found — template drift or wrong file.`,
    );
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.cite)) duplicates.add(section.cite);
    seen.add(section.cite);
  }
  if (duplicates.size > 0) {
    warnings.push(
      `chapter ${opts.chapter} prints ${duplicates.size} cite(s) more than once ` +
        `(${[...duplicates].slice(0, 8).join(', ')}${duplicates.size > 8 ? ', …' : ''}) — ` +
        'the source publishes two texts for them (delayed effective dates); the later one is captured.',
    );
  }
  return { sections, warnings };
}

/**
 * The currency sentence from api/GetProperty/StatutesCurrentMsg — plain text.
 * VERIFIED 2026-08-31: "The statutes available on this website are current
 * through the 89th 2nd Called Legislative Session, 2025. …" A response that
 * cannot state its currency hard-fails the capture.
 */
export function parseTxStatutesCurrency(body: string): {
  currencyNote: string;
  sessionPhrase: string;
} {
  const text = decodeEntities(body).replace(/\s+/g, ' ').trim();
  const match = /current through the (.+?(?:Legislative Session|Legislature)[^.]*\d{4})/i.exec(text);
  if (!match) {
    throw new TxStatuteParseError(
      'The statutes currency endpoint no longer states its currency sentence — ' +
        'refusing to capture a corpus that cannot state its own currency.',
    );
  }
  return { currencyNote: text, sessionPhrase: match[1]!.trim() };
}
