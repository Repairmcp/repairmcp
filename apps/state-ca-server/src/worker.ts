/**
 * Cloudflare Worker entry — the remote California state law MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  build identity + corpus meta (no upstream — pure corpus)
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Same stateless design as the other servers: every request builds its own
 * server, transport, and adapter, then throws them away. The one
 * module-level value is the corpus — statute, CCR, and Cal/OSHA sections
 * plus the annotation layer, parsed and validated once per isolate,
 * including the substring guarantee on every quote-safe excerpt.
 *
 * Six tools per server: four ca_* tools and the search/fetch pair for
 * ChatGPT's connector contract.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer, recordMcpUsage } from '@repairmcp/core';
import {
  CaAdapter,
  CaCorpus,
  registerCaConnectorTools,
  registerCaTools,
  type CaItem,
} from '@repairmcp/state-ca';
import corpusJson from '@repairmcp/state-ca/data/ca-law-corpus.json';
import annotationsJson from '@repairmcp/state-ca/data/ca-annotations.json';

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
const SERVER_NAME = 'RepairMCP California Law';
const SERVER_VERSION = '0.1.0';

// Validated once per isolate. A malformed corpus, an orphaned annotation key,
// or a non-substring excerpt fails the first request loudly instead of
// serving wrong law text quietly.
const corpus = new CaCorpus(corpusJson, annotationsJson);

/** How many sections came from each capture surface — the provenance /health states. */
function captureSourceBreakdown(): Record<string, number> {
  const counts: Record<string, number> = { leginfo: 0, dir: 0, lii: 0 };
  for (const section of corpus.sections) {
    counts[section.captureSource] = (counts[section.captureSource] ?? 0) + 1;
  }
  return counts;
}

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
  const adapter = new CaAdapter(corpus);
  const server = new RepairMCPServer<CaItem>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerCaTools(server, corpus);
  registerCaConnectorTools(server, adapter, corpus);

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
            // No edition or session pin: none of California's three capture
            // surfaces states a currency marker, so currency IS the capture
            // date. captureSources reports where the text came from.
            captureSources: captureSourceBreakdown(),
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
        vertical: 'ca',
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
            `Source: California state law for collision repair facilities — insurance\n` +
            `claims handling (anti-steering, the paint and materials cap, the Fair Claims\n` +
            `Settlement Practices Regulations, labor rate surveys, total loss), the\n` +
            `Automotive Repair Act and BAR regulations, the repair and storage lien,\n` +
            `Cal/OSHA orders, and employment rules, captured verbatim from the\n` +
            `Legislature (leginfo.legislature.ca.gov), the Department of Industrial\n` +
            `Relations (dir.ca.gov), and the LII mirror of the California Code of\n` +
            `Regulations (law.cornell.edu).\n` +
            `Read-only. Not legal advice.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
