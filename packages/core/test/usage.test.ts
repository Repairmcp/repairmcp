/**
 * MCP usage telemetry.
 *
 * The contract under test: the parser turns JSON-RPC bodies into events
 * without ever throwing, and the recorder writes blobs in the documented
 * order without ever touching the response path — a malformed body, a
 * missing binding, or a throwing dataset must all cost zero.
 */
import { describe, expect, test } from 'bun:test';

import {
  parseMcpUsage,
  recordMcpUsage,
  type AnalyticsDataPoint,
  type McpRequestLike,
} from '../src/server/usage.js';

function toolCallBody(name: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: { query: 'blend two-tone refinish' } },
  });
}

function makeRequest(opts: {
  method?: string;
  body?: string;
  userAgent?: string;
  country?: string;
  failClone?: boolean;
}): McpRequestLike {
  return {
    method: opts.method ?? 'POST',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'user-agent' ? (opts.userAgent ?? null) : null,
    },
    clone() {
      if (opts.failClone) throw new Error('body already consumed');
      return { text: async () => opts.body ?? '' };
    },
    ...(opts.country !== undefined ? { cf: { country: opts.country } } : {}),
  };
}

/** Runs recordMcpUsage and resolves once every waitUntil promise settles. */
async function record(
  request: McpRequestLike,
  dataset: { writeDataPoint(p: AnalyticsDataPoint): void } | undefined,
  vertical = 'deg',
): Promise<void> {
  const pending: Promise<unknown>[] = [];
  recordMcpUsage({
    dataset,
    vertical,
    request,
    waitUntil: (p) => pending.push(p),
  });
  await Promise.all(pending);
}

describe('parseMcpUsage', () => {
  test('a tools/call body yields one tool_call event with the tool name', () => {
    expect(parseMcpUsage(toolCallBody('deg_find_supporting'))).toEqual([
      { kind: 'tool_call', detail: 'deg_find_supporting' },
    ]);
  });

  test('initialize captures the client self-declared name/version', () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'claude-ai', version: '0.1.0' },
        capabilities: {},
      },
    });
    expect(parseMcpUsage(body)).toEqual([{ kind: 'initialize', detail: 'claude-ai/0.1.0' }]);
  });

  test('initialize without clientInfo still records, as unknown', () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} });
    expect(parseMcpUsage(body)).toEqual([{ kind: 'initialize', detail: 'unknown' }]);
  });

  test('tools/list and other requests are kinded, notifications are dropped', () => {
    const body = JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ]);
    expect(parseMcpUsage(body)).toEqual([
      { kind: 'tools_list', detail: 'tools/list' },
      { kind: 'other', detail: 'ping' },
    ]);
  });

  test('malformed JSON, non-objects, and missing methods yield zero events', () => {
    expect(parseMcpUsage('not json at all')).toEqual([]);
    expect(parseMcpUsage('')).toEqual([]);
    expect(parseMcpUsage('42')).toEqual([]);
    expect(parseMcpUsage('null')).toEqual([]);
    expect(parseMcpUsage(JSON.stringify({ jsonrpc: '2.0', id: 1 }))).toEqual([]);
    expect(parseMcpUsage(JSON.stringify([{ method: 42 }, 'x']))).toEqual([]);
  });

  test('a tools/call with a non-string name records as unknown, not a crash', () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} });
    expect(parseMcpUsage(body)).toEqual([{ kind: 'tool_call', detail: 'unknown' }]);
  });

  test('event details are clipped to the blob budget', () => {
    const long = 'x'.repeat(500);
    const [event] = parseMcpUsage(toolCallBody(long));
    expect(event?.detail.length).toBe(120);
  });

  test('a batch is capped at the Analytics Engine per-invocation write limit', () => {
    const batch = Array.from({ length: 40 }, (_, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'tools/call',
      params: { name: `tool_${i}` },
    }));
    expect(parseMcpUsage(JSON.stringify(batch)).length).toBe(25);
  });
});

describe('recordMcpUsage', () => {
  test('writes the documented blob layout: vertical, kind, detail, UA, country', async () => {
    const points: AnalyticsDataPoint[] = [];
    await record(
      makeRequest({
        body: toolCallBody('wa_find_supporting_authority'),
        userAgent: 'Claude-User',
        country: 'US',
      }),
      { writeDataPoint: (p) => points.push(p) },
      'wa',
    );
    expect(points).toEqual([
      {
        blobs: ['wa', 'tool_call', 'wa_find_supporting_authority', 'Claude-User', 'US'],
        doubles: [1],
        indexes: ['wa'],
      },
    ]);
  });

  test('missing UA and country write as empty strings, keeping blob positions stable', async () => {
    const points: AnalyticsDataPoint[] = [];
    await record(makeRequest({ body: toolCallBody('deg_get_inquiry') }), {
      writeDataPoint: (p) => points.push(p),
    });
    expect(points[0]?.blobs).toEqual(['deg', 'tool_call', 'deg_get_inquiry', '', '']);
  });

  test('no dataset binding is a silent no-op', async () => {
    // The absence of a throw IS the assertion.
    await record(makeRequest({ body: toolCallBody('deg_search_inquiries') }), undefined);
  });

  test('non-POST requests are ignored', async () => {
    const points: AnalyticsDataPoint[] = [];
    await record(makeRequest({ method: 'GET' }), { writeDataPoint: (p) => points.push(p) });
    expect(points).toEqual([]);
  });

  test('a throwing clone never reaches the caller', async () => {
    await record(makeRequest({ failClone: true }), {
      writeDataPoint: () => {
        throw new Error('should not be called');
      },
    });
  });

  test('a throwing writeDataPoint never reaches the caller', async () => {
    await record(makeRequest({ body: toolCallBody('deg_list_recent') }), {
      writeDataPoint: () => {
        throw new Error('dataset over quota');
      },
    });
  });
});
