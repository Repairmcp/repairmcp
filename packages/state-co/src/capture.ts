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
  'from the Secretary of State Code of Colorado Regulations at coloradosos.gov (the PDF the ' +
  'Secretary of State designates the official version of each rule series), and from the ' +
  'Division of Insurance bulletin PDF at doi.colorado.gov. Statute currency is the CRS edition ' +
  'stated in crsEdition. A CCR rule carries the effective date its own text states, and where ' +
  'the rule states none, the effective date of the series document version it was captured ' +
  'from. All were captured on the date stated.';

/**
 * DOI Bulletin B-5.04, located on doi.colorado.gov 2026-08-31. The bulletins
 * landing page renders its index inside a Looker Studio embed rather than as
 * HTML, so the PDF URL is not reachable by reading the page's markup — it was
 * read out of the embedded report's own data, and both URLs were then verified
 * on the wire.
 *
 * `heading` and `effectiveDate` are the document's, checked against the PDF:
 * its title line reads exactly as below, and its History section records
 * "Originally issued as bulletin 11-03, December 11, 2003. Reissued May 8,
 * 2007. Reissued September 1, 2007. Reissued September 19, 2016." — the last
 * reissue is the date carried here.
 *
 * The userAgent override is not cosmetic: doi.colorado.gov's WAF answers the
 * bare `RepairMCP-Bot/1.0 (+https://repairmcp.com)` string with 403 and the
 * conventional `Mozilla/5.0 (compatible; …)` form with 200 (bare `Mozilla/5.0`
 * and `curl/8.0` are also refused, so this is a shape requirement, not
 * browser-sniffing). It still names us and still points at the project.
 */
export const CO_BULLETIN_SOURCE: BulletinSource = {
  cite: 'B-5.04',
  heading:
    'Notice of the Provisions Pertaining to the Payment of Claims for the Repair of Damaged Property',
  chapter: 'B-5',
  chapterTitle: 'Division of Insurance Bulletins, Property and Casualty',
  domain: 'insurance',
  effectiveDate: '2016-09-19',
  pdfUrl:
    'https://doi.colorado.gov/sites/doi/files/documents/' +
    'Bulletin-B-5.04-Notice-of-Provisions-Pertaining-to-Payment-Claims-for-Repair-of-Damaged-Property.pdf',
  pageUrl: 'https://doi.colorado.gov/statutes-regulations-bulletins/colorado-insurance-bulletins',
  mustContain: ['B-5.04', '10-4-120'],
  userAgent: 'Mozilla/5.0 (compatible; RepairMCP-Bot/1.0; +https://repairmcp.com)',
};

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
    const bulletin = await captureBulletin(io, CO_BULLETIN_SOURCE);
    sections.push(bulletin.section);
    warnings.push(...bulletin.report.warnings);

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
