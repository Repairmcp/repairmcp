import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createSchema, upsertMetadata, getPendingIds } from '../src/db.js';
import type { MetadataRow } from '../src/db.js';
import { fetchDetail } from '../src/tier2.js';
import type { FetchDetailResult } from '../src/tier2.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dir, 'fixtures');
const RESOLVED_HTML = readFileSync(join(FIXTURES, 'inquiry-resolved.html'), 'utf-8');
const PENDING_HTML = readFileSync(join(FIXTURES, 'inquiry-pending.html'), 'utf-8');

const BASE_ROW: MetadataRow = {
  dbId: 41477,
  database: 'CCC',
  inquiryType: 'Refinish Operations',
  status: 'Resolved (IP Change)',
  resolutionStatus: 'resolved',
  year: 2022,
  make: 'Toyota',
  model: '4 RUNNER',
  submissionDate: '2023-01-15',
  resolutionDate: '2023-01-17',
  sourceUrl: 'https://degweb.org/inquiries/41477/',
  lastSeenAt: '2026-06-26T00:00:00.000Z',
};

describe('fetchDetail', () => {
  test('returns ok=true with parsed body on 200', async () => {
    const mockFetch: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/inquiries/41477/',
        text: async () => RESOLVED_HTML,
      }) as unknown as Response;

    const result = await fetchDetail(41477, {
      fetchImpl: mockFetch,
      initialBackoffMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.parsed?.inquiryType).toBe('Refinish Operations');
    expect(result.parsed?.resolution).toContain('CCC confirmed');
  });

  test('returns ok=false with reason on soft-404 redirect', async () => {
    const mockFetch: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/deg-database/',
        text: async () => '<html></html>',
      }) as unknown as Response;

    const result = await fetchDetail(41477, {
      fetchImpl: mockFetch,
      initialBackoffMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('soft-404');
  });

  test('returns ok=false on 404', async () => {
    const mockFetch: typeof fetch = async () =>
      ({
        ok: false,
        status: 404,
      }) as unknown as Response;

    const result = await fetchDetail(99999, {
      fetchImpl: mockFetch,
      initialBackoffMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.reason).toBe('not found');
  });

  test('retries on 429 and succeeds', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      if (callCount < 2) {
        return ({
          ok: false,
          status: 429,
          url: 'https://degweb.org/inquiries/41477/',
        }) as unknown as Response;
      }
      return ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/inquiries/41477/',
        text: async () => RESOLVED_HTML,
      }) as unknown as Response;
    };

    const result = await fetchDetail(41477, {
      fetchImpl: mockFetch,
      initialBackoffMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(2);
  });

  test('gives up after maxRetries on repeated 500', async () => {
    const mockFetch: typeof fetch = async () =>
      ({
        ok: false,
        status: 500,
        url: 'https://degweb.org/inquiries/41477/',
      }) as unknown as Response;

    const result = await fetchDetail(41477, {
      fetchImpl: mockFetch,
      initialBackoffMs: 1,
      maxRetries: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('gave up');
  });

  test('sends User-Agent header on every request', async () => {
    let capturedUA = '';
    const mockFetch: typeof fetch = async (_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedUA = headers?.['User-Agent'] ?? '';
      return ({
        ok: true,
        status: 200,
        url: 'https://degweb.org/inquiries/41477/',
        text: async () => RESOLVED_HTML,
      }) as unknown as Response;
    };

    await fetchDetail(41477, { fetchImpl: mockFetch, initialBackoffMs: 1 });
    expect(capturedUA).toBe('RepairMCP-Bot/1.0 (+https://repairmcp.org)');
  });
});
