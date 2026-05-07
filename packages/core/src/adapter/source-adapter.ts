import type { Citation } from '../citation/schema.js';
import type {
  BaseItem,
  ListRecentOpts,
  RefreshResult,
  SearchQuery,
  SearchResult,
} from './types.js';

/**
 * The contract every vertical must implement.
 * Implementing this gives the vertical the four standard MCP tools
 * (search / getById / listRecent / findSupporting) for free via the tool-builder.
 */
export interface SourceAdapter<TItem extends BaseItem> {
  // --- Identity ---
  /** Stable identifier; used as a prefix on every tool name. */
  readonly sourceId: string;
  /** Full human-readable source name; appears in long-form citations. */
  readonly sourceName: string;
  /** Short brand label for short-form citations (e.g. "DEG", "I-CAR"). */
  readonly sourceShortName: string;
  /** Canonical homepage / landing URL for the source. */
  readonly sourceUrl: string;
  /** 1–2 sentence description used inside tool descriptions and listings. */
  readonly description: string;
  /** Singular noun for items returned by this adapter, e.g. "inquiry", "article". */
  readonly itemNoun: string;
  /** Plural noun used in tool names and descriptions, e.g. "inquiries", "articles". */
  readonly itemNounPlural: string;

  // --- Discovery ---
  search(query: SearchQuery): Promise<SearchResult<TItem>[]>;
  getById(id: string): Promise<TItem | null>;
  listRecent(opts: ListRecentOpts): Promise<TItem[]>;

  // --- Citation ---
  formatCitation(item: TItem): Citation;

  // --- Refresh (called by ingestion layer / cron handler) ---
  refresh(opts?: { since?: Date }): Promise<RefreshResult>;
}
