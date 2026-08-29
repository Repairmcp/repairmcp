/**
 * Colorado's StateCaptureProfile: the CRS whole-title fetches, the CCR
 * two-tier crawl, and the bulletin PDF composed into one captureAll. NOT
 * exported from the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts (the MT pattern; fflate/unpdf stay out of the
 * Worker bundle this way).
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureBulletin, type BulletinSource } from './capture-bulletin.js';
import { captureCcr } from './capture-ccr.js';
import { captureCrs } from './capture-crs.js';
import { CRS_EDITION } from './identity.js';
import { CoCorpusFileSchema, type CoSection } from './schema.js';
import { CO_CCR_SOURCES } from './sources-ccr.js';
import { CO_CRS_SOURCES } from './sources-crs.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SOURCE_NOTE =
  'Captured from the Office of Legislative Legal Services CRS title files at olls.info ' +
  '(the practical official surface; the OLLS states currency per General Assembly session), ' +
  'from the Secretary of State Code of Colorado Regulations at coloradosos.gov (per-series ' +
  'documents with stated effective dates), and from the Division of Insurance bulletin PDF. ' +
  'Statute currency is the CRS edition stated in crsEdition; each CCR rule carries its own ' +
  'effective date; all were captured on the date stated.';

/** Filled with the real DOI URL in the first-capture task; null skips loudly. */
export const CO_BULLETIN_SOURCE: BulletinSource | null = null;

export const CO_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'CO',
  displayName: 'Colorado',
  corpusPath: 'packages/state-co/data/co-law-corpus.json',
  corpusFileSchema: CoCorpusFileSchema,
  attentionFileName: 'CO-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state co      (re-captures CRS + CCR + bulletin)\n' +
    '  3. cd packages\\state-co && bun test             (annotation + demo suites are the gate;\n' +
    '     a CRS edition rollover fails the CRS_EDITION pin and needs the constant bumped)\n' +
    '  4. cd ..\\..\\apps\\state-co-server && npx wrangler deploy\n' +
    '  5. curl -s https://co.repairmcp.com/health       (confirm the new capture date + edition)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo, opts = {}): Promise<CaptureOutcome> {
    const previous = opts.previous?.sections as CoSection[] | undefined;
    const crs = await captureCrs(io, CO_CRS_SOURCES);
    const ccr = await captureCcr(io, CO_CCR_SOURCES, { previousSections: previous });

    const sections: CoSection[] = [...crs.sections, ...ccr.sections];
    const warnings = [...crs.report.warnings, ...ccr.report.warnings];
    if (CO_BULLETIN_SOURCE) {
      const bulletin = await captureBulletin(io, CO_BULLETIN_SOURCE);
      sections.push(bulletin.section);
      warnings.push(...bulletin.report.warnings);
    } else {
      io.log('  WARNING: CO_BULLETIN_SOURCE is null — B-5.04 NOT captured. Fill it (task 10).');
      warnings.push('bulletin skipped: CO_BULLETIN_SOURCE is null.');
    }

    const byKey = new Map<string, CoSection>();
    for (const section of sections) {
      const key = `${section.code}:${section.cite}`;
      if (byKey.has(key)) {
        throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      }
      byKey.set(key, section);
    }

    return {
      file: {
        meta: {
          state: 'CO',
          capturedAt: today(),
          currentThrough: today(),
          sourceNote: SOURCE_NOTE,
          sourceUrl: 'https://leg.colorado.gov',
          crsEdition: CRS_EDITION,
          crsCurrencyNote: crs.currencyNote,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [...crs.report.skippedEmpty, ...ccr.report.skippedEmpty],
        duplicates: [],
        warnings,
      },
    };
  },
};
