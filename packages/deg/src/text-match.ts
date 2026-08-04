/**
 * Free-text matching for `deg_search_inquiries`, shared by both adapters.
 *
 * These four functions used to live inside the in-memory adapter. They moved
 * here when D1 arrived, because the alternative was a second copy — and a
 * second copy is how the same query starts returning a different `score`
 * depending on whether a shop is on the local server or the remote one.
 *
 * Note this is a different scorer from `scoring.ts`. That one is the calibrated
 * killer scoring behind `deg_find_supporting`, with IP / vehicle / operation /
 * recency components. This one is deliberately crude — what fraction of the
 * query's words appear in the record — and it is what `score` has always meant
 * on the search tool.
 */
import type { DEGInquiry } from './schema.js';

export const SEARCHABLE_FIELDS: Array<keyof DEGInquiry> = [
  'title',
  'issueSummary',
  'suggestedAction',
  'resolution',
  'inquiryType',
  'areaOfVehicle',
  'vehicleMake',
  'vehicleModel',
  'body',
];

export function buildHaystack(inq: DEGInquiry): string {
  const parts: string[] = [];
  for (const f of SEARCHABLE_FIELDS) {
    const v = inq[f];
    if (typeof v === 'string') parts.push(v);
  }
  return parts.join(' \n ').toLowerCase();
}

/** Fraction of the query's words (2+ chars) that appear anywhere in the record. */
export function scoreText(haystack: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return 0;
  let hits = 0;
  for (const w of words) if (haystack.includes(w)) hits++;
  return hits / words.length;
}

/** Convenience: coverage of `query` against `inq`, for callers holding an item. */
export function coverageScore(inq: DEGInquiry, query: string): number {
  return scoreText(buildHaystack(inq), query);
}

/** Excerpt centred on the query as a literal substring; falls back to the head. */
export function extractSnippet(inq: DEGInquiry, query: string): string | undefined {
  const queryLc = query.toLowerCase();
  const candidates: string[] = [];
  if (inq.issueSummary) candidates.push(inq.issueSummary);
  if (inq.resolution) candidates.push(inq.resolution);
  if (inq.suggestedAction) candidates.push(inq.suggestedAction);
  for (const text of candidates) {
    const idx = text.toLowerCase().indexOf(queryLc);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + queryLc.length + 120);
      const slice = text.slice(start, end);
      return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
    }
  }
  // No exact match — fall back to first 200 chars of issueSummary.
  if (inq.issueSummary) {
    const head = inq.issueSummary.slice(0, 200);
    return head + (inq.issueSummary.length > 200 ? '…' : '');
  }
  return undefined;
}
