/**
 * Parser for pacodeandbulletin.gov CHAPTER pages
 * (…/Display/pacode?file=/secure/pacode/data/{TTT}/chapter{N}/chap{N}toc.html).
 * VERIFIED 2026-09-14 against Chapters 146, 62, 301, 231, and 9 (kickoff
 * §3.3): despite the name, the page carries every section in full.
 *
 * Markup: `<a name="146.7."></a><h4 class="pacode-section-title"><FONT
 * SIZE=+1>§ 146.7. </FONT>Catchline.</H4>`, then UNCLOSED `<p>` paragraphs
 * (indentation as &nbsp; runs), then labeled blocks `<p><CENTER><B>Source
 * </B></CENTER></P>` — Authority, Source, Notes of Decisions, Cross
 * References. Section text ends at the first label; "The provisions of
 * this § N …" lines under Authority/Source are kept as sourceLines; case
 * notes and cross references are dropped. The preamble before the first h4
 * carries the chapter TOC (ignored) and the chapter-level Source lines
 * ("The provisions of this Chapter 146 adopted …"), which sections without
 * their own history inherit (capture-pacode.ts). Every page states
 * "changes effective through 56 Pa.B. 4026 (July 4, 2026)"; a page that
 * does not is refused. Absence is HTTP 200 + "File not found."
 */
import { decodeEntities } from '@repairmcp/state-law';

export class PacodeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacodeParseError';
  }
}

export interface ParsedPacodeSection {
  cite: string;
  heading: string;
  text: string;
  /** Every "The provisions of this § N …" line the section prints (authority and history). */
  sourceLines: string[];
  reserved: boolean;
}

function stripToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const CURRENCY = /changes effective through\s+(\d+\s+Pa\.B\.\s+\d+\s+\([^)]+\))/;
const H4 = /<h4 class="pacode-section-title">([\s\S]*?)<\/h4>/i;
const HEAD_TEXT = /^§\s*(\d+\.\d+[a-z]?)\.\s*(.*)$/;
/**
 * A whole-RANGE reserved block ("§ § 231.91—231.99. {Reserved}.", double §,
 * hyphen-joined pair, curly-brace "{Reserved}" rather than the single-cite
 * "[Reserved]") — verified on the real chapter 231 page (2026-09-14). It
 * covers no addressable single cite the manifest could ever name, so it is
 * skipped rather than parsed as a section.
 */
const RANGE_RESERVED_HEAD = /^§\s*§\s*\d+\.\d+[a-z]?—\d+\.\d+[a-z]?\.\s*\{Reserved\}\.?$/i;
const LABEL = /<center>\s*<b>\s*([^<]+?)\s*<\/b>\s*<\/center>/i;
const PROVISIONS = /^The provisions of this /;

export function parsePacodeChapterHtml(
  html: string,
  opts: { title: number; chapter: number },
): { currency: string; chapterSourceLines: string[]; sections: ParsedPacodeSection[] } {
  const currency = CURRENCY.exec(stripToText(html))?.[1];
  if (!currency) throw new PacodeParseError('The page does not state its currency ("changes effective through N Pa.B. N (date)") — refusing a corpus that cannot state its own cutoff.');
  if (/File not found\. Please go back and try again\./.test(html)) {
    throw new PacodeParseError(`Chapter ${opts.chapter} of Title ${opts.title}: the site answers "File not found" (HTTP 200) — the chapter does not exist at this path.`);
  }
  const chunks = html.split(/(?=<h4 class="pacode-section-title")/i);
  const preamble = chunks[0] ?? '';
  const chapterSourceLines = preamble
    .split(/<p\b[^>]*>/i)
    .map(stripToText)
    .filter((t) => PROVISIONS.test(t) && / Chapter \d+ /.test(t));

  const sections: ParsedPacodeSection[] = [];
  for (const chunk of chunks.slice(1)) {
    const h4 = H4.exec(chunk);
    if (!h4) throw new PacodeParseError('A section chunk has no closing </h4> — template drift.');
    const headStripped = stripToText(h4[1]!);
    if (RANGE_RESERVED_HEAD.test(headStripped)) continue;
    const head = HEAD_TEXT.exec(headStripped);
    if (!head) throw new PacodeParseError(`Section head "${headStripped.slice(0, 60)}" is not "§ N.N. Catchline." — template drift.`);
    const cite = head[1]!;
    if (!cite.startsWith(`${opts.chapter}.`)) {
      throw new PacodeParseError(`Section ${cite} does not belong to chapter ${opts.chapter} — wrong page or template drift.`);
    }
    const heading = head[2]!.trim();
    const after = chunk.slice(h4.index + h4[0].length);
    const bodyLines: string[] = [];
    const sourceLines: string[] = [];
    let label: string | undefined;
    for (const piece of after.split(/<p\b[^>]*>/i)) {
      const lab = LABEL.exec(piece);
      if (lab) { label = lab[1]!.trim(); continue; }
      const text = stripToText(piece);
      if (!text) continue;
      if (label === undefined) bodyLines.push(text);
      else if ((label === 'Source' || label === 'Authority') && PROVISIONS.test(text)) sourceLines.push(text);
    }
    sections.push({ cite, heading, text: bodyLines.join('\n'), sourceLines, reserved: /^\[Reserved\]/i.test(heading) });
  }
  if (sections.length === 0) throw new PacodeParseError(`Chapter ${opts.chapter} of Title ${opts.title}: no section heads (h4.pacode-section-title) found — template drift or wrong page.`);
  const seen = new Set<string>();
  for (const s of sections) {
    if (seen.has(s.cite)) throw new PacodeParseError(`Section ${s.cite} appears twice on the chapter ${opts.chapter} page.`);
    seen.add(s.cite);
  }
  return { currency, chapterSourceLines, sections };
}
