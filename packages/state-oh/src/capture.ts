/**
 * Ohio's StateCaptureProfile: one pipeline behind captureAll. NOT exported
 * from the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts. No edition pin exists for Ohio: codes.ohio.gov
 * states no currency beyond each section's own Effective date, so meta
 * records the newest of those and the capture date.
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureOhio } from './capture-codes.js';
import { OhCorpusFileSchema, type OhSection } from './schema.js';
import { OH_SOURCES } from './sources.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const OH_SOURCE_NOTE =
  "Captured from the Ohio Revised Code, the Ohio Administrative Code, and the Ohio Constitution as published by the Legislative Service Commission at codes.ohio.gov — whole-chapter pages where two or more sections share a chapter and single-section pages otherwise, fetched at a 10-second pace by the project owner's decision despite the site's blanket robots.txt Disallow. Every section carries the Effective date the site prints for its current text; Revised Code sections also record the Latest Legislation marker, and Administrative Code rules record the Supplemental Information block (Authorized By, Amplifies, Five Year Review Date, Prior Effective Dates). A bracketed status note the site prints in front of a catchline (a Governor's veto not yet reflected, for example) is kept per section. The site states no currency line; the newest per-section effective date is recorded in meta. Each section records whether it was captured from a chapter page or its own page.";

export const OH_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'OH',
  displayName: 'Ohio',
  corpusPath: 'packages/state-oh/data/oh-law-corpus.json',
  corpusFileSchema: OhCorpusFileSchema,
  attentionFileName: 'OH-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state oh      (ten chapter pages + eight section pages at 10 s; ~3 minutes)\n' +
    '  3. cd packages\\state-oh && bun test             (annotation + demo suites are the gate; read every status note the log prints)\n' +
    '  4. cd ..\\..\\apps\\state-oh-server && npx wrangler deploy\n' +
    '  5. curl -s https://oh.repairmcp.com/health       (confirm the capture date + newestEffectiveDate)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo): Promise<CaptureOutcome> {
    const capturedAt = today();
    const captured = await captureOhio(io, OH_SOURCES);
    const byKey = new Map<string, OhSection>();
    for (const s of captured.sections) {
      const key = `${s.code}:${s.cite}`;
      if (byKey.has(key)) throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      byKey.set(key, s);
    }
    let newestEffectiveDate = '';
    for (const s of byKey.values()) if (s.effectiveDate > newestEffectiveDate) newestEffectiveDate = s.effectiveDate;
    return {
      file: {
        meta: {
          state: 'OH',
          capturedAt,
          currentThrough: capturedAt,
          sourceNote: OH_SOURCE_NOTE,
          sourceUrl: 'https://codes.ohio.gov/',
          newestEffectiveDate,
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
