/**
 * `DegSource` backed by Cloudflare D1 with an FTS5 index.
 *
 * The in-memory `DEGAdapter` scores all 22,652 records against every query,
 * across 17.2 MB of text. That is affordable when the corpus is already
 * resident and impossible inside a Worker. This adapter reaches the same answers
 * by making FTS5 do bounded retrieval first:
 *
 *   - search / OpenAI search  → bm25 ranking, straight off the index
 *   - find_supporting         → bm25 retrieves a candidate pool, then the
 *                               existing `scoreInquiry` ranks it
 *
 * The second one is the whole reason the corpus moved to D1 rather than to a
 * hosted search product: the confidence number a shop quotes in a supplement is
 * still produced by the scorer that was tuned for it, with its per-component
 * breakdown intact.
 */
import type {
  Citation,
  CorpusFreshness,
  ListRecentOpts,
  RefreshResult,
  SearchQuery,
  SearchResult,
} from '@repairmcp/core';
import { DEG_IDENTITY, formatDegCitation } from '../identity.js';
import { parseFilters, type DEGFilters } from '../filters.js';
import type { DegSource, FindSupportingHit, FindSupportingOpts } from '../ports.js';
import type { DEGInquiry } from '../schema.js';
import {
  compareSupportingHits,
  scoreInquiry,
  snippetForQuery,
  type ScoreInquiryOpts,
} from '../scoring.js';
import { coverageScore, extractSnippet } from '../text-match.js';
import {
  BM25_RANK,
  SELECT_COLUMNS,
  SELECT_CORPUS_META,
  buildMatchExpression,
  rowToInquiry,
  rowsToCorpusMeta,
  type CorpusMetaRow,
  type InquiryRow,
} from './sql.js';
import type { D1Like, ResultCache } from './types.js';

/**
 * How many candidates `findSupporting` re-scores, per arm.
 *
 * The pool is drawn twice and deduplicated, because bm25 alone is not enough.
 * The final ranking is (score desc, effective date desc, id desc), and bm25
 * orders by neither of the first two — so a bm25-only pool systematically loses
 * on saturated queries, where thousands of records tie at the same score and
 * recency decides. Measured against the full 22,652-record corpus over 20 real
 * estimator queries, agreement with the in-memory adapter was:
 *
 *   bm25 200 only        top-5 13/20   top-1 17/20
 *   bm25 500 only        top-5 17/20   top-1 18/20
 *   bm25 1000 only       top-5 17/20   top-1 18/20   (more depth does not help)
 *   bm25 300 + recent 300  top-5 18/20   top-1 19/20
 *   bm25 500 + recent 500  top-5 19/20   top-1 20/20
 *
 * The second arm is what buys it: it targets the tie-break dimension directly.
 * Raising bm25 depth alone plateaus at 17/20, because the missing records are
 * not deep in the bm25 ranking — they are recent records bm25 ranks poorly and
 * the scorer ranks first.
 *
 * Cost is roughly 1,000 rows / ~1.2 MB off D1 per uncached call.
 */
const DEFAULT_CANDIDATE_POOL = 500;

/** `%`, `_` and `\` are LIKE wildcards; a make of "A_B" must not match "AxB". */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

interface WhereClause {
  sql: string;
  params: unknown[];
}

/** Compile the shared filter struct into SQL. Mirrors `inquiryMatchesFilters`. */
function filtersToWhere(filters: DEGFilters): WhereClause {
  const parts: string[] = [];
  const params: unknown[] = [];

  if (filters.vehicleYear !== undefined) {
    parts.push('i.vehicle_year = ?');
    params.push(filters.vehicleYear);
  }
  if (filters.vehicleMake) {
    parts.push("i.vehicle_make LIKE ? ESCAPE '\\'");
    params.push(likeContains(filters.vehicleMake));
  }
  if (filters.vehicleModel) {
    parts.push("i.vehicle_model LIKE ? ESCAPE '\\'");
    params.push(likeContains(filters.vehicleModel));
  }
  if (filters.ip !== undefined) {
    if (filters.ip === 'unknown') {
      parts.push('i.ip IS NULL');
    } else {
      parts.push('i.ip = ?');
      params.push(filters.ip);
    }
  }
  if (filters.status) {
    parts.push('i.status = ?');
    params.push(filters.status);
  }
  if (filters.inquiryType) {
    parts.push("i.inquiry_type LIKE ? ESCAPE '\\'");
    params.push(likeContains(filters.inquiryType));
  }

  return { sql: parts.length > 0 ? ` AND ${parts.join(' AND ')}` : '', params };
}

type RankedRow = InquiryRow & { rank: number };

export interface D1DEGAdapterOpts {
  /** Candidate pool size for `findSupporting`. Defaults to 200. */
  candidatePool?: number;
  /** Optional read-through result cache. Omit to disable caching entirely. */
  cache?: ResultCache;
}

export class D1DEGAdapter implements DegSource {
  readonly sourceId = DEG_IDENTITY.sourceId;
  readonly sourceName = DEG_IDENTITY.sourceName;
  readonly sourceShortName = DEG_IDENTITY.sourceShortName;
  readonly sourceUrl = DEG_IDENTITY.sourceUrl;
  readonly description = DEG_IDENTITY.description;
  readonly itemNoun = DEG_IDENTITY.itemNoun;
  readonly itemNounPlural = DEG_IDENTITY.itemNounPlural;

  private readonly candidatePool: number;
  private readonly cache: ResultCache | undefined;

  constructor(
    private readonly db: D1Like,
    opts: D1DEGAdapterOpts = {},
  ) {
    this.candidatePool = opts.candidatePool ?? DEFAULT_CANDIDATE_POOL;
    this.cache = opts.cache;
  }

  /**
   * Run a query, caching the raw rows.
   *
   * Rows are the right cache granularity because they are already pure JSON —
   * caching mapped `DEGInquiry` objects would silently turn every Date into a
   * string on the way back out.
   */
  private async rows<T>(cacheKey: string, sql: string, params: unknown[]): Promise<T[]> {
    if (this.cache) {
      const hit = await this.cache.get<T[]>(cacheKey);
      if (hit) return hit;
    }
    const { results } = await this.db
      .prepare(sql)
      .bind(...params)
      .all<T>();
    this.cache?.put(cacheKey, results);
    return results;
  }

  async search(query: SearchQuery): Promise<SearchResult<DEGInquiry>[]> {
    const filters = parseFilters(query.filters);
    const where = filtersToWhere(filters);
    const text = query.text?.trim() ?? '';
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    let rows: RankedRow[];

    if (text) {
      const match = buildMatchExpression(text);
      // No usable tokens (all stopwords, or punctuation only). An empty MATCH
      // is an FTS5 syntax error, and "match everything" would be a lie.
      if (match === null) return [];

      const sql =
        `SELECT ${SELECT_COLUMNS}, ${BM25_RANK} AS rank ` +
        `FROM inquiry_fts JOIN inquiry i ON i.db_id = inquiry_fts.rowid ` +
        `WHERE inquiry_fts MATCH ?${where.sql} ` +
        `ORDER BY rank ASC LIMIT ? OFFSET ?`;
      const params = [match, ...where.params, limit, offset];
      rows = await this.rows<RankedRow>(`search:${JSON.stringify(params)}`, sql, params);
    } else {
      // No query text — the in-memory adapter falls back to recency here.
      const sql =
        `SELECT ${SELECT_COLUMNS}, 0 AS rank FROM inquiry i ` +
        `WHERE 1=1${where.sql} ORDER BY i.submitted_at DESC LIMIT ? OFFSET ?`;
      const params = [...where.params, limit, offset];
      rows = await this.rows<RankedRow>(`browse:${JSON.stringify(params)}`, sql, params);
    }

    // Ordering is bm25's; the reported `score` is term coverage — the same
    // number, from the same function, the in-memory adapter reports. Those are
    // two different jobs and bm25 is only good at one of them: its magnitude
    // scales with query length and term rarity, so a nonsense query's top hit
    // scores about as high as a good query's. Coverage does not have that
    // failure mode, and it is what `score` has always meant on this tool.
    return rows.map((row) => {
      const item = rowToInquiry(row);
      const result: SearchResult<DEGInquiry> = {
        item,
        score: text ? coverageScore(item, text) : 1,
        citation: formatDegCitation(item),
      };
      const snippet = extractSnippet(item, text);
      if (snippet) result.snippet = snippet;
      return result;
    });
  }

  async getById(id: string): Promise<DEGInquiry | null> {
    // db_id is the rowid. A non-numeric id can never match one, and treating it
    // as not-found is the honest answer — `fetch("banana")` is a miss, not a 500.
    if (!/^[0-9]+$/.test(id)) return null;
    const sql = `SELECT ${SELECT_COLUMNS} FROM inquiry i WHERE i.db_id = ?`;
    const rows = await this.rows<InquiryRow>(`get:${id}`, sql, [Number(id)]);
    const row = rows[0];
    return row ? rowToInquiry(row) : null;
  }

  async listRecent(opts: ListRecentOpts): Promise<DEGInquiry[]> {
    const limit = opts.limit ?? 10;
    const where = filtersToWhere(parseFilters(opts.filters));
    const params: unknown[] = [...where.params];

    let sinceClause = '';
    if (opts.since) {
      sinceClause = ' AND i.submitted_at >= ?';
      params.push(opts.since.toISOString());
    }
    params.push(limit);

    // submitted_at is ISO 8601 UTC in a single fixed format, so lexicographic
    // ordering is chronological ordering — no date functions needed.
    const sql =
      `SELECT ${SELECT_COLUMNS} FROM inquiry i ` +
      `WHERE 1=1${where.sql}${sinceClause} ORDER BY i.submitted_at DESC LIMIT ?`;
    const rows = await this.rows<InquiryRow>(`recent:${JSON.stringify(params)}`, sql, params);
    return rows.map(rowToInquiry);
  }

  formatCitation(item: DEGInquiry): Citation {
    return formatDegCitation(item);
  }

  /** D1 is loaded by the import pipeline, not by the server. */
  async refresh(_opts?: { since?: Date }): Promise<RefreshResult> {
    return { scanned: 0, added: 0, updated: 0, errors: 0, durationMs: 0 };
  }

  /**
   * Two-stage: FTS5 bm25 retrieves a candidate pool, then `scoreInquiry` — the
   * same function the in-memory adapter runs over the whole corpus — ranks it.
   *
   * Vehicle arguments are boosts, not filters, exactly as in the in-memory
   * implementation. Filtering on them here would change what the tool means: a
   * strong precedent on a different vehicle should still surface, ranked lower.
   */
  async findSupporting(opts: FindSupportingOpts): Promise<FindSupportingHit[]> {
    const limit = opts.limit ?? 5;
    const match = buildMatchExpression(opts.lineItemText);
    if (match === null) return [];

    const paramsRel = [match, this.candidatePool];

    // Arm 1 — bm25's best. Finds records that match the query well.
    const byRelevance =
      `SELECT ${SELECT_COLUMNS}, ${BM25_RANK} AS rank ` +
      `FROM inquiry_fts JOIN inquiry i ON i.db_id = inquiry_fts.rowid ` +
      `WHERE inquiry_fts MATCH ? ORDER BY rank ASC LIMIT ?`;

    // Arm 2 — the newest matches as of `now`, ordered by exactly the date the
    // tie-break uses. Covers the case bm25 cannot: a query whose scores
    // saturate, where recency is what actually picks the winner.
    //
    // The `<= now` cutoff exists because the scorer gives no recency credit to
    // a record dated after `now`, so on a saturated query the winner is the
    // newest match AT OR BEFORE `now` — not the newest match outright. With a
    // live clock the two are the same thing (nothing is dated in the future),
    // but under a pinned `now` a growing corpus slides the plain newest-500
    // window forward until the real winner falls out of the pool. The parity
    // panel caught exactly that on 2026-08-27, when the corpus first grew 500
    // matching records past its fixed clock. Day granularity on the cutoff
    // keeps the result-cache key stable within a day; the corpus dates are
    // day-granular anyway.
    const nowIso = (opts.now ?? new Date()).toISOString().slice(0, 10);
    const paramsRec = [match, nowIso, this.candidatePool];
    const byRecency =
      `SELECT ${SELECT_COLUMNS}, 0 AS rank ` +
      `FROM inquiry_fts JOIN inquiry i ON i.db_id = inquiry_fts.rowid ` +
      `WHERE inquiry_fts MATCH ? AND date(COALESCE(i.resolved_at, i.submitted_at)) <= date(?) ` +
      `ORDER BY COALESCE(i.resolved_at, i.submitted_at) DESC LIMIT ?`;

    const [relevant, recent] = await Promise.all([
      this.rows<RankedRow>(`cand-rel:${JSON.stringify(paramsRel)}`, byRelevance, paramsRel),
      this.rows<RankedRow>(`cand-rec:${JSON.stringify(paramsRec)}`, byRecency, paramsRec),
    ]);

    const byId = new Map<number, RankedRow>();
    for (const row of relevant) byId.set(row.db_id, row);
    for (const row of recent) if (!byId.has(row.db_id)) byId.set(row.db_id, row);
    const rows = [...byId.values()];

    const scoreOpts: ScoreInquiryOpts = {};
    if (opts.vehicleYear !== undefined) scoreOpts.vehicleYear = opts.vehicleYear;
    if (opts.vehicleMake) scoreOpts.vehicleMake = opts.vehicleMake;
    if (opts.vehicleModel) scoreOpts.vehicleModel = opts.vehicleModel;
    if (opts.now) scoreOpts.now = opts.now;

    const scored = rows.map((row) => {
      const inquiry = rowToInquiry(row);
      const { score, breakdown } = scoreInquiry(opts.lineItemText, inquiry, scoreOpts);
      return {
        inquiry,
        score,
        breakdown,
        snippet: snippetForQuery(opts.lineItemText, inquiry),
      };
    });

    scored.sort(compareSupportingHits);

    return scored.slice(0, limit);
  }

  /**
   * Freshness, read from the `corpus_meta` table the import writes.
   *
   * Not computed with `SELECT MAX(...) FROM inquiry`, even though that would
   * always be true of the rows present: the sync date lives nowhere in the
   * columns — it is inside each row's JSON `metadata` blob — and scanning 22,652
   * of those per request to recover one date is the wrong trade. The value is
   * derived once, at import, by the same `deriveCorpusMeta` the local adapter
   * runs.
   *
   * Never throws. A database that has not had `0004`/`0005` applied yet answers
   * this query with an error, and the honest degradation there is silence: the
   * tools simply stop claiming a cutoff. Failing the call instead would take the
   * whole server down over a metadata row.
   */
  async corpusMeta(): Promise<CorpusFreshness | null> {
    try {
      const rows = await this.rows<CorpusMetaRow>('corpus-meta', SELECT_CORPUS_META, []);
      return rowsToCorpusMeta(rows);
    } catch {
      return null;
    }
  }

  /** Row count, for the Worker's /health endpoint. */
  async count(): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM inquiry')
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
}
