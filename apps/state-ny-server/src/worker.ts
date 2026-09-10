/**
 * Cloudflare Worker entry — the remote New York state law MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  build identity + corpus meta (no upstream — pure corpus)
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Same stateless design as the other servers: every request builds its own
 * server, transport, and adapter, then throws them away. The one
 * module-level value is the corpus — statute and NYCRR sections plus the
 * annotation layer, parsed and validated once per isolate, including the
 * substring guarantee on every quote-safe excerpt.
 *
 * Six tools per server: four ny_* tools and the search/fetch pair for
 * ChatGPT's connector contract.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer, recordMcpUsage } from '@repairmcp/core';
import {
  NyAdapter,
  NyCorpus,
  registerNyConnectorTools,
  registerNyTools,
  type NyItem,
} from '@repairmcp/state-ny';
import corpusJson from '@repairmcp/state-ny/data/ny-law-corpus.json';
import annotationsJson from '@repairmcp/state-ny/data/ny-annotations.json';

export interface Env {
  /** The running deployment's own id, supplied by Cloudflare. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  /**
   * Tool-usage telemetry (Analytics Engine). Optional so a local `wrangler dev`
   * without the binding degrades to a no-op instead of a crash.
   */
  USAGE?: AnalyticsEngineDataset;
}

// Display-cased on purpose: Gemini shows this string verbatim as the app's
// name in Custom apps for Spark. The wrangler.jsonc Worker name stays kebab.
const SERVER_NAME = 'RepairMCP New York Law';
const SERVER_VERSION = '0.1.0';

// Validated once per isolate. A malformed corpus, an orphaned annotation key,
// or a non-substring excerpt fails the first request loudly instead of
// serving wrong law text quietly.
const corpus = new NyCorpus(corpusJson, annotationsJson);

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
  const adapter = new NyAdapter(corpus);
  const server = new RepairMCPServer<NyItem>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerNyTools(server, corpus);
  registerNyConnectorTools(server, adapter, corpus);

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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
            cr82Edition: (corpus.meta as { cr82Edition?: string }).cr82Edition ?? null,
            part142EffectiveDate:
              (corpus.meta as { part142EffectiveDate?: string }).part142EffectiveDate ?? null,
            captureSources: corpus.sections.reduce<Record<string, number>>((acc, s) => {
              acc[s.captureSource] = (acc[s.captureSource] ?? 0) + 1;
              return acc;
            }, {}),
            domains: corpus.domainBreakdown(),
          },
        });
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 503);
      }
    }

    if (url.pathname === '/mcp') {
      // Before the transport consumes the body — the clone is read inside
      // waitUntil, off the response path, and only tool/client names are
      // recorded, never arguments.
      recordMcpUsage({
        dataset: env.USAGE,
        vertical: 'ny',
        request,
        waitUntil: (p) => ctx.waitUntil(p),
      });
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
            `Source: New York state law for collision repair facilities — insurance\n` +
            `claims handling (no requiring, and no unrequested recommending, of a\n` +
            `particular repair shop, the unfair claim settlement practices catalog,\n` +
            `physical damage standard provisions, Regulation 64's acknowledgment,\n` +
            `inspection, good-faith negotiation, parts, labor, and total-loss\n` +
            `valuation rules, and DFS guidance on steering and total loss), the\n` +
            `Motor Vehicle Repair Shop Registration Act and 15 NYCRR Part 82 (written\n` +
            `estimates, authorization, parts return, quality repairs), the bailee's\n` +
            `lien on a motor vehicle and the sale to enforce it, deceptive practices\n` +
            `law, and employment rules, captured verbatim from the State Senate's\n` +
            `public site (nysenate.gov), the DMV and DOL booklets, the Legal\n` +
            `Information Institute's NYCRR mirror (Regulation 64 only, provenance\n` +
            `stated), and dfs.ny.gov.\n` +
            `Read-only. Not legal advice.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
