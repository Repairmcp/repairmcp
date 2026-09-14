/**
 * Parser for the Legislature's static unconsolidated ACT pages
 * (legis.state.pa.us/WU01/LI/LI/US/HTM/{YYYY}/0/{AAAA}..HTM). VERIFIED
 * 2026-09-14 against the six manifest acts (kickoff §3.2).
 *
 * The page marks its own regions: `<div class="Comment">19610329ua</div>`
 * (header), `…uc` (table of contents), `…uh` (enacting clause), and one
 * `…u{N}s` per section ("u5s", "u2.1s", "u301s"). Splitting on the section
 * markers means the table of contents — which repeats every "Section N.
 * Catchline." line — is never mistaken for text, and a section's number is
 * cross-checked against its marker so a page whose regions drift fails by
 * name.
 *
 * Inside a region the first <p> is the head: `Section 5.  Catchline.--(a)
 * body…` (modern acts) or `Section 301.  (a) body…` (the 1915 WCA prints no
 * catchline). Later <p>s are body paragraphs; a paragraph that is ONLY a
 * parenthesized history note "(10 amended July 14, 1977, P.L.82, No.30)" is
 * kept as historyNotes, not text. Inline notes "((a) amended …)" are part
 * of the printed text and stay.
 *
 * A paragraph that OPENS with a bold run is dropped as a note (the
 * "Compiler's Note:" label being the only shape ever seen on the six
 * manifest acts) UNLESS its bold text itself opens with "(" or a
 * quotation mark (straight or curly) — the same ruling parse-consolidated
 * applies to Pennsylvania's inline bold subsection markers and defined
 * terms, kept here for consistency even though no manifest act currently
 * prints one. Tags are stripped with an EMPTY string, not a space —
 * matching parse-consolidated.ts — because the real pages use `&nbsp;` for
 * every genuine word gap, including across a bold run's own boundary; a
 * synthetic space at a tag boundary would be verbatim-text corruption. A
 * head whose body is only "(N repealed …)" is repealed.
 */
import { decodeEntities } from '@repairmcp/state-law';
import { parseActTitleLine } from './history-dates.js';

export class ActParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActParseError';
  }
}

export interface ParsedActSection {
  actSection: string;
  /** As printed, trailing period kept; absent when the act prints none. */
  catchline?: string;
  text: string;
  historyNotes: string[];
  repealed: boolean;
}

function stripToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

const REGION = /<div class="Comment">\d{8}u([0-9.]+)s<\/div>/g;
const ANY_MARKER = /<div class="Comment">[^<]*<\/div>/;
const HEAD = /^Section\s+(\d+(?:\.\d+)?)\.\s*(?:(.+?\.)--\s*)?([\s\S]*)$/;
const HISTORY_ONLY = /^\(.*P\.L\..*\)\.?$/;
/**
 * A GENUINE standalone note ("(10 amended July 14, 1977, P.L.82, No.30)",
 * "((14) amended July 7, 2006, P.L.363, No.78)", even the doubled
 * empty-subsection form "(b) ((b) repealed July 15, 2024, P.L. , No.62).")
 * is nothing but the citation, 40-52 chars on every manifest act. A body
 * subsection that merely ENDS with an inline note ("(b)  The appraiser
 * shall furnish a legible copy…((b) amended Apr. 14, 2016, P.L.79,
 * No.13)") also opens with "(" and closes with ")" containing "P.L.", so
 * HISTORY_ONLY alone (the brief's literal regex) matches both shapes —
 * verified against the six real act pages, where it silently swept whole
 * defined-term and subsection paragraphs (some 2000+ chars, e.g. 73 P.S.
 * 201-2's Pyramid Promotional Scheme definition) out of `text` and into
 * `historyNotes`. The real corpus shows a clean gap between the longest
 * true standalone note (52 chars) and the shortest true body paragraph
 * with a trailing inline note (188 chars); this cap sits in that gap.
 */
const MAX_STANDALONE_NOTE_LENGTH = 90;
const REPEALED_BODY = /^\([0-9.]+\s+repealed\b.*\)\.?$/;

/** The paragraph's first bold run, when it opens the paragraph — decoded and trimmed. */
const LEADING_BOLD = /^\s*<p\b[^>]*>\s*<b\b[^>]*>([\s\S]*?)<\/b>/i;
function leadingBoldText(pieceHtml: string): string | undefined {
  const m = LEADING_BOLD.exec(pieceHtml);
  if (!m) return undefined;
  return decodeEntities(m[1]!.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * A bold run opening with "(" is an inline subsection marker; one opening
 * with a quotation mark (straight or curly) is a defined term. Either
 * makes the whole paragraph BODY text, not a note.
 */
const BODY_MARKER_OPENER = /^["“”'‘’(]/;

export function parseActHtml(html: string): {
  title: { actDate: string; pl: string; actNo: string; shortTitle: string };
  sections: ParsedActSection[];
} {
  const titleText = stripToText(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const parsedTitle = parseActTitleLine(titleText);
  if (!parsedTitle) throw new ActParseError(`No "Act of <date>, P.L. N, No. N" title line — not an act page, or template drift.`);
  const shortTitle = stripToText(/<h1>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '');
  if (!shortTitle) throw new ActParseError('No <h1> short title.');

  const markers = [...html.matchAll(REGION)];
  if (markers.length === 0) throw new ActParseError('no section regions (u{N}s markers) found — template drift.');

  const sections: ParsedActSection[] = [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]!;
    const start = m.index! + m[0].length;
    const rest = html.slice(start);
    const nextMarker = ANY_MARKER.exec(rest);
    const region = nextMarker ? rest.slice(0, nextMarker.index) : rest;
    const pieces = region.split(/<\/p>/i).map((p) => ({ text: stripToText(p), html: p })).filter((p) => p.text);
    const first = pieces[0];
    if (!first) throw new ActParseError(`Section region u${m[1]}s is empty.`);
    const head = HEAD.exec(first.text);
    if (!head) throw new ActParseError(`Region u${m[1]}s does not open with "Section N." — got "${first.text.slice(0, 60)}".`);
    if (head[1] !== m[1]) throw new ActParseError(`Region marker u${m[1]}s opens with Section ${head[1]} — template drift.`);
    const catchline = head[2]?.trim();
    const lead = head[3]!.trim();
    const bodyLines: string[] = [];
    const historyNotes: string[] = [];
    if (lead) bodyLines.push(lead);
    for (const p of pieces.slice(1)) {
      if (HISTORY_ONLY.test(p.text) && p.text.length <= MAX_STANDALONE_NOTE_LENGTH) { historyNotes.push(p.text); continue; }
      const bold = leadingBoldText(p.html);
      if (bold !== undefined && !BODY_MARKER_OPENER.test(bold)) continue;
      bodyLines.push(p.text);
    }
    const repealed = bodyLines.length === 1 && REPEALED_BODY.test(bodyLines[0]!);
    sections.push({
      actSection: head[1]!,
      ...(catchline ? { catchline } : {}),
      text: repealed ? '' : bodyLines.join('\n'),
      historyNotes: repealed ? [bodyLines[0]!] : historyNotes,
      repealed,
    });
  }
  return { title: { ...parsedTitle, shortTitle }, sections };
}
