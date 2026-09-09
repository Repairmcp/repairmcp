/**
 * Florida's StateCaptureProfile: the Online Sunshine statute pages and the
 * flrules.org FAC pipeline composed into one captureAll. NOT exported from
 * the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts (the MT/CO/TX/CA pattern).
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureFlFac } from './capture-fac.js';
import { captureFlStatutes } from './capture-statutes.js';
import { FlCorpusFileSchema, type FlSection } from './schema.js';
import { FL_FAC_SOURCES } from './sources-fac.js';
import { FL_STATUTE_SOURCES } from './sources-statutes.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const FL_SOURCE_NOTE =
  "Captured from the Florida Statutes as published by the Legislature's own Online Sunshine site " +
  '(leg.state.fl.us, one page per section) and from the Florida Administrative Code as published by ' +
  "the Department of State's flrules.org (the rule card in HTML; the rule text from the Word document " +
  'the card links, read in place). Florida statutes print catchlines, so every statute heading is ' +
  'source text. Florida statutes state NO per-section effective dates — the history note is a ' +
  "session-law list — so a statute's currency is the annual edition the site prints above every " +
  'page (meta.statutesEdition), which every statute citation carries. A rule\'s effective date is the ' +
  "one its card states, cross-checked against the chapter listing; a rule's document is versioned by " +
  'the adopting notice id the site links, recorded per rule.';

export const FL_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'FL',
  displayName: 'Florida',
  corpusPath: 'packages/state-fl/data/fl-law-corpus.json',
  corpusFileSchema: FlCorpusFileSchema,
  attentionFileName: 'FL-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state fl      (re-captures statutes + FAC; ~2 minutes;\n' +
    '     an edition rollover fails the FL_STATUTES_EDITION pin and needs the constant\n' +
    '     in packages/state-fl/src/identity.ts updated after reading what changed)\n' +
    '  3. cd packages\\state-fl && bun test             (annotation + demo suites are the gate;\n' +
    '     a renumbered or reworded section fails here and needs a human eye)\n' +
    '  4. cd ..\\..\\apps\\state-fl-server && npx wrangler deploy\n' +
    '  5. curl -s https://fl.repairmcp.com/health       (confirm the new capture date + edition)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo, opts = {}): Promise<CaptureOutcome> {
    const capturedAt = today();
    const previousSections = (opts.previous?.sections ?? []) as FlSection[];
    const statutes = await captureFlStatutes(io, FL_STATUTE_SOURCES);
    const fac = await captureFlFac(io, FL_FAC_SOURCES, { previousSections });

    const sections: FlSection[] = [...statutes.sections, ...fac.sections];
    const byKey = new Map<string, FlSection>();
    for (const section of sections) {
      const key = `${section.code}:${section.cite}`;
      if (byKey.has(key)) throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      byKey.set(key, section);
    }

    return {
      file: {
        meta: {
          state: 'FL',
          capturedAt,
          currentThrough: capturedAt,
          sourceNote: FL_SOURCE_NOTE,
          sourceUrl: 'https://www.leg.state.fl.us/statutes/',
          statutesEdition: statutes.edition,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [],
        duplicates: [],
        warnings: [...statutes.report.warnings, ...fac.report.warnings],
      },
    };
  },
};
