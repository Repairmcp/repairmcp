/**
 * New York's StateCaptureProfile: five pipelines composed into one
 * captureAll. NOT exported from the barrel — script plumbing, imported by
 * path from scripts/state-registry.ts. The CR-82 edition pin lives here
 * (the FL_STATUTES_EDITION pattern): a reissued DMV booklet fails the
 * capture until a human reads what changed and re-pins.
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureNyDfs } from './capture-dfs.js';
import { captureNyPdfParts } from './capture-parts.js';
import { captureNyReg64 } from './capture-reg64.js';
import { captureNyStatutes } from './capture-statutes.js';
import { NY_CR82_EDITION } from './identity.js';
import { NyCorpusFileSchema, type NySection } from './schema.js';
import { NY_DFS_SOURCES } from './sources-dfs.js';
import { NY_REG64_SOURCE } from './sources-reg64.js';
import { NY_STATUTE_SOURCES } from './sources-statutes.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const NY_SOURCE_NOTE =
  "Captured from the New York Consolidated Laws as published on the State Senate's public site (nysenate.gov, one page per section; every statute carries the date of its most recent revision as the site states it, and New York prints catchlines, so headings are source text), from the Department of Motor Vehicles' CR-82 booklet (15 NYCRR Part 82, verbatim, versioned by the booklet edition on its cover — Part 82 prints no per-section dates), from the Department of Labor's CR 142 booklet (12 NYCRR Part 142, verbatim, carrying the single amendment date its cover states), from the Legal Information Institute's mirror of the NYCRR for 11 NYCRR Part 216 (Regulation 64) ONLY — the official NYCRR publisher does not permit automated access and the Department of Financial Services hosts no regulation text — with each section's Register history kept, and from dfs.ny.gov for six Office of General Counsel opinions and circular letters (guidance, not law; one withdrawn and marked so). Each section records its capture surface.";

export const NY_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'NY',
  displayName: 'New York',
  corpusPath: 'packages/state-ny/data/ny-law-corpus.json',
  corpusFileSchema: NyCorpusFileSchema,
  attentionFileName: 'NY-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state ny      (statutes at 2 s, Reg 64 at 10 s, two PDFs, six DFS pages; ~5 minutes;\n' +
    '     a reissued CR-82 booklet fails the NY_CR82_EDITION pin and needs the constant in\n' +
    '     packages/state-ny/src/identity.ts updated after reading what changed)\n' +
    '  3. cd packages\\state-ny && bun test             (annotation + demo suites are the gate)\n' +
    '  4. cd ..\\..\\apps\\state-ny-server && npx wrangler deploy\n' +
    '  5. curl -s https://ny.repairmcp.com/health       (confirm the capture date + cr82Edition)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo, opts = {}): Promise<CaptureOutcome> {
    const capturedAt = today();
    const extractText = (opts as { extractText?: (b: Uint8Array) => Promise<string> }).extractText;
    const statutes = await captureNyStatutes(io, NY_STATUTE_SOURCES);
    const parts = await captureNyPdfParts(io, extractText ? { extractText } : {});
    if (parts.cr82Edition !== NY_CR82_EDITION) {
      throw new Error(
        `The DMV booklet prints "${parts.cr82Edition}" but the corpus pins "${NY_CR82_EDITION}" — CR-82 was reissued. Read what changed, update NY_CR82_EDITION in src/identity.ts, and re-capture consciously.`,
      );
    }
    const reg64 = await captureNyReg64(io, NY_REG64_SOURCE);
    const dfs = await captureNyDfs(io, NY_DFS_SOURCES);

    const sections: NySection[] = [...statutes.sections, ...reg64.sections, ...dfs.sections, ...parts.sections];
    const byKey = new Map<string, NySection>();
    for (const s of sections) {
      const key = `${s.code}:${s.cite}`;
      if (byKey.has(key)) throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      byKey.set(key, s);
    }
    return {
      file: {
        meta: {
          state: 'NY',
          capturedAt,
          currentThrough: capturedAt,
          sourceNote: NY_SOURCE_NOTE,
          sourceUrl: 'https://www.nysenate.gov/legislation/laws',
          cr82Edition: parts.cr82Edition,
          part142EffectiveDate: parts.part142EffectiveDate,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [],
        duplicates: [],
        warnings: [...statutes.report.warnings, ...parts.report.warnings, ...reg64.report.warnings, ...dfs.report.warnings],
      },
    };
  },
};
