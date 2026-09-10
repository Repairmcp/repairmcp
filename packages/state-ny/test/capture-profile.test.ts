import { describe, expect, test } from 'bun:test';
import { NY_CAPTURE_PROFILE } from '../src/capture.js';
import { NY_CR82_EDITION } from '../src/identity.js';
import { buildDfsIo } from './capture-dfs.test.js';
import { buildPartsIo } from './capture-parts.test.js';
import { buildReg64Io } from './capture-reg64.test.js';
import { buildStatuteIo } from './capture-statutes.test.js';

function compositeIo() {
  const statutes = buildStatuteIo();
  const reg64 = buildReg64Io();
  const dfs = buildDfsIo();
  const parts = buildPartsIo();
  return {
    parts,
    io: {
      async fetchText(url: string, opts?: { minDelayMs?: number }) {
        if (url.includes('nysenate.gov')) return statutes.fetchText(url, opts);
        if (url.includes('cornell.edu')) return reg64.fetchText(url, opts);
        return dfs.fetchText(url, opts);
      },
      async fetchJson() { throw new Error('not used'); },
      fetchBinary: parts.fetchBinary!,
      log() {},
    },
  };
}

describe('NY_CAPTURE_PROFILE.captureAll', () => {
  test('95 sections across three domains with the two meta pins', async () => {
    const { io, parts } = compositeIo();
    const out = await NY_CAPTURE_PROFILE.captureAll(io, { extractText: parts.extract } as never);
    const file = NY_CAPTURE_PROFILE.corpusFileSchema.parse(out.file);
    expect(file.sections.length).toBe(95);
    expect(file.meta.state).toBe('NY');
    expect((file.meta as { cr82Edition: string }).cr82Edition).toBe(NY_CR82_EDITION);
    expect((file.meta as { part142EffectiveDate: string }).part142EffectiveDate).toBe('2020-06-24');
    const domains = new Map<string, number>();
    for (const s of file.sections) domains.set(s.domain, (domains.get(s.domain) ?? 0) + 1);
    expect(domains.get('insurance')).toBe(22);
    expect(domains.get('repair_law')).toBe(34);
    expect(domains.get('employment')).toBe(39);
    const keys = file.sections.map((s) => `${s.code}:${s.cite}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  test('an edition rollover on the DMV booklet fails the capture with both phrases', async () => {
    const { io, parts } = compositeIo();
    const extract = async (b: Uint8Array) => (await parts.extract(b)).replace('CR-82 (5/26)', 'CR-82 (1/27)');
    await expect(NY_CAPTURE_PROFILE.captureAll(io, { extractText: extract } as never)).rejects.toThrow(/prints "CR-82 \(1\/27\)" but the corpus pins "CR-82 \(5\/26\)"/);
  });
});
