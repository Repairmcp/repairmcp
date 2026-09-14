/**
 * Parser for the Legislature's static consolidated-statute CHAPTER pages
 * (legis.state.pa.us/WU01/LI/LI/CT/HTM/{TT}/00.{CCC}..HTM). Verified against
 * saved copies of Title 42 ch. 83, Title 75 ch. 11 and ch. 73 at review
 * (2026-09-14) — the review pass is where the inline-bold
 * subsection-marker shape documented below was found; the original
 * capture-time read of the same three pages had missed it.
 *
 * One <p> per paragraph, hard-wrapped at ~80 columns inside the tag. A
 * section HEAD prints `<b>§ 7311. &nbsp;Catchline.</b>`; the chapter's and
 * each subchapter's table of contents print the same number and catchline
 * with no § and no bold, so bold-§ is the head test (the CO parse-crs
 * rule). `<div class="Comment">75c7311s</div>` markers are the site's own
 * anchors and are removed before splitting so their text never leaks.
 *
 * After a head, body paragraphs run until the first NOTE. A paragraph that
 * OPENS with a bold run is a note only when that bold run's decoded text
 * does NOT itself open with "(" or a quotation mark (straight or curly):
 * `2012 Amendment.`, `Cross References.`, `Special Provisions in
 * Appendix.` (even split across several adjacent `<b>` tags — only the
 * first run's opening character is tested), a subchapter title line, and
 * their kin are notes and excluded from text. Pennsylvania prints
 * subsection markers as INLINE bold in the same paragraph as their body —
 * `<b>(a)&nbsp;&nbsp;General rule.--</b>The department shall authorize…` —
 * so a bold run opening with "(" is body, label included. A bold run
 * opening with a quotation mark is a defined term
 * (`<b>"Salvor."</b>&nbsp;A person…`) and is body for the same reason. A
 * standalone parenthesized history note `(Oct. 24, 2012, P.L.1431,
 * No.178, eff. 60 days)` (never bold) is kept, verbatim. The next
 * subchapter label / TOC / head also ends the body run. `Enactment.`
 * notes are read wherever they appear, bold or not (some print via `<b>`,
 * others via a plain-text run inside a bold-styled `<p>` — the check runs
 * on stripped text either way): "Chapter N was added …" applies to every
 * section without a closer note; "Subchapter X was added …" applies to
 * that subchapter's sections (a subchapter letter may carry a decimal,
 * e.g. "C.1", "F.1"). The date rule itself lives in history-dates.ts.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class ConsolidatedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsolidatedParseError';
  }
}

export interface ParsedConsolidatedSection {
  cite: string;
  heading: string;
  /** One paragraph per line, wrapped source lines joined with a space. */
  text: string;
  /** The section's own parenthesized history notes, verbatim, in page order. */
  historyNotes: string[];
  /** The nearest enclosing Enactment note (subchapter's, else chapter's), when one was printed. */
  inheritedEnactment?: string;
  /** The SUBCHAPTER letter the section sits under, when the page prints one. */
  subchapter?: string;
  repealed: boolean;
}

/**
 * Tags are dropped WITHOUT inserting a space at the boundary: every real
 * word-separating space on these pages already exists as a literal
 * character (or `&nbsp;`) in the source, including across a bold run's own
 * boundary — Pennsylvania prints `<b>(a)&nbsp;&nbsp;General rule.--</b>The
 * department…` with no space before "The", and a synthetic one would be
 * verbatim-text corruption, not tidiness. `\s+` afterward still collapses
 * any genuine multi-space/newline run (source line wraps, doubled `&nbsp;`)
 * to one.
 */
function stripToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function toPieces(html: string): { text: string; html: string }[] {
  const cleaned = html.replace(/<div class="Comment">[^<]*<\/div>/g, '');
  const out: { text: string; html: string }[] = [];
  for (const piece of cleaned.split(/<\/p>/i)) {
    const text = stripToText(piece);
    if (text) out.push({ text, html: piece });
  }
  return out;
}

const HEAD = /<b\b[^>]*>\s*(?:&#167;|&sect;|§)\s*(\d{1,4}(?:\.\d+)?)\.\s*(?:&nbsp;|\s)*([\s\S]*?)<\/b>/i;
/** Subchapter letters occasionally carry a decimal, e.g. "SUBCHAPTER C.1", "SUBCHAPTER F.1". */
const SUBCHAPTER = /^SUBCHAPTER ([A-Z](?:\.\d+)?)$/;
const TOC_LINE = /^\d{1,4}(?:\.\d+)?\.\s+\S/;
const HISTORY = /^\(.*P\.L\..*\)\.?$/;
const REPEALED = /\((Repealed|Expired|Deleted by amendment|Reserved)\)\s*\.?\s*$/i;

/**
 * The paragraph's first bold run, when it opens the paragraph — decoded and
 * trimmed. Nested tags are stripped with an EMPTY string, matching
 * `stripToText` above and parse-act.ts's identical helper: the two must stay
 * byte-for-byte identical, because both decide the same question (is this
 * paragraph a note or body?) on the same publisher's markup.
 */
const LEADING_BOLD = /^\s*<p\b[^>]*>\s*<b\b[^>]*>([\s\S]*?)<\/b>/i;
function leadingBoldText(pieceHtml: string): string | undefined {
  const m = LEADING_BOLD.exec(pieceHtml);
  if (!m) return undefined;
  return decodeEntities(m[1]!.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * A bold run opening with "(" is an inline subsection marker
 * ("(a)  General rule.--"); one opening with a quotation mark (straight or
 * curly) is a defined term ('"Salvor."'). Either makes the whole paragraph
 * BODY text, not a note.
 */
const BODY_MARKER_OPENER = /^["“”'‘’(]/;

export function parseConsolidatedChapterHtml(
  html: string,
  opts: { title: number; chapter: number },
): { sections: ParsedConsolidatedSection[]; warnings: string[] } {
  const sections: ParsedConsolidatedSection[] = [];
  const warnings: string[] = [];
  let chapterEnactment: string | undefined;
  let subchapterEnactment: string | undefined;
  let subchapter: string | undefined;
  let current: ParsedConsolidatedSection | null = null;
  let inNotes = false;

  const push = (): void => {
    if (!current) return;
    if (!current.text && !current.repealed) warnings.push(`${current.cite}: no body text captured.`);
    sections.push(current);
    current = null;
    inNotes = false;
  };

  for (const piece of toPieces(html)) {
    const head = HEAD.exec(piece.html);
    if (head) {
      const cite = head[1]!;
      if (Math.floor(Number(cite.split('.')[0]) / 100) !== opts.chapter) {
        throw new ConsolidatedParseError(`Section ${cite} does not belong to chapter ${opts.chapter} of title ${opts.title} — wrong page or template drift.`);
      }
      push();
      const heading = stripToText(head[2]!);
      current = {
        cite, heading, text: '', historyNotes: [], repealed: REPEALED.test(heading),
        ...(subchapterEnactment ?? chapterEnactment ? { inheritedEnactment: subchapterEnactment ?? chapterEnactment } : {}),
        ...(subchapter ? { subchapter } : {}),
      };
      continue;
    }
    const sub = SUBCHAPTER.exec(piece.text);
    if (sub) {
      push();
      subchapter = sub[1]!;
      subchapterEnactment = undefined;
      continue;
    }
    if (/^Enactment\./.test(piece.text)) {
      push();
      if (/\bSubchapter [A-Z](?:\.\d+)? was added\b/.test(piece.text)) subchapterEnactment = piece.text;
      else if (/\bChapter \d+ was added\b/.test(piece.text)) chapterEnactment = piece.text;
      continue;
    }
    if (TOC_LINE.test(piece.text) || piece.text === 'Sec.') {
      push();
      continue;
    }
    if (!current) continue;
    if (HISTORY.test(piece.text)) {
      current.historyNotes.push(piece.text);
      inNotes = true;
      continue;
    }
    const boldOpener = leadingBoldText(piece.html);
    if (boldOpener !== undefined) {
      if (BODY_MARKER_OPENER.test(boldOpener)) {
        inNotes = false;
        current.text = current.text ? `${current.text}\n${piece.text}` : piece.text;
      } else {
        inNotes = true;
      }
      continue;
    }
    if (inNotes) continue;
    current.text = current.text ? `${current.text}\n${piece.text}` : piece.text;
  }
  push();

  if (sections.length === 0) {
    throw new ConsolidatedParseError(`Title ${opts.title} chapter ${opts.chapter}: no section heads (bold § lines) found — template drift or wrong page.`);
  }
  const seen = new Set<string>();
  for (const s of sections) {
    if (seen.has(s.cite)) throw new ConsolidatedParseError(`Section ${s.cite} appears twice as a head on the chapter ${opts.chapter} page.`);
    seen.add(s.cite);
  }
  return { sections, warnings };
}
