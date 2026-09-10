import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureNyReg64 } from '../src/capture-reg64.js';
import { NY_REG64_SOURCE, liiNycrrPartUrl, liiNycrrSectionUrl } from '../src/sources-reg64.js';
import { liiPage } from './parse-lii-nycrr.test.js';

export function partIndex(items: Array<{ cite: string; title: string }>): string {
  return '<h1 class="title" id="page_title"> N.Y. Comp. Codes R. &amp; Regs. tit. 11, ch. IX, pt. 216 - Unfair Claims Settlement Practices And Claim Cost Control Measures </h1><ul>' +
    items.map((i) => `<li class="tocitem"><a href="/regulations/new-york/11-NYCRR-${i.cite}">§ ${i.cite} - ${i.title}</a></li>`).join('') + '</ul>';
}

export function buildReg64Io(overrides: { pages?: Record<string, string> } = {}): CaptureIo & { fetched: Array<{ url: string; minDelayMs?: number }> } {
  const pages = new Map<string, string>();
  const s = NY_REG64_SOURCE;
  pages.set(liiNycrrPartUrl(s.title, s.chapterRoman, s.part), partIndex([...s.cites.map((c) => ({ cite: c, title: `Title ${c}` })), { cite: '216.13', title: 'Mediation (Repealed)' }]));
  for (const cite of s.cites) pages.set(liiNycrrSectionUrl(s.title, cite), liiPage({ cite, heading: `Title ${cite}` }));
  for (const [u, h] of Object.entries(overrides.pages ?? {})) pages.set(u, h);
  const fetched: Array<{ url: string; minDelayMs?: number }> = [];
  return {
    fetched,
    async fetchText(url, opts) { fetched.push({ url, minDelayMs: opts?.minDelayMs }); const h = pages.get(url); if (h === undefined) throw new Error(`fixture missing ${url}`); return h; },
    async fetchJson() { throw new Error('not used'); },
    log() {},
  };
}

describe('captureNyReg64', () => {
  test('index first, then every cite at the 10 s delay, lii provenance, newest date', async () => {
    const io = buildReg64Io();
    const r = await captureNyReg64(io, NY_REG64_SOURCE);
    expect(r.sections.map((x) => x.cite)).toEqual([...NY_REG64_SOURCE.cites]);
    expect(io.fetched[0]?.url).toBe(liiNycrrPartUrl('11', 'IX', '216'));
    expect(io.fetched.every((f) => f.minDelayMs === 10_000)).toBe(true);
    for (const x of r.sections) {
      expect(x.captureSource).toBe('lii');
      expect(x.code).toBe('11 NYCRR');
      expect(x.effectiveDate).toBe('2021-06-09');
      expect(x.sourceUrl).toBe(liiNycrrSectionUrl('11', x.cite));
    }
  });
  test('a live section listed upstream but missing from the manifest fails', async () => {
    const io = buildReg64Io({ pages: { [liiNycrrPartUrl('11', 'IX', '216')]: partIndex([...NY_REG64_SOURCE.cites.map((c) => ({ cite: c, title: 't' })), { cite: '216.14', title: 'New thing' }]) } });
    await expect(captureNyReg64(io, NY_REG64_SOURCE)).rejects.toThrow(/216\.14 .*not in the manifest/);
  });
  test('a manifest cite absent from the index fails', async () => {
    const io = buildReg64Io({ pages: { [liiNycrrPartUrl('11', 'IX', '216')]: partIndex(NY_REG64_SOURCE.cites.slice(1).map((c) => ({ cite: c, title: 't' }))) } });
    await expect(captureNyReg64(io, NY_REG64_SOURCE)).rejects.toThrow(/216\.0 .*no longer listed/);
  });
  test('a section that turns up repealed fails', async () => {
    const io = buildReg64Io({ pages: { [liiNycrrSectionUrl('11', '216.7')]: liiPage({ cite: '216.7', heading: 'Gone (Repealed)' }) } });
    await expect(captureNyReg64(io, NY_REG64_SOURCE)).rejects.toThrow(/216\.7 .*Repealed/);
  });
  test('no history is a warning, not a failure', async () => {
    const io = buildReg64Io({ pages: { [liiNycrrSectionUrl('11', '216.0')]: liiPage({ cite: '216.0', heading: 'Preamble', notes: '<div class="statereg-note"><note>No prior version found.</note></div>' }) } });
    const r = await captureNyReg64(io, NY_REG64_SOURCE);
    expect(r.sections[0]?.effectiveDate).toBeUndefined();
    expect(r.report.warnings.some((w) => w.includes('216.0'))).toBe(true);
  });
});
