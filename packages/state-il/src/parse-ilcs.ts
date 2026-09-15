/**
 * Parser for ilga.gov statute pages (kickoff §3.1), VERIFIED 2026-09-15
 * against saved whole-act pages (815 ILCS 306, 308, 505, 770 ILCS 45/50,
 * 820 ILCS 90/105/115/140/192/219/305) and article-range pages (215 ILCS 5
 * Art. IX/XXVI, 625 ILCS 5 Ch. 1/3/4/5).
 *
 * Both page shapes print one <table width="500"> per section inside
 * <div class="billtext-scale">, the text in <code><font …> runs separated
 * by <br>, paragraph indents as <code>&nbsp;&nbsp;&nbsp;&nbsp;</code>. The
 * runs are the grammar:
 *   (815 ILCS 308/15)                     the cite marker, first line;
 *   (from Ch. 73, par. 766.6)             on the codes, same line — formerCite
 *   (Text of Section before amendment by P.A. 104-457)   optional version marker
 *   Sec. 15. <catchline run> [<body run>]  the catchline is the FIRST RUN after
 *                                          "Sec. N. " when it is short, ends
 *                                          with a period, and does not open
 *                                          with "(" — Illinois prints no
 *                                          catchline on many older sections
 *   … body lines, one per <br> …
 *   (Source: P.A. 93-565, eff. 1-1-04.)   closes the version
 * A second version marker after a Source line opens the next version.
 *
 * The Courier text is hard-wrapped mid-sentence ("the repair of\ncollision-
 * damaged"): a newline INSIDE a run is typesetting, not text, and joins with
 * one space; paragraph breaks are only ever <br>. Internal NBSP runs
 * (continuation indents) collapse to one space.
 *
 * Absence is HTTP 200 with the billtext-scale div present and EMPTY
 * (verified with ActID=999999): no tables, no cite markers — parseIlcsPage
 * returns [] and the capture decides what that means for a named cite.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class IlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IlParseError';
  }
}

export interface ParsedIlcsVersion {
  /** "before amendment by P.A. 104-457", "from P.A. 104-480", or undefined for a single printed version. */
  label?: string;
  /** The printed catchline, when the page prints one. */
  heading?: string;
  bodyLines: string[];
  /** The inner text of "(Source: …)". */
  sourceNote: string;
  publicActs: string[];
  effectiveDate?: string;
}
export interface ParsedIlcsSection {
  cite: string;
  formerCite?: string;
  /** The site printed "(This Section may contain text from a Public Act with a delayed effective date)" above a head. */
  delayedEffectiveNotice?: boolean;
  versions: ParsedIlcsVersion[];
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "1-1-98" → "1998-01-01"; "7-12-19" → "2019-07-12"; "1-1-2004" → "2004-01-01". Two-digit years pivot at 50. */
export function parseEffDate(s: string): string | undefined {
  const m = /^\s*(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})\s*$/.exec(s);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (m[3]!.length === 2) year += year >= 50 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "P.A. 101-81, eff. 7-12-19; 102-550, eff. 8-20-21." → every act named, and the NEWEST effective date (or none). */
export function parseSourceNote(note: string): { publicActs: string[]; effectiveDate?: string } {
  const publicActs: string[] = [];
  for (const m of note.matchAll(/(?:P\.A\.\s*)?(\d{2,3}-\d{1,4})(?=[,;.\s)]|$)/g)) {
    if (/^\d{1,2}-\d{1,2}$/.test(m[1]!) && !/P\.A\./.test(m[0])) continue; // a bare "1-1" inside a date, not an act
    const act = `P.A. ${m[1]}`;
    if (!publicActs.includes(act)) publicActs.push(act);
  }
  let newest: string | undefined;
  for (const m of note.matchAll(/eff\.\s*(\d{1,2}-\d{1,2}-\d{2,4})/g)) {
    const iso = parseEffDate(m[1]!);
    if (iso && (!newest || iso > newest)) newest = iso;
  }
  return { publicActs, ...(newest ? { effectiveDate: newest } : {}) };
}

const stripTags = (html: string): string => decodeEntities(html.replace(/<[^>]+>/g, ''));

interface Line {
  text: string;
  /** The runs the line was built from, before joining — the catchline rule reads the first. */
  runs: string[];
}

/** One section table → its lines (a <br>, <p></p>, <center> boundary, or an inner table's </table> ends a line; NBSP-only runs are indents and vanish; soft wraps join). */
function tableToLines(tableHtml: string): Line[] {
  const lines: Line[] = [];
  let runs: string[] = [];
  const flush = (): void => {
    const text = runs.join('').replace(/[\s ]+/g, ' ').trim();
    if (text) lines.push({ text, runs: runs.map((r) => r.replace(/[\s ]+/g, ' ').trim()).filter((r) => r.length > 0) });
    runs = [];
  };
  for (const m of tableHtml.matchAll(/<code>([\s\S]*?)<\/code>|<br\s*\/?>|<p><\/p>|<\/?center>|<\/table>/gi)) {
    if (m[1] === undefined) {
      flush();
      continue;
    }
    const inner = stripTags(m[1]);
    if (inner.replace(/[\s ]/g, '') === '') continue;
    runs.push(inner);
  }
  flush();
  return lines;
}

const CITE_LINE = /^\((\d{1,3} ILCS \d{1,4}\/[\w.\-]+)\)\s*(?:\((from [^)]+)\))?$/;
const VERSION_LINE = /^\(Text of Section (.+?)\)$/;
/** A site notice printed above some heads (215 ILCS 5/143.21e, live 2026-09-15); recorded, never text. */
const DELAYED_NOTICE = /^\(This Section may contain text from a Public Act with a delayed effective date\)$/;
const SEC_RUN = /^Sec\.\s*([\w.\-]+)\.\s*$/;
const SOURCE_LINE = /^\(Source:\s*(.*?)\)$/;
/** A Source note glued to the end of a body line (770 ILCS 45/2's lien-notice form ends in <center> lines with no <br> before the note). */
const SOURCE_TAIL = /^(.*?)\s*\(Source:\s*(.*?)\)$/;
/** "(215 ILCS 5/Art. IX heading)", "(625 ILCS 5/Ch. 4 Art. II heading)" — an article or chapter heading table, not a section. */
const HEADING_TABLE = /^\(\d{1,3} ILCS \d{1,4}\/[^)]* heading\)/;
const MAX_CATCHLINE = 160;

function isCatchline(run: string): boolean {
  return run.length <= MAX_CATCHLINE && run.endsWith('.') && !run.startsWith('(');
}

function parseTable(lines: Line[], label: string): ParsedIlcsSection {
  const first = lines[0];
  if (!first) throw new IlParseError(`${label}: an empty section table.`);
  const citeMatch = CITE_LINE.exec(first.text);
  if (!citeMatch) throw new IlParseError(`${label}: a section table does not open with a cite marker: "${first.text.slice(0, 80)}".`);
  const cite = citeMatch[1]!;
  const sectionNumber = cite.slice(cite.indexOf('/') + 1);
  const section: ParsedIlcsSection = { cite, versions: [], ...(citeMatch[2] ? { formerCite: citeMatch[2] } : {}) };

  let i = 1;
  while (i < lines.length) {
    let labelText: string | undefined;
    if (DELAYED_NOTICE.test(lines[i]!.text)) {
      section.delayedEffectiveNotice = true;
      i += 1;
    }
    const vm = VERSION_LINE.exec(lines[i]?.text ?? '');
    if (vm) {
      labelText = vm[1]!;
      i += 1;
    }
    if (DELAYED_NOTICE.test(lines[i]?.text ?? '')) {
      section.delayedEffectiveNotice = true;
      i += 1;
    }
    const secLine = lines[i];
    if (!secLine) throw new IlParseError(`${cite}: the section ends before its "Sec. N." line.`);
    const secRun = secLine.runs[0] ?? '';
    const sm = SEC_RUN.exec(secRun) ?? /^Sec\.\s*([\w.\-]+)\.\s+(.*)$/.exec(secRun);
    if (!sm) throw new IlParseError(`${cite}: expected a "Sec. ${sectionNumber}." line but found "${secLine.text.slice(0, 80)}".`);
    if (sm[1] !== sectionNumber) throw new IlParseError(`${cite}: the cite marker says section ${sectionNumber} but the head says Sec. ${sm[1]}.`);
    // The runs after "Sec. N. " on the same line: the first decides the catchline.
    const after = SEC_RUN.test(secRun) ? secLine.runs.slice(1) : [sm[2] ?? '', ...secLine.runs.slice(1)];
    let heading: string | undefined;
    const bodyLines: string[] = [];
    const firstRun = after[0];
    if (firstRun !== undefined && isCatchline(firstRun)) {
      heading = firstRun;
      const rest = after.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      if (rest) bodyLines.push(rest);
    } else {
      const rest = after.join(' ').replace(/\s+/g, ' ').trim();
      if (rest) bodyLines.push(rest);
    }
    i += 1;
    let sourceNote: string | undefined;
    while (i < lines.length) {
      const line = lines[i]!;
      const srcMatch = SOURCE_LINE.exec(line.text);
      if (srcMatch) {
        sourceNote = srcMatch[1]!;
        i += 1;
        break;
      }
      const tail = SOURCE_TAIL.exec(line.text);
      if (tail) {
        bodyLines.push(tail[1]!);
        sourceNote = tail[2]!;
        i += 1;
        break;
      }
      if (VERSION_LINE.test(line.text)) throw new IlParseError(`${cite}: a version marker appeared before the previous version's Source note.`);
      bodyLines.push(line.text);
      i += 1;
    }
    if (sourceNote === undefined) throw new IlParseError(`${cite}: no "(Source: …)" note closes the section — template drift.`);
    const parsed = parseSourceNote(sourceNote);
    section.versions.push({
      ...(labelText ? { label: labelText } : {}),
      ...(heading ? { heading } : {}),
      bodyLines,
      sourceNote,
      publicActs: parsed.publicActs,
      ...(parsed.effectiveDate ? { effectiveDate: parsed.effectiveDate } : {}),
    });
    if (i < lines.length && !VERSION_LINE.test(lines[i]!.text)) {
      throw new IlParseError(`${cite}: text follows the Source note without a version marker: "${lines[i]!.text.slice(0, 80)}".`);
    }
  }
  if (section.versions.length === 0) throw new IlParseError(`${cite}: no version parsed.`);
  return section;
}

/** Every section on an act page or an article-range page; [] when the text block is present but empty (an absent act). */
export function parseIlcsPage(html: string, label: string): ParsedIlcsSection[] {
  const open = html.indexOf('<div class="billtext-scale">');
  if (open < 0) throw new IlParseError(`${label}: no billtext-scale block on the page — template drift or wrong page.`);
  const scoped = html.slice(open);
  // Section tables are width="500"; the outline items INSIDE a section are
  // nested width="100%" tables (a hanging-indent item's first line in one
  // <td>, its continuation in the next — verified on 815 ILCS 308/35), so the
  // split is on section tables only and a chunk runs to the next one.
  const chunks = scoped.split(/(?=<table\b[^>]*\bwidth="500")/i).slice(1);
  const out: ParsedIlcsSection[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const lines = tableToLines(chunk);
    if (lines.length === 0) continue;
    if (HEADING_TABLE.test(lines[0]!.text)) continue;
    const section = parseTable(lines, label);
    if (seen.has(section.cite)) throw new IlParseError(`${label}: ${section.cite} appears twice on the page.`);
    seen.add(section.cite);
    out.push(section);
  }
  return out;
}

export interface VersionChoice {
  chosen: ParsedIlcsVersion;
  versionNote?: string;
  printed: ParsedIlcsVersion[];
  futureEffective: boolean;
}

/** Every act of a version as [general assembly, number], sorted descending — the tie-break compares element-wise. */
function actNumbers(v: ParsedIlcsVersion): Array<[number, number]> {
  return v.publicActs
    .map((a): [number, number] => {
      const m = /(\d+)-(\d+)$/.exec(a);
      return m ? [Number(m[1]), Number(m[2])] : [0, 0];
    })
    .sort((x, y) => (y[0] !== x[0] ? y[0] - x[0] : y[1] - x[1]));
}
function compareActs(a: ParsedIlcsVersion, b: ParsedIlcsVersion): number {
  const xa = actNumbers(a);
  const xb = actNumbers(b);
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const [am, an] = xa[i] ?? [0, 0];
    const [bm, bn] = xb[i] ?? [0, 0];
    if (bm !== am) return bm - am;
    if (bn !== an) return bn - an;
  }
  return 0;
}

/**
 * Decision 4 (kickoff): before/after pairs resolve by DATE — the after-text
 * once its Public Act's effective date is at or before the capture date;
 * "from P.A. N" sets resolve to the version whose source note carries the
 * newest effective date at or before the capture date, ties by the higher
 * Public Act numbers (the act lists compared descending, element-wise); when no version is yet effective, the newest overall
 * with futureEffective set. A single printed version is simply the section,
 * futureEffective when its own date is after the capture date.
 */
export function selectVersion(section: ParsedIlcsSection, capturedAt: string): VersionChoice {
  const versions = section.versions;
  if (versions.length === 1) {
    const only = versions[0]!;
    return { chosen: only, printed: versions, futureEffective: !!only.effectiveDate && only.effectiveDate > capturedAt };
  }
  const labels = versions.map((v) => v.label ?? '(unlabeled)');
  let chosen: ParsedIlcsVersion | undefined;
  const before = versions.find((v) => /^before amendment by/i.test(v.label ?? ''));
  const after = versions.find((v) => /^after amendment by/i.test(v.label ?? ''));
  if (before && after) {
    chosen = after.effectiveDate && after.effectiveDate <= capturedAt ? after : before;
  } else {
    const inForce = versions.filter((v) => v.effectiveDate && v.effectiveDate <= capturedAt);
    const pool = inForce.length > 0 ? inForce : versions;
    chosen = [...pool].sort((a, b) => {
      const da = a.effectiveDate ?? '';
      const db = b.effectiveDate ?? '';
      if (da !== db) return da < db ? 1 : -1;
      return compareActs(a, b);
    })[0]!;
  }
  const futureEffective = !!chosen.effectiveDate && chosen.effectiveDate > capturedAt;
  return {
    chosen,
    printed: versions,
    futureEffective,
    versionNote: `Printed in ${versions.length} versions on ilga.gov at capture: ${labels.join('; ')} — this corpus carries "${chosen.label ?? '(unlabeled)'}".`,
  };
}
