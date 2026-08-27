import type { CorpusFreshness } from '@repairmcp/core';
import { NhtsaLawCorpusFileSchema } from './schema.js';
import type { NhtsaLawCorpusFile, NhtsaLawCorpusMeta, NhtsaLawSection } from './schema.js';
import { searchLawSections, type LawSearchHit } from './search.js';

/**
 * In-memory corpus over the captured 49 U.S.C. ch. 301 JSON. The caller hands
 * in the parsed JSON (a static import in the Worker, a file read in tests) and
 * this validates it once at construction — a malformed corpus fails at deploy
 * time, not at query time.
 */
export class LawCorpus {
  private readonly file: NhtsaLawCorpusFile;
  private readonly bySection: Map<string, NhtsaLawSection>;

  constructor(data: unknown) {
    this.file = NhtsaLawCorpusFileSchema.parse(data);
    this.bySection = new Map(
      this.file.sections.map((section) => [section.section.toUpperCase(), section]),
    );
  }

  get meta(): NhtsaLawCorpusMeta {
    return this.file.meta;
  }

  get sections(): readonly NhtsaLawSection[] {
    return this.file.sections;
  }

  searchLaws(query: string, limit = 10): LawSearchHit[] {
    return searchLawSections(this.file.sections, query, limit);
  }

  /** Accepts "30122", "§30122", "30120a", "sec. 30122" — anything a model might pass. */
  getSection(section: string): NhtsaLawSection | null {
    const cleaned = section
      .toUpperCase()
      .replace(/[§\s.]/g, '')
      .replace(/^SEC(TION)?/, '');
    return this.bySection.get(cleaned) ?? null;
  }

  /**
   * The law corpus fits core's corpus-freshness convention exactly:
   * `currentThrough` is OLRC's own currency marker, `syncedAt` is our capture
   * date. The live NHTSA tools deliberately do NOT use this — they are live —
   * see live.ts for that side of the split.
   */
  freshness(): CorpusFreshness {
    return {
      currentThrough: this.file.meta.currentThrough,
      syncedAt: this.file.meta.capturedAt,
      recordCount: this.file.sections.length,
    };
  }
}
