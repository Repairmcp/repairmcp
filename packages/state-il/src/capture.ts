/**
 * Illinois's StateCaptureProfile: one pipeline behind captureAll. NOT
 * exported from the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts. No edition pin exists for Illinois: ilga.gov
 * states no currency beyond each section's own source note ("Updating the
 * database of the Illinois Compiled Statutes is an ongoing process"), so
 * meta records the newest effective date, the capture date, and every
 * dual-printed section's resolution.
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureIllinois } from './capture-ilga.js';
import { IlCorpusFileSchema, type IlSection } from './schema.js';
import { IL_SOURCES } from './sources.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const IL_SOURCE_NOTE =
  "Captured from the Illinois Compiled Statutes and the Illinois Administrative Code as published by the General Assembly at ilga.gov (the Administrative Code through the Joint Committee on Administrative Rules) — statutes from whole-act pages and, for the Insurance Code and the Vehicle Code, from article-range pages; Administrative Code rules from whole-Part pages — fetched at the 10-second crawl delay the site's own robots.txt asks for. A statute carries the newest effective date its source note prints and every Public Act the note names; a source note with no effective date (the normal case for pre-1990s acts) leaves the citation undated rather than guessing. An Administrative Code section carries its own Source line's effective date and Illinois Register cite, or the Part's adoption date when it has never been amended. When ilga.gov printed a section in more than one version (a pending amendment, or two Public Acts not yet merged), the corpus carries one — the after-text once its Public Act is in effect, else the version with the newest effective date in force — and records every printed version on the section and in meta. Illinois prints no catchline on many older sections; the manifest supplies a descriptor for those and each section records which it carries. The site states no currency line; the newest per-section effective date is recorded in meta.";

export const IL_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'IL',
  displayName: 'Illinois',
  corpusPath: 'packages/state-il/data/il-law-corpus.json',
  corpusFileSchema: IlCorpusFileSchema,
  attentionFileName: 'IL-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state il      (twelve act pages + six article ranges + five Part pages at 10 s; ~4 minutes)\n' +
    '  3. cd packages\\state-il && bun test             (annotation + demo suites are the gate; read every dual-printed line the log prints)\n' +
    '  4. cd ..\\..\\apps\\state-il-server && npx wrangler deploy\n' +
    '  5. curl -s https://il.repairmcp.com/health       (confirm the capture date + newestEffectiveDate + dualPrinted)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo): Promise<CaptureOutcome> {
    const capturedAt = today();
    const captured = await captureIllinois(io, IL_SOURCES, capturedAt);
    const byKey = new Map<string, IlSection>();
    for (const s of captured.sections) {
      if (byKey.has(s.cite)) throw new Error(`Manifest overlap: ${s.cite} captured by more than one entry.`);
      byKey.set(s.cite, s);
    }
    let newestEffectiveDate = '';
    for (const s of byKey.values()) if (s.effectiveDate && s.effectiveDate > newestEffectiveDate) newestEffectiveDate = s.effectiveDate;
    return {
      file: {
        meta: {
          state: 'IL',
          capturedAt,
          currentThrough: capturedAt,
          sourceNote: IL_SOURCE_NOTE,
          sourceUrl: 'https://www.ilga.gov/',
          newestEffectiveDate,
          dualPrinted: captured.report.dualPrinted,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [],
        duplicates: [],
        warnings: [...captured.report.warnings],
      },
    };
  },
};
