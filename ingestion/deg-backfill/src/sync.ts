import type { Database } from 'bun:sqlite';
import {
  getRow,
  getAllDbIds,
  getIndexComparableRows,
  getUnresolvedIds,
  getResolvedWithoutResolutionIds,
  getTrailingIds,
  getDelistedIds,
  writeRefreshedBody,
  setContentHash,
} from './db.js';
import type { ParsedBody } from './db.js';
import { fetchDetail, isTransientStatus, RATE_DELAY_MS } from './tier2.js';
import type { FetchDetailOpts } from './tier2.js';
import { contentHash, contentFieldsFromRow, diffFields } from './hash.js';
import type { ContentFields, HashedField } from './hash.js';
import { recordItemOutcome, getQueuedItems, enqueueItems } from './state.js';
import type { ItemPass } from './state.js';
import type { IndexEntry } from './tier1.js';

export interface PlanOptions {
  /** Size of the trailing re-verify sweep, in db_ids. 0 disables it. */
  refreshWindow: number;
  /** Skip the trailing sweep and pending cohort; index diff + new only. */
  indexDiffOnly?: boolean;
}

export interface SyncPlan {
  /** In the live index, absent locally. Includes gaps below the high-water mark. */
  newIds: number[];
  /** Held rows whose live status or ResolutionDate no longer matches ours. */
  indexChangedIds: number[];
  /** Held rows we still carry as unresolved. */
  unresolvedIds: number[];
  /** Held rows the index calls Resolved but which have no resolution text. */
  resolvedBlankIds: number[];
  /** Trailing re-verify sweep. */
  trailingIds: number[];
  /** Held locally, no longer in the live index. */
  delistedIds: number[];
  /** Previously delisted, back in the index. */
  reappearedIds: number[];
  /** newIds ∪ (indexChanged ∪ unresolved ∪ trailing), deduped, new pass first. */
  queue: Array<{ dbId: number; pass: ItemPass }>;
  indexCount: number;
  indexMaxDbId: number;
  highWaterBefore: number;
}

function normalizeIndexValue(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Pure planner — no network, no writes. Takes the already-fetched index so the
 * diff is computed against the database as it stands *before* the tier-1 upsert
 * moves status/resolution_date under us.
 */
export function planSync(db: Database, entries: IndexEntry[], opts: PlanOptions): SyncPlan {
  const live = new Map<number, IndexEntry>();
  for (const entry of entries) {
    const dbId = parseInt(entry.db_id, 10);
    if (!isNaN(dbId)) live.set(dbId, entry);
  }

  const localIds = getAllDbIds(db);
  const stored = getIndexComparableRows(db);
  const alreadyDelisted = new Set(getDelistedIds(db));

  const newIds: number[] = [];
  const indexChangedIds: number[] = [];
  for (const [dbId, entry] of live) {
    const local = stored.get(dbId);
    if (local === undefined) {
      newIds.push(dbId);
      continue;
    }
    const statusMoved =
      normalizeIndexValue(entry.status) !== normalizeIndexValue(local.status);
    const dateMoved =
      normalizeIndexValue(entry.ResolutionDate) !== normalizeIndexValue(local.resolutionDate);
    if (statusMoved || dateMoved) indexChangedIds.push(dbId);
  }
  newIds.sort((a, b) => a - b);
  indexChangedIds.sort((a, b) => a - b);

  const delistedIds = [...localIds].filter((id) => !live.has(id) && !alreadyDelisted.has(id));
  delistedIds.sort((a, b) => a - b);
  const reappearedIds = [...alreadyDelisted].filter((id) => live.has(id)).sort((a, b) => a - b);

  const unresolvedIds = opts.indexDiffOnly === true ? [] : getUnresolvedIds(db);
  const resolvedBlankIds =
    opts.indexDiffOnly === true ? [] : getResolvedWithoutResolutionIds(db);
  const trailingIds =
    opts.indexDiffOnly === true ? [] : getTrailingIds(db, opts.refreshWindow);

  // Delisted rows are not worth fetching — the page is gone.
  const skip = new Set(delistedIds);
  const newSet = new Set(newIds);

  const refreshSet = new Set<number>();
  for (const id of [...indexChangedIds, ...unresolvedIds, ...resolvedBlankIds, ...trailingIds]) {
    if (skip.has(id) || newSet.has(id)) continue;
    refreshSet.add(id);
  }

  const queue: Array<{ dbId: number; pass: ItemPass }> = [
    ...newIds.map((dbId) => ({ dbId, pass: 'new' as const })),
    ...[...refreshSet].sort((a, b) => a - b).map((dbId) => ({ dbId, pass: 'refresh' as const })),
  ];

  const indexMaxDbId = [...live.keys()].reduce((max, id) => Math.max(max, id), 0);

  return {
    newIds,
    indexChangedIds,
    unresolvedIds,
    resolvedBlankIds,
    trailingIds,
    delistedIds,
    reappearedIds,
    queue,
    indexCount: live.size,
    indexMaxDbId,
    highWaterBefore: 0, // filled in by the caller, which owns sync_state
  };
}

export function materializePlan(db: Database, runId: number, plan: SyncPlan): void {
  enqueueItems(db, runId, plan.queue);
}

/** Values DEG's Make cell uses to mean "not recorded". */
const MAKE_PLACEHOLDERS = new Set(['', 'na', 'n/a', 'none', 'unknown', 'other', 'tbd']);

/** Longest genuine multi-word make we carry is 'Mercedes Benz' (13 chars). */
const MAX_PLAUSIBLE_MAKE_LENGTH = 20;

/**
 * Whether a page-supplied make is too unreliable to overwrite what we hold.
 *
 * DEG's Make cell is free text and, on inquiries the index classifies as
 * "Other", it is frequently junk. Measured against run 1: db_id 37429's page
 * gave make='2020 Rang Rover Ecoque P250' — the entire vehicle string with two
 * typos — and 36435's gave 'NA', both overwriting a cleaner stored value.
 *
 * A 4-digit token means the whole vehicle string leaked into the field; an
 * over-long value means the same thing less obviously.
 */
export function isImplausibleMake(make: string | null): boolean {
  if (make === null) return true;
  const trimmed = make.trim();
  if (MAKE_PLACEHOLDERS.has(trimmed.toLowerCase())) return true;
  if (/\b\d{4}\b/.test(trimmed)) return true;
  if (trimmed.length > MAX_PLAUSIBLE_MAKE_LENGTH) return true;
  return false;
}

/**
 * Fill nulls in a fresh parse from what we already hold.
 *
 * A refresh should adopt every value the page now asserts, but a field the
 * parser could not find is not evidence that DEG deleted it — far likelier a
 * markup variation. Merging here (rather than via COALESCE in the UPDATE) means
 * the value we hash is exactly the value we store.
 */
export function mergeParsedBody(
  storedRow: Record<string, unknown> | null,
  parsed: ParsedBody,
): ParsedBody {
  if (storedRow === null) return parsed;
  const str = (key: string): string | null => {
    const value = storedRow[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  const num = (key: string): number | null => {
    const value = storedRow[key];
    return typeof value === 'number' ? value : null;
  };
  return {
    inquiryType: parsed.inquiryType ?? str('inquiry_type'),
    areaOfVehicle: parsed.areaOfVehicle ?? str('area_of_vehicle'),
    oemPartNumber: parsed.oemPartNumber ?? str('oem_part_number'),
    issueSummary: parsed.issueSummary ?? str('issue_summary'),
    suggestedAction: parsed.suggestedAction ?? str('suggested_action'),
    // parseDetailHtml never returns null here — it substitutes
    // 'Awaiting resolution' — so the page always wins on resolution.
    resolution: parsed.resolution,
    resolutionStatus: parsed.resolutionStatus,
    year: parsed.year ?? num('year'),
    // Unlike the other fields, a non-null page value does not automatically
    // win here — see isImplausibleMake.
    make: isImplausibleMake(parsed.make) ? str('make') : parsed.make,
    model: parsed.model ?? str('model'),
    vehicleBody: parsed.vehicleBody ?? str('body'),
    submittedDatetime: parsed.submittedDatetime ?? str('submitted_datetime'),
  };
}

/**
 * Guard against overwrite semantics erasing a good row.
 *
 * A page that parses to nothing — no inquiry type, no area, no summary, no
 * suggested action, no resolution — against a row that already has content is
 * far more likely a markup change or a truncated response than a genuine
 * upstream deletion. Skip it and surface it in the report rather than writing.
 *
 * This must be handed the RAW parse, never the merged one. mergeParsedBody
 * repairs exactly the emptiness we are trying to detect, so judging the merged
 * body would silently reclassify a markup regression as "unchanged".
 */
export function isSuspectParse(
  storedRow: Record<string, unknown> | null,
  parsed: ParsedBody,
): boolean {
  if (storedRow === null) return false;

  const parsedEmpty =
    !parsed.inquiryType &&
    !parsed.areaOfVehicle &&
    !parsed.issueSummary &&
    !parsed.suggestedAction &&
    (!parsed.resolution || parsed.resolution === 'Awaiting resolution');
  if (!parsedEmpty) return false;

  const hadContent = Boolean(
    storedRow['inquiry_type'] ?? storedRow['issue_summary'] ?? storedRow['suggested_action'],
  );
  return hadContent;
}

/** The content fields a merged parse would produce, keeping index fields as stored. */
function fieldsAfterMerge(
  storedRow: Record<string, unknown> | null,
  merged: ParsedBody,
): ContentFields {
  return {
    // status and resolution_date come from the tier-1 index, not the detail
    // page, and have already been upserted by the time we get here.
    status: (storedRow?.['status'] as string | null | undefined) ?? null,
    resolution_date: (storedRow?.['resolution_date'] as string | null | undefined) ?? null,
    inquiry_type: merged.inquiryType,
    area_of_vehicle: merged.areaOfVehicle,
    oem_part_number: merged.oemPartNumber,
    issue_summary: merged.issueSummary,
    suggested_action: merged.suggestedAction,
    resolution: merged.resolution,
    year: merged.year,
    make: merged.make,
    model: merged.model,
    body: merged.vehicleBody,
    submitted_datetime: merged.submittedDatetime,
  };
}

export interface BatchOptions {
  limit: number;
  rateDelayMs?: number;
  /** Consecutive transient failures that abort the batch. */
  circuitBreakerThreshold?: number;
  fetchOpts?: FetchDetailOpts;
  onItem?: (event: {
    dbId: number;
    pass: ItemPass;
    outcome: 'written' | 'unchanged' | 'skipped' | 'transient';
    changedFields?: HashedField[];
    reason?: string;
    index: number;
    total: number;
  }) => void;
}

export interface BatchResult {
  processed: number;
  written: number;
  unchanged: number;
  skipped: number;
  transient: number;
  suspect: number[];
  breakerTripped: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drain up to `limit` queued items. Every item commits its row write and its
 * queue state in a single transaction, so a hard kill loses at most the one
 * request in flight.
 */
export async function runBatch(
  db: Database,
  runId: number,
  opts: BatchOptions,
): Promise<BatchResult> {
  const items = getQueuedItems(db, runId, opts.limit);
  const rateDelayMs = opts.rateDelayMs ?? RATE_DELAY_MS;
  const threshold = opts.circuitBreakerThreshold ?? 10;

  const result: BatchResult = {
    processed: 0,
    written: 0,
    unchanged: 0,
    skipped: 0,
    transient: 0,
    suspect: [],
    breakerTripped: false,
  };

  let consecutiveTransient = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items.at(i);
    if (item === undefined) continue;

    if (i > 0) await sleep(rateDelayMs);

    const fetched = await fetchDetail(item.dbId, opts.fetchOpts);
    result.processed++;

    if (!fetched.ok || !fetched.parsed) {
      if (isTransientStatus(fetched.status)) {
        // Stays 'queued' — the next run retries it. Matches the tier-2
        // convention from commit e8d0bd0.
        db.run(
          `UPDATE sync_item SET attempts = attempts + 1, http_status = ?, reason = ?, updated_at = ?
           WHERE run_id = ? AND db_id = ?`,
          [
            fetched.status,
            fetched.reason ?? 'transient',
            new Date().toISOString(),
            runId,
            item.dbId,
          ],
        );
        result.transient++;
        consecutiveTransient++;
        opts.onItem?.({
          dbId: item.dbId,
          pass: item.pass,
          outcome: 'transient',
          reason: fetched.reason ?? '',
          index: i + 1,
          total: items.length,
        });
        if (consecutiveTransient >= threshold) {
          result.breakerTripped = true;
          break;
        }
        continue;
      }

      // 404, soft-404, parse error — definitive, never retry.
      recordItemOutcome(db, runId, item.dbId, {
        state: 'skipped',
        httpStatus: fetched.status,
        reason: fetched.reason ?? 'unknown',
      });
      result.skipped++;
      consecutiveTransient = 0;
      opts.onItem?.({
        dbId: item.dbId,
        pass: item.pass,
        outcome: 'skipped',
        reason: fetched.reason ?? '',
        index: i + 1,
        total: items.length,
      });
      continue;
    }

    consecutiveTransient = 0;

    const storedRow = getRow(db, item.dbId);

    // Judged on the raw parse, before mergeParsedBody papers over the gap.
    if (isSuspectParse(storedRow, fetched.parsed)) {
      recordItemOutcome(db, runId, item.dbId, {
        state: 'skipped',
        httpStatus: fetched.status,
        reason: 'suspect parse: page yielded no content against a populated row',
      });
      result.skipped++;
      result.suspect.push(item.dbId);
      opts.onItem?.({
        dbId: item.dbId,
        pass: item.pass,
        outcome: 'skipped',
        reason: 'suspect parse',
        index: i + 1,
        total: items.length,
      });
      continue;
    }

    const merged = mergeParsedBody(storedRow, fetched.parsed);
    const afterFields = fieldsAfterMerge(storedRow, merged);
    const afterHash = contentHash(afterFields);
    const storedHash =
      typeof storedRow?.['content_hash'] === 'string'
        ? (storedRow['content_hash'] as string)
        : null;

    if (storedHash !== null && storedHash === afterHash) {
      recordItemOutcome(db, runId, item.dbId, {
        state: 'unchanged',
        httpStatus: fetched.status,
        changed: false,
      });
      result.unchanged++;
      opts.onItem?.({
        dbId: item.dbId,
        pass: item.pass,
        outcome: 'unchanged',
        index: i + 1,
        total: items.length,
      });
      continue;
    }

    // Either the hash moved, or this row predates hashing (the whole existing
    // corpus does). Either way, classify honestly with a field-level diff
    // rather than assuming a change — that is what keeps the first run from
    // reporting 22k false positives.
    const beforeFields =
      storedRow === null ? null : contentFieldsFromRow(storedRow);
    const changedFields =
      beforeFields === null ? null : diffFields(beforeFields, afterFields);

    const commit = db.transaction(() => {
      if (changedFields !== null && changedFields.length === 0) {
        // Content identical, hash simply absent. Seed it; touch nothing else.
        setContentHash(db, item.dbId, afterHash);
        recordItemOutcome(db, runId, item.dbId, {
          state: 'unchanged',
          httpStatus: fetched.status,
          changed: false,
        });
        return 'unchanged' as const;
      }
      writeRefreshedBody(db, item.dbId, merged, afterHash);
      recordItemOutcome(db, runId, item.dbId, {
        state: 'written',
        httpStatus: fetched.status,
        changed: true,
        changedFields: changedFields ?? undefined,
      });
      return 'written' as const;
    });

    const outcome = commit();
    if (outcome === 'unchanged') result.unchanged++;
    else result.written++;

    opts.onItem?.({
      dbId: item.dbId,
      pass: item.pass,
      outcome,
      changedFields: changedFields ?? undefined,
      index: i + 1,
      total: items.length,
    });
  }

  return result;
}
