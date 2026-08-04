/**
 * Cloudflare Worker entry — the remote DEG MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  corpus size and build identity, for smoke checks
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Stateless is the whole design. Every request builds its own server, its own
 * transport, and its own adapter, then throws them away. There are no sessions
 * to affinitize, no Durable Objects, and no state that can drift between
 * isolates — which is what a read-only corpus should cost.
 *
 * The same six tools are served to every client. `search` and `fetch` exist for
 * ChatGPT's connector contract; the four `deg_*` tools carry the richer payload
 * (citations, scoring breakdowns) that clients able to use it should prefer.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer } from '@repairmcp/core';
import {
  D1DEGAdapter,
  registerDegConnectorTools,
  registerDegTools,
  type DEGInquiry,
} from '@repairmcp/deg/worker';
import { createWorkerCache } from './cache.js';

export interface Env {
  DB: D1Database;
  /**
   * Cache namespace. Bump on every corpus refresh — it is part of the cache key,
   * so changing it retires every entry at once.
   */
  CORPUS_VERSION?: string;
  /** Set to any non-empty value to bypass the result cache entirely. */
  CACHE_DISABLED?: string;
}

const SERVER_NAME = 'repairmcp-deg';
const SERVER_VERSION = '0.2.0';

/**
 * Permissive CORS, because the corpus is public and unauthenticated anyway —
 * there is no credential for a cross-origin page to steal. The exposed headers
 * are not optional: a browser-based client (the MCP Inspector, notably) cannot
 * read the protocol version or session id without them, and fails the handshake
 * in a way that looks like a server bug.
 */
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

function makeAdapter(env: Env, ctx: ExecutionContext): D1DEGAdapter {
  const useCache = !env.CACHE_DISABLED;
  return new D1DEGAdapter(env.DB, {
    ...(useCache
      ? { cache: createWorkerCache(ctx, env.CORPUS_VERSION ?? SERVER_VERSION) }
      : {}),
  });
}

async function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const adapter = makeAdapter(env, ctx);
  const server = new RepairMCPServer<DEGInquiry>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Four domain tools with shop-floor descriptions, plus the two OpenAI
  // connector tools. Names are distinct, so no `skip` is needed.
  registerDegTools(server, adapter);
  registerDegConnectorTools(server, adapter);

  // sessionIdGenerator: undefined selects stateless mode explicitly — no session
  // header is issued and none is validated.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  // No teardown here, deliberately. `handleRequest` resolves as soon as the
  // response stream exists — the JSON-RPC payload is written into it later, when
  // the server finishes handling the message. Closing the server at this point
  // (even through waitUntil) tears the transport down first and the client gets
  // a 200 with correct SSE headers and an empty body, which reads as a hung
  // server rather than an error. Everything here is per-request and collected
  // with the isolate; there is nothing to leak.
  return withCors(await transport.handleRequest(request));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      try {
        const records = await makeAdapter(env, ctx).count();
        return json({
          ok: records > 0,
          server: SERVER_NAME,
          version: SERVER_VERSION,
          corpusVersion: env.CORPUS_VERSION ?? null,
          records,
        });
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 503);
      }
    }

    if (url.pathname === '/mcp') {
      try {
        return await handleMcp(request, env, ctx);
      } catch (err) {
        // A throw here would surface to the client as a bare 500 with no body,
        // which is indistinguishable from the Worker being down.
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
            `Source: Database Enhancement Gateway (https://degweb.org), read-only.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
