/**
 * CCR parsing, two halves. (1) parseCcrPdfPages: the SOS serves one document
 * per SERIES, and the PDF is the one the publisher itself calls official —
 * the rule-info page says so in as many words ("The PDF document constitutes
 * the official version of the rule and shall govern in all cases. The Word
 * document is provided as an accessible alternative"). The research pass
 * planned to read the Word download and split word/document.xml; the real
 * download is `application/msword`, a legacy OLE .doc (magic D0CF11E0, filename
 * "3 CCR 702-5.doc"), not a DOCX zip at all. So the capture takes the official
 * PDF, and the Word auto-numbering worry the DOCX path carried disappears with
 * it: a PDF's numbering is rendered text. The extraction lives in
 * pdf-text.ts / capture-ccr.ts, never here — this module ships in the barrel
 * and must stay dependency-free. (2) The find* helpers regex the
 * server-rendered SOS browse pages (deptID/agencyID → ruleId →
 * ruleVersionId + effective date + the document download), hardened in task 10
 * against the real pages: see the comments on each.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class CcrParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CcrParseError';
  }
}

export type CcrHeaderKind = 'regulation' | 'comps-rule' | 'puc-rule';

export interface ParsedCcrReg {
  regNumber: string;
  heading: string;
  text: string;
  statedEffectiveDate?: string;
  /** `[Reserved]` / `[Repealed …]` — a held or emptied number, not a rule. */
  placeholder: boolean;
}

/**
 * Header patterns, re-derived from the real PDFs — one shape per publisher,
 * because the three agencies do not typeset alike.
 *
 * The Division of Insurance sets a regulation's catchline in CAPITALS. That
 * matters: the research-pass pattern accepted anything after the number, which
 * on the real 3 CCR 702-5 matched 72 lines for 39 regulations, because every
 * history entry ("Regulation 5-1-19 repealed eff. 02/14/2025.", "Regulation
 * 5-3-1 and is certified with a Cost Containment Certificate…") reads like a
 * header. Requiring the first word after the number to carry no lowercase
 * letter separates them exactly.
 *
 * The PUC numbers its rules `6511. Rates and Charges.` in title case, so no
 * such restriction is possible — and none is needed: across all 5,046 lines of
 * 4 CCR 723-6 only the 155 real rule and reserved-range entries begin with a
 * four-digit number and a period. Cross-references inside the text are written
 * `6512(a)` or `6513,` and never match.
 *
 * COMPS numbers an outline, not a list of rules: `Rule 5. Meal and Rest
 * Periods.` heads a part, and the provisions under it are `5.1`, `5.2`,
 * `5.2.1` with NO `Rule` prefix — which is why the research pattern (`Rule
 * <number>`) found none of the five cites the manifest names. Matching the
 * outline directly yields exactly the document's 102 numbered provisions, in
 * order, with no false positives; the `Rule N.` form is accepted too, and the
 * trailing period is REQUIRED there so that prose like "Rule 4 overtime rules
 * do not apply to…" is not read as a heading.
 *
 * A COMPS provision also puts its catchline and its first sentence on one
 * line ("5.1 Meal Periods. Employees shall be entitled to…"), so the two are
 * split; and some provisions have no catchline at all ("4.1.1 Employees shall
 * be paid time and one-half…"), which is why headings are inherited from the
 * enclosing provision — "Overtime Wages." is the source's own heading for that
 * text, one level up. Nothing is invented.
 */
const CAPS_CATCHLINE = String.raw`(\[[^\]]*\]|[A-Z][^a-z\s]*(?:\s.*)?)`;
const ANY_CATCHLINE = String.raw`(\S.*)`;
const HEADER_PATTERNS: Record<CcrHeaderKind, RegExp> = {
  regulation: new RegExp(String.raw`^Regulation\s+(\d+-\d+-\d+)\s+${CAPS_CATCHLINE}$`),
  'comps-rule': /^(?:Rule\s+(\d+)\.|(\d+(?:\.\d+)+))\s+(\S.*)$/,
  'puc-rule': new RegExp(String.raw`^(\d{4})\.\s+${ANY_CATCHLINE}$`),
};

interface HeaderMatch {
  regNumber: string;
  heading: string;
  /** Text that shared the header's line and belongs to the body. */
  firstLine?: string;
}

/** A short leading sentence is the provision's catchline; a definition is not. */
const COMPS_CATCHLINE = /^([^.“"]{1,70}\.)(?:\s+(\S.*))?$/;

function matchHeader(kind: CcrHeaderKind, line: string): HeaderMatch | null {
  const m = HEADER_PATTERNS[kind].exec(line);
  if (!m) return null;
  if (kind !== 'comps-rule') {
    return { regNumber: m[1]!, heading: m[2]!.trim() };
  }
  const regNumber = (m[1] ?? m[2])!;
  const rest = m[3]!.trim();
  const split = COMPS_CATCHLINE.exec(rest);
  if (!split) return { regNumber, heading: '', firstLine: rest };
  return {
    regNumber,
    heading: split[1]!.trim(),
    ...(split[2] ? { firstLine: split[2].trim() } : {}),
  };
}

/** `5.2.1` → `5.2` → `5`; used only to inherit a missing catchline. */
function ancestorsOf(regNumber: string): string[] {
  const parts = regNumber.split('.');
  const out: string[] = [];
  for (let i = parts.length - 1; i > 0; i--) out.push(parts.slice(0, i).join('.'));
  return out;
}
/**
 * `6502. [Reserved].`, `6515. – 6599. [Reserved].`, `Regulation 5-1-19
 * [Repealed eff. 02/14/2025]` — number slots the publisher is holding open or
 * has emptied. They are not rules and must not reach the corpus as sections
 * with no text; the caller decides whether that is a skip (a prefix filter) or
 * a hard failure (a rule asked for by name).
 */
const PLACEHOLDER_CATCHLINE = /\[\s*(Reserved|Repealed)\b/i;
/**
 * A catchline that ran past the page width continues on all-capitals lines —
 * but only when it was cut off mid-phrase. A heading that already ends in a
 * full stop is complete, and continuing it swallows whatever banner follows
 * (4 CCR 723-6's reserved slot "6515. - 6599. [Reserved]." is immediately
 * followed by the all-capitals part title "MOVER RULES").
 */
const CAPS_LINE = /^[^a-z]*[A-Z][^a-z]*$/;
const COMPLETE_HEADING = /[.]\s*$/;
const MAX_HEADING_CONTINUATION_LINES = 3;

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function longDateToIso(text: string): string | undefined {
  const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(text);
  if (!m) return undefined;
  return `${m[3]}-${MONTHS[m[1]!.toLowerCase()]}-${m[2]!.padStart(2, '0')}`;
}

/**
 * Every CCR regulation ends with its own numbered "Effective Date" section,
 * followed by a "History" section listing every prior amendment. Reading the
 * last 500 characters — the research-pass approach — reads the History list,
 * where the dates belong to superseded versions. Anchor on the section
 * instead, and stop at History.
 *
 * The heading appears twice: once in the regulation's own table of contents
 * (immediately followed by the History heading, so it yields nothing) and once
 * over the sentence that states the date. Taking the first block that actually
 * contains a date therefore lands on the real one.
 */
function statedEffectiveDateOf(text: string): string | undefined {
  for (const m of text.matchAll(/Section\s+\d+\.?\s+Effective\s+Date\b/gi)) {
    const after = text.slice(m.index + m[0].length);
    const end = /Section\s+\d+\.?\s+History\b/i.exec(after);
    const block = after.slice(0, end ? end.index : 400);
    const iso = longDateToIso(block);
    if (iso) return iso;
  }
  return undefined;
}

/**
 * Running headers repeat on every page ("CODE OF COLORADO REGULATIONS
 * 3 CCR 702-5" / the agency name / the page number) and would otherwise land
 * mid-sentence in the captured text, 131 times over. They are removed by
 * measurement rather than by pattern: a short line that appears at the top or
 * bottom of most pages is furniture, and the page number beside it is the one
 * line that changes. Nothing here guesses at rule text — only lines in the
 * first or last three of a page are ever eligible.
 */
export function stripPageFurniture(pages: readonly string[]): {
  lines: string[];
  dropped: number;
} {
  const perPage = pages.map((page) =>
    page.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 0),
  );
  const EDGE = 3;
  const counts = new Map<string, number>();
  for (const lines of perPage) {
    const edges = new Set([...lines.slice(0, EDGE), ...lines.slice(-EDGE)]);
    for (const line of edges) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(perPage.length * 0.6));
  const repeated = new Set(
    [...counts.entries()].filter(([line, n]) => n >= threshold && line.length <= 120).map(([line]) => line),
  );

  const out: string[] = [];
  let dropped = 0;
  for (const lines of perPage) {
    lines.forEach((line, i) => {
      const atEdge = i < EDGE || i >= lines.length - EDGE;
      if (atEdge && (repeated.has(line) || /^\d{1,4}$/.test(line))) {
        dropped++;
        return;
      }
      out.push(line);
    });
  }
  return { lines: out, dropped };
}

/**
 * The PDF's own line breaks are KEPT — deliberately, and this is the decision
 * to leave alone. Reflowing wrapped lines into paragraphs reads better in the
 * two thirds of cases that are plain prose and destroys the rest: COMPS 5.2
 * renders its rest-period entitlement as a table, one line per row ("Over 6,
 * and up to 10 | 2"), and joining those lines produces a single unreadable
 * run of numbers. Line ends also carry real hyphens ("claims-", "day-",
 * "Out-of-") that a naive join would either split or fuse. Whitespace is
 * normalised within a line and nothing is dropped, reordered, or invented;
 * where the publisher broke a line, so does the corpus.
 */
export function parseCcrPdfPages(
  pages: readonly string[],
  opts: { headerKind: CcrHeaderKind; seriesNum: string },
): { regs: ParsedCcrReg[]; warnings: string[] } {
  const warnings: string[] = [];
  const regs: ParsedCcrReg[] = [];
  const headingByNumber = new Map<string, string>();
  const { lines, dropped } = stripPageFurniture(pages);
  if (pages.length > 4 && dropped === 0) {
    warnings.push(
      `${opts.seriesNum}: no repeated page furniture was recognised in a ${pages.length}-page ` +
        'document — the running header may now be landing inside the captured rule text.',
    );
  }

  let current: { regNumber: string; heading: string; lines: string[] } | null = null;
  let headingContinuation = 0;

  const push = (): void => {
    if (!current) return;
    const text = current.lines.join('\n');
    const stated = statedEffectiveDateOf(text);
    if (!current.heading) {
      // Sections must carry a heading; the number is the only thing the
      // document gives us here, and inventing a caption would be worse.
      warnings.push(`${opts.seriesNum}: ${current.regNumber} has no catchline of its own or above it.`);
      current.heading = current.regNumber;
    }
    regs.push({
      regNumber: current.regNumber,
      heading: current.heading,
      text,
      placeholder: PLACEHOLDER_CATCHLINE.test(current.heading),
      ...(stated ? { statedEffectiveDate: stated } : {}),
    });
    current = null;
  };

  for (const line of lines) {
    const header = matchHeader(opts.headerKind, line);
    if (header) {
      push();
      let heading = header.heading;
      if (heading) headingByNumber.set(header.regNumber, heading);
      else {
        for (const ancestor of ancestorsOf(header.regNumber)) {
          const inherited = headingByNumber.get(ancestor);
          if (inherited) { heading = inherited; break; }
        }
      }
      current = {
        regNumber: header.regNumber,
        heading,
        lines: header.firstLine ? [header.firstLine] : [],
      };
      headingContinuation =
        header.firstLine || !heading || COMPLETE_HEADING.test(heading)
          ? 0
          : MAX_HEADING_CONTINUATION_LINES;
      continue;
    }
    if (!current) continue;
    if (headingContinuation > 0 && current.lines.length === 0 && CAPS_LINE.test(line)) {
      current.heading = `${current.heading} ${line}`.replace(/\s+/g, ' ').trim();
      headingContinuation--;
      continue;
    }
    headingContinuation = 0;
    current.lines.push(line);
  }
  push();

  if (regs.length === 0) {
    throw new CcrParseError(
      `${opts.seriesNum}: no ${opts.headerKind} headers found in the document — the split pattern no longer matches; re-derive it from the saved raw.`,
    );
  }
  return { regs, warnings };
}

function decodeHtml(html: string): string {
  return decodeEntities(html.replace(/&#x2F;/gi, '/'));
}

/**
 * Every browse link on the SOS site carries its own row's identity in its
 * query string — `deptID`, `agencyID`, `deptName`, `agencyName`, `seriesNum`,
 * `ruleId`. The research-pass helpers matched names inside a ±200/+300
 * character window AROUND each link instead, which on the real 273-row
 * department list and 18-row document list is a coin flip: neighbouring rows
 * sit well inside that window, so a row could be selected on its neighbour's
 * name. Reading the link's OWN parameters removes the guess entirely.
 */
function linkParams(href: string): Record<string, string> {
  const out: Record<string, string> = {};
  const query = href.slice(href.indexOf('?') + 1);
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    // The SOS emits these values unencoded (real spaces, not %20 or +), but
    // decode both forms so an encoding change upstream is a no-op here.
    let value = pair.slice(eq + 1).replace(/\+/g, ' ');
    try {
      value = decodeURIComponent(value);
    } catch {
      /* a stray % is not a reason to lose the row */
    }
    out[pair.slice(0, eq)] = value.trim();
  }
  return out;
}

export function findAgencyIds(
  deptListHtml: string,
  deptName: string,
  agencyName: string,
): { deptID: number; agencyID: number } {
  const html = decodeHtml(deptListHtml);
  // Names on the real list carry their CCR number as a prefix and sometimes a
  // parenthetical ("1101 Division of Labor Standards and Statistics (Includes
  // 1103 Series)"), so the manifest's name is matched as a substring of the
  // row's own value — but an ambiguous match is a stop-and-look, never a
  // first-wins guess.
  const hits: { deptID: number; agencyID: number; agencyName: string }[] = [];
  for (const m of html.matchAll(/NumericalCCRDocList\.do\?[^"'<>]*/gi)) {
    const p = linkParams(m[0]);
    if (!p['deptID'] || !p['agencyID']) continue;
    if (!(p['deptName'] ?? '').includes(deptName)) continue;
    if (!(p['agencyName'] ?? '').includes(agencyName)) continue;
    const hit = { deptID: Number(p['deptID']), agencyID: Number(p['agencyID']), agencyName: p['agencyName']! };
    if (!hits.some((h) => h.deptID === hit.deptID && h.agencyID === hit.agencyID)) hits.push(hit);
  }
  if (hits.length === 0) {
    throw new CcrParseError(
      `Agency "${agencyName}" (${deptName}) not found on the SOS department list — renumbered or template drift.`,
    );
  }
  if (hits.length > 1) {
    throw new CcrParseError(
      `Agency "${agencyName}" (${deptName}) matches ${hits.length} rows on the SOS department list ` +
        `(${hits.map((h) => `${h.agencyName} [${h.deptID}/${h.agencyID}]`).join('; ')}) — ` +
        'narrow the manifest name; capturing the wrong agency is worse than not capturing.',
    );
  }
  return { deptID: hits[0]!.deptID, agencyID: hits[0]!.agencyID };
}

export function findRuleId(docListHtml: string, seriesNum: string): number {
  const html = decodeHtml(docListHtml);
  // EXACT match on the row's own seriesNum. Substring matching is unsafe here:
  // "3 CCR 702-1" is a prefix of "3 CCR 702-10", and "3 CCR 702-4" of
  // "3 CCR 702-4 Series 4-1" — both live on the real Division of Insurance
  // document list.
  const hits: number[] = [];
  for (const m of html.matchAll(/DisplayRule\.do\?[^"'<>]*/gi)) {
    const p = linkParams(m[0]);
    if (!p['ruleId'] || p['seriesNum'] !== seriesNum) continue;
    const ruleId = Number(p['ruleId']);
    if (!hits.includes(ruleId)) hits.push(ruleId);
  }
  if (hits.length === 0) {
    throw new CcrParseError(`Series "${seriesNum}" not found on the SOS document list.`);
  }
  if (hits.length > 1) {
    throw new CcrParseError(
      `Series "${seriesNum}" resolves to ${hits.length} different ruleIds (${hits.join(', ')}) on the SOS document list.`,
    );
  }
  return hits[0]!;
}

/**
 * The rule-info page prints the current version in its own "Current version"
 * table and then up to ~70 ARCHIVED versions in a second table below. The two
 * tables are built from the same template — same columns, same link shapes —
 * so anything that scans the whole page can select an archived version, and
 * the ids are not monotonic (3 CCR 702-5's current version is 12295 while an
 * archived row carries 12316), which rules out "take the highest" as well.
 *
 * So: slice the page to the region between the two visible headings and read
 * only that. Within it, the effective date is taken from the PDF link's own
 * label rather than from the first date in the region — the row also carries
 * an adopted date and a Colorado Register publication date, and binding the
 * date to the link that identifies the version is what makes them impossible
 * to confuse. The download URL is the one the page's own OpenRuleWindow
 * builds, which is the PDF: the page states that the PDF is the official
 * version of the rule and the Word document only an accessible alternative,
 * and the Word download is in any case a legacy binary .doc.
 */
const CURRENT_HEADING = /<b>\s*Current version\s*<\/b>/i;
const ARCHIVED_HEADING = /<b>\s*Archived versions?\s*<\/b>/i;
/**
 * The gap between the call and the date is `[^>]` — it may not cross a tag
 * boundary, so the date has to be the link's OWN label. With a permissive
 * `[\s\S]{0,300}` gap, a current-version row whose date reads "Imported"
 * matched the adopted date in the next cell instead and reported a version as
 * effective on the day it was adopted.
 */
const PDF_LINK =
  /OpenRuleWindow\(\s*'(\d+)'\s*,\s*'([^']*)'\s*\)[^>]{0,200}>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

export function findCurrentVersion(ruleInfoHtml: string): {
  ruleVersionId: string;
  effectiveDate: string;
  docDownload: { url: string };
} {
  const html = decodeHtml(ruleInfoHtml);
  const current = CURRENT_HEADING.exec(html);
  if (!current) {
    throw new CcrParseError(
      'No "Current version" heading on the rule-info page — the current and archived versions can ' +
        'no longer be told apart, and guessing between them is exactly the failure this refuses to ship.',
    );
  }
  const archived = ARCHIVED_HEADING.exec(html.slice(current.index));
  const region = html.slice(
    current.index,
    archived ? current.index + archived.index : undefined,
  );

  const pdf = PDF_LINK.exec(region);
  if (!pdf) {
    throw new CcrParseError(
      'The "Current version" region has no dated PDF link. The SOS shows "Imported" instead of a ' +
        'date for some rules, and a rule whose version cannot be dated must not be captured — ' +
        'inspect the saved raw before changing this.',
    );
  }
  const [, ruleVersionId, fileName, month, day, year] = pdf;
  const url = `GenerateRulePdf.do?ruleVersionId=${ruleVersionId}&fileName=${encodeURIComponent(fileName!)}`;
  return {
    ruleVersionId: ruleVersionId!,
    effectiveDate: `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`,
    docDownload: { url },
  };
}
