import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureNyDfs } from '../src/capture-dfs.js';
import { NY_DFS_SOURCES } from '../src/sources-dfs.js';
import { circularPage, ogcPage } from './parse-dfs.test.js';

export function buildDfsIo(overrides: Record<string, string> = {}): CaptureIo {
  const pages = new Map<string, string>();
  for (const s of NY_DFS_SOURCES) {
    pages.set(s.url, s.kind === 'ogc' ? ogcPage({ number: s.number, subject: s.heading }) : circularPage({ number: s.number, subject: s.heading, ...(s.expectedStatus === 'current' ? { date: 'September 5, 1991' } : {}), ...(s.expectedStatus === 'withdrawn' ? { withdrawn: 'DECEMBER 4, 2003' } : {}) }));
  }
  for (const [u, h] of Object.entries(overrides)) pages.set(u, h);
  return { async fetchText(url) { const h = pages.get(url); if (h === undefined) throw new Error(`fixture missing ${url}`); return h; }, async fetchJson() { throw new Error('not used'); }, log() {} };
}

describe('captureNyDfs', () => {
  test('six documents, guidance code, issue dates, statuses', async () => {
    const r = await captureNyDfs(buildDfsIo(), NY_DFS_SOURCES);
    expect(r.sections.map((s) => s.cite)).toEqual(NY_DFS_SOURCES.map((s) => s.cite));
    for (const s of r.sections) {
      expect(s.code).toBe('DFS Guidance');
      expect(s.captureSource).toBe('dfs');
      expect(s.domain).toBe('insurance');
      expect(s.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const cl16 = r.sections.find((s) => s.cite === 'Circular Letter 16 (2000)')!;
    expect(cl16.dfsStatus).toBe('withdrawn');
    expect(cl16.dfsWithdrawnDate).toBe('2003-12-04');
    expect(cl16.historyNote).toBe('Issued 2000-05-10; withdrawn effective 2003-12-04');
    const ogc = r.sections.find((s) => s.cite === 'OGC Opinion 04-06-03')!;
    expect(ogc.dfsStatus).toBe('current');
    expect(ogc.heading).toBe('Section 2610 - Certified Autobody Repair Shops');
  });
  test('a status change is drift and fails by name', async () => {
    const cl11 = NY_DFS_SOURCES.find((s) => s.cite === 'Circular Letter 11 (1991)')!;
    const io = buildDfsIo({ [cl11.url]: circularPage({ number: '11 (1991)', subject: cl11.heading, date: 'September 5, 1991', withdrawn: 'JANUARY 2, 2027' }) });
    await expect(captureNyDfs(io, NY_DFS_SOURCES)).rejects.toThrow(/Circular Letter 11 \(1991\).*withdrawn.*expected current/);
  });
  test('a subject that drifts from the manifest heading fails', async () => {
    const o = NY_DFS_SOURCES[0]!;
    const io = buildDfsIo({ [o.url]: ogcPage({ number: o.number, subject: 'Something else entirely' }) });
    await expect(captureNyDfs(io, NY_DFS_SOURCES)).rejects.toThrow(/subject reads/);
  });
});
