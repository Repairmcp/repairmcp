/**
 * Montana's StateCaptureProfile: the MCA two-tier crawl and the ARM API walk
 * composed into one captureAll. NOT exported from the barrel — script
 * plumbing, imported by path from scripts/state-registry.ts.
 */
import type { CaptureIo, CaptureOutcome, StateCaptureProfile } from '@repairmcp/state-law';
import { captureArm } from './capture-arm.js';
import { captureMca } from './capture-mca.js';
import { MCA_EDITION } from './identity.js';
import { MtCorpusFileSchema, type MtSection } from './schema.js';
import { MT_ARM_SOURCES } from './sources-arm.js';
import { MT_MCA_SOURCES } from './sources-mca.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const SOURCE_NOTE =
  'Captured from mca.legmt.gov (the Montana Code Annotated; the Legislature notes the printed ' +
  'MCA prevails over the web version) and from the Secretary of State\'s Administrative Rules ' +
  'of Montana API at rules.mt.gov. Statute currency is the MCA edition stated in mcaEdition; ' +
  'each ARM rule carries its own effective date; both were captured on the date stated.';

export const MT_CAPTURE_PROFILE: StateCaptureProfile = {
  state: 'MT',
  displayName: 'Montana',
  corpusPath: 'packages/state-mt/data/mt-law-corpus.json',
  corpusFileSchema: MtCorpusFileSchema,
  attentionFileName: 'MT-LAW-ATTENTION.txt',
  refreshChecklist:
    '  1. cd C:\\dev\\repairmcp\n' +
    '  2. bun scripts/capture-state.ts --state mt      (re-captures MCA + ARM)\n' +
    '  3. cd packages\\state-mt && bun test             (annotation + demo suites are the gate;\n' +
    '     an MCA edition rollover fails the MCA_EDITION pin and needs the constant bumped)\n' +
    '  4. cd ..\\..\\apps\\state-mt-server && npx wrangler deploy\n' +
    '  5. curl -s https://mt.repairmcp.com/health       (confirm the new capture date + edition)\n' +
    '  6. commit the corpus + any annotation fixes',
  supportsOnly: false,

  async captureAll(io: CaptureIo, opts = {}): Promise<CaptureOutcome> {
    const mca = await captureMca(io, MT_MCA_SOURCES);
    const arm = await captureArm(io, MT_ARM_SOURCES, {
      previousSections: opts.previous?.sections as MtSection[] | undefined,
    });

    const byKey = new Map<string, MtSection>();
    for (const section of [...mca.sections, ...arm.sections]) {
      const key = `${section.code}:${section.cite}`;
      if (byKey.has(key)) {
        throw new Error(`Manifest overlap: ${key} captured by more than one entry.`);
      }
      byKey.set(key, section);
    }

    if (mca.edition !== MCA_EDITION) {
      io.log(
        `  WARNING: pages state "${mca.edition}" but the package pins MCA_EDITION ` +
          `"${MCA_EDITION}" — the edition rolled over. Update src/identity.ts (the pin test ` +
          'will fail until you do) so citations state the right edition.',
      );
    }

    return {
      file: {
        meta: {
          state: 'MT',
          capturedAt: today(),
          currentThrough: today(),
          sourceNote: SOURCE_NOTE,
          sourceUrl: 'https://mca.legmt.gov',
          mcaEdition: mca.edition,
        },
        sections: [...byKey.values()],
      },
      report: {
        fetches: 0,
        skippedEmpty: [...mca.report.skippedEmpty, ...arm.report.skippedEmpty],
        duplicates: [],
        warnings: [...mca.report.warnings, ...arm.report.warnings],
      },
    };
  },
};
