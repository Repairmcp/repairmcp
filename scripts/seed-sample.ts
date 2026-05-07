#!/usr/bin/env bun
/**
 * Seed-sample runner: scrape ~50 DEG inquiries into apps/deg-server/data/sample-inquiries.json.
 *
 * Polite scraping per architecture spec §9:
 *   - 1 request per 2 seconds (configurable)
 *   - User-Agent: RepairMCP-Bot/1.0 (+https://repairmcp.org)
 *   - Exponential backoff on 429/5xx (handled inside fetchInquiry)
 *   - Skip 404s
 *
 * Run from repo root: `bun scripts/seed-sample.ts`
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchInquiry } from '../packages/deg/src/scraper';
import type { DEGInquiry, InformationProvider } from '../packages/deg/src/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// Confirmed-real recent IDs from manual recon.
const KNOWN_IDS = [40990, 18849, 18914, 18918, 18919, 17326, 17327, 17409, 17278];

// Hand-spaced IDs across 5000-41000 for variety. Deterministic so reruns are reproducible.
// Bias toward 5000-21000 and 35000-41000 — initial recon showed 22000-35000 is sparse
// (most return 404 or redirect to /deg-database/).
const SAMPLED_IDS = [
  5247, 5500, 5891, 6000, 6432, 6700, 7150, 7400, 7888, 8101, 8501, 8800, 9233, 9500, 9874,
  10421, 10800, 11103, 11500, 11782, 12200, 12456, 12900, 13119, 13500, 13822, 14101, 14401, 14800,
  15110, 15400, 15788, 16000, 16245, 16700, 17500, 18200, 18800, 19200, 19500, 19800, 20100, 20500, 21000, 21345,
  22098, 22781, 23456, 24190, 24875, 25533, 26218, 26904, 27589, 28275, 28960, 29646, 30332,
  31017, 31703, 32388, 33074, 33760, 34445, 35131, 35500, 36000, 36502, 36800, 37500, 37873, 38400, 39245, 39800, 40200, 40500, 40700,
];

const ALL_IDS = [...KNOWN_IDS, ...SAMPLED_IDS];
const TARGET = 50;
const RATE_DELAY_MS = 2000;

function fmtDate(d: Date): string {
  const iso = d.toISOString();
  return iso.split('T')[0] ?? iso;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const collected: DEGInquiry[] = [];
  const skipped: Array<{ id: number; status: number; reason: string }> = [];

  console.log(`Target: ${TARGET} inquiries. Pool: ${ALL_IDS.length} candidate IDs.`);
  console.log(`Rate: ${RATE_DELAY_MS}ms between requests.\n`);

  for (let idx = 0; idx < ALL_IDS.length; idx++) {
    if (collected.length >= TARGET) break;
    const id = ALL_IDS[idx]!;
    const t0 = Date.now();
    process.stdout.write(`[${idx + 1}/${ALL_IDS.length}] ${id} ... `);
    const result = await fetchInquiry(id);
    const dt = Date.now() - t0;

    if (result.ok && result.inquiry) {
      collected.push(result.inquiry);
      console.log(
        `OK ${result.status} ${dt}ms ip=${result.inquiry.ip ?? 'unknown'} ` +
          `(${collected.length}/${TARGET})`,
      );
    } else {
      skipped.push({ id, status: result.status, reason: result.reason ?? 'unknown' });
      console.log(`SKIP ${result.status} ${dt}ms — ${result.reason}`);
    }
    await sleep(RATE_DELAY_MS);
  }

  const outDir = join(REPO_ROOT, 'apps', 'deg-server', 'data');
  // Guard against bun + OneDrive EEXIST despite { recursive: true }.
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'sample-inquiries.json');
  writeFileSync(outPath, JSON.stringify(collected, null, 2), 'utf-8');

  console.log(`\nWrote ${collected.length} inquiries to ${outPath}`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} IDs:`);
    for (const s of skipped) console.log(`  - ${s.id}: ${s.status} ${s.reason}`);
  }

  printSummary(collected);
  printSpotChecks(collected);
}

function printSummary(items: DEGInquiry[]): void {
  console.log('\n=== Summary ===');
  console.log(`Total fetched: ${items.length}`);

  const ipBuckets: Record<string, number> = { CCC: 0, Mitchell: 0, Audatex: 0, unknown: 0 };
  for (const inq of items) {
    const k: keyof typeof ipBuckets = (inq.ip ?? 'unknown') as keyof typeof ipBuckets;
    ipBuckets[k] = (ipBuckets[k] ?? 0) + 1;
  }
  console.log('IP distribution:');
  for (const [k, v] of Object.entries(ipBuckets)) console.log(`  ${k.padEnd(8)} ${v}`);

  const dates = items
    .map((i) => i.submittedAt)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length > 0) {
    console.log(`Date range: ${fmtDate(dates[0]!)} → ${fmtDate(dates[dates.length - 1]!)}`);
  }

  const makes: Record<string, number> = {};
  for (const inq of items) {
    const m = inq.vehicleMake ?? '(unknown)';
    makes[m] = (makes[m] ?? 0) + 1;
  }
  console.log('Vehicle makes:');
  const sortedMakes = Object.entries(makes).sort((a, b) => b[1] - a[1]);
  for (const [make, count] of sortedMakes) console.log(`  ${make.padEnd(20)} ${count}`);

  const types: Record<string, number> = {};
  for (const inq of items) {
    const t = inq.inquiryType ?? '(unknown)';
    types[t] = (types[t] ?? 0) + 1;
  }
  console.log('Inquiry types:');
  for (const [t, c] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(28)} ${c}`);
  }
}

function printSpotChecks(items: DEGInquiry[]): void {
  if (items.length === 0) return;
  // Deterministic-but-varied: pick first, middle, last (after stable sort by id).
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const picks = [
    sorted[0]!,
    sorted[Math.floor(sorted.length / 2)]!,
    sorted[sorted.length - 1]!,
  ];

  console.log('\n=== Spot checks (3 inquiries — first, middle, last by ID) ===');
  for (const inq of picks) {
    console.log(`\n--- ${inq.url} ---`);
    console.log(JSON.stringify(inq, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
