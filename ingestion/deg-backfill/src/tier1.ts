import type { Database } from 'bun:sqlite';
import { upsertMetadata } from './db.js';
import type { MetadataRow } from './db.js';
import type { FetchLike } from './tier2.js';

const INDEX_URL = 'https://degweb.org/grid/get/all';
const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.org)';

export interface IndexEntry {
  db_id: string;
  post_id: string;
  database: string;
  InquiryType: string;
  VehicleData: string;
  status: string;
  SubmissionDate: string;
  ResolutionDate: string;
  ResolveTime: string;
  more: unknown;
}

interface IndexResponse {
  count: number;
  data: IndexEntry[];
}

export interface SyncResult {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Makes whose name contains a space, written without a hyphen by DEG.
 *
 * The index ships vehicles as one string ("2022 Land Rover Range Rover Sport"),
 * so a naive split on whitespace takes only the first token as the make and
 * leaves the rest in the model — 296 rows corpus-wide had make='Land',
 * model='Rover Range Rover Sport' or make='Mercedes', model='Benz C300'.
 * Detail pages carry Make and Model in separate cells and are correct; this
 * list keeps the index path in agreement with them.
 */
export const MULTI_WORD_MAKES = [
  'Land Rover',
  'Mercedes Benz',
  'Alfa Romeo',
  'Aston Martin',
  'Rolls Royce',
  'Great Wall',
] as const;

export function parseVehicleData(vehicleData: string): {
  year: number | null;
  make: string | null;
  model: string | null;
} {
  const trimmed = vehicleData.trim();
  if (!trimmed) return { year: null, make: null, model: null };
  const parts = trimmed.split(/\s+/);
  const yearStr = parts[0] ?? '';
  if (!/^\d{4}$/.test(yearStr)) return { year: null, make: null, model: null };
  const year = parseInt(yearStr, 10);

  const first = parts[1] ?? null;
  const second = parts[2] ?? null;
  if (first !== null && second !== null) {
    const pair = `${first} ${second}`;
    const known = MULTI_WORD_MAKES.find((m) => m.toLowerCase() === pair.toLowerCase());
    if (known !== undefined) {
      // Preserve the source's casing, per the corpus-wide fidelity convention.
      return {
        year,
        make: pair,
        model: parts.length > 3 ? parts.slice(3).join(' ') : null,
      };
    }
  }

  const make = first;
  const model = parts.length > 2 ? parts.slice(2).join(' ') : null;
  return { year, make, model };
}

export function deriveResolutionStatus(status: string): 'pending' | 'resolved' {
  return status.trim().toLowerCase().startsWith('resolved') ? 'resolved' : 'pending';
}

function entryToRow(entry: IndexEntry, now: string): MetadataRow {
  const dbId = parseInt(entry.db_id, 10);
  const { year, make, model } = parseVehicleData(entry.VehicleData);
  return {
    dbId,
    database: entry.database,
    inquiryType: entry.InquiryType,
    status: entry.status,
    resolutionStatus: deriveResolutionStatus(entry.status),
    year,
    make,
    model,
    submissionDate: entry.SubmissionDate,
    resolutionDate: entry.ResolutionDate,
    sourceUrl: `https://degweb.org/inquiries/${entry.db_id}/`,
    lastSeenAt: now,
  };
}

/**
 * Fetch the index and return it deduped, without touching the database.
 *
 * The separation matters: upsertMetadata has a side effect — it resets
 * body_fetched_at to NULL when status or resolution_date moved — which would
 * destroy the very before/after difference the delta sync needs to compute.
 * The sync planner calls this; syncIndex() composes it with the upsert.
 *
 * Dedupe is real, not defensive: the live index carries 13 db_ids twice
 * (21493-21495, 21529-21531, 23145-23151), each under two WordPress post_ids
 * with identical payloads. Last occurrence wins.
 */
export async function fetchIndex(fetchImpl: FetchLike = fetch): Promise<IndexEntry[]> {
  const res = await fetchImpl(INDEX_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Tier-1 fetch failed: ${res.status}`);
  }

  const json = (await res.json()) as IndexResponse;

  const byDbId = new Map<number, IndexEntry>();
  for (const entry of json.data) {
    const dbId = parseInt(entry.db_id, 10);
    if (isNaN(dbId)) continue;
    byDbId.set(dbId, entry);
  }
  return [...byDbId.values()];
}

export function indexMaxDbId(entries: IndexEntry[]): number {
  return entries.reduce((max, e) => {
    const dbId = parseInt(e.db_id, 10);
    return isNaN(dbId) ? max : Math.max(max, dbId);
  }, 0);
}

export async function syncIndex(
  db: Database,
  fetchImpl: FetchLike = fetch,
): Promise<SyncResult> {
  const entries = await fetchIndex(fetchImpl);
  return upsertIndexEntries(db, entries);
}

export function upsertIndexEntries(db: Database, entries: IndexEntry[]): SyncResult {
  const now = new Date().toISOString();

  const BATCH = 500;
  let processed = 0;
  while (processed < entries.length) {
    const chunk = entries.slice(processed, processed + BATCH);
    const rows = chunk
      .map((e) => entryToRow(e, now))
      .filter((r) => !isNaN(r.dbId));
    upsertMetadata(db, rows);
    processed += chunk.length;
    process.stderr.write(`  Tier-1: ${processed}/${entries.length} upserted\r`);
  }
  process.stderr.write('\n');

  return { inserted: 0, updated: 0, total: entries.length };
}
