/**
 * The statutes capture pipeline: one text-view fetch per manifest entry at
 * the Legislature's requested 10-second crawl delay, parse, cross-check the
 * article/chapter header the view prints against the manifest, and select
 * the named cites. A named cite absent from its view hard-fails. A cite the
 * view prints twice (the Legislature's way of publishing a version with a
 * later operative date alongside the current one) is resolved by date: the
 * newest version whose effective/operative date is on or before the capture
 * date is the one in force; with no dates to go on, the last printed is
 * taken and the warning names it so a human looks.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseLeginfoHtml, type ParsedCaStatuteSection } from './parse-leginfo.js';
import type { CaSection } from './schema.js';
import {
  leginfoSectionUrl,
  leginfoTextViewUrl,
  type CaStatuteCaptureSource,
} from './sources-statutes.js';

/** robots.txt: "Crawl-Delay: 10". Not negotiable — see sources-statutes.ts. */
export const LEGINFO_CRAWL_DELAY_MS = 10_000;

export interface CaStatutesCaptureResult {
  sections: CaSection[];
  report: { warnings: string[] };
}

function rawName(source: CaStatuteCaptureSource): string {
  const v = source.view;
  const slug = [v.division, v.title, v.part, v.chapter, v.article]
    .map((p) => p.replace(/\.$/, ''))
    .filter((p) => p.length > 0)
    .join('-');
  return `leginfo-${source.lawCode}-${slug}.html`;
}

/** The version in force on `today` among a cite's printed versions. */
export function selectVersion(
  versions: readonly ParsedCaStatuteSection[],
  today: string,
): { section: ParsedCaStatuteSection; warning?: string } {
  if (versions.length === 1) return { section: versions[0]! };
  const dated = versions.filter((v) => v.effectiveDate !== undefined && v.effectiveDate <= today);
  if (dated.length > 0) {
    const chosen = dated.reduce((best, v) => (v.effectiveDate! > best.effectiveDate! ? v : best));
    return {
      section: chosen,
      warning:
        `${chosen.cite}: printed in ${versions.length} versions; kept the one effective ` +
        `${chosen.effectiveDate} (the newest on or before ${today}).`,
    };
  }
  return {
    section: versions[versions.length - 1]!,
    warning:
      `${versions[0]!.cite}: printed in ${versions.length} versions with no usable dates; ` +
      'kept the LAST printed — verify by eye against leginfo.',
  };
}

export async function captureCaStatutes(
  io: CaptureIo,
  sources: readonly CaStatuteCaptureSource[],
  opts: { today: string },
): Promise<CaStatutesCaptureResult> {
  const warnings: string[] = [];
  const out: CaSection[] = [];

  for (const source of sources) {
    const url = leginfoTextViewUrl(source);
    const html = await io.fetchText(url, {
      rawName: rawName(source),
      minDelayMs: LEGINFO_CRAWL_DELAY_MS,
    });
    const parsed = parseLeginfoHtml(html);
    const label = `${source.code} ${source.chapter}`;

    if (!parsed.hierarchy.some((line) => line.startsWith(source.expectHeader))) {
      throw new Error(
        `${label}: the fetched view does not print the header "${source.expectHeader}" ` +
          `(it prints: ${parsed.hierarchy.slice(0, 6).join(' | ')}) — the article was ` +
          'renumbered or the view parameters drifted. Reconcile the manifest consciously.',
      );
    }
    warnings.push(...parsed.warnings.map((w) => `${label}: ${w}`));

    const byCite = new Map<string, ParsedCaStatuteSection[]>();
    for (const section of parsed.sections) {
      byCite.set(section.cite, [...(byCite.get(section.cite) ?? []), section]);
    }

    for (const spec of source.sections) {
      const versions = byCite.get(spec.cite);
      if (!versions) {
        throw new Error(
          `${source.code} ${spec.cite} was requested by name but is absent from the ` +
            `${source.expectHeader} view — renumbered or repealed upstream; reconcile the ` +
            'manifest consciously.',
        );
      }
      const { section, warning } = selectVersion(versions, opts.today);
      if (warning) warnings.push(`${source.code} ${warning}`);
      if (!section.text) {
        throw new Error(`${source.code} ${spec.cite}: the view prints no body text for it.`);
      }
      out.push({
        cite: section.cite,
        code: source.code,
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: spec.heading,
        text: section.text,
        ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
        ...(section.historyNote ? { historyNote: section.historyNote } : {}),
        domain: source.domain,
        sourceUrl: leginfoSectionUrl(source.lawCode, section.cite),
        captureSource: 'leginfo',
        headingSource: 'manifest',
      });
    }
  }

  return { sections: out, report: { warnings } };
}
