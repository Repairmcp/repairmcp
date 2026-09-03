/**
 * Cloudflare Worker entry — the remote NHTSA MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  build identity + one live NHTSA probe + law corpus meta
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Same stateless design as deg-server: every request builds its own server,
 * transport, client, and adapter, then throws them away. The one module-level
 * value is the law corpus — 47 statute sections parsed and validated once per
 * isolate, since the JSON never changes between deploys.
 *
 * Nine tools per server: five live nhtsa_* tools, two law tools, and the
 * search/fetch pair for ChatGPT's connector contract.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer } from '@repairmcp/core';
import {
  LawCorpus,
  NhtsaClient,
  NhtsaLiveAdapter,
  campaignUrl,
  registerNhtsaConnectorTools,
  registerNhtsaTools,
  type NhtsaItem,
} from '@repairmcp/nhtsa';
import lawCorpusJson from '@repairmcp/nhtsa/data/uscode-title49-ch301.json';
import { createCachingFetch } from './cache.js';

export interface Env {
  /** Set to any non-empty value to bypass the upstream response cache entirely. */
  CACHE_DISABLED?: string;
  /** The running deployment's own id, supplied by Cloudflare. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
}

// Display-cased on purpose: Gemini shows this string verbatim as the app's
// name in Custom apps for Spark. The wrangler.jsonc Worker name stays kebab.
const SERVER_NAME = 'RepairMCP NHTSA';
const SERVER_VERSION = '0.1.0';

/** Upstream timeout. Wall-clock waits don't count against Worker CPU limits. */
const NHTSA_TIMEOUT_MS = 10_000;

/** /health probes with a tighter budget — it answers "is NHTSA up", not "fetch data". */
const HEALTH_PROBE_TIMEOUT_MS = 5_000;

/** A recall known to exist since 2021; the cheapest single-record NHTSA read. */
const HEALTH_PROBE_CAMPAIGN = '21V978000';

// Validated once per isolate. A malformed corpus fails the first request
// loudly instead of serving wrong law text quietly.
const lawCorpus = new LawCorpus(lawCorpusJson);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function json(body: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function makeClient(env: Env, ctx: ExecutionContext): NhtsaClient {
  return new NhtsaClient({
    timeoutMs: NHTSA_TIMEOUT_MS,
    ...(env.CACHE_DISABLED
      ? {}
      : { fetchImpl: createCachingFetch(ctx, SERVER_VERSION) }),
  });
}

async function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const client = makeClient(env, ctx);
  const adapter = new NhtsaLiveAdapter(client, lawCorpus);
  const server = new RepairMCPServer<NhtsaItem>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Seven nhtsa_* tools plus the two connector tools. All registration is
  // synchronous — the live tools have no cutoff to read, and the law corpus
  // freshness comes from the module-level corpus.
  registerNhtsaTools(server, client, lawCorpus);
  registerNhtsaConnectorTools(server, adapter);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  // No teardown, deliberately — same empty-200 gotcha as deg-server:
  // handleRequest resolves when the response *stream* exists, and closing the
  // server here tears the transport down before the payload is written.
  return withCors(await transport.handleRequest(request));
}

/**
 * One uncached single-record read against NHTSA. `ok` on the health payload
 * reflects the Worker; `upstream.ok` reflects NHTSA. They are different facts
 * and a wire check needs both — a healthy Worker in front of a down NHTSA
 * serves law tools fine and `unavailable` payloads for the rest.
 */
async function probeUpstream(): Promise<{
  ok: boolean;
  status: number | null;
  latencyMs: number;
}> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(campaignUrl(HEALTH_PROBE_CAMPAIGN), {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { ok: false, status: null, latencyMs: Date.now() - started };
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      try {
        const upstream = await probeUpstream();
        const freshness = lawCorpus.freshness();
        return json({
          ok: true,
          server: SERVER_NAME,
          version: SERVER_VERSION,
          deployment: env.CF_VERSION_METADATA?.id ?? null,
          deployedAt: env.CF_VERSION_METADATA?.timestamp ?? null,
          // Live data has no corpus cutoff — currency is per-request. The one
          // corpus this server carries states its own.
          upstream,
          lawCorpus: {
            sections: freshness.recordCount,
            currentThrough: freshness.currentThrough,
            publicLaw: lawCorpus.meta.publicLaw,
            capturedAt: freshness.syncedAt,
          },
        });
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 503);
      }
    }

    if (url.pathname === '/mcp') {
      try {
        return await handleMcp(request, env, _ctx);
      } catch (err) {
        console.error('mcp handler failed', err);
        return json(
          {
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          },
          500,
        );
      }
    }

    if (url.pathname === '/') {
      return withCors(
        new Response(
          `${SERVER_NAME} ${SERVER_VERSION}\n\n` +
            `MCP endpoint: ${url.origin}/mcp (Streamable HTTP, no authentication)\n` +
            `Health:       ${url.origin}/health\n\n` +
            `Sources: NHTSA recalls and complaints (live, api.nhtsa.gov), NHTSA vPIC VIN\n` +
            `decoding (live, vpic.nhtsa.dot.gov), and 49 U.S.C. chapter 301 (captured from\n` +
            `uscode.house.gov). Read-only.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
