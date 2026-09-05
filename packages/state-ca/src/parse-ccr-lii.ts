/**
 * Parser for the Legal Information Institute's mirror of the California Code
 * of Regulations (law.cornell.edu/regulations/california/{T}-CCR-{§}). This
 * is the capture surface for 10 CCR and 16 CCR — and for 8 CCR 11090, Wage
 * Order 9, which DIR publishes only as a PDF — because the OFFICIAL CCR
 * publisher (govt.westlaw.com/calregs, under the OAL contract) answers every
 * non-browser request with a Cloudflare challenge. VERIFIED 2026-09-04 across
 * the whole manifest (44 pages); the markup is identical everywhere:
 *
 *   <h1 class="title" id="page_title"> Cal. Code Regs. Tit. 16, § 3353 - Estimate/Work Order Requirements </h1>
 *   …breadcrumb <li>s: Title 16 - … > Division 33 - Bureau of Automotive Repair > … > Article 7 - …
 *   <div class="statereg-text">
 *     <p>lead paragraph</p>
 *     <div class="subsect indent0"><span class="designator">(a)</span> text
 *       <div class="subsect indent1"><span class="designator">(1)</span> nested text</div>
 *     </div>
 *   </div>
 *   <div class="statereg-notes"> <div class="statereg-note"><note>Cal. Code Regs. Tit. 16, § 3353</note></div>
 *     <div class="statereg-note"><note><p>Note: Authority cited: … Reference: …</p></note></div>
 *     <div class="statereg-note"><note>1. Amendment filed 6-26-74; designated effective 8-1-74 (Register 74, No. 26).<br/>2. …</note></div>
 *
 * The h1 is the identity tripwire: a page whose h1 does not name the
 * requested title and section is refused (a missing section returns HTTP 200
 * with a generic "California Code of Regulations" page and NO h1 — absence
 * is detected here, not by status). "[Repealed]" in the heading marks a
 * repealed section. Register history rides history-dates.ts.
 *
 * LII prints no currency marker of its own; the newest Register cite in a
 * section's history is the only per-section currency signal, and corpus
 * currency is the capture date.
 */
import { decodeEntities } from '@repairmcp/state-law';
import { newestRegulationEffectiveDate } from './history-dates.js';

export class CaRegulationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaRegulationParseError';
  }
}

export interface ParsedCcrSection {
  title: string;
  cite: string;
  heading: string;
  /** Breadcrumb levels between "California Code of Regulations" and the section. */
  hierarchy: string[];
  text: string;
  authorityNote?: string;
  historyNote?: string;
  effectiveDate?: string;
  repealed: boolean;
}

function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * One line per <p> and per subsection div, document order, designators
 * kept. The source's own pretty-printing wraps sentences mid-phrase, so its
 * whitespace collapses FIRST; only element boundaries become line breaks.
 */
export function linearizeLiiText(html: string): string[] {
  return html
    .replace(/\s+/g, ' ')
    .replace(/<(?:p|div|br|li|h\d|tr)\b[^>]*>/gi, '\n$&')
    .replace(/<\/(?:p|div|li|h\d|tr)>/gi, '$&\n')
    .split('\n')
    .map(clean)
    .filter((line) => line.length > 0);
}

const H1 = /<h1[^>]*id="page_title"[^>]*>([\s\S]*?)<\/h1>/;
const H1_TEXT = /^Cal\. Code Regs\. Tit\. (\d+), § ([\d.]+) - (.+)$/;

export function parseLiiCcrHtml(
  html: string,
  expected: { title: string; cite: string },
): ParsedCcrSection {
  const h1 = H1.exec(html);
  if (!h1) {
    throw new CaRegulationParseError(
      `${expected.title} CCR ${expected.cite}: the page has no section title — LII answers an ` +
        'unknown section with a generic page (HTTP 200). The section does not exist under ' +
        'this cite, or the template changed. Re-derive from the saved raw before capturing.',
    );
  }
  const h1Text = clean(h1[1]!);
  const head = H1_TEXT.exec(h1Text);
  if (!head) {
    throw new CaRegulationParseError(
      `${expected.title} CCR ${expected.cite}: the title reads "${h1Text}" — not the ` +
        '"Cal. Code Regs. Tit. N, § X - Heading" form. Template drift.',
    );
  }
  const [, title, cite, heading] = head as unknown as [string, string, string, string];
  if (title !== expected.title || cite !== expected.cite) {
    throw new CaRegulationParseError(
      `Asked for ${expected.title} CCR ${expected.cite} but the page is ${title} CCR ${cite} — ` +
        'the URL delivered a different section.',
    );
  }

  // The breadcrumb runs "… > California Code of Regulations > Title N - … >
  // … > Cal. Code Regs. Tit. N, § X - Heading"; the levels between the
  // corpus name and the section itself are the hierarchy. Nav <li>s that
  // follow (Compare, Accessibility, …) are not.
  const crumbs = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => clean(m[1]!))
    .filter((c) => c.length > 0);
  const start = crumbs.findIndex((c) => c === 'California Code of Regulations');
  const stop = crumbs.findIndex((c, i) => i > start && c.startsWith('Cal. Code Regs.'));
  const hierarchy = start >= 0 && stop > start ? crumbs.slice(start + 1, stop) : [];

  // The page carries the CURRENT text in tab_default_1 and, behind the
  // "Compare" tab, a prior point-in-time copy with its own (shorter) history.
  // Only the active tab is the regulation; the copy would otherwise supply
  // an older history note and an older effective date (16 CCR 3353's 2025
  // amendment was invisible until this cut).
  const tabStart = html.indexOf('id="tab_default_1"');
  const tabEnd = html.indexOf('id="tab_default_2"');
  const active = tabStart >= 0 && tabEnd > tabStart ? html.slice(tabStart, tabEnd) : html;

  const textOpen = /<div class="statereg-text">/.exec(active);
  const notesOpen = /<div class="statereg-notes">/.exec(active);
  if (!textOpen) {
    throw new CaRegulationParseError(
      `${title} CCR ${cite}: no statereg-text region — template drift.`,
    );
  }
  const textStart = textOpen.index + textOpen[0].length;
  const notesStart = notesOpen && notesOpen.index > textStart ? notesOpen.index : undefined;
  const textHtml = active.slice(textStart, notesStart);
  const text = linearizeLiiText(textHtml).join('\n');

  let authorityNote: string | undefined;
  let historyNote: string | undefined;
  let effectiveDate: string | undefined;
  if (notesStart !== undefined) {
    const notesHtml = active.slice(notesStart);
    for (const note of notesHtml.matchAll(/<note>([\s\S]*?)<\/note>/g)) {
      const raw = note[1]!;
      const flat = clean(raw);
      if (/^Note:\s*Authority cited/i.test(flat)) {
        authorityNote ??= flat;
        continue;
      }
      if (/^\d+\.\s/.test(flat) && historyNote === undefined) {
        const entries = raw
          .split(/<br\s*\/?>/i)
          .map(clean)
          .filter((e) => e.length > 0);
        historyNote = entries.join('\n');
        effectiveDate = newestRegulationEffectiveDate(entries);
      }
    }
  }

  return {
    title,
    cite,
    heading: heading.trim(),
    hierarchy,
    text,
    ...(authorityNote ? { authorityNote } : {}),
    ...(historyNote ? { historyNote } : {}),
    ...(effectiveDate ? { effectiveDate } : {}),
    repealed: /\[Repealed\]/i.test(heading),
  };
}
