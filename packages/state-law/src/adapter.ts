/**
 * The generic state-law SourceAdapter — what core's OpenAI connector
 * builders run over. Pure corpus, no live arms. The two-parameter generic is
 * deliberate: `StateLawAdapter<WaSection, WaItem> implements
 * SourceAdapter<WaItem>` keeps the state's narrowed item type flowing into
 * RepairMCPServer<WaItem>, which plain `StateLawAdapter<WaSection>` cannot
 * satisfy (metadata.domain string vs the state's enum). The one internal
 * cast is justified by the corpus's own code/domain validation at
 * construction.
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
import type { StateLawCorpus } from './corpus.js';
import type { StateIdentity } from './identity.js';
import type { StateSection } from './schema.js';

export interface StateLawItem<S extends StateSection = StateSection> extends BaseItem {
  metadata: {
    kind: 'law';
    record: S;
    domain: string;
    [key: string]: unknown;
  };
}

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export class StateLawAdapter<
  S extends StateSection,
  I extends StateLawItem<S> = StateLawItem<S>,
> implements SourceAdapter<I>
{
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceShortName: string;
  readonly sourceUrl: string;
  readonly description: string;
  readonly itemNoun: string;
  readonly itemNounPlural: string;

  constructor(
    protected readonly corpus: StateLawCorpus<S>,
    protected readonly identity: StateIdentity,
  ) {
    this.sourceId = identity.config.sourceId;
    this.sourceName = identity.config.sourceName;
    this.sourceShortName = identity.config.sourceShortName;
    this.sourceUrl = identity.config.sourceUrl;
    this.description = identity.config.description;
    this.itemNoun = identity.config.itemNoun;
    this.itemNounPlural = identity.config.itemNounPlural;
  }

  sectionToItem(section: S): I {
    return {
      id: this.identity.id(section.code, section.cite),
      title: `${this.identity.displayCite(section)} — ${section.heading}`,
      url: section.sourceUrl,
      // The date the current text took effect, or the corpus cutoff when the
      // source states none — never a crawl artifact.
      lastUpdated: isoToDate(section.effectiveDate ?? this.corpus.meta.currentThrough),
      metadata: { kind: 'law', record: section, domain: section.domain },
    } as I;
  }

  async search(query: SearchQuery): Promise<SearchResult<I>[]> {
    const offset = query.offset ?? 0;
    const result = this.corpus.search(query.text ?? '', {
      limit: (query.limit ?? 10) + offset,
    });
    return result.hits.slice(offset).map((hit) => ({
      item: this.sectionToItem(hit.section),
      score: hit.score,
      snippet: hit.snippet,
      citation: this.identity.formatCitation(hit.section),
    }));
  }

  async getById(id: string): Promise<I | null> {
    // The strict id namespace first; then any citation spelling, because
    // connector clients pass back whatever the model typed.
    const parsed = this.identity.parseId(id);
    const section = parsed
      ? this.corpus.getSection(`${parsed.code} ${parsed.cite}`)
      : this.corpus.getSection(id);
    return section ? this.sectionToItem(section) : null;
  }

  async listRecent(opts: ListRecentOpts): Promise<I[]> {
    const limit = opts.limit ?? 10;
    return this.corpus.sections
      .filter((section) => section.effectiveDate)
      .sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''))
      .slice(0, limit)
      .map((section) => this.sectionToItem(section));
  }

  formatCitation(item: I): Citation {
    return this.identity.formatCitation(item.metadata.record);
  }

  /** The corpus refreshes by re-running capture + a deploy, not at runtime. */
  async refresh(): Promise<RefreshResult> {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }
}
