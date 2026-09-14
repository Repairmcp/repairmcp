/**
 * The three Pennsylvania date rules (kickoff §3.1–§3.3, §4). Every date a
 * citation carries is computed here and nowhere else.
 *
 *  1. Consolidated statutes: a section's own history note reads
 *     "(Oct. 24, 2012, P.L.1431, No.178, eff. 60 days)" — the EFFECTIVE date
 *     is the act date plus N days, the act date for "eff. imd.", or the
 *     explicit date. Subchapter/chapter Enactment notes read "… was added
 *     December 9, 2002, P.L.1278, No.152, effective in 60 days." Newest
 *     candidate wins; the parser handles inheritance.
 *  2. Unconsolidated acts: "(5 amended July 14, 1977, P.L.82, No.30)" and
 *     "((a) amended …)" carry the amending act's APPROVAL date only — never
 *     an effective clause. The newest is the section's date, labeled
 *     "amended"; a section with none takes the act's own title-line date,
 *     labeled "enacted". The citation says which (schema.dateKind).
 *  3. Pennsylvania Code: "adopted December 15, 1978, effective December 16,
 *     1978, 8 Pa.B. 3575; amended May 6, 2022, effective in 90 days, 52
 *     Pa.B. 2701" — explicit effective date, else the entry date plus N
 *     days, else the entry date itself. Newest wins.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_DATE = /\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),\s+(\d{4})\b/;

/** "Oct. 24, 2012" / "December 9, 2002" → "2012-10-24"; undefined when no such date. */
export function parseMonthDate(text: string): string | undefined {
  const m = MONTH_DATE.exec(text);
  if (!m) return undefined;
  const month = MONTHS[m[1]!.toLowerCase()];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) return undefined;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function newest(dates: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const d of dates) if (!best || d > best) best = d;
  return best;
}

// --- 1. consolidated -------------------------------------------------------

/** One entry: an act date, a P.L. citation, and an effective clause. */
const CONSOLIDATED_ENTRY = new RegExp(
  String.raw`([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}),\s*P\.L\.\s*\d*,\s*No\.\s*\d+,\s*(?:eff\.|effective)\s+(?:in\s+)?(imd\.|immediately|(\d+)\s+days|[A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4})`,
  'g',
);

/** Candidate effective dates one consolidated note states (section note or Enactment prose). */
export function consolidatedNoteDates(note: string): string[] {
  const out: string[] = [];
  for (const m of note.replace(/\s+/g, ' ').matchAll(CONSOLIDATED_ENTRY)) {
    const actDate = parseMonthDate(m[1]!);
    if (!actDate) continue;
    const clause = m[2]!;
    if (clause === 'imd.' || clause === 'immediately') out.push(actDate);
    else if (m[3]) out.push(plusDays(actDate, Number(m[3])));
    else {
      const explicit = parseMonthDate(clause);
      if (explicit) out.push(explicit);
    }
  }
  return out;
}

export function newestConsolidatedEffectiveDate(notes: readonly string[]): string | undefined {
  return newest(notes.flatMap(consolidatedNoteDates));
}

// --- 2. unconsolidated acts ------------------------------------------------

/** "(5 amended July 14, 1977, P.L.82, No.30)", "((a) amended …)", "(Def. amended …)", "((b) repealed July 15, 2024, P.L. , No.62)". */
const ACT_NOTE = new RegExp(
  String.raw`\((?:\([a-z0-9]+\)|[A-Za-z0-9.]+)\s+(?:amended|added|repealed(?:\s+in\s+part)?|reenacted(?:\s+and\s+amended)?|renumbered|deleted)\s+([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}),\s*P\.L\.`,
  'g',
);

/** Every amending act's approval date stated anywhere in a section's text. */
export function actAmendmentDates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.replace(/\s+/g, ' ').matchAll(ACT_NOTE)) {
    const d = parseMonthDate(m[1]!);
    if (d) out.push(d);
  }
  return out;
}

export function newestActAmendmentDate(text: string): string | undefined {
  return newest(actAmendmentDates(text));
}

const ACT_TITLE = /Act of ([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}),\s*P\.L\.\s*(\d+),\s*No\.\s*(\d+)/;

/** "Act of Jul. 14, 1961,P.L. 637, No. 329 Cl. 43 - …" → the act's own date and numbers. */
export function parseActTitleLine(title: string): { actDate: string; pl: string; actNo: string } | undefined {
  const m = ACT_TITLE.exec(title.replace(/\s+/g, ' '));
  if (!m) return undefined;
  const actDate = parseMonthDate(m[1]!);
  return actDate ? { actDate, pl: m[2]!, actNo: m[3]! } : undefined;
}

// --- 3. Pennsylvania Code --------------------------------------------------

const PACODE_ENTRY = new RegExp(
  String.raw`\b(?:adopted|amended(?:\s+through)?|corrected|reserved|added)\s+([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4})(?:,\s*effective\s+(?:in\s+(\d+)\s+days|([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4})))?`,
  'g',
);

/** Candidate effective dates one Source line states; an authority ("issued under") line states none. */
export function pacodeSourceDates(line: string): string[] {
  const out: string[] = [];
  for (const m of line.replace(/\s+/g, ' ').matchAll(PACODE_ENTRY)) {
    const entryDate = parseMonthDate(m[1]!);
    if (!entryDate) continue;
    if (m[3]) {
      const explicit = parseMonthDate(m[3]);
      if (explicit) out.push(explicit);
    } else if (m[2]) out.push(plusDays(entryDate, Number(m[2])));
    else out.push(entryDate);
  }
  return out;
}

export function newestPacodeEffectiveDate(lines: readonly string[]): string | undefined {
  return newest(lines.flatMap(pacodeSourceDates));
}
