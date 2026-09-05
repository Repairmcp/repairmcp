/**
 * California's StateCaptureProfile: the leginfo text views, the LII CCR
 * pages, and the DIR Title 8 pages composed into one captureAll. NOT
 * exported from the barrel — script plumbing, imported by path from
 * scripts/state-registry.ts (the MT/CO/TX pattern).
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureCaDir, captureCaLii } from './capture-regs.js';
import { captureCaStatutes } from './capture-statutes.js';
import { CaCorpusFileSchema, type CaSection } from './schema.js';
import { CA_DIR_SOURCES, CA_LII_SOURCES } from './sources-regs.js';
import { CA_STATUTE_SOURCES } from './sources-statutes.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const CA_SOURCE_NOTE =
  "Captured from the California codes as published by the Legislature's own site " +
  '(leginfo.legislature.ca.gov, article and chapter text views), from Title 8 of the California ' +
  "Code of Regulations as published by the Department of Industrial Relations' own site " +
  '(dir.ca.gov/title8), and — for Titles 10 and 16 of the CCR and Wage Order 9 — from the ' +
  "Legal Information Institute's mirror of the CCR (law.cornell.edu/regulations/california), " +
  'because the official CCR publisher (Westlaw, under the Office of Administrative Law contract) ' +
  'refuses automated access. Each section records which surface it came from. A statute ' +
  "section's effective date is the newest one its own history note states; a regulation's is " +
  'the newest operative or effective date in its Register history. None of the three surfaces ' +
  'states a currency marker of its own, so currency is the capture date. California statutes ' +
  'print no catchlines; statute headings are editorial descriptors from the capture manifest, ' +
  'never source text.';

export const CA_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'CA',
  displayName: 'California',
  corpusPath: 'packages/state-ca/data/ca-law-corpus.json',
  corpusFileSchema: CaCorpusFileSchema,
  attentionFileName: 'CA-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state ca      (re-captures statutes + CCR + Cal/OSHA;\n' +
    '     ~20 minutes — leginfo and the LII mirror each ask for a 10 s crawl delay)\n' +
    '  3. cd packages\\state-ca && bun test             (annotation + demo suites are the gate;\n' +
    '     a renumbered or reworded section fails here and needs a human eye; a statute\n' +
    '     printed in two versions is selected by date and named in the warnings)\n' +
    '  4. cd ..\\..\\apps\\state-ca-server && npx wrangler deploy\n' +
    '  5. curl -s https://ca.repairmcp.com/health       (confirm the new capture date)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo): Promise<CaptureOutcome> {
    const capturedAt = today();
    const statutes = await captureCaStatutes(io, CA_STATUTE_SOURCES, { today: capturedAt });
    const lii = await captureCaLii(io, CA_LII_SOURCES);
    const dir = await captureCaDir(io, CA_DIR_SOURCES);

    const sections: CaSection[] = [...statutes.sections, ...lii.sections, ...dir.sections];
    const warnings = [
      ...statutes.report.warnings,
      ...lii.report.warnings,
      ...dir.report.warnings,
    ];

    const byKey = new Map<string, CaSection>();
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
          state: 'CA',
          capturedAt,
          currentThrough: capturedAt,
          sourceNote: CA_SOURCE_NOTE,
          sourceUrl: 'https://leginfo.legislature.ca.gov',
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [],
        duplicates: [],
        warnings,
      },
    };
  },
};
