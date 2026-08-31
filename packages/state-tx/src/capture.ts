/**
 * Texas's StateCaptureProfile: the statutes chapter fetches, the TAC Appian
 * crawl, and the two TDI bulletins composed into one captureAll. NOT
 * exported from the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts (the MT/CO pattern).
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureTdiBulletin, type TdiBulletinSource } from './capture-bulletins.js';
import { captureTac } from './capture-tac.js';
import { captureTxStatutes } from './capture-statutes.js';
import { TxCorpusFileSchema, type TxSection } from './schema.js';
import { TX_STATUTE_SOURCES } from './sources-statutes.js';
import { TX_TAC_SOURCES } from './sources-tac.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SOURCE_NOTE =
  'Captured from the Texas statutes as served by the Legislature\'s own statutes site backend ' +
  '(tcss.legis.texas.gov, the data source of statutes.capitol.texas.gov, which states its own ' +
  'currency per legislative session), from the Texas Administrative Code as served by the ' +
  "Secretary of State's rules portal (texas-sos.appianportalsgov.com), and from the Texas " +
  "Department of Insurance Commissioner's Bulletins at tdi.texas.gov. A statute section's " +
  'effective date is the newest one its own session-law history note states; a TAC rule\'s is ' +
  'the newest its Source Note states; a bulletin carries its issue date. All were captured on ' +
  'the date stated.';

/**
 * Both bulletins verified on the wire 2026-08-31: plain HTML, dates and
 * bulletin numbers as pinned. The filename-vs-number mismatch on these two
 * is why pageUrl is pinned rather than derived (see capture-bulletins.ts).
 */
export const TX_BULLETIN_SOURCES: readonly TdiBulletinSource[] = [
  {
    cite: 'B-0031-10',
    heading: 'Automobile Repair Facilities',
    domain: 'insurance',
    issueDate: '2010-08-02',
    pageUrl: 'https://www.tdi.texas.gov/bulletins/2010/cc30.html',
    mustContain: ['B-0031-10', 'repair'],
  },
  {
    cite: 'B-0026-11',
    heading: 'Automobile Repair Facilities',
    domain: 'insurance',
    issueDate: '2011-06-20',
    pageUrl: 'https://www.tdi.texas.gov/bulletins/2011/cc25.html',
    mustContain: ['B-0026-11', 'repair'],
  },
];

export const TX_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'TX',
  displayName: 'Texas',
  corpusPath: 'packages/state-tx/data/tx-law-corpus.json',
  corpusFileSchema: TxCorpusFileSchema,
  attentionFileName: 'TX-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state tx      (re-captures statutes + TAC + bulletins)\n' +
    '  3. cd packages\\state-tx && bun test             (annotation + demo suites are the gate;\n' +
    '     a Legislature rollover fails the TX_STATUTES_CURRENCY pin and needs the constant\n' +
    '     bumped; a TAC 406 means Appian changed its client headers — re-derive them from the\n' +
    '     portal bundle, see sources-tac.ts)\n' +
    '  4. cd ..\\..\\apps\\state-tx-server && npx wrangler deploy\n' +
    '  5. curl -s https://tx.repairmcp.com/health       (confirm the new capture date + session)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo): Promise<CaptureOutcome> {
    const statutes = await captureTxStatutes(io, TX_STATUTE_SOURCES);
    const tac = await captureTac(io, TX_TAC_SOURCES);

    const sections: TxSection[] = [...statutes.sections, ...tac.sections];
    const warnings = [...statutes.report.warnings, ...tac.report.warnings];
    for (const source of TX_BULLETIN_SOURCES) {
      const bulletin = await captureTdiBulletin(io, source);
      sections.push(bulletin.section);
      warnings.push(...bulletin.report.warnings);
    }

    const byKey = new Map<string, TxSection>();
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
          state: 'TX',
          capturedAt: today(),
          currentThrough: today(),
          sourceNote: SOURCE_NOTE,
          sourceUrl: 'https://statutes.capitol.texas.gov',
          txStatutesCurrencyNote: statutes.currencyNote,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [...statutes.report.skippedEmpty, ...tac.report.skippedEmpty],
        duplicates: [],
        warnings,
      },
    };
  },
};
