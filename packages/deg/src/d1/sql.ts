/**
 * The single producer of the D1 row shape.
 *
 * Both directions live here on purpose: `scripts/build-d1-sql.ts` uses
 * `inquiryToRow` to generate the import file, and `D1DEGAdapter` uses
 * `rowToInquiry` to read it back. If those two ever disagree the served corpus
 * silently diverges from the local one, so they are not allowed to live apart.
 */
import type { DEGInquiry, InformationProvider, InquiryStatus } from '../schema.js';
import { tokenize } from '../scoring.js';

/** Column order for INSERT. Must match `0001_schema.sql`. */
export const INQUIRY_COLUMNS = [
  'db_id',
  'id',
  'inquiry_number',
  'title',
  'url',
  'ip',
  'inquiry_type',
  'area_of_vehicle',
  'vehicle_year',
  'vehicle_make',
  'vehicle_model',
  'body',
  'labor_type',
  'issue_summary',
  'suggested_action',
  'resolution',
  'status',
  'submitted_at',
  'resolved_at',
  'last_updated',
  'metadata',
] as const;

/** Qualified column list for SELECTs that join the FTS table. */
export const SELECT_COLUMNS = INQUIRY_COLUMNS.map((c) => `i.${c}`).join(', ');

/**
 * bm25() weights, positional against the column order declared in
 * `0003_fts.sql`. Title heaviest, then the two fields a resolution actually
 * lives in, then suggested action. Vehicle fields are near-zero so a query that
 * happens to name a make ("blend time on a Ford") does not drown the operation
 * terms that carry the meaning.
 */
export const BM25_RANK =
  'bm25(inquiry_fts, 8.0, 4.0, 3.0, 4.0, 2.0, 1.0, 0.5, 0.5, 0.5)';

/** A row as it comes back from D1. Every column is nullable except the NOT NULLs. */
export interface InquiryRow {
  db_id: number;
  id: string;
  inquiry_number: string;
  title: string;
  url: string;
  ip: string | null;
  inquiry_type: string | null;
  area_of_vehicle: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  body: string | null;
  labor_type: string | null;
  issue_summary: string | null;
  suggested_action: string | null;
  resolution: string | null;
  status: string;
  submitted_at: string;
  resolved_at: string | null;
  last_updated: string;
  metadata: string;
}

function asIp(raw: string | null): InformationProvider | null {
  return raw === 'CCC' || raw === 'Mitchell' || raw === 'Audatex' ? raw : null;
}

function asStatus(raw: string): InquiryStatus {
  return raw === 'resolved' || raw === 'closed' ? raw : 'pending';
}

function asLaborType(raw: string | null): DEGInquiry['laborType'] {
  switch (raw) {
    case 'body':
    case 'paint':
    case 'mechanical':
    case 'frame':
    case 'refinish':
    case 'other':
      return raw;
    default:
      return undefined;
  }
}

/** D1 row → the served record. Inverse of `inquiryToRow`. */
export function rowToInquiry(row: InquiryRow): DEGInquiry {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    lastUpdated: new Date(row.last_updated),
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    inquiryNumber: row.inquiry_number,
    ip: asIp(row.ip),
    inquiryType: row.inquiry_type ?? undefined,
    areaOfVehicle: row.area_of_vehicle ?? undefined,
    vehicleYear: row.vehicle_year ?? undefined,
    vehicleMake: row.vehicle_make ?? undefined,
    vehicleModel: row.vehicle_model ?? undefined,
    body: row.body ?? undefined,
    laborType: asLaborType(row.labor_type),
    issueSummary: row.issue_summary ?? undefined,
    suggestedAction: row.suggested_action ?? undefined,
    resolution: row.resolution ?? undefined,
    status: asStatus(row.status),
    submittedAt: new Date(row.submitted_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
  };
}

/**
 * The served record → a D1 row. `db_id` is the numeric form of `id`; every
 * corpus id has been verified numeric, and a non-numeric one is a hard error
 * rather than something to coerce, because it would collide at rowid 0.
 */
export function inquiryToRow(inq: DEGInquiry): InquiryRow {
  if (!/^[0-9]+$/.test(inq.id)) {
    throw new Error(`inquiry id "${inq.id}" is not a positive integer; cannot be a rowid`);
  }
  return {
    db_id: Number(inq.id),
    id: inq.id,
    inquiry_number: inq.inquiryNumber,
    title: inq.title,
    url: inq.url,
    ip: inq.ip,
    inquiry_type: inq.inquiryType ?? null,
    area_of_vehicle: inq.areaOfVehicle ?? null,
    vehicle_year: inq.vehicleYear ?? null,
    vehicle_make: inq.vehicleMake ?? null,
    vehicle_model: inq.vehicleModel ?? null,
    body: inq.body ?? null,
    labor_type: inq.laborType ?? null,
    issue_summary: inq.issueSummary ?? null,
    suggested_action: inq.suggestedAction ?? null,
    resolution: inq.resolution ?? null,
    status: inq.status,
    submitted_at: inq.submittedAt.toISOString(),
    resolved_at: inq.resolvedAt ? inq.resolvedAt.toISOString() : null,
    last_updated: inq.lastUpdated.toISOString(),
    metadata: JSON.stringify(inq.metadata),
  };
}

/**
 * Minimum token length that earns a prefix match.
 *
 * The scorer matches substrings (`haystack.includes('measurement')` is true of
 * "measurements"); FTS5 matches whole tokens, and would not retrieve that
 * record at all. Prefix matching closes the inflection gap — plurals, -ing,
 * -ed — which is where essentially all of the divergence lives.
 *
 * It is length-gated because short tokens are the ones that go wrong: `ri`,
 * which is what `R&I` tokenizes to, would prefix-match "right", "rim", "rivet",
 * and "ribbon". Three is the measured floor — it is what "aim" needs to reach
 * "aiming", and dropping to three took full-corpus top-5 agreement with the
 * in-memory adapter from 14/15 to 15/15 across the estimator queries in
 * `d1-parity.test.ts`. Two would let `ri` through and is not worth it.
 *
 * Suffix and infix divergence remains — a query for "frame" still will not
 * retrieve a record that only says "subframe". That residue is fine; a subframe
 * genuinely is not a frame, and the substring scorer is the sloppy one there.
 */
const PREFIX_MIN_LENGTH = 3;

/**
 * Build an FTS5 MATCH expression from free user text.
 *
 * User text never reaches FTS5 raw. It goes through the same `tokenize` the
 * scorer uses — which lowercases, collapses `R&I` → `ri`, replaces every
 * non-alphanumeric with a space, and drops stopwords — so the tokens that come
 * out are `[a-z0-9]+` and nothing else. Quoting each one makes an FTS5 syntax
 * error (or an injected `NEAR`/`*`/`OR`) structurally impossible rather than
 * merely unlikely.
 *
 * OR rather than AND: recall matters more than precision here, because bm25
 * does the ranking and, for find_supporting, the killer scorer re-ranks after.
 *
 * Returns null when the query has no usable tokens — all stopwords, or nothing
 * but punctuation. Callers must treat that as "no results", not as "match all";
 * an empty MATCH string is a syntax error in FTS5.
 */
export function buildMatchExpression(text: string): string | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  return tokens
    .map((t) => {
      const quoted = `"${t.replace(/"/g, '""')}"`;
      return t.length >= PREFIX_MIN_LENGTH ? `${quoted}*` : quoted;
    })
    .join(' OR ');
}
