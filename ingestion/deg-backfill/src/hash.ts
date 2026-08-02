import { createHash } from 'node:crypto';

/**
 * The fields that decide whether a refreshed inquiry is materially different.
 *
 * This is exactly the set that feeds the served JSON via
 * scripts/transform-deg-sqlite.ts — nothing more. Crawl bookkeeping
 * (body_fetched_at, last_seen_at, source_url) is deliberately excluded: it
 * changes on every fetch and would make every row look "changed".
 *
 * Order is significant — it is part of the hash preimage. Appending a field
 * invalidates every stored hash, which is correct: the first run after such a
 * change re-classifies via diffFields() rather than trusting a stale digest.
 */
export const HASHED_FIELDS = [
  'status',
  'resolution_date',
  'inquiry_type',
  'area_of_vehicle',
  'oem_part_number',
  'issue_summary',
  'suggested_action',
  'resolution',
  'resolution_status',
  'year',
  'make',
  'model',
  'body',
  'submitted_datetime',
] as const;

export type HashedField = (typeof HASHED_FIELDS)[number];

export type ContentFields = Record<HashedField, string | number | null | undefined>;

/**
 * Collapse a field to its comparable form.
 *
 * NULL, undefined and '' all normalize to '' — DEG writes empty labels as both
 * a missing row and an empty cell depending on inquiry vintage, and we do not
 * want that distinction to register as an edit. Whitespace is collapsed for the
 * same reason: the WordPress editor reflows <td> content without the author
 * touching a word.
 *
 * Case is preserved. DEG vehicle make casing is dirty at the source
 * ("Ford"/"FORD"/"ford") and we keep source fidelity, so a casing change
 * upstream is a real change.
 */
export function normalizeForHash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** SHA-256 over the normalized content fields, in HASHED_FIELDS order. */
export function contentHash(fields: ContentFields): string {
  const hash = createHash('sha256');
  for (const field of HASHED_FIELDS) {
    // Field name in the preimage too, so a value shifting between fields is
    // not hash-equivalent to the original.
    hash.update(field);
    hash.update('\x1e');
    hash.update(normalizeForHash(fields[field]));
    hash.update('\x1f');
  }
  return hash.digest('hex');
}

/**
 * Names of the fields that actually differ. Only called when the hashes already
 * disagree — this exists to make the batch report readable, not to decide
 * whether to write.
 */
export function diffFields(before: ContentFields, after: ContentFields): HashedField[] {
  return HASHED_FIELDS.filter(
    (field) => normalizeForHash(before[field]) !== normalizeForHash(after[field]),
  );
}

/** Project a raw `inquiry` row (snake_case, as stored) onto the hashed field set. */
export function contentFieldsFromRow(row: Record<string, unknown>): ContentFields {
  const out = {} as ContentFields;
  for (const field of HASHED_FIELDS) {
    const value = row[field];
    out[field] =
      typeof value === 'string' || typeof value === 'number' || value === null
        ? value
        : undefined;
  }
  return out;
}
