/**
 * A caching fetch for the NHTSA upstream, on the Workers Cache API.
 *
 * Different shape from deg-server's result cache, on purpose: DEG caches D1
 * rows because its upstream is a database; here the upstream is NHTSA's own
 * GET endpoints, so the natural cache unit is the upstream HTTP response.
 * `caches.default` cannot cache cross-origin GETs implicitly from a Worker,
 * so responses are re-keyed under a synthetic .internal URL, same trick as
 * deg-server.
 *
 * Two exemptions, both privacy:
 *   - the vPIC host (VIN decodes) is never cached — a VIN must never become a
 *     cache key, hashed or otherwise
 *   - any URL containing a 17-character VIN-like token is skipped as a
 *     belt-and-suspenders backstop, whatever host it is on
 *
 * Only `res.ok` responses are stored. A cached 503 would keep reporting an
 * outage after NHTSA recovered, and the failure-honesty convention makes
 * outages visible enough without extending them.
 *
 * TTL 6 hours: NHTSA's ODI pipeline refreshes roughly daily, so anything
 * under 24h is equivalent for correctness; the cache exists to absorb bursts
 * of identical lookups, and per-colo `caches.default` is thin anyway (see the
 * DEG backlog measurement).
 */
import { VPIC_API_BASE, VIN_LIKE_PATTERN } from '@repairmcp/nhtsa';

const CACHE_TTL_SECONDS = 21_600;
const CACHE_ORIGIN = 'https://nhtsa-cache.repairmcp.internal';

async function cacheUrl(namespace: string, upstreamUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(upstreamUrl),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${CACHE_ORIGIN}/${encodeURIComponent(namespace)}/${hex}`;
}

function cacheable(url: string): boolean {
  if (url.startsWith(VPIC_API_BASE)) return false;
  // Fresh regex per call: VIN_LIKE_PATTERN is /g and stateful across .test().
  return !new RegExp(VIN_LIKE_PATTERN.source, 'i').test(url);
}

/**
 * Wrap `fetch` for injection into NhtsaClient. GETs to cacheable NHTSA URLs
 * are served from `caches.default` when present; successful responses are
 * stored via waitUntil so the reply never waits on the write. Cache failures
 * fall through to a live fetch — a cache is an optimization, never a failure
 * source.
 */
export function createCachingFetch(ctx: ExecutionContext, namespace: string): typeof fetch {
  const cachingFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

    if (method.toUpperCase() !== 'GET' || !cacheable(url)) {
      return fetch(input as RequestInfo, init);
    }

    const cache = caches.default;
    let key: Request | undefined;
    try {
      key = new Request(await cacheUrl(namespace, url));
      const hit = await cache.match(key);
      if (hit) return hit;
    } catch {
      key = undefined;
    }

    const res = await fetch(input as RequestInfo, init);

    if (res.ok && key) {
      const forCache = res.clone();
      const cacheKey = key;
      ctx.waitUntil(
        (async () => {
          try {
            const body = await forCache.arrayBuffer();
            await cache.put(
              cacheKey,
              new Response(body, {
                headers: {
                  'content-type': forCache.headers.get('content-type') ?? 'application/json',
                  'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
                },
              }),
            );
          } catch {
            // Deliberately silent — see module comment.
          }
        })(),
      );
    }

    return res;
  };

  return cachingFetch as typeof fetch;
}
