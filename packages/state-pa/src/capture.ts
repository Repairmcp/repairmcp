/**
 * Pennsylvania's StateCaptureProfile: three pipelines composed into one
 * captureAll. NOT exported from the barrel — script plumbing, imported by
 * path from scripts/state-registry.ts. No edition pin exists for
 * Pennsylvania: the Pennsylvania Code's currency sentence rolls weekly and
 * is RECORDED in meta (it is checked for agreement across pages inside
 * capture-pacode.ts), and the statutes state no currency at all.
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureActs } from './capture-acts.js';
import { captureConsolidated } from './capture-consolidated.js';
import { capturePacode } from './capture-pacode.js';
import { PaCorpusFileSchema, type PaSection } from './schema.js';
import { PA_ACT_SOURCES } from './sources-acts.js';
import { PA_CONSOLIDATED_SOURCES } from './sources-consolidated.js';
import { PA_PACODE_SOURCES } from './sources-pacode.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const PA_SOURCE_NOTE =
  "Captured from the Pennsylvania Consolidated Statutes and the unconsolidated Pennsylvania Statutes as published on the General Assembly's static mirror (legis.state.pa.us/WU01, one page per chapter and one page per act; consolidated sections carry the effective date computed from their history note or the enclosing Enactment note, and unconsolidated act sections carry the amending act's approval date or the act's own date because the page states no effective clause — P.S. numbers are asserted by the manifest, the page prints act section numbers), and from the Pennsylvania Code as published by the Legislative Reference Bureau (pacodeandbulletin.gov, one page per chapter, fetched at a 10-second pace by the project owner's decision despite the site's robots.txt; every section carries its Source-note effective date or the chapter's, and the site's own 'changes effective through' sentence is recorded). The 1915 Workers' Compensation Act prints no catchlines; its five headings are manifest descriptors. Each section records its capture surface.";

export const PA_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'PA',
  displayName: 'Pennsylvania',
  corpusPath: 'packages/state-pa/data/pa-law-corpus.json',
  corpusFileSchema: PaCorpusFileSchema,
  attentionFileName: 'PA-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state pa      (three chapter pages + six act pages at 5 s, five Pa. Code chapter pages at 10 s; ~2 minutes)\n' +
    '  3. cd packages\\state-pa && bun test             (annotation + demo suites are the gate)\n' +
    '  4. cd ..\\..\\apps\\state-pa-server && npx wrangler deploy\n' +
    '  5. curl -s https://pa.repairmcp.com/health       (confirm the capture date + paCodeEffectiveThrough)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo): Promise<CaptureOutcome> {
    const capturedAt = today();
    const consolidated = await captureConsolidated(io, PA_CONSOLIDATED_SOURCES);
    const acts = await captureActs(io, PA_ACT_SOURCES);
    const pacode = await capturePacode(io, PA_PACODE_SOURCES);

    const sections: PaSection[] = [...consolidated.sections, ...acts.sections, ...pacode.sections];
    const byKey = new Map<string, PaSection>();
    for (const s of sections) {
      const key = `${s.code}:${s.cite}`;
      if (byKey.has(key)) throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      byKey.set(key, s);
    }
    return {
      file: {
        meta: {
          state: 'PA',
          capturedAt,
          currentThrough: capturedAt,
          sourceNote: PA_SOURCE_NOTE,
          sourceUrl: 'https://www.palegis.us/statutes',
          paCodeEffectiveThrough: pacode.currency,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [],
        duplicates: [],
        warnings: [...consolidated.report.warnings, ...acts.report.warnings, ...pacode.report.warnings],
      },
    };
  },
};
