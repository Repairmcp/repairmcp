/**
 * Deriving DEG's freshness from the corpus itself.
 *
 * This is the single producer of the two dates the server states about its own
 * currency, and it is deliberately the only one. `DEGAdapter` calls it over the
 * JSON it loaded, `scripts/build-d1-sql.ts` calls it to generate the D1 rows the
 * Worker reads, and the D1 test fake calls it to seed those same rows. Local,
 * remote and test therefore cannot disagree about the cutoff for the same reason
 * `identity.ts` keeps them from disagreeing about a citation: there is one
 * function, and nothing hand-types a date.
 *
 * Both values are `YYYY-MM-DD`. They are never `Date` objects, so nothing here
 * has the timezone surface `buildCitation` has to defend against.
 */
import type { CorpusFreshness } from '@repairmcp/core';
import type { DEGInquiry } from './schema.js';

/**
 * Metadata keys that record when we last saw a record at the source, in
 * priority order.
 *
 * `lastSeenAt` is the index sighting written by the delta sync, and it is the
 * right answer: it is the crawl that establishes "everything up to here has been
 * looked at". `scrapedAt` is what the older sample scraper wrote and means the
 * same thing for that corpus. `bodyFetchedAt` is last because it moves only when
 * a detail page is actually re-fetched, which happens for a subset of records
 * and on a different day — on the current corpus it reads a day later than the
 * sync that produced it, and claiming the later date would overstate currency by
 * exactly the kind of margin this module exists to prevent.
 *
 * First key present anywhere in the corpus wins outright; the maximum is then
 * taken within that key alone rather than across all three.
 */
const CRAWL_TIMESTAMP_KEYS = ['lastSeenAt', 'scrapedAt', 'bodyFetchedAt'] as const;

/** ISO instant or date string → `YYYY-MM-DD`. Returns null for anything else. */
function toDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const head = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/**
 * The date an inquiry carries for freshness purposes: when it was resolved, or
 * when it was submitted if it never was.
 *
 * Same expression as the `idx_inquiry_effective_date` index and the recency arm
 * of the D1 candidate pool — `COALESCE(resolved_at, submitted_at)`. Using the
 * same definition everywhere is what lets the cutoff mean something precise:
 * "no record in here has an effective date past this".
 */
function effectiveDate(inq: DEGInquiry): string | null {
  const d = inq.resolvedAt ?? inq.submittedAt;
  return d ? toDateOnly(d.toISOString()) : null;
}

/**
 * Compute what this corpus can honestly claim about itself.
 *
 * Returns null rather than a partial answer when the corpus is empty or carries
 * no crawl timestamp at all. A freshness object with a missing half would be
 * stated to the model with the same confidence as a complete one, and half a
 * currency claim is worse than none — the tools are built to degrade to silence.
 */
export function deriveCorpusMeta(inquiries: DEGInquiry[]): CorpusFreshness | null {
  if (inquiries.length === 0) return null;

  let currentThrough = '';
  for (const inq of inquiries) {
    const d = effectiveDate(inq);
    if (d && d > currentThrough) currentThrough = d;
  }
  if (!currentThrough) return null;

  let syncedAt = '';
  for (const key of CRAWL_TIMESTAMP_KEYS) {
    for (const inq of inquiries) {
      const d = toDateOnly(inq.metadata[key]);
      if (d && d > syncedAt) syncedAt = d;
    }
    if (syncedAt) break;
  }
  if (!syncedAt) return null;

  return { currentThrough, syncedAt, recordCount: inquiries.length };
}
