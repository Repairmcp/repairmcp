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
  delisted_at: string | null;
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

/** The parser's stand-in for an empty Resolution cell — never real content. */
const RESOLUTION_PLACEHOLDER = 'Awaiting resolution';

function hasRealResolution(row: RawRow): boolean {
  return Boolean(row.resolution) && row.resolution !== RESOLUTION_PLACEHOLDER;
}

/**
 * DEG sometimes marks an inquiry Resolved while its detail page carries no
 * resolution text — 83 records corpus-wide as of 2026-08-02, going back to 2008.
 * Emitting the placeholder there would produce a citation that says resolved and
 * then shows "Awaiting resolution", which reads as a contradiction to a shop.
 * Drop the field instead.
 *
 * Suppression applies to all 83. The delta sync separately keeps the *recent*
 * ones on its refresh list until real text arrives, bounded to a year
 * (getResolvedWithoutResolutionIds in ingestion/deg-backfill/src/db.ts) — a
 * 2009 inquiry that has been blank for 17 years is settled, not pending.
 *
 * On a genuinely pending inquiry the placeholder is honest, so it survives.
 */
function deriveResolution(row: RawRow, status: 'pending' | 'resolved' | 'closed'): string | undefined {
  if (!row.resolution) return undefined;
  if (status === 'resolved' && row.resolution === RESOLUTION_PLACEHOLDER) return undefined;
  return row.resolution;
}

function deriveIssueSummary(row: RawRow): string | undefined {
  if (row.issue_summary) return row.issue_summary;
  if (row.suggested_action) {
    const truncated = row.suggested_action.slice(0, 200);
    return truncated.length < row.suggested_action.length ? `${truncated}...` : truncated;
  }
  // Never fall back to the placeholder — it would surface as the summary.
  if (hasRealResolution(row) && row.resolution) {
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

/**
 * When DEG last changed this inquiry — NOT when we last crawled it.
 *
 * This used to read last_seen_at, which tier-1 stamps on every row on every
 * index sync. The result was that all 22,425 served records carried a single
 * identical lastUpdated (2026-06-29), so a 2007 inquiry claimed to have been
 * updated last week. Citations are the product here; a date that moves because
 * our crawler ran is worse than no date at all.
 *
 * body_fetched_at is excluded for the same reason — also a crawl artifact.
 * Resolution is the last real content event on a DEG inquiry; before that,
 * submission is. Inquiries still awaiting an IP response correctly report their
 * submission date.
 */
function deriveLastUpdated(row: RawRow, submittedAt: Date): Date {
  return parseDate(row.resolution_date) ?? submittedAt;
}

function transformRow(row: RawRow): DEGInquiry | null {
  if (EXCLUDED_IDS.has(row.db_id)) return null;

  const submittedAt = parseDate(row.submission_date) ?? parseDate(row.submitted_datetime);

  if (!submittedAt) {
    console.warn(`  SKIP: db_id=${row.db_id} has no parseable submission date`);
    return null;
  }

  const lastUpdated = deriveLastUpdated(row, submittedAt);
  if (!row.source_url) {
    console.warn(`  SKIP: db_id=${row.db_id} has no source_url`);
    return null;
  }

  const issueSummary = deriveIssueSummary(row);
  if (!row.issue_summary && issueSummary) {
    console.warn(`  NOTE: db_id=${row.db_id} has no native issue_summary, derived from fallback`);
  }
  if (!issueSummary && !hasRealResolution(row) && !row.suggested_action) {
    console.warn(`  SKIP: db_id=${row.db_id} has no issue_summary, resolution, or suggested_action, nothing to surface`);
    return null;
  }

  const status = mapStatus(row.status ?? row.resolution_status);
  const resolution = deriveResolution(row, status);
  if (status === 'resolved' && resolution === undefined) {
    console.warn(`  NOTE: db_id=${row.db_id} marked Resolved upstream but has no resolution text; field omitted`);
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
    resolution,
    status,
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
  let delisted = 0;
  let skipped = 0;
  let derived = 0;

  for (const row of rows) {
    if (EXCLUDED_IDS.has(row.db_id)) {
      excluded++;
      continue;
    }

    // Retracted upstream: the row is kept in SQLite for audit, but serving it
    // would cite a degweb.org page that no longer exists. Stamped by the
    // delta sync (ingestion/deg-backfill/src/sync.ts).
    if (row.delisted_at) {
      console.warn(`  DELISTED: db_id=${row.db_id} removed upstream ${row.delisted_at}`);
      delisted++;
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
  console.log(`Delisted upstream:        ${delisted}`);
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