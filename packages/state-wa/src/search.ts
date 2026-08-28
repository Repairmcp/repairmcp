/**
 * Washington's view of the shared base search (@repairmcp/state-law). The
 * scorer moved there verbatim at the extraction; what is Washington's here
 * is one stopword — "washington" itself, which matches everything in an
 * all-Washington corpus and means nothing. Exported names are unchanged.
 */
import {
  buildSnippet,
  contentTokens as sharedContentTokens,
  normalizeToken,
  searchSections,
  tokenize,
  type BaseComponents,
  type BaseHit,
} from '@repairmcp/state-law';
import type { WaSection } from './schema.js';

export { buildSnippet, normalizeToken, tokenize };

export const WA_EXTRA_STOPWORDS: ReadonlySet<string> = new Set(['washington']);

export type WaBaseComponents = BaseComponents;
export type WaBaseHit = BaseHit<WaSection>;

/** Query tokens that actually discriminate: tokenized, deduplicated, stopwords out. */
export function contentTokens(query: string): string[] {
  return sharedContentTokens(query, WA_EXTRA_STOPWORDS);
}

export function searchWaSections(
  sections: readonly WaSection[],
  query: string,
  limit = 10,
): WaBaseHit[] {
  return searchSections(sections, query, limit, WA_EXTRA_STOPWORDS);
}
