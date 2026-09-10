/**
 * Parser for the Legal Information Institute's mirror of the NYCRR
 * (law.cornell.edu/regulations/new-york/{T}-NYCRR-{§}). The capture
 * surface for 11 NYCRR Part 216 (Regulation 64) because the official
 * publisher (govt.westlaw.com/nycrr) answers non-browser requests with a
 * Cloudflare challenge and DFS hosts no text (kickoff preface). VERIFIED
 * 2026-09-10 on 216.7 and 15 NYCRR 82.5; the page family is California's
 * (parse-ccr-lii.ts) with two New York differences: the h1 reads
 * "N.Y. Comp. Codes R. & Regs. Tit. 11 § 216.7 - Heading" (no comma), and
 * history is not numbered Register entries but one <note> per amendment
 * carrying an explicit <effectivedate>M/D/YYYY</effectivedate>. The newest
 * such date is the section's effectiveDate; "No prior version found" means
 * silence. Only the active tab (tab_default_1) is read — the Compare tab
 * carries an older copy with its own history (the CA 16 CCR 3353 lesson).
 * Absence is HTTP 200 with a generic h1 whose id is "page-title", not
 * "page_title" — detected by the missing wrapper, never by status.
 */
import { decodeEntities } from '@repairmcp/state-law';

export class NyLiiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NyLiiParseError';
  }
}

export interface ParsedNycrrSection {
  title: string;
  cite: string;
  heading: string;
  hierarchy: string[];
  text: string;
  historyNote?: string;
  effectiveDate?: string;
  repealed: boolean;
}

function clean(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]+>(?=[,.;:)])/g, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function linearize(html: string): string[] {
  return html
    .replace(/\s+/g, ' ')
    .replace(/<(?:p|div|br|li|h\d|tr)\b[^>]*>/gi, '\n$&')
    .replace(/<\/(?:p|div|li|h\d|tr)>/gi, '$&\n')
    .split('\n')
    .map(clean)
    .filter((l) => l.length > 0);
}

const H1 = /<h1[^>]*id="page_title"[^>]*>([\s\S]*?)<\/h1>/;
const H1_TEXT = /^N\.Y\. Comp\. Codes R\. & Regs\. Tit\. (\d+) § ([\d.-]+) - (.+)$/;

function mdyToIso(mdy: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mdy.trim());
  if (!m) return undefined;
  return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

export function parseLiiNycrrHtml(html: string, expected: { title: string; cite: string }): ParsedNycrrSection {
  const label = `${expected.title} NYCRR ${expected.cite}`;
  const h1 = H1.exec(html);
  if (!h1) {
    throw new NyLiiParseError(`${label}: the page has no section title — LII answers an unknown section with a generic page (HTTP 200). The section does not exist under this cite, or the template changed.`);
  }
  const h1Text = clean(h1[1]!);
  const head = H1_TEXT.exec(h1Text);
  if (!head) throw new NyLiiParseError(`${label}: the title reads "${h1Text}" — not the "N.Y. Comp. Codes R. & Regs. Tit. N § X - Heading" form. Template drift.`);
  const [, title, cite, heading] = head as unknown as [string, string, string, string];
  if (title !== expected.title || cite !== expected.cite) {
    throw new NyLiiParseError(`Asked for ${label} but the page is ${title} NYCRR ${cite} — the URL delivered a different section.`);
  }

  const crumbs = [...html.matchAll(/<li\b[^>]*>\s*<a href="\/regulations\/new-york\/[^"]*">([\s\S]*?)<\/a>/g)].map((m) => clean(m[1]!));
  const hierarchy = crumbs.filter((c) => /^(N\.Y\. Comp\. Codes R\. & Regs\. tit\.|Chapter |Subchapter |Part )/.test(c));

  const tabStart = html.indexOf('id="tab_default_1"');
  const tabEnd = html.indexOf('id="tab_default_2"');
  const active = tabStart >= 0 && tabEnd > tabStart ? html.slice(tabStart, tabEnd) : tabStart >= 0 ? html.slice(tabStart) : html;
  const textOpen = /<div class="statereg-text">/.exec(active);
  const notesOpen = /<div class="statereg-notes">/.exec(active);
  if (!textOpen) throw new NyLiiParseError(`${label}: no statereg-text region — template drift.`);
  const textStart = textOpen.index + textOpen[0].length;
  const notesStart = notesOpen && notesOpen.index > textStart ? notesOpen.index : undefined;
  const text = linearize(active.slice(textStart, notesStart)).join('\n');
  if (!text) throw new NyLiiParseError(`${label}: empty regulation text.`);

  let historyNote: string | undefined;
  let effectiveDate: string | undefined;
  if (notesStart !== undefined) {
    const entries: string[] = [];
    for (const note of active.slice(notesStart).matchAll(/<note>([\s\S]*?)<\/note>/g)) {
      const raw = note[1]!;
      const flat = clean(raw);
      if (/^N\.Y\. Comp\. Codes/.test(flat) || /No prior version found/i.test(flat) || !flat) continue;
      entries.push(flat);
      for (const d of raw.matchAll(/<effectivedate>([^<]+)<\/effectivedate>/g)) {
        const iso = mdyToIso(d[1]!);
        if (iso && (!effectiveDate || iso > effectiveDate)) effectiveDate = iso;
      }
    }
    if (entries.length) historyNote = entries.join('\n');
  }

  return {
    title, cite, heading: heading.trim(), hierarchy, text,
    ...(historyNote ? { historyNote } : {}),
    ...(effectiveDate ? { effectiveDate } : {}),
    repealed: /\(Repealed\)|\[Repealed\]/i.test(heading),
  };
}

/** The part index: every "§ 216.N - Title" toc item, in page order. */
export function parseLiiNycrrPartIndex(html: string): Array<{ cite: string; title: string }> {
  const out: Array<{ cite: string; title: string }> = [];
  for (const m of html.matchAll(/<li class="tocitem"><a href="\/regulations\/new-york\/\d+-NYCRR-([\d.-]+)">([\s\S]*?)<\/a>/g)) {
    const label = clean(m[2]!);
    const t = /^§\s*[\d.-]+\s*-\s*(.+)$/.exec(label);
    out.push({ cite: m[1]!, title: t ? t[1]!.trim() : label });
  }
  return out;
}
