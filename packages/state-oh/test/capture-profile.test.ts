import { describe, expect, test } from 'bun:test';
import { OH_CAPTURE_PROFILE } from '../src/capture.js';
import { buildOhIo } from './capture-codes.test.js';

describe('OH_CAPTURE_PROFILE.captureAll', () => {
  test('51 sections across four domains, unique keys, capture-source counts, the newest effective date in meta', async () => {
    const out = await OH_CAPTURE_PROFILE.captureAll(buildOhIo());
    const file = OH_CAPTURE_PROFILE.corpusFileSchema.parse(out.file);
    expect(file.sections.length).toBe(51);
    expect(file.meta.state).toBe('OH');
    expect((file.meta as { newestEffectiveDate: string }).newestEffectiveDate).toBe('2023-03-11');
    const domains = new Map<string, number>();
    for (const s of file.sections) domains.set(s.domain, (domains.get(s.domain) ?? 0) + 1);
    expect(domains.get('insurance')).toBe(9);
    expect(domains.get('repair_law')).toBe(16);
    expect(domains.get('employment')).toBe(17);
    expect(domains.get('safety')).toBe(9);
    const keys = file.sections.map((s) => `${s.code}:${s.cite}`);
    expect(new Set(keys).size).toBe(keys.length);
    const sources = new Map<string, number>();
    for (const s of file.sections) sources.set((s as { captureSource: string }).captureSource, (sources.get((s as { captureSource: string }).captureSource) ?? 0) + 1);
    expect(sources.get('chapter')).toBe(33);
    expect(sources.get('section')).toBe(18);
    expect(out.report.warnings).toEqual([]);
  });
  test('the profile is registered under oh with the attention file and checklist', () => {
    expect(OH_CAPTURE_PROFILE.state).toBe('OH');
    expect(OH_CAPTURE_PROFILE.attentionFileName).toBe('OH-LAW-ATTENTION.txt');
    expect(OH_CAPTURE_PROFILE.refreshChecklist).toContain('capture-state.ts --state oh');
    expect(OH_CAPTURE_PROFILE.supportsOnly).toBe(false);
  });
});
