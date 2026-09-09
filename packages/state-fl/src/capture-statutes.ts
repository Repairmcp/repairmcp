/**
 * The statutes capture pipeline: one Online Sunshine page per named cite,
 * parsed, the cite and the EDITION cross-checked. Every page prints the
 * edition it belongs to; the first page's phrase must match the pinned
 * FL_STATUTES_EDITION (the rollover tripwire — a "The 2027 Florida
 * Statutes" or a mid-year "(including 2026 Special Session A)" fails the
 * capture until a human reads what changed and re-pins), and every later
 * page must print the same phrase (a site rolling over mid-capture would
 * otherwise ship a mixed corpus).
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { FL_STATUTES_EDITION } from './identity.js';
import { parseOnlineSunshineHtml } from './parse-statutes.js';
import type { FlSection } from './schema.js';
import { onlineSunshineSectionUrl, type FlStatuteCaptureSource } from './sources-statutes.js';

export interface FlStatutesCaptureResult {
  sections: FlSection[];
  /** The edition phrase the site printed — becomes meta.statutesEdition. */
  edition: string;
  report: { warnings: string[] };
}

export function statuteRawName(cite: string): string {
  return `fl-stat-${cite}.html`;
}

export async function captureFlStatutes(
  io: CaptureIo,
  sources: readonly FlStatuteCaptureSource[],
): Promise<FlStatutesCaptureResult> {
  const warnings: string[] = [];
  const out: FlSection[] = [];
  let edition: string | undefined;

  for (const source of sources) {
    for (const cite of source.cites) {
      const url = onlineSunshineSectionUrl(cite);
      const html = await io.fetchText(url, { rawName: statuteRawName(cite) });
      let parsed;
      try {
        parsed = parseOnlineSunshineHtml(html);
      } catch (err) {
        throw new Error(`Fla. Stat. ${cite}: ${(err as Error).message}`);
      }
      if (parsed.cite !== cite) {
        throw new Error(
          `Fla. Stat. ${cite}: the page prints section ${parsed.cite} — the URL delivered a ` +
            'different section; reconcile the manifest against the site.',
        );
      }
      if (edition === undefined) {
        edition = parsed.edition;
        if (edition !== FL_STATUTES_EDITION) {
          throw new Error(
            `Online Sunshine states "${edition}" but the corpus pins "${FL_STATUTES_EDITION}" — ` +
              'the annual edition rolled over or a special session was folded in. Read what ' +
              'changed, update FL_STATUTES_EDITION in src/identity.ts, and re-capture consciously.',
          );
        }
      } else if (parsed.edition !== edition) {
        throw new Error(
          `Fla. Stat. ${cite}: the page states "${parsed.edition}" while earlier pages stated ` +
            `"${edition}" — the site changed editions mid-capture. Re-run.`,
        );
      }
      out.push({
        cite,
        code: 'Fla. Stat.',
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: parsed.heading,
        text: parsed.text,
        historyNote: parsed.historyNote,
        domain: source.domain,
        sourceUrl: url,
      });
    }
  }

  if (!edition) throw new Error('No statute sources were captured.');
  return { sections: out, edition, report: { warnings } };
}
