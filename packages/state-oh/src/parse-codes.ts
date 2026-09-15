/**
 * Parser for codes.ohio.gov pages (kickoff §3.1–§3.2), VERIFIED 2026-09-14
 * against saved ORC section, OAC rule, Constitution, and chapter pages.
 *
 * Every page shape carries the same BLOCK:
 *   <div class="laws-section-info"> label/value pairs — "Effective:" always;
 *     "Latest Legislation:" on ORC; "Promulgated Under:" on OAC; a PDF link.
 *   <section class="laws-body"> (a DIV on the Constitution page) holding
 *     <p> paragraphs, with a <div class="laws-notice"> "Last updated …" line
 *     INSIDE the body that is not law text and is cut.
 *   <section class="laws-history"> on OAC: "Supplemental Information" —
 *     Authorized By, Amplifies, Five Year Review Date, Prior Effective Dates
 *     (an HTML comment holds a disabled "Current Five Year Review Date";
 *     comments are stripped before reading). On ORC section pages the same
 *     element holds "Available Versions of this Section" and is ignored.
 *
 * Heads: a section page prints <h1>Section 4505.101 | Catchline.</h1>
 * (Rule … / Article II, Section 34a …) and the chapter and its title in the
 * last breadcrumb node; a chapter page prints <h1>Chapter 4505 | Title</h1>
 * and one <span class="content-head"> anchor per section, each followed by
 * the section's block. A leading bracketed note on a catchline ("[Governor's
 * veto not reflected; see H.B. 434 status report]", "[Repealed effective …]",
 * "[Former Section 3 of S.B. 166 …]") is split off into statusNote; the
 * capture decides what a Repealed note means for a named cite. On a chapter
 * page, a section too new to have been given a catchline yet prints only
 * "Section N" with no separator (ORC 3901.93, effective 10/6/2026, on the
 * live chapter-3901 page) — the head parses with an empty heading rather
 * than failing the whole page; it is not a manifest cite and is simply
 * dropped by the capture like any other unrequested section on the page.
 *
 * Absence is HTTP 200 with <h1>Number Not Found</h1> (after a 302 to
 * /number-not-found/) and no body. A rule "filed with the Legislative Service
 * Commission in PDF format" carries no body either — refused by name.
 */
import { decodeEntities } from '@repairmcp/state-law';
import type { OhCode } from './schema.js';

export class OhParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OhParseError';
  }
}

export interface ParsedOhBlock {
  cite: string;
  heading: string;
  statusNote?: string;
  effectiveDate: string;
  latestLegislation?: string;
  text: string;
  authorizedBy?: string;
  amplifies?: string;
  fiveYearReviewDate?: string;
  priorEffectiveDates?: string[];
}
export interface ParsedOhSectionPage extends ParsedOhBlock {
  chapter: string;
  chapterTitle: string;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};
const pad = (n: number): string => String(n).padStart(2, '0');

/** "October 24, 2024" → "2024-10-24". */
export function parseLongDate(s: string): string | undefined {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*$/.exec(s);
  if (!m) return undefined;
  const month = MONTHS[m[1]!.toLowerCase()];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return undefined;
  return `${m[3]}-${pad(month)}-${pad(day)}`;
}
/** "2/27/2027" → "2027-02-27". */
export function parseSlashDate(s: string): string | undefined {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${m[3]}-${pad(month)}-${pad(day)}`;
}

const stripComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, '');
const stripTags = (html: string): string => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Body HTML → verbatim text: one paragraph per line, inner whitespace collapsed, tags dropped (link text kept), the laws-notice cut. */
export function htmlToText(fragment: string): string {
  // The site hard-wraps paragraph text with literal newlines ("(1) When
  // partial losses\n will be settled …"), so paragraphs are split on a
  // sentinel placed at each </p>, never on raw newlines; stripTags then
  // collapses every run of whitespace inside a paragraph to one space.
  const withoutNotice = fragment.replace(/<div class="laws-notice">[\s\S]*?<\/div>/g, '');
  return withoutNotice
    .replace(/<\/p>/gi, '\u0000')
    .split('\u0000')
    .map((para) => stripTags(para))
    .filter((para) => para.length > 0)
    .join('\n');
}

export function splitCatchline(raw: string): { heading: string; statusNote?: string } {
  const text = stripTags(raw);
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(text);
  if (!m) return { heading: text };
  return { heading: m[2]!.trim(), statusNote: m[1]!.trim() };
}

export function isNumberNotFound(html: string): boolean {
  return /<h1>\s*Number Not Found\s*<\/h1>/.test(html);
}

const PDF_FILED = /filed with the Legislative Service Commission in PDF format/;
const BODY_OPEN = /<(section|div) class="laws-body">/;
const BODY_END_MARKERS = ['<section class="laws-history"', '<div class="profile-navigator', '<span id="content-head-', '</main>'];
const LABEL = /<div class="label">\s*([^<]*?)\s*<\/div>\s*<div class="value">([\s\S]*?)<\/div>/g;
const HISTORY_FIELD = /<strong>\s*([^<]+?)\s*<\/strong>\s*<span>([\s\S]*?)<\/span>/g;

/** The block that follows a head: info labels, the body, and (OAC) the Supplemental block. `label` names the section in errors. */
function parseBlock(fragment: string, code: OhCode, label: string): Omit<ParsedOhBlock, 'cite' | 'heading' | 'statusNote'> {
  const html = stripComments(fragment);
  if (PDF_FILED.test(html)) {
    throw new OhParseError(`${label} was filed with the Legislative Service Commission in PDF format — the page carries no rule text, and a PDF is not a verbatim surface this corpus captures.`);
  }
  const labels = new Map<string, string>();
  for (const m of html.matchAll(LABEL)) labels.set(m[1]!.trim(), stripTags(m[2]!));
  const effectiveRaw = labels.get('Effective:');
  const effectiveDate = effectiveRaw ? parseLongDate(effectiveRaw) : undefined;
  if (!effectiveDate) throw new OhParseError(`${label} states no "Effective:" date (${effectiveRaw ?? 'label absent'}) — template drift; every codes.ohio.gov page prints one.`);
  const open = BODY_OPEN.exec(html);
  if (!open) throw new OhParseError(`${label} has no laws-body block — template drift or an absent section.`);
  const start = open.index + open[0].length;
  let end = html.length;
  for (const marker of BODY_END_MARKERS) {
    const i = html.indexOf(marker, start);
    if (i >= 0 && i < end) end = i;
  }
  const text = htmlToText(html.slice(start, end));
  const out: Omit<ParsedOhBlock, 'cite' | 'heading' | 'statusNote'> = { effectiveDate, text };
  if (code === 'ORC') {
    const leg = labels.get('Latest Legislation:');
    if (!leg) throw new OhParseError(`${label} states no "Latest Legislation:" — template drift; every Revised Code section prints one.`);
    out.latestLegislation = leg;
  }
  if (code === 'OAC') {
    const histStart = html.indexOf('<div class="laws-additional-information">', end);
    if (histStart >= 0) {
      const hist = html.slice(histStart, html.indexOf('</section>', histStart) >= 0 ? html.indexOf('</section>', histStart) : html.length);
      const fields = new Map<string, string>();
      for (const m of hist.matchAll(HISTORY_FIELD)) fields.set(m[1]!.trim(), stripTags(m[2]!));
      const authorizedBy = fields.get('Authorized By:');
      const amplifies = fields.get('Amplifies:');
      if (authorizedBy) out.authorizedBy = authorizedBy;
      if (amplifies) out.amplifies = amplifies;
      const fyr = fields.get('Five Year Review Date:');
      if (fyr) {
        const iso = parseSlashDate(fyr);
        if (!iso) throw new OhParseError(`${label}: Five Year Review Date "${fyr}" is not M/D/YYYY.`);
        out.fiveYearReviewDate = iso;
      }
      const prior = fields.get('Prior Effective Dates:');
      if (prior) {
        out.priorEffectiveDates = prior.split(',').map((d) => {
          // A prior effective date can carry a trailing annotation like
          // "(Emer.)" marking an emergency-adopted rule (OAC 3745-31-30:
          // "6/7/2010 (Emer.)", live 2026-09-14) — the corpus keeps only
          // the ISO date the site prints, dropping the marker.
          const cleaned = d.replace(/\s*\([^)]*\)\s*$/, '').trim();
          const iso = parseSlashDate(cleaned);
          if (!iso) throw new OhParseError(`${label}: Prior Effective Date "${d.trim()}" is not M/D/YYYY.`);
          return iso;
        });
      }
    }
  }
  return out;
}

const SECTION_H1 = /<h1>\s*(Section|Rule|Article\s+([IVXLC]+),\s*Section)\s+(\S+)\s+<span class='codes-separator'>\|<\/span>\s*([\s\S]*?)<\/h1>/;
const CHAPTER_H1 = /<h1>\s*Chapter\s+(\S+)\s+<span class='codes-separator'>\|<\/span>\s*([\s\S]*?)<\/h1>/;
const CRUMB = /<div class="breadcrumbs-node">\s*<a href="[^"]*">([^<]*)<\/a>/g;
/**
 * The catchline group is optional: a brand-new section not yet given a
 * heading by the LSC prints only "Section N" with no separator and no
 * catchline text (ORC 3901.93 on the live chapter-3901 page, effective
 * 10/6/2026 — verified 2026-09-14). It is not a cite this corpus captures by
 * name, so the parser must not fail the whole page over it; heading comes
 * back empty rather than the parse throwing.
 */
const CHAPTER_HEAD = /<span class="content-head-text">\s*<a href="[^"]*">\s*(Section|Rule)\s+(\S+)(?:\s+<span class='codes-separator'>\|<\/span>\s*([\s\S]*?))?<\/a>/;

function headedCite(word: string, article: string | undefined, num: string): string {
  return word.startsWith('Article') ? `art. ${article}, § ${num}` : num;
}

export function parseOhSectionPage(html: string, expect: { code: OhCode; cite: string }): ParsedOhSectionPage {
  const label = `${expect.code} ${expect.cite}`;
  if (isNumberNotFound(html)) {
    throw new OhParseError(`${label}: codes.ohio.gov answers "Number Not Found" (HTTP 200 after a redirect to /number-not-found/) — the section does not exist at this number.`);
  }
  const h1 = SECTION_H1.exec(html);
  if (!h1) throw new OhParseError(`${label}: no "Section N | Catchline" h1 on the page — template drift or wrong page.`);
  const cite = headedCite(h1[1]!, h1[2], h1[3]!);
  if (cite !== expect.cite) throw new OhParseError(`${label}: expected ${label} but the page is headed ${h1[1]!.replace(/\s+/g, ' ')} ${h1[3]!}.`);
  const { heading, statusNote } = splitCatchline(h1[4]!);
  const crumbs = [...html.matchAll(CRUMB)].map((m) => stripTags(m[1]!));
  const last = crumbs[crumbs.length - 1];
  if (!last) throw new OhParseError(`${label}: no breadcrumb — cannot read the chapter.`);
  let chapter: string;
  let chapterTitle: string;
  if (expect.code === 'Ohio Const.') {
    const m = /^Article\s+([IVXLC]+)\s+(.+)$/.exec(last);
    if (!m) throw new OhParseError(`${label}: breadcrumb "${last}" is not "Article N Title".`);
    chapter = `art. ${m[1]}`;
    chapterTitle = m[2]!.trim();
  } else {
    const m = /^Chapter\s+(\S+)\s+(?:\|\s+)?(.+)$/.exec(last);
    if (!m) throw new OhParseError(`${label}: breadcrumb "${last}" is not "Chapter N Title".`);
    chapter = m[1]!;
    chapterTitle = m[2]!.trim();
  }
  const block = parseBlock(html.slice(h1.index), expect.code, label);
  return { cite, heading, ...(statusNote ? { statusNote } : {}), ...block, chapter, chapterTitle };
}

/**
 * A chapter page carries many sections this corpus never asked for
 * (chapter 4123:1-5 — Workshops and Factories — runs dozens of rules; the
 * manifest wants six). A PDF-filed rule among them (4123:1-5-03, "Ladders
 * and scaffolds", live 2026-09-14) must not fail the whole page: it is
 * SKIPPED here, by cite, with its reason recorded, rather than thrown. The
 * caller (captureOhio) decides what a skip means — silent when the cite was
 * never wanted, a named hard failure with this exact reason when it was.
 * Every other per-entry failure (missing Effective date, no laws-body,
 * template drift on the head itself) still throws immediately: those are
 * signals worth seeing even on content nobody asked for.
 */
export function parseOhChapterPage(html: string, expect: { code: 'ORC' | 'OAC'; chapter: string }): { chapterTitle: string; sections: ParsedOhBlock[]; skipped: Array<{ cite: string; reason: string }> } {
  const label = `${expect.code} chapter ${expect.chapter}`;
  const h1 = CHAPTER_H1.exec(html);
  if (!h1) throw new OhParseError(`${label}: no "Chapter N | Title" h1 on the page — absent chapter, template drift, or wrong page.`);
  if (h1[1] !== expect.chapter) throw new OhParseError(`${label}: expected chapter ${expect.chapter} but the page is headed Chapter ${h1[1]}.`);
  const chapterTitle = stripTags(h1[2]!);
  const chunks = html.split(/(?=<span id="content-head-\d+" class="content-head">)/);
  const sections: ParsedOhBlock[] = [];
  const skipped: Array<{ cite: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const chunk of chunks.slice(1)) {
    const head = CHAPTER_HEAD.exec(chunk);
    if (!head) throw new OhParseError(`${label}: a content-head has no "Section N | Catchline" anchor — template drift.`);
    const cite = head[2]!;
    if (seen.has(cite)) throw new OhParseError(`${label}: ${cite} appears twice on the page.`);
    seen.add(cite);
    const { heading, statusNote } = splitCatchline(head[3] ?? '');
    try {
      const block = parseBlock(chunk.slice(head.index + head[0].length), expect.code, `${expect.code} ${cite}`);
      sections.push({ cite, heading, ...(statusNote ? { statusNote } : {}), ...block });
    } catch (err) {
      if (!(err instanceof OhParseError) || !err.message.includes('in PDF format')) throw err;
      skipped.push({ cite, reason: err.message });
    }
  }
  if (sections.length === 0 && skipped.length === 0) throw new OhParseError(`${label}: no section heads on the page.`);
  return { chapterTitle, sections, skipped };
}
