import { z } from 'zod';

/**
 * Common base shape for any item type returned by a SourceAdapter.
 * Verticals extend this with their domain-specific fields.
 */
export interface BaseItem {
  id: string;
  title: string;
  url: string;
  lastUpdated: Date;
  metadata: Record<string, unknown>;
}

export const SearchQuerySchema = z.object({
  text: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export interface SearchResult<T extends BaseItem> {
  item: T;
  /** Relevance 0–1; verticals decide how to compute. */
  score: number;
  /** Highlighted match excerpt for UI rendering. */
  snippet?: string;
  citation: import('../citation/schema.js').Citation;
}

export interface ListRecentOpts {
  since?: Date;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface RefreshResult {
  scanned: number;
  added: number;
  updated: number;
  errors: number;
  durationMs: number;
}
