/**
 * Cloudflare Worker entry — the remote Illinois state law MCP server.
 *
 * Routes:
 *   POST /mcp     MCP over Streamable HTTP, stateless
 *   GET  /health  build identity + corpus meta (no upstream — pure corpus)
 *   GET  /        a plain-text pointer, so a human who lands here isn't lost
 *
 * Same stateless design as the other servers: every request builds its own
 * server, transport, and adapter, then throws them away. The one
 * module-level value is the corpus — Illinois Compiled Statutes and
 * Administrative Code sections plus the annotation layer, parsed and
 * validated once per isolate, including the substring guarantee on every
 * quote-safe excerpt.
 *
 * Six tools per server: four il_* tools and the search/fetch pair for
 * ChatGPT's connector contract.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { RepairMCPServer, recordMcpUsage } from '@repairmcp/core';
import {
  IlAdapter,
  IlCorpus,
  registerIlConnectorTools,
  registerIlTools,
  type IlItem,
} from '@repairmcp/state-il';
import corpusJson from '@repairmcp/state-il/data/il-law-corpus.json';
import annotationsJson from '@repairmcp/state-il/data/il-annotations.json';

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
const SERVER_NAME = 'RepairMCP Illinois Law';
const SERVER_VERSION = '0.1.0';

// Validated once per isolate. A malformed corpus, an orphaned annotation key,
// or a non-substring excerpt fails the first request loudly instead of
// serving wrong law text quietly.
const corpus = new IlCorpus(corpusJson, annotationsJson);

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
  const adapter = new IlAdapter(corpus);
  const server = new RepairMCPServer<IlItem>(adapter, {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerIlTools(server, corpus);
  registerIlConnectorTools(server, adapter, corpus);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  // No teardown, deliberately — same empty-200 gotcha as the other servers:
  // handleRequest resolves when the response *stream* exists, and closing the
  // server here tears the transport down before the payload is written.
  return withCors(await transport.handleRequest(request));
}

function count<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, v) => {
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});
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
        const meta = corpus.meta as { newestEffectiveDate?: string; dualPrinted?: unknown[] };
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
            newestEffectiveDate: meta.newestEffectiveDate ?? null,
            captureSources: count(corpus.sections.map((s) => s.captureSource)),
            headingSources: count(corpus.sections.map((s) => s.headingSource)),
            undated: corpus.sections.filter((s) => !s.effectiveDate).length,
            dualPrinted: meta.dualPrinted ?? [],
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
        vertical: 'il',
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
            `Source: Illinois state law for collision repair facilities — insurance claims\n` +
            `handling (a paint-and-materials cap is an improper claims practice; the insurer\n` +
            `names a shop that will repair for its estimate or promises reimbursement in\n` +
            `writing; no unreasonable travel to a recommended shop; notice before storage\n` +
            `payments stop; the $500 betterment cap; like-kind-and-quality crash parts; the\n` +
            `total loss methods and the 30-day right of recourse; Section 155 attorney fees;\n` +
            `aftermarket crash parts disclosure), the Automotive Collision Repair Act (the\n` +
            `estimate and authorization rules, the 10 percent rule, parts return, the invoice,\n` +
            `the sign, the lien barred for unauthorized work), the Labor and Storage Lien Acts\n` +
            `with the lienholder-notice rule, repairer licensing and salvage certificates,\n` +
            `employment rules, and the Chicago-area and Metro East refinishing rules,\n` +
            `captured verbatim from ilga.gov.\n` +
            `Read-only. Not legal advice.\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        ),
      );
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
