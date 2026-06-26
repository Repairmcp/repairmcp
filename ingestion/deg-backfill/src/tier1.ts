import type { Database } from 'bun:sqlite';
import { upsertMetadata } from './db.js';
import type { MetadataRow } from './db.js';

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
  const make = parts[1] ?? null;
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

export async function syncIndex(
  db: Database,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
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
  const entries = json.data;
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
