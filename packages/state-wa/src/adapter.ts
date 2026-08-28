/**
 * The WA vertical's SourceAdapter — what core's OpenAI connector builders run
 * over. Much simpler than NHTSA's composite: a pure corpus source, no live
 * arms, no Promise.allSettled, nothing to time out. The four wa_* tools do NOT
 * go through this adapter; they take structured input and call WaCorpus
 * directly. This exists so `search`/`fetch` (and any future standard tools)
 * work unchanged.
 */
import type {
  BaseItem,
  Citation,
  ListRecentOpts,
  RefreshResult,
  SearchQuery,
  SearchResult,
  SourceAdapter,
} from '@repairmcp/core';
import type { WaCorpus } from './corpus.js';
import { WA_IDENTITY, displayCite, formatWaCitation, parseWaId, waId } from './identity.js';
import type { WaDomain, WaSection } from './schema.js';

export interface WaItem extends BaseItem {
  metadata: {
    kind: 'law';
    record: WaSection;
    domain: WaDomain;
    [key: string]: unknown;
  };
}

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export class WaAdapter implements SourceAdapter<WaItem> {
  readonly sourceId = WA_IDENTITY.sourceId;
  readonly sourceName = WA_IDENTITY.sourceName;
  readonly sourceShortName = WA_IDENTITY.sourceShortName;
  readonly sourceUrl = WA_IDENTITY.sourceUrl;
  readonly description = WA_IDENTITY.description;
  readonly itemNoun = WA_IDENTITY.itemNoun;
  readonly itemNounPlural = WA_IDENTITY.itemNounPlural;

  constructor(private readonly corpus: WaCorpus) {}

  sectionToItem(section: WaSection): WaItem {
    return {
      id: waId(section.code, section.cite),
      title: `${displayCite(section)} — ${section.heading}`,
      url: section.sourceUrl,
      // The date the current text took effect, or the corpus cutoff when the
      // history note states none — never a crawl artifact.
      lastUpdated: isoToDate(section.effectiveDate ?? this.corpus.meta.currentThrough),
      metadata: { kind: 'law', record: section, domain: section.domain },
    };
  }

  async search(query: SearchQuery): Promise<SearchResult<WaItem>[]> {
    const offset = query.offset ?? 0;
    const result = this.corpus.search(query.text ?? '', {
      limit: (query.limit ?? 10) + offset,
    });
    return result.hits.slice(offset).map((hit) => ({
      item: this.sectionToItem(hit.section),
      score: hit.score,
      snippet: hit.snippet,
      citation: formatWaCitation(hit.section),
    }));
  }

  async getById(id: string): Promise<WaItem | null> {
    // The strict id namespace first; then any citation spelling, because
    // connector clients pass back whatever the model typed.
    const parsed = parseWaId(id);
    const section = parsed
      ? this.corpus.getSection(`${parsed.code} ${parsed.cite}`)
      : this.corpus.getSection(id);
    return section ? this.sectionToItem(section) : null;
  }

  async listRecent(opts: ListRecentOpts): Promise<WaItem[]> {
    const limit = opts.limit ?? 10;
    return this.corpus.sections
      .filter((section) => section.effectiveDate)
      .sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''))
      .slice(0, limit)
      .map((section) => this.sectionToItem(section));
  }

  formatCitation(item: WaItem): Citation {
    return formatWaCitation(item.metadata.record);
  }

  /** The corpus refreshes by re-running capture-waleg + a deploy, not at runtime. */
  async refresh(): Promise<RefreshResult> {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }
}
