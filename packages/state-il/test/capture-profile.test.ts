import { describe, expect, test } from 'bun:test';
import { IL_CAPTURE_PROFILE } from '../src/capture.js';
import { manifestCites } from '../src/sources.js';
import { buildIlIo } from './capture-ilga.test.js';

describe('IL_CAPTURE_PROFILE.captureAll', () => {
  test('88 sections across four domains, unique cites, capture-source counts from the manifest, the newest effective date and the dual-print record in meta', async () => {
    const out = await IL_CAPTURE_PROFILE.captureAll(buildIlIo());
    const file = IL_CAPTURE_PROFILE.corpusFileSchema.parse(out.file);
    expect(file.sections.length).toBe(88);
    expect(file.meta.state).toBe('IL');
    const meta = file.meta as { newestEffectiveDate: string; dualPrinted: Array<{ cite: string }> };
    expect(meta.newestEffectiveDate).toBe('2026-07-01');
    expect(meta.dualPrinted.map((d) => d.cite)).toEqual(['820 ILCS 115/9', '820 ILCS 105/3']);
    const domains = new Map<string, number>();
    for (const s of file.sections) domains.set(s.domain, (domains.get(s.domain) ?? 0) + 1);
    expect(domains.get('insurance')).toBe(16);
    expect(domains.get('repair_law')).toBe(37);
    expect(domains.get('employment')).toBe(23);
    expect(domains.get('safety')).toBe(12);
    expect(new Set(file.sections.map((s) => s.cite)).size).toBe(88);
    const expected = new Map<string, number>();
    for (const c of manifestCites()) expected.set(c.captureSource, (expected.get(c.captureSource) ?? 0) + 1);
    const sources = new Map<string, number>();
    for (const s of file.sections) sources.set((s as { captureSource: string }).captureSource, (sources.get((s as { captureSource: string }).captureSource) ?? 0) + 1);
    expect([...sources.entries()].sort()).toEqual([...expected.entries()].sort());
    expect(sources.get('part')).toBe(23);
    expect(out.report.warnings).toEqual([]);
  });
  test('the profile is registered under il with the attention file and checklist', () => {
    expect(IL_CAPTURE_PROFILE.state).toBe('IL');
    expect(IL_CAPTURE_PROFILE.attentionFileName).toBe('IL-LAW-ATTENTION.txt');
    expect(IL_CAPTURE_PROFILE.refreshChecklist).toContain('capture-state.ts --state il');
    expect(IL_CAPTURE_PROFILE.supportsOnly).toBe(false);
  });
});
