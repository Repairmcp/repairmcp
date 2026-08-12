/**
 * The contract the DEG tools bind to.
 *
 * `packages/deg/src/tools.ts` used to name the concrete `DEGAdapter`, which
 * pinned the tools to the in-memory implementation — it loads the whole corpus
 * from a JSON file via `node:fs` and scores all 22,652 records per call. Neither
 * is possible inside a Cloudflare Worker, so the tools now depend on this
 * interface and both `DEGAdapter` (local, STDIO) and `D1DEGAdapter` (remote)
 * satisfy it.
 *
 * `findSupporting` is async here even though the in-memory implementation has no
 * reason to be: the D1 implementation must await a query, and a port that forces
 * every consumer to handle both shapes is worse than one that always awaits.
 */
import type { CorpusFreshness, SourceAdapter } from '@repairmcp/core';
import type { DEGInquiry } from './schema.js';
import type { ScoringBreakdown } from './scoring.js';

export interface FindSupportingOpts {
  /** Natural shop-floor description of the operation in question. */
  lineItemText: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  limit?: number;
  /** Reference time for the recency boost. Defaults to `new Date()`. */
  now?: Date;
}

export interface FindSupportingHit {
  inquiry: DEGInquiry;
  score: number;
  breakdown: ScoringBreakdown;
  snippet: string | undefined;
}

/**
 * A DEG-shaped source: the four standard adapter methods plus the killer
 * scoring behind `deg_find_supporting`.
 */
export interface DegSource extends SourceAdapter<DEGInquiry> {
  findSupporting(opts: FindSupportingOpts): Promise<FindSupportingHit[]>;

  /**
   * What this source can honestly claim about its own currency, or null when it
   * cannot tell.
   *
   * Async for the same reason `findSupporting` is: D1 has to be asked. Nullable
   * because the remote adapter reads it from a table that a not-yet-migrated
   * database will not have, and the correct behaviour there is to say nothing
   * rather than to fail a tool call — a server that 500s on `/mcp` because a
   * metadata row is missing has traded a small silence for a total outage.
   */
  corpusMeta(): Promise<CorpusFreshness | null>;
}
