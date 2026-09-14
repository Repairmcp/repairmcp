/**
 * Cloudflare Worker entry — the remote Pennsylvania state law MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  build identity + corpus meta (no upstream — pure corpus)
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Same stateless design as the other servers: every request builds its own
 * server, transport, and adapter, then throws them away. The one
 * module-level value is the corpus — statute and Pennsylvania Code sections
 * plus the annotation layer, parsed and validated once per isolate,
 * including the substring guarantee on every quote-safe excerpt.
 *
 * Six tools per server: four pa_* tools and the search/fetch pair for
 * ChatGPT's connector contract.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer, recordMcpUsage } from '@repairmcp/core';
import {
  PaAdapter,
  PaCorpus,
  registerPaConnectorTools,
  registerPaTools,
  type PaItem,
} from '@repairmcp/state-pa';
import corpusJson from '@repairmcp/state-pa/data/pa-law-corpus.json';
import annotationsJson from '@repairmcp/state-pa/data/pa-annotations.json';

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
const SERVER_NAME = 'RepairMCP Pennsylvania Law';
const SERVER_VERSION = '0.1.0';

// Validated once per isolate. A malformed corpus, an orphaned annotation key,
// or a non-substring excerpt fails the first request loudly instead of
// serving wrong law text quietly.
const corpus = new PaCorpus(corpusJson, annotationsJson);

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
  const adapter = new PaAdapter(corpus);
  const server = new RepairMCPServer<PaItem>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerPaTools(server, corpus);
  registerPaConnectorTools(server, adapter, corpus);

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
            paCodeEffectiveThrough:
              (corpus.meta as { paCodeEffectiveThrough?: string }).paCodeEffectiveThrough ?? null,
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
        vertical: 'pa',
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
            `Source: Pennsylvania state law for collision repair facilities — insurance\n` +
            `claims handling (the appraiser may not name or require a repair shop, must\n` +
            `inspect within six working days, must disclose aftermarket crash parts, and\n` +
            `applies the total loss formula; claim acknowledgment, investigation, and\n` +
            `decision deadlines; the automobile settlement standards; the Unfair\n` +
            `Insurance Practices Act; bad faith under 42 Pa.C.S. 8371; salvage\n` +
            `certificates), the Attorney General's automotive trade practices (written\n` +
            `authorization, parts return, storage-charge posting, the itemized invoice),\n` +
            `the abandoned-vehicle chapter, and employment rules, captured verbatim from\n` +
            `the General Assembly's static mirror (legis.state.pa.us) and the Pennsylvania\n` +
            `Code (pacodeandbulletin.gov).\n` +
            `Read-only. Not legal advice.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
