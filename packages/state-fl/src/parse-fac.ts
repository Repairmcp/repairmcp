/**
 * Parsers for flrules.org (the Department of State's Florida Administrative
 * Code service). VERIFIED against the live site 2026-09-09.
 *
 * Tier 1 — the chapter page (ChapterHome.asp?Chapter=69B-220), a table of
 * <tr class="results"> rows:
 *   <a href="/gateway/readFile.asp?sid=0&type=1&tid=29438547&file=69B-220.201.doc" title="Rule file">
 *   <td><a class="FX_link_ID" href="/gateway/RuleNo.asp?title=ADJUSTERS&ID=69B-220.201"> 69B-220.201 </a></td>
 *   <td width=450 >Ethical Requirements</td>
 *   <td align="center">4/21/2025</td>
 * The `tid` is the adopting notice id — it changes with every amendment and
 * is the version key (schema.ts: facNoticeId).
 *
 * Tier 1b — the rule card (ruleNo.asp?id=69B-220.201): "Effective Date:"
 * and "History Notes:" cells, the latter the full "Rulemaking Authority …
 * Law Implemented … History–New 6-2-93, Amended …" line with statute cites
 * hyperlinked. The history is read from HERE (plain HTML) and the document
 * is cross-checked against it.
 *
 * Tier 2 — the document text (word-extractor's getBody() over the .doc):
 *   "69B-220.201 Ethical Requirements for All Adjusters and Public Adjuster Apprentices.\n
 *    (1) Definitions.\n(a) "Adjuster," …\n…\n
 *    Rulemaking Authority 624.308, … History-New 6-2-93, Amended … 4-21-25.\n\n"
 * The first line is the rule's own title (fuller than the card's), the last
 * non-empty line is the history line the card already states.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class FlFacParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlFacParseError';
  }
}

export interface FacChapterRow {
  cite: string;
  title: string;
  /** ISO, from the row's M/D/YYYY. */
  effectiveDate: string;
  /** Site-relative download href, entities decoded. */
  docHref: string;
  noticeId: string;
}

export interface FacRuleCard {
  title: string;
  effectiveDate: string;
  /** "Rulemaking Authority … History–New 6-2-93, Amended …" — tags stripped, verbatim. */
  historyNote: string;
  docHref: string;
  noticeId: string;
}

export interface ParsedFacDocument {
  cite: string;
  /** The document's own title line, minus the leading cite. */
  title: string;
  /** One paragraph per line, the history line removed. */
  text: string;
  /** The trailing "Rulemaking Authority …" line, when present. */
  historyLine?: string;
}

/** Anchors vanish without a space (the card hyperlinks every statute cite: "624.308</a>, <a> 626.878</a>"). */
function stripToText(html: string): string {
  return decodeEntities(html.replace(/<\/?a\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

/** "4/21/2025" → "2025-04-21". */
export function usDateToIso(value: string): string | undefined {
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  if (!match) return undefined;
  return `${match[3]}-${match[1]!.padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
}

const DOC_HREF = /href\s*=\s*"([^"]*readFile\.asp[^"]*)"/i;

function noticeIdFrom(href: string): string | undefined {
  return /[?&]tid=(\d+)/.exec(href)?.[1];
}

export function parseFacChapterPage(html: string): FacChapterRow[] {
  const rows: FacChapterRow[] = [];
  const chunks = html.split(/<tr class="results"/i).slice(1);
  for (const chunk of chunks) {
    const rowHtml = chunk.slice(0, chunk.indexOf('</tr>') >= 0 ? chunk.indexOf('</tr>') : undefined);
    const hrefRaw = DOC_HREF.exec(rowHtml)?.[1];
    if (!hrefRaw) continue;
    const docHref = decodeEntities(hrefRaw);
    const noticeId = noticeIdFrom(docHref);
    const cite = stripToText(/class="FX_link_ID"[^>]*>([\s\S]*?)<\/a>/i.exec(rowHtml)?.[1] ?? '');
    const cells = rowHtml.split(/<td\b[^>]*>/i).slice(1).map(stripToText);
    const title = cells[2] ?? '';
    const effectiveDate = usDateToIso(cells[cells.length - 1] ?? '');
    if (!noticeId || !cite || !title || !effectiveDate) {
      throw new FlFacParseError(
        `A chapter row did not parse (cite "${cite}", title "${title}", notice "${noticeId ?? ''}") — ` +
          'template drift; re-derive from the saved raw before capturing.',
      );
    }
    rows.push({ cite, title, effectiveDate, docHref, noticeId });
  }
  if (rows.length === 0) {
    throw new FlFacParseError('No tr.results rows on the chapter page — template drift or an error page.');
  }
  return rows;
}

export function parseFacRuleCard(html: string): FacRuleCard {
  const title = stripToText(/Rule Title:\s*([^<]*)/.exec(html)?.[1] ?? '');
  const effectiveRaw = stripToText(/Effective Date:<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ?? '');
  const effectiveDate = usDateToIso(effectiveRaw);
  const historyNote = stripToText(/History Notes:<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ?? '')
    // The card prints an en dash after "History"; the document prints a hyphen.
    // Keep the card's text as printed except for that one glyph, so the two
    // can be compared and the corpus is consistent across rules.
    .replace(/History[–-]/, 'History–');
  const hrefRaw = DOC_HREF.exec(html)?.[1];
  const docHref = hrefRaw ? decodeEntities(hrefRaw) : '';
  const noticeId = docHref ? noticeIdFrom(docHref) : undefined;
  if (!title || !effectiveDate || !historyNote || !docHref || !noticeId) {
    throw new FlFacParseError(
      `The rule card did not parse (title "${title}", effective "${effectiveRaw}", ` +
        `notice "${noticeId ?? ''}") — template drift, or the rule does not exist.`,
    );
  }
  return { title, effectiveDate, historyNote, docHref, noticeId };
}

const HISTORY_LINE = /^(?:Rulemaking|Specific) Authority\b/;

export function parseFacDocumentText(body: string, expectedCite: string): ParsedFacDocument {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    throw new FlFacParseError(`${expectedCite}: the document yielded ${lines.length} line(s) of text.`);
  }
  const first = lines[0]!;
  const titleMatch = new RegExp(`^${expectedCite.replace(/\./g, '\\.')}\\s+(.+)$`).exec(first);
  if (!titleMatch) {
    throw new FlFacParseError(
      `${expectedCite}: the document's first line is "${first.slice(0, 80)}" — it does not open ` +
        'with the requested rule number. The notice id may have delivered a different rule.',
    );
  }
  let historyLine: string | undefined;
  let last = lines.length;
  if (HISTORY_LINE.test(lines[lines.length - 1]!)) {
    historyLine = lines[lines.length - 1]!;
    last = lines.length - 1;
  }
  const text = lines.slice(1, last).join('\n');
  if (!text) {
    throw new FlFacParseError(`${expectedCite}: the document has a title and history but no body text.`);
  }
  return {
    cite: expectedCite,
    title: titleMatch[1]!.trim(),
    text,
    ...(historyLine ? { historyLine } : {}),
  };
}
