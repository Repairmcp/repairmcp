import type { Database } from 'bun:sqlite';
import { markBodyFetched } from './db.js';
import type { ParsedBody } from './db.js';
import { parseDetailHtml } from './parser.js';
import type { ProgressTracker } from './progress.js';

const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.org)';
const RATE_DELAY_MS = 2000;

export interface FetchDetailOpts {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchDetailResult {
  ok: boolean;
  status: number;
  parsed?: ParsedBody;
  reason?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchDetail(
  dbId: number,
  opts: FetchDetailOpts = {},
): Promise<FetchDetailResult> {
  const url = `https://degweb.org/inquiries/${dbId}/`;
  const maxRetries = opts.maxRetries ?? 5;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let backoffMs = opts.initialBackoffMs ?? 10_000;
  const maxBackoffMs = opts.maxBackoffMs ?? 5 * 60 * 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          ok: false,
          status: 0,
          reason: `network error: ${(err as Error).message}`,
        };
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      continue;
    }

    if (res.status === 404) {
      return { ok: false, status: 404, reason: 'not found' };
    }

    const expectedPath = `/inquiries/${dbId}/`;
    if (!res.url.includes(expectedPath)) {
      return {
        ok: false,
        status: res.status,
        reason: `soft-404: redirected to ${res.url}`,
      };
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) {
        return {
          ok: false,
          status: res.status,
          reason: `gave up after ${maxRetries} retries on status ${res.status}`,
        };
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      continue;
    }

    if (!res.ok) {
      return { ok: false, status: res.status, reason: 'unexpected status' };
    }

    const html = await res.text();
    try {
      const parsed = parseDetailHtml(dbId, html);
      return { ok: true, status: res.status, parsed };
    } catch (err) {
      return {
        ok: false,
        status: res.status,
        reason: `parse error: ${(err as Error).message}`,
      };
    }
  }

  return { ok: false, status: 0, reason: 'unreachable retry loop' };
}

export async function runBackfill(
  db: Database,
  ids: number[],
  tracker: ProgressTracker,
): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    const dbId = ids.at(i);
    if (dbId === undefined) continue;

    if (i > 0) {
      await sleep(RATE_DELAY_MS);
    }

    const result = await fetchDetail(dbId);

    if (result.ok && result.parsed) {
      markBodyFetched(db, dbId, result.parsed);
      tracker.record('ok');
    } else {
      markBodyFetched(db, dbId, null);
      tracker.record('error', `id=${dbId} status=${result.status} ${result.reason ?? ''}`);
    }

    tracker.print(dbId);
  }
}
