/**
 * Parser for the Illinois Administrative Code whole-Part page
 * (`/agencies/JCAR/EntirePart?titlepart=TTTPPPPP`), VERIFIED 2026-09-15
 * against Parts 50-919, 56-300, 56-210, 35-218, and 35-219.
 *
 * The page is UTF-8 and opens with a table of contents — `<p
 * class="content">Section 919.80  Required Claim Practices …</p>` lines,
 * `<p class="subheading">SUBPART D:  OVERTIME</p>` headings, and the Part's
 * own `AUTHORITY:` and `SOURCE:` paragraphs ("Adopted at 19 Ill. Reg. 6576,
 * effective May 2, 1995; amended at …") — followed by every section's
 * Word-exported document concatenated: `<div><p class=MsoNormal><b>Section
 * 919.80  Required …</b></p>` … `<p class=JCARSourceNote>(Source: Amended at
 * 26 Ill. Reg. 11915, effective July 22, 2002)</p></div></body></html>`.
 * The embedded `</html>` closers are the document boundaries.
 *
 * A section with no Source line of its own (210.440, 219.103) has never
 * been amended since the Part's adoption; the caller inherits the Part's
 * adoption date for it. The per-section pages
 * (`/commission/jcar/admincode/056/056003000D07200R.html`) are windows-1252
 * Word HTML and are NOT the capture surface, but they are the human landing
 * page — `sectionPageUrl` derives their file name from the subpart letter
 * the TOC gives each section and the section number × 10.
 */
import { decodeEntities } from '@repairmcp/state-law';
import { IlParseError } from './parse-ilcs.js';

export interface ParsedIacSection {
  /** "919.80", "919.EXHIBIT A" */
  num: string;
  heading: string;
  /** "00" when the Part has no subparts or the section precedes the first; else the SUBPART letter(s). */
  subpart: string;
  text: string;
  /** The inner text of "(Source: …)" when the section prints one. */
  sourceNote?: string;
  effectiveDate?: string;
  illRegCite?: string;
}
export interface ParsedIacPart {
  partAdoptedDate: string;
  partSource: string;
  authority: string;
  sections: ParsedIacSection[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};
const pad = (n: number): string => String(n).padStart(2, '0');

/** "July 22, 2002" → "2002-07-22". */
export function parseLongDate(s: string): string | undefined {
  const m = /^\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*$/.exec(s);
  if (!m) return undefined;
  const month = MONTHS[m[1]!.toLowerCase()];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return undefined;
  return `${m[3]}-${pad(month)}-${pad(day)}`;
}

const LONG_DATE = /effective\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/g;
/** The LAST "effective <Month D, YYYY>" in a Source line — the current text's date. */
export function lastEffectiveDate(source: string): string | undefined {
  let last: string | undefined;
  for (const m of source.replace(/\s+/g, ' ').matchAll(LONG_DATE)) last = parseLongDate(m[1]!);
  return last;
}
/** The FIRST "effective <Month D, YYYY>" — the Part's adoption date. */
export function firstEffectiveDate(source: string): string | undefined {
  const m = /effective\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/.exec(source.replace(/\s+/g, ' '));
  return m ? parseLongDate(m[1]!) : undefined;
}

const clean = (html: string): string => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/[\s ]+/g, ' ').trim();

/**
 * "50","919","00","919.80" → …/050/050009190000800R.html; "56","300","D","300.720" → …/056/056003000D07200R.html;
 * "35","218","HH","218.780" → …/035/03500218HH07800R.html; the exhibit → …/050/05000919ZZ9999aR.html.
 */
export function sectionPageUrl(title: string, part: string, subpart: string, num: string): string {
  const t = title.padStart(3, '0');
  const p = part.padStart(5, '0');
  const after = num.slice(num.indexOf('.') + 1);
  const exhibit = /^EXHIBIT ([A-Z])$/.exec(after);
  const tail = exhibit ? `ZZ9999${exhibit[1]!.toLowerCase()}` : `${subpart.padStart(2, '0')}${String(Number(after) * 10).padStart(5, '0')}`;
  return `https://www.ilga.gov/commission/jcar/admincode/${t}/${t}${p}${tail}R.html`;
}

/** Every TOC paragraph: "jcarheading" (title/chapter/PART lines joined by <br>), "content" (section lines, AUTHORITY, SOURCE), "subheading" (SUBPART — nested inside a content paragraph on the live page). */
const TOC_LINE = /<p class="(jcarheading|content|subheading)">([\s\S]*?)<\/p>/g;
/** "Section 919.80", "Section 919.EXHIBIT A", "Section 218.APPENDIX H", "Section 218.TABLE A" — exhibits, appendices, and tables are sections on this surface. */
const SECTION_HEAD = /^Section (\d+\.(?:\d+|[A-Z]+ [A-Z0-9]+))\s+(.*)$/;
const SUBPART_HEAD = /^SUBPART ([A-Z]+):/;

export function parseIacPart(html: string, expect: { title: string; part: string }): ParsedIacPart {
  const label = `${expect.title} Ill. Adm. Code Part ${expect.part}`;
  const open = html.indexOf('<div class="billtext-scale">');
  if (open < 0) throw new IlParseError(`${label}: no billtext-scale block on the page — template drift or wrong page.`);
  const scoped = html.slice(open);
  const firstDoc = scoped.search(/<div>\s*<p class=MsoNormal/);
  const toc = firstDoc >= 0 ? scoped.slice(0, firstDoc) : scoped;

  const subpartOf = new Map<string, string>();
  let current = '00';
  let authority = '';
  let partSource = '';
  let sawPart = false;
  for (const m of toc.matchAll(TOC_LINE)) {
    const text = clean(m[2]!);
    if (new RegExp(`\\bPART ${expect.part}\\b`).test(text)) sawPart = true;
    const sp = SUBPART_HEAD.exec(text);
    if (sp) {
      current = sp[1]!;
      continue;
    }
    const head = SECTION_HEAD.exec(text);
    if (head) {
      subpartOf.set(head[1]!, current);
      continue;
    }
    if (text.startsWith('AUTHORITY:')) authority = text.slice('AUTHORITY:'.length).trim();
    if (text.startsWith('SOURCE:')) partSource = text.slice('SOURCE:'.length).trim();
  }
  if (!sawPart) throw new IlParseError(`${label}: the table of contents does not name PART ${expect.part} — wrong page or template drift.`);
  if (!partSource) throw new IlParseError(`${label}: no SOURCE: block in the table of contents — the Part adoption date cannot be inherited.`);
  const partAdoptedDate = firstEffectiveDate(partSource);
  if (!partAdoptedDate) throw new IlParseError(`${label}: the SOURCE: block states no "effective <Month D, YYYY>" adoption date.`);

  const sections: ParsedIacSection[] = [];
  const seen = new Set<string>();
  const docs = firstDoc >= 0 ? scoped.slice(firstDoc).split(/<\/html>/i) : [];
  for (const doc of docs) {
    let paras = [...doc.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1]!)).filter((t) => t.length > 0);
    // A "SUBPART X: TITLE" heading document precedes the first section of
    // each subpart on Parts 300, 210, 218, and 219 (live 2026-09-15); it is
    // not a section and is dropped, with the subpart letter cross-checked
    // against the table of contents.
    while (paras.length > 0 && SUBPART_HEAD.test(paras[0]!)) paras = paras.slice(1);
    if (paras.length === 0) continue;
    const headText = paras[0]!;
    const head = SECTION_HEAD.exec(headText);
    if (!head) throw new IlParseError(`${label}: a section document does not open with "Section N Heading": "${headText.slice(0, 80)}".`);
    const num = head[1]!;
    if (!num.startsWith(`${expect.part}.`)) throw new IlParseError(`${label}: section ${num} does not belong to Part ${expect.part}.`);
    if (seen.has(num)) throw new IlParseError(`${label}: ${num} appears twice on the page.`);
    seen.add(num);
    const heading = head[2]!.trim();
    let sourceNote: string | undefined;
    const body: string[] = [];
    for (const p of paras.slice(1)) {
      const src = /^\(Source:\s*(.*)\)$/s.exec(p);
      if (src) {
        sourceNote = src[1]!.trim();
        continue;
      }
      body.push(p);
    }
    const subpart = subpartOf.get(num);
    if (subpart === undefined) throw new IlParseError(`${label}: ${num} is not listed in the table of contents — cannot place it in a subpart.`);
    const effectiveDate = sourceNote ? lastEffectiveDate(sourceNote) : undefined;
    const reg = sourceNote ? [...sourceNote.matchAll(/(\d+ Ill\. Reg\. \d+)/g)].map((m) => m[1]!).pop() : undefined;
    sections.push({
      num,
      heading,
      subpart,
      text: body.join('\n'),
      ...(sourceNote ? { sourceNote } : {}),
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(reg ? { illRegCite: reg } : {}),
    });
  }
  if (sections.length === 0) throw new IlParseError(`${label}: no section documents on the page.`);
  return { partAdoptedDate, partSource, authority, sections };
}
