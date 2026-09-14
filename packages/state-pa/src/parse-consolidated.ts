/**
 * Parser for the Legislature's static consolidated-statute CHAPTER pages
 * (legis.state.pa.us/WU01/LI/LI/CT/HTM/{TT}/00.{CCC}..HTM). VERIFIED against
 * Title 42 ch. 83, Title 75 ch. 11 and ch. 73 on 2026-09-14 (kickoff §3.1).
 *
 * One <p> per paragraph, hard-wrapped at ~80 columns inside the tag. A
 * section HEAD prints `<b>§ 7311. &nbsp;Catchline.</b>`; the chapter's and
 * each subchapter's table of contents print the same number and catchline
 * with no § and no bold, so bold-§ is the head test (the CO parse-crs
 * rule). `<div class="Comment">75c7311s</div>` markers are the site's own
 * anchors and are removed before splitting so their text never leaks.
 *
 * After a head, body paragraphs run until the first NOTE: a parenthesized
 * history note `(Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)` (kept,
 * verbatim), or any bold-labeled paragraph (`2012 Amendment.`, `Cross
 * References.`, `Special Provisions in Appendix.` …), or the next
 * subchapter label / TOC / head. `Enactment.` notes are read wherever they
 * appear: "Chapter N was added …" applies to every section without a
 * closer note; "Subchapter X was added …" applies to that subchapter's
 * sections. The date rule itself lives in history-dates.ts.
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

function stripToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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
const SUBCHAPTER = /^SUBCHAPTER ([A-Z])$/;
const TOC_LINE = /^\d{1,4}(?:\.\d+)?\.\s+\S/;
const HISTORY = /^\(.*P\.L\..*\)\.?$/;
const BOLD_LABEL = /^\s*<p[^>]*>\s*<b\b/i;
const REPEALED = /\((Repealed|Expired|Deleted by amendment|Reserved)\)\s*\.?\s*$/i;

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
      if (/\bSubchapter [A-Z] was added\b/.test(piece.text)) subchapterEnactment = piece.text;
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
    if (BOLD_LABEL.test(piece.html)) {
      inNotes = true;
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
