/**
 * The minimum of D1 this package actually uses.
 *
 * Deliberately a structural interface rather than `D1Database` from
 * `@cloudflare/workers-types` — the same call the ingestion package made with
 * `FetchLike` in `tier2.ts`, for the same two reasons: a vertical package has no
 * business depending on a platform's type surface, and a three-method interface
 * is trivial to satisfy from `bun:sqlite` in tests. The real `D1Database`
 * structurally satisfies this, so `new D1DEGAdapter(env.DB)` type-checks with no
 * cast at the call site.
 */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
}

/**
 * Optional read-through cache for query results.
 *
 * Injected rather than imported so `packages/deg` never sees the Workers Cache
 * API. `put` is fire-and-forget on purpose: a cache write must never be able to
 * delay or fail a tool call.
 */
export interface ResultCache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): void;
}
