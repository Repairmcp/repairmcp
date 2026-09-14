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
 * of the printed text and stay. A GENUINE standalone note is recognized
 * STRUCTURALLY, not by length (a length cap was tried and failed real-page
 * review — the WCA prints compound notes like "(318 amended Dec. 28, 1959,
 * P.L.2034, No.747; repealed in part Apr. 28, 1978, P.L.202, No.53)" that
 * run past any sane cap): the paragraph's ENTIRE decoded text must be one
 * pair of parentheses (optional trailing period) enclosing one or more
 * act-note CLAUSES joined by "; ", and nothing else. A clause is an
 * optional subsection/definition token ("5", "2.1", "(a)", "(14)", "Def.",
 * "318") followed by a verb (amended/added/repealed[, in part]/reenacted[
 * and amended]/renumbered/deleted[ by amendment]/suspended/expired), a
 * date, ", P.L." with an optional act-number (blank in "P.L. , No.62"),
 * and ", No." with a number. A body subsection that opens with "(" and
 * ends with an inline note ("(f) The court in any action… ((f) repealed in
 * part Oct. 5, 1980, P.L.693, No.142)") has PROSE between its opening
 * paren and its trailing note, so no clause can start right after the
 * anchor's leading "(" — the whole match fails and the paragraph stays
 * body, exactly as it must.
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

/**
 * Fragments for the standalone-note structural test. Deliberately private
 * to this file — history-dates.ts's ACT_NOTE regex does the analogous job
 * (finding an amendment reference ANYWHERE in a section's text to date it)
 * but is not reused here: that regex is not anchored and does not need to
 * reject prose, so coupling the two would make either one harder to change
 * for its own reason.
 */
const NOTE_TOKEN = String.raw`(?:\([a-zA-Z0-9.]{1,12}\)|[a-zA-Z0-9.]{1,12})`;
const NOTE_VERB = String.raw`(?:repealed(?:\s+in\s+part)?|reenacted(?:\s+and\s+amended)?|deleted(?:\s+by\s+amendment)?|amended|added|renumbered|suspended|expired)`;
const NOTE_DATE = String.raw`[A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}`;
/** "P.L.82, No.30" and the blank-number form "P.L. , No.62" both fit. */
const NOTE_PL = String.raw`P\.L\.\s*\d*\s*,\s*No\.\s*\d+`;
const NOTE_CLAUSE = String.raw`(?:${NOTE_TOKEN}\s+)?${NOTE_VERB}\s+${NOTE_DATE},\s*${NOTE_PL}`;
/**
 * The paragraph's entire decoded text, and nothing else, must be one pair
 * of parentheses wrapping one or more `;`-joined clauses. Verified against
 * all 41 manifest sections and, separately, every u{N}s region on all six
 * saved pages — see the fix report for the full before/after diagnostic.
 */
const HISTORY_ONLY = new RegExp(String.raw`^\(${NOTE_CLAUSE}(?:;\s*${NOTE_CLAUSE})*\)\.?$`);
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
      if (HISTORY_ONLY.test(p.text)) { historyNotes.push(p.text); continue; }
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
