/**
 * The unconsolidated-act pipeline: one whole-act page per manifest act at
 * the mirror's 5 s crawl delay. The title line is cross-checked against the
 * manifest's year and act number (a wrong URL cannot deliver the wrong act
 * silently), every named section must be present and live, and a modern
 * act's section must print a catchline unless the manifest supplies a
 * heading (only the 1915 WCA does). Dates: the newest amending act's
 * approval date anywhere in the section, labeled "amended"; else the act's
 * own date, labeled "enacted" (kickoff §3.2, §4).
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { newestActAmendmentDate } from './history-dates.js';
import { parseActHtml } from './parse-act.js';
import type { PaSection } from './schema.js';
import { actRawName, actUrl, type PaActCaptureSource } from './sources-acts.js';
import { LEGIS_MIN_DELAY_MS } from './sources-consolidated.js';

export async function captureActs(
  io: CaptureIo,
  sources: readonly PaActCaptureSource[],
): Promise<{ sections: PaSection[]; report: { warnings: string[] } }> {
  const warnings: string[] = [];
  const out: PaSection[] = [];
  for (const act of sources) {
    const url = actUrl(act.year, act.actNo);
    const html = await io.fetchText(url, { rawName: actRawName(act.year, act.actNo), minDelayMs: LEGIS_MIN_DELAY_MS });
    const parsed = parseActHtml(html);
    const actLabel = `Act ${act.actNo} of ${act.year}`;
    if (Number(parsed.title.actNo) !== act.actNo || !parsed.title.actDate.startsWith(`${act.year}-`)) {
      throw new Error(`${actLabel}: the page prints No. ${parsed.title.actNo} of ${parsed.title.actDate.slice(0, 4)} — the URL delivered a different act.`);
    }
    const bySection = new Map(parsed.sections.map((s) => [s.actSection, s]));
    for (const entry of act.sections) {
      const label = `${act.code} ${entry.psCite} (section ${entry.actSection} of ${act.shortTitle})`;
      const s = bySection.get(entry.actSection);
      if (!s) throw new Error(`${label} was requested by name but is absent from the act page — renumbered or repealed upstream; correct the manifest after reading the page.`);
      if (s.repealed) throw new Error(`${label} was requested by name but the page prints it repealed: ${s.historyNotes[0] ?? ''}`);
      const heading = s.catchline ?? entry.heading;
      if (!heading) throw new Error(`${label}: the page prints no catchline and the manifest supplies no heading.`);
      if (s.catchline && entry.heading) warnings.push(`${label}: the page prints a catchline; the manifest heading "${entry.heading}" is ignored.`);
      const amended = newestActAmendmentDate([s.text, ...s.historyNotes].join(' '));
      out.push({
        cite: entry.psCite, code: act.code, chapter: act.shortTitle, chapterTitle: act.chapterTitle,
        heading, text: s.text,
        effectiveDate: amended ?? parsed.title.actDate,
        ...(s.historyNotes.length > 0 ? { historyNote: s.historyNotes.join(' ') } : {}),
        domain: act.domain, sourceUrl: url, captureSource: 'legis',
        headingSource: s.catchline ? 'source' : 'manifest',
        actSection: entry.actSection,
        dateKind: amended ? 'amended' : 'enacted',
      });
    }
  }
  return { sections: out, report: { warnings } };
}
