/**
 * Tool-result cache on the Workers Cache API.
 *
 * Why results and not HTTP responses: `/mcp` is POST, which Cloudflare's edge
 * cache ignores outright, and a JSON-RPC response embeds the id of the request
 * that produced it. Replaying a whole cached response would hand a client
 * someone else's request id and break the correlation the protocol runs on. So
 * the cache sits one level down, on the rows a query returned, and the Worker
 * rebuilds the envelope around them every time.
 *
 * Rows are pure JSON — no Dates, no class instances — which is what makes them
 * safe to serialize and revive. See the `rows()` helper in the D1 adapter.
 */
import type { ResultCache } from '@repairmcp/deg/worker';

/**
 * One hour. The corpus changes at most nightly, so this is conservative; the
 * real invalidation lever is `namespace`, which changes on redeploy.
 */
const CACHE_TTL_SECONDS = 3600;

/**
 * The Cache API keys on a URL, so we synthesize one. The host is deliberately
 * a .internal name that resolves nowhere — nothing is ever fetched from it.
 */
const CACHE_ORIGIN = 'https://cache.repairmcp.internal';

async function cacheUrl(namespace: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${CACHE_ORIGIN}/${encodeURIComponent(namespace)}/${hex}`;
}

/**
 * A `ResultCache` backed by `caches.default`.
 *
 * `namespace` should change whenever the corpus does — it is part of the key,
 * so bumping it retires every entry at once. That is the entire cache
 * invalidation story, and it is deliberately the only one: a corpus refresh
 * already requires a redeploy, and one lever that always works beats a
 * purge path that is exercised twice a year.
 *
 * Every operation swallows its own errors. A cache is an optimization; a cache
 * that can fail a tool call is a liability.
 */
export function createWorkerCache(ctx: ExecutionContext, namespace: string): ResultCache {
  const cache = caches.default;

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const hit = await cache.match(new Request(await cacheUrl(namespace, key)));
        if (!hit) return null;
        return (await hit.json()) as T;
      } catch {
        return null;
      }
    },

    put(key: string, value: unknown): void {
      // Fire-and-forget through waitUntil: the response goes out without
      // waiting on the write, but the Worker stays alive long enough to finish it.
      ctx.waitUntil(
        (async () => {
          try {
            const res = new Response(JSON.stringify(value), {
              headers: {
                'content-type': 'application/json',
                'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
              },
            });
            await cache.put(new Request(await cacheUrl(namespace, key)), res);
          } catch {
            // Deliberately silent.
          }
        })(),
      );
    },
  };
}
