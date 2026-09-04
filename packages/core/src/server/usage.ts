/**
 * MCP usage telemetry over Cloudflare's Analytics Engine.
 *
 * Zone analytics can say a request hit /mcp; it cannot say which tool was
 * called or which AI client called it — every claude.ai request arrives from
 * Anthropic egress IPs with the same user agent regardless of the human
 * behind it. This module reads the JSON-RPC body off a clone of the request
 * (the transport consumes the original) and writes one data point per
 * meaningful message.
 *
 * Vertical-agnostic and platform-structural on purpose: the dataset is any
 * object with `writeDataPoint` (Cloudflare's AnalyticsEngineDataset satisfies
 * it), so core takes no dependency on Workers types — the same reasoning as
 * FetchLike in the ingestion package.
 *
 * What is recorded: the tool/method name, the client's self-declared
 * name+version (from `initialize`), the user agent, and the request country.
 * What is NOT recorded, on purpose: tool arguments. Queries can carry VINs
 * and claim details, and the redaction discipline says those never leave the
 * request path.
 *
 * Telemetry must never cost a request: every path here swallows its own
 * errors, and a missing dataset binding degrades to a no-op.
 */

/** One Analytics Engine row. Field ORDER is the schema — see BLOB LAYOUT below. */
export interface AnalyticsDataPoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

/** Structural stand-in for Cloudflare's AnalyticsEngineDataset. */
export interface AnalyticsEngineLike {
  writeDataPoint(point: AnalyticsDataPoint): void;
}

/**
 * The subset of a fetch Request this module touches. Both the standard
 * Request and Cloudflare's satisfy it. `cf` (the edge-derived request
 * properties, carrying the country) is deliberately `unknown`: Cloudflare's
 * own union includes a shape with no shared fields, so anything narrower
 * fails structural assignment — narrowing happens at the read site instead.
 */
export interface McpRequestLike {
  method: string;
  headers: { get(name: string): string | null };
  clone(): { text(): Promise<string> };
  cf?: unknown;
}

export type McpUsageEventKind = 'tool_call' | 'initialize' | 'tools_list' | 'other';

export interface McpUsageEvent {
  kind: McpUsageEventKind;
  /** Tool name for tool_call, client name/version for initialize, the method otherwise. */
  detail: string;
}

/**
 * Analytics Engine's own hard cap on writeDataPoint calls per Worker
 * invocation. A real MCP POST carries one message; only a hand-built batch
 * could approach this, and the excess is dropped rather than erroring.
 */
const MAX_EVENTS_PER_REQUEST = 25;

/** Blob budget is 5 KB across the row; clip each field well under it. */
const MAX_DETAIL_LEN = 120;
const MAX_USER_AGENT_LEN = 200;

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function toEvent(message: unknown): McpUsageEvent | null {
  if (typeof message !== 'object' || message === null) return null;
  const method = (message as { method?: unknown }).method;
  if (typeof method !== 'string' || method.length === 0) return null;
  // Notifications (notifications/initialized etc.) are protocol chatter, not
  // usage — recording them would double-count every session.
  if (method.startsWith('notifications/')) return null;

  const params = (message as { params?: unknown }).params;

  if (method === 'tools/call') {
    const name = (params as { name?: unknown } | undefined)?.name;
    return {
      kind: 'tool_call',
      detail: clip(typeof name === 'string' && name.length > 0 ? name : 'unknown', MAX_DETAIL_LEN),
    };
  }

  if (method === 'initialize') {
    // The client's self-declared identity — the only place "claude-ai" vs
    // "Claude Desktop" vs a Gemini client is distinguishable, since all
    // hosted clients share their platform's egress IPs.
    const clientInfo = (params as { clientInfo?: unknown } | undefined)?.clientInfo;
    const name = (clientInfo as { name?: unknown } | undefined)?.name;
    const version = (clientInfo as { version?: unknown } | undefined)?.version;
    const label =
      typeof name === 'string' && name.length > 0
        ? typeof version === 'string' && version.length > 0
          ? `${name}/${version}`
          : name
        : 'unknown';
    return { kind: 'initialize', detail: clip(label, MAX_DETAIL_LEN) };
  }

  if (method === 'tools/list') return { kind: 'tools_list', detail: method };

  return { kind: 'other', detail: clip(method, MAX_DETAIL_LEN) };
}

/**
 * Parse a JSON-RPC request body into usage events. Never throws: a malformed
 * body (or a GET with none) is simply zero events.
 */
export function parseMcpUsage(bodyText: string): McpUsageEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return [];
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const events: McpUsageEvent[] = [];
  for (const message of messages) {
    if (events.length >= MAX_EVENTS_PER_REQUEST) break;
    const event = toEvent(message);
    if (event) events.push(event);
  }
  return events;
}

/**
 * Record the usage events in an /mcp POST, without touching the response
 * path. Call BEFORE handing the request to the transport: the body is read
 * from a clone, inside `waitUntil`, so the transport still sees the original
 * stream and the client never waits on telemetry.
 *
 * BLOB LAYOUT (write order is the read-side schema — keep stable):
 *   blob1 vertical, blob2 event kind, blob3 detail (tool / client / method),
 *   blob4 user agent, blob5 country. double1 is the count (always 1).
 *   index1 is the vertical, so sampling under load stays fair per server.
 */
export function recordMcpUsage(opts: {
  dataset: AnalyticsEngineLike | undefined;
  /** Which server is reporting: 'deg' | 'nhtsa' | 'wa' | 'mt' | 'co' | 'tx'. */
  vertical: string;
  request: McpRequestLike;
  waitUntil: (promise: Promise<unknown>) => void;
}): void {
  const { dataset, vertical, request, waitUntil } = opts;
  if (!dataset || request.method !== 'POST') return;

  try {
    const clone = request.clone();
    const userAgent = clip(request.headers.get('user-agent') ?? '', MAX_USER_AGENT_LEN);
    const cf = request.cf as { country?: unknown } | undefined;
    const country = typeof cf?.country === 'string' ? cf.country : '';

    waitUntil(
      (async () => {
        try {
          const events = parseMcpUsage(await clone.text());
          for (const event of events) {
            dataset.writeDataPoint({
              blobs: [vertical, event.kind, event.detail, userAgent, country],
              doubles: [1],
              indexes: [vertical],
            });
          }
        } catch {
          // Telemetry never surfaces an error — there is nobody to surface it to.
        }
      })(),
    );
  } catch {
    // Same contract as above: a clone/read failure costs nothing but the row.
  }
}
