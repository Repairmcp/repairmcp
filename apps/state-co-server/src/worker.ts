/**
 * Cloudflare Worker entry — the remote Colorado state law MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  build identity + corpus meta (no upstream — pure corpus)
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Same stateless design as the other servers: every request builds its own
 * server, transport, and adapter, then throws them away. The one
 * module-level value is the corpus — CRS and CCR sections plus the
 * annotation layer, parsed and validated once per isolate, including the
 * substring guarantee on every quote-safe excerpt.
 *
 * Six tools per server: four co_* tools and the search/fetch pair for
 * ChatGPT's connector contract.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer } from '@repairmcp/core';
import {
  CoAdapter,
  CoCorpus,
  registerCoConnectorTools,
  registerCoTools,
  type CoItem,
} from '@repairmcp/state-co';
import corpusJson from '@repairmcp/state-co/data/co-law-corpus.json';
import annotationsJson from '@repairmcp/state-co/data/co-annotations.json';

export interface Env {
  /** The running deployment's own id, supplied by Cloudflare. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
}

const SERVER_NAME = 'repairmcp-state-co';
const SERVER_VERSION = '0.1.0';

// Validated once per isolate. A malformed corpus, an orphaned annotation key,
// or a non-substring excerpt fails the first request loudly instead of
// serving wrong law text quietly.
const corpus = new CoCorpus(corpusJson, annotationsJson);

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

async function handleMcp(request: Request): Promise<Response> {
  const adapter = new CoAdapter(corpus);
  const server = new RepairMCPServer<CoItem>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerCoTools(server, corpus);
  registerCoConnectorTools(server, adapter, corpus);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  // No teardown, deliberately — same empty-200 gotcha as the other servers:
  // handleRequest resolves when the response *stream* exists, and closing the
  // server here tears the transport down before the payload is written.
  return withCors(await transport.handleRequest(request));
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health') {
      try {
        const freshness = corpus.freshness();
        return json({
          ok: true,
          server: SERVER_NAME,
          version: SERVER_VERSION,
          deployment: env.CF_VERSION_METADATA?.id ?? null,
          deployedAt: env.CF_VERSION_METADATA?.timestamp ?? null,
          corpus: {
            sections: freshness.recordCount,
            currentThrough: freshness.currentThrough,
            capturedAt: freshness.syncedAt,
            crsEdition: (corpus.meta as { crsEdition?: string }).crsEdition ?? null,
            domains: corpus.domainBreakdown(),
          },
        });
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 503);
      }
    }

    if (url.pathname === '/mcp') {
      try {
        return await handleMcp(request);
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
            `Source: Colorado state law for collision repair facilities — insurance claims\n` +
            `handling, the Motor Vehicle Repair Act, DOI regulations and Bulletin B-5.04,\n` +
            `towing rules, and employment rules, captured verbatim from the CRS\n` +
            `(leg.colorado.gov / olls.info) and the Code of Colorado Regulations\n` +
            `(coloradosos.gov).\n` +
            `Read-only. Not legal advice.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
