/**
 * The one date rule for California REGULATIONS (10 CCR, 16 CCR, and 8 CCR
 * from either publisher). CCR history notes are numbered Register entries:
 *
 *   1. New section filed 12-15-92; operative 1-14-93 (Register 92, No. 52).
 *   3. Amendment of section heading and section filed 1-10-97; operative 5-10-97 (Register 97, No. 2).
 *   1. Amendment filed 6-26-74; designated effective 8-1-74 (Register 74, No. 26).
 *   2. Amendment of subsection (h) filed 12-5-86; effective thirtieth day thereafter (Register 86, No. 51).
 *   12. Change without regulatory effect amending subsections … filed 7-14-2021 (Register 2021, No. 29).
 *   10. Editorial correction of NOTE (Register 2015, No. 21).
 *
 * An entry contributes a candidate date when it states one: an explicit
 * "operative M-D-Y" or "effective M-D-Y", the older "effective thirtieth day
 * thereafter" (the filing date plus thirty days), or "effective/operative
 * upon filing" (the filing date). Changes without regulatory effect and
 * editorial corrections state no such date and contribute nothing — they do
 * not change what the text requires. The NEWEST candidate across the note is
 * the section's effectiveDate; a note with no candidate at all yields
 * silence. Two-digit years are pre-2000 (Registers print four digits from
 * 2000 on — verified across 10 CCR 2695.8's twelve entries and 8 CCR 5155's
 * fifty-nine).
 */

function toIso(month: string, day: string, year: string): string | undefined {
  const m = Number(month);
  const d = Number(day);
  let y = Number(year);
  if (year.length <= 2) y += 1900;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Registers print M-D-Y with hyphens; LII's transcription of 10 CCR 2695.8's
// entry 11 prints "operative 1/1/2017" with slashes. Both are the same date.
const DATE = String.raw`(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})`;
const FILED = new RegExp(String.raw`\bfiled\s+${DATE}`, 'i');
const EXPLICIT = new RegExp(String.raw`\b(?:operative|effective)\s+${DATE}`, 'gi');
const THIRTIETH = /\b(?:effective|operative)\s+(?:the\s+)?thirtieth\s+day\s+thereafter/i;
const UPON_FILING = /\b(?:effective|operative)\s+upon\s+filing/i;

/** Candidate effective dates one history entry states, as ISO strings. */
export function entryEffectiveDates(entry: string): string[] {
  const out: string[] = [];
  for (const match of entry.matchAll(EXPLICIT)) {
    const iso = toIso(match[1]!, match[2]!, match[3]!);
    if (iso) out.push(iso);
  }
  if (out.length > 0) return out;

  const filed = FILED.exec(entry);
  const filedIso = filed ? toIso(filed[1]!, filed[2]!, filed[3]!) : undefined;
  if (!filedIso) return out;
  if (THIRTIETH.test(entry)) out.push(plusDays(filedIso, 30));
  else if (UPON_FILING.test(entry)) out.push(filedIso);
  return out;
}

/** Newest candidate across every entry, or undefined when none states one. */
export function newestRegulationEffectiveDate(entries: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const entry of entries) {
    for (const iso of entryEffectiveDates(entry)) {
      if (!best || iso > best) best = iso;
    }
  }
  return best;
}
