import { describe, expect, test } from 'bun:test';
import { PA_CAPTURE_PROFILE } from '../src/capture.js';
import { buildActsIo } from './capture-acts.test.js';
import { buildConsolidatedIo } from './capture-consolidated.test.js';
import { buildPacodeIo } from './capture-pacode.test.js';

function compositeIo() {
  const consolidated = buildConsolidatedIo();
  const acts = buildActsIo();
  const pacode = buildPacodeIo();
  return {
    async fetchText(url: string, opts?: { minDelayMs?: number; rawName?: string }) {
      if (url.includes('/CT/HTM/')) return consolidated.fetchText(url, opts);
      if (url.includes('/US/HTM/')) return acts.fetchText(url, opts);
      return pacode.fetchText(url, opts);
    },
    async fetchJson() { throw new Error('not used'); },
    log() {},
  };
}

describe('PA_CAPTURE_PROFILE.captureAll', () => {
  test('89 sections across three domains, unique keys, the currency sentence in meta', async () => {
    const out = await PA_CAPTURE_PROFILE.captureAll(compositeIo());
    const file = PA_CAPTURE_PROFILE.corpusFileSchema.parse(out.file);
    expect(file.sections.length).toBe(89);
    expect(file.meta.state).toBe('PA');
    expect((file.meta as { paCodeEffectiveThrough: string }).paCodeEffectiveThrough).toBe('56 Pa.B. 4026 (July 4, 2026)');
    const domains = new Map<string, number>();
    for (const s of file.sections) domains.set(s.domain, (domains.get(s.domain) ?? 0) + 1);
    expect(domains.get('insurance')).toBe(37);
    expect(domains.get('repair_law')).toBe(19);
    expect(domains.get('employment')).toBe(33);
    const keys = file.sections.map((s) => `${s.code}:${s.cite}`);
    expect(new Set(keys).size).toBe(keys.length);
    const sources = new Map<string, number>();
    for (const s of file.sections) sources.set(s.captureSource, (sources.get(s.captureSource) ?? 0) + 1);
    expect(sources.get('legis')).toBe(58);
    expect(sources.get('pacode')).toBe(31);
  });
  test('the profile is registered under pa with the attention file and checklist', () => {
    expect(PA_CAPTURE_PROFILE.state).toBe('PA');
    expect(PA_CAPTURE_PROFILE.attentionFileName).toBe('PA-LAW-ATTENTION.txt');
    expect(PA_CAPTURE_PROFILE.refreshChecklist).toContain('capture-state.ts --state pa');
    expect(PA_CAPTURE_PROFILE.supportsOnly).toBe(false);
  });
});
