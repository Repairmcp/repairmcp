#!/usr/bin/env node
/**
 * Transform raw DEG crawl SQLite data into the DEGInquiry[] JSON shape
 * consumed by DEGAdapter.fromJsonFile().
 *
 * Source: C:\degdata\deg.sqlite (table: inquiry)
 * Output: apps/deg-server/data/deg-inquiries-full.json
 *
 * Run from repo root:
 *   npx tsx scripts/transform-deg-sqlite.ts
 *
 * Requires: better-sqlite3 (already installed)
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEGInquirySchema, type DEGInquiry } from '../packages/deg/src/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const SQLITE_PATH = 'C:\\degdata\\deg.sqlite';
const OUT_PATH = join(REPO_ROOT, 'apps', 'deg-server', 'data', 'deg-inquiries-full.json');

const EXCLUDED_IDS = new Set<number>([
  38943, // DEG retracted this inquiry; page 404s on degweb.org. Confirmed by Travis 2026-06-30.
]);

interface RawRow {
  db_id: number;
  database: string | null;
  inquiry_type: string | null;
  status: string | null;
  resolution_status: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  body: string | null;
  area_of_vehicle: string | null;
  oem_part_number: string | null;
  issue_summary: string | null;
  suggested_action: string | null;
  resolution: string | null;
  submission_date: string | null;
  resolution_date: string | null;
  submitted_datetime: string | null;
  source_url: string | null;
  body_fetched_at: string | null;
  last_seen_at: string | null;
}

function mapStatus(raw: string | null): 'pending' | 'resolved' | 'closed' {
  if (!raw) return 'pending';
  if (raw.startsWith('Resolved')) return 'resolved';
  if (raw === 'Submitted to IP') return 'pending';
  console.warn(`  WARN: unrecognized status "${raw}", defaulting to "pending"`);
  return 'pending';
}

function mapIp(raw: string | null): 'CCC' | 'Mitchell' | 'Audatex' | null {
  if (raw === 'CCC' || raw === 'Mitchell' || raw === 'Audatex') return raw;
  if (raw) console.warn(`  WARN: unrecognized database value "${raw}", mapping to null`);
  return null;
}

function deriveTitle(row: RawRow): string {
  if (row.inquiry_type && row.area_of_vehicle) {
    return `${row.inquiry_type}: ${row.area_of_vehicle}`;
  }
  if (row.inquiry_type) return row.inquiry_type;
  if (row.issue_summary) {
    const truncated = row.issue_summary.slice(0, 80);
    return truncated.length < row.issue_summary.length ? `${truncated}...` : truncated;
  }
  return `DEG Inquiry ${row.db_id}`;
}

function deriveIssueSummary(row: RawRow): string | undefined {
  if (row.issue_summary) return row.issue_summary;
  if (row.suggested_action) {
    const truncated = row.suggested_action.slice(0, 200);
    return truncated.length < row.suggested_action.length ? `${truncated}...` : truncated;
  }
  if (row.resolution) {
    const truncated = row.resolution.slice(0, 200);
    return truncated.length < row.resolution.length ? `${truncated}...` : truncated;
  }
  return undefined;
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function transformRow(row: RawRow): DEGInquiry | null {
  if (EXCLUDED_IDS.has(row.db_id)) return null;

  const submittedAt = parseDate(row.submission_date) ?? parseDate(row.submitted_datetime);
  const lastUpdated =
    parseDate(row.last_seen_at) ?? parseDate(row.body_fetched_at) ?? submittedAt;

  if (!submittedAt) {
    console.warn(`  SKIP: db_id=${row.db_id} has no parseable submission date`);
    return null;
  }
  if (!lastUpdated) {
    console.warn(`  SKIP: db_id=${row.db_id} has no parseable lastUpdated date`);
    return null;
  }
  if (!row.source_url) {
    console.warn(`  SKIP: db_id=${row.db_id} has no source_url`);
    return null;
  }

  const issueSummary = deriveIssueSummary(row);
  if (!row.issue_summary && issueSummary) {
    console.warn(`  NOTE: db_id=${row.db_id} has no native issue_summary, derived from fallback`);
  }
  if (!issueSummary && !row.resolution && !row.suggested_action) {
    console.warn(`  SKIP: db_id=${row.db_id} has no issue_summary, resolution, or suggested_action, nothing to surface`);
    return null;
  }

  const candidate: DEGInquiry = {
    id: String(row.db_id),
    title: deriveTitle(row),
    url: row.source_url,
    lastUpdated,
    metadata: {
      oemPartNumber: row.oem_part_number ?? undefined,
      lastSeenAt: row.last_seen_at ?? undefined,
      bodyFetchedAt: row.body_fetched_at ?? undefined,
      issueSummaryDerived: !row.issue_summary,
    },
    inquiryNumber: String(row.db_id),
    ip: mapIp(row.database),
    inquiryType: row.inquiry_type ?? undefined,
    areaOfVehicle: row.area_of_vehicle ?? undefined,
    vehicleYear: row.year ?? undefined,
    vehicleMake: row.make ?? undefined,
    vehicleModel: row.model ?? undefined,
    body: row.body ?? undefined,
    issueSummary,
    suggestedAction: row.suggested_action ?? undefined,
    resolution: row.resolution ?? undefined,
    status: mapStatus(row.status ?? row.resolution_status),
    submittedAt,
    resolvedAt: parseDate(row.resolution_date),
  };

  return candidate;
}

function main(): void {
  console.log(`Reading from ${SQLITE_PATH}`);
  const db = new Database(SQLITE_PATH, { readonly: true });
  const rows = db.prepare('SELECT * FROM inquiry').all() as RawRow[];
  db.close();

  console.log(`Read ${rows.length} raw rows.\n`);

  const results: DEGInquiry[] = [];
  const errors: Array<{ id: number; issue: string }> = [];
  let excluded = 0;
  let skipped = 0;
  let derived = 0;

  for (const row of rows) {
    if (EXCLUDED_IDS.has(row.db_id)) {
      excluded++;
      continue;
    }

    const candidate = transformRow(row);
    if (!candidate) {
      skipped++;
      continue;
    }

    if (candidate.metadata['issueSummaryDerived']) derived++;

    const parsed = DEGInquirySchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ id: row.db_id, issue: parsed.error.issues.map((i) => i.message).join('; ') });
      continue;
    }

    results.push(parsed.data);
  }

  console.log(`\n=== Transform Summary ===`);
  console.log(`Total raw rows:           ${rows.length}`);
  console.log(`Excluded (manual):        ${excluded}`);
  console.log(`Skipped (no usable text): ${skipped}`);
  console.log(`Derived issueSummary:     ${derived}`);
  console.log(`Schema validation errors: ${errors.length}`);
  console.log(`Successfully transformed: ${results.length}`);

  if (errors.length > 0) {
    console.log(`\n=== Validation Errors (first 20) ===`);
    for (const e of errors.slice(0, 20)) {
      console.log(`  db_id=${e.id}: ${e.issue}`);
    }
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);
  }

  const outDir = dirname(OUT_PATH);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\nWrote ${results.length} inquiries to ${OUT_PATH}`);
}

main();