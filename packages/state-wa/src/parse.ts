/**
 * Parser for app.leg.wa.gov chapter pages (`cite=<chapter>&full=true`).
 *
 * WAC and RCW share one ASP.NET template (verified against the live pages
 * 2026-08-27): inside `<div id='contentWrapper' class='chapter-page'>`, each
 * live section is
 *
 *   <a name='284-30-330' ></a>
 *   <div><h3><a ...>PDF</a>284-30-330</h3></div>          (RCW nests the number in a link)
 *   <div><h3>Heading as printed.</h3></div>
 *   <div><div style="text-indent:0.5in;">…paragraph…</div>…</div>
 *   <div style="margin-top:15pt;margin-bottom:0pt;">[history note]</div>
 *   (RCW only: <h3>NOTES:</h3> severability annotations)
 *
 * Everything before the first anchor is the TOC and the disposition table —
 * which is where repealed sections live — so splitting on anchors excludes
 * repealed stubs structurally. Bounding each body at its history div keeps the
 * NOTES blocks and the page footer out of the captured text.
 *
 * The anchor/number-h3 cross-check is the template-drift tripwire: this
 * vertical's analog of OLRC's currentthrough guard. String/regex based on
 * purpose — machine-generated markup from a single producer, not the open web.
 */

import type { WaCode } from './schema.js';

export interface ParsedWaSection {
  cite: string;
  heading: string;
  text: string;
  effectiveDate?: string;
  historyNote?: string;
}

export interface ParsedWaChapter {
  sections: ParsedWaSection[];
  /** Cites whose body parsed to nothing (part-heads) — skipped, reported. */
  skippedEmpty: string[];
  /** Cites that appeared more than once (pending amendments) — first kept. */
  duplicates: string[];
  /** Non-fatal oddities worth printing in the capture report. */
  warnings: string[];
}

export class WaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WaParseError';
  }
}

// Same map as packages/nhtsa/src/laws/parse.ts — copied, not shared, per the
// copy-once-more decision in the WA kickoff (extract at state #2).
const ENTITY_MAP: Record<string, string> = {
  '&sect;': '§',
  '&#167;': '§',
  '&mdash;': '—',
  '&#8212;': '—',
  '&ndash;': '–',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&quot;': '"',
  '&#160;': ' ',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

export function decodeEntities(value: string): string {
  let out = value;
  for (const [entity, replacement] of Object.entries(ENTITY_MAP)) {
    out = out.replaceAll(entity, replacement);
  }
  out = out.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCodePoint(Number.parseInt(code, 10)),
  );
  return out.replaceAll('&amp;', '&');
}

/** Strip tags from one fragment and normalize whitespace, keeping link text. */
function stripToText(html: string): string {
  const spaced = html.replace(/<\/(td|th|tr)>/gi, ' ');
  const noTags = spaced.replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

/**
 * Body HTML → verbatim text, one paragraph per line. Split on `</div>` rather
 * than matching div pairs: nested structure produces extra line breaks but can
 * never lose text, and silent truncation is the one unforgivable failure in a
 * verbatim-quotation corpus. Tables flatten to space-joined cell text.
 */
function bodyText(html: string): string {
  const lines: string[] = [];
  for (const piece of html.split(/<\/div>/i)) {
    const text = stripToText(piece);
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

/** M/D/YY or M/D/YYYY → ISO `YYYY-MM-DD`; century pivots at 60 (nothing here predates 1960). */
function toIsoDate(mdy: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(mdy.trim());
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year = year >= 60 ? 1900 + year : 2000 + year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * History notes list amendments NEWEST-FIRST (verified live: WAC 284-30-330
 * opens with its 2016 entry and ends with 1978). The date the CURRENT text
 * took effect is therefore the effective date of the FIRST `filed` clause —
 * and if that clause has no effective date (pre-1989 orders), the answer is
 * "unknown", never an older entry's date, which would misdate newer text.
 * RCW notes are session-law citations with no dates at all; undefined is the
 * normal outcome there, not the edge case.
 */
export function parseHistoryNote(note: string): string | undefined {
  const filed = /filed\s+\d{1,2}\/\d{1,2}\/\d{2,4}([^;\]]*)/.exec(note);
  if (!filed) return undefined;
  const effective = /effective\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(filed[1] ?? '');
  if (!effective) return undefined;
  return toIsoDate(effective[1] ?? '');
}

const HISTORY_MARK = '<div style="margin-top:15pt;margin-bottom:0pt;">[';

const CITE_SHAPES: Record<WaCode, RegExp> = {
  WAC: /^\d{2,3}[A-Z]?-\d{1,4}[A-Z]?-\d{2,6}[A-Za-z]?$/,
  RCW: /^\d{1,2}[A-Z]?\.\d{1,3}[A-Z]?\.\d{3,5}$/,
};

export function parseLegChapterHtml(
  html: string,
  opts: { code: WaCode; chapter: string },
): ParsedWaChapter {
  const wrapperIdx = html.indexOf("id='contentWrapper'");
  if (wrapperIdx < 0) {
    throw new WaParseError(
      `contentWrapper not found for ${opts.code} ${opts.chapter} — template drift or an error page.`,
    );
  }

  const blocks = html.slice(wrapperIdx).split("<a name='");
  if (blocks.length < 2) {
    throw new WaParseError(`No anchored sections found in ${opts.code} ${opts.chapter}.`);
  }

  const chapterPrefix = `${opts.chapter}${opts.code === 'WAC' ? '-' : '.'}`;
  const citeShape = CITE_SHAPES[opts.code];

  const sections: ParsedWaSection[] = [];
  const skippedEmpty: string[] = [];
  const duplicates: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  // blocks[0] is the prelude: TOC plus the disposition table where repealed
  // sections live. Discarded by construction — that IS the repealed filter.
  for (const block of blocks.slice(1)) {
    const anchorMatch = /^([0-9A-Za-z.\-]+)' *>/.exec(block);
    if (!anchorMatch) continue;
    const cite = anchorMatch[1] ?? '';
    if (!citeShape.test(cite)) continue; // a non-cite anchor (nav etc.), not a section

    if (!cite.startsWith(chapterPrefix)) {
      throw new WaParseError(
        `Anchor ${cite} does not belong to ${opts.code} ${opts.chapter} — refusing a capture whose page does not match its request.`,
      );
    }

    if (seen.has(cite)) {
      // Pending-amendment double versions: leg.wa.gov lists the currently
      // effective text first; keep it and report the duplicate.
      if (!duplicates.includes(cite)) duplicates.push(cite);
      continue;
    }

    const h3s = [...block.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)];
    if (h3s.length < 2) {
      throw new WaParseError(`Section ${cite}: expected number and heading h3s — template drift.`);
    }

    const numberText = stripToText(h3s[0]![1] ?? '')
      .replace(/^PDF\s*/, '')
      .replace(/^(WAC|RCW)\s*/, '')
      .trim();
    if (numberText !== cite) {
      throw new WaParseError(
        `Section number "${numberText}" does not match anchor ${cite} — template drift.`,
      );
    }

    const headingMatch = h3s[1]!;
    const heading = stripToText(headingMatch[1] ?? '');
    const bodyStart = (headingMatch.index ?? 0) + headingMatch[0].length;

    const histIdx = block.indexOf(HISTORY_MARK, bodyStart);
    let bodyHtml: string;
    let historyNote: string | undefined;
    if (histIdx >= 0) {
      bodyHtml = block.slice(bodyStart, histIdx);
      const histEnd = block.indexOf('</div>', histIdx);
      historyNote = stripToText(
        block.slice(histIdx + HISTORY_MARK.length - 1, histEnd >= 0 ? histEnd : undefined),
      );
    } else {
      // No history div: bound at the trailing <hr> so the footer cannot leak.
      const hrIdx = block.indexOf('<hr', bodyStart);
      bodyHtml = block.slice(bodyStart, hrIdx >= 0 ? hrIdx : undefined);
      warnings.push(`${cite}: no history note found — body bounded at trailing rule.`);
    }

    const text = bodyText(bodyHtml);
    seen.add(cite);
    if (!text) {
      skippedEmpty.push(cite);
      continue;
    }

    sections.push({
      cite,
      heading,
      text,
      effectiveDate: historyNote ? parseHistoryNote(historyNote) : undefined,
      historyNote,
    });
  }

  if (sections.length === 0) {
    throw new WaParseError(
      `No sections with text found in ${opts.code} ${opts.chapter} (${skippedEmpty.length} empty part-heads).`,
    );
  }

  return { sections, skippedEmpty, duplicates, warnings };
}
