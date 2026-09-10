import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureNyPdfParts } from '../src/capture-parts.js';
import { NY_PART142_SOURCE, NY_PART82_SOURCE } from '../src/sources-parts.js';
import { CR142_TEXT, CR82_TEXT } from './parse-pdf-part.test.js';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1

export function buildPartsIo(texts: Record<string, string> = {}): CaptureIo & { extract: (b: Uint8Array) => Promise<string>; fetched: string[] } {
  const byUrl: Record<string, string> = { [NY_PART82_SOURCE.pdfUrl]: CR82_TEXT, [NY_PART142_SOURCE.pdfUrl]: CR142_TEXT, ...texts };
  const fetched: string[] = [];
  return {
    fetched,
    async fetchText() { throw new Error('not used'); },
    async fetchJson() { throw new Error('not used'); },
    async fetchBinary(url) { fetched.push(url); if (!(url in byUrl)) throw new Error(`no fixture ${url}`); return PDF; },
    log() {},
    extract: async () => byUrl[fetched[fetched.length - 1]!]!,
  };
}

describe('captureNyPdfParts', () => {
  test('captures 19 + 24 sections, stamps sources, edition, and the 142 date', async () => {
    const io = buildPartsIo();
    const r = await captureNyPdfParts(io, { extractText: io.extract });
    expect(r.sections.length).toBe(43);
    expect(r.cr82Edition).toBe('CR-82 (5/26)');
    expect(r.part142EffectiveDate).toBe('2020-06-24');
    const s82 = r.sections.filter((s) => s.code === '15 NYCRR');
    expect(s82.every((s) => s.captureSource === 'dmv' && s.effectiveDate === undefined && s.historyNote === 'CR-82 (5/26)')).toBe(true);
    const s142 = r.sections.filter((s) => s.code === '12 NYCRR');
    expect(s142.every((s) => s.captureSource === 'dol' && s.effectiveDate === '2020-06-24')).toBe(true);
    expect(s142[0]?.sourceUrl).toBe(NY_PART142_SOURCE.pageUrl);
  });
  test('a missing section fails naming the cite', async () => {
    const io = buildPartsIo({ [NY_PART82_SOURCE.pdfUrl]: CR82_TEXT.replace('82.18 Title 18.', '82.18x Title 18.') });
    await expect(captureNyPdfParts(io, { extractText: io.extract })).rejects.toThrow(/15 NYCRR: expected \[.*82\.18/);
  });
  test('a mustContain miss fails as an extraction problem', async () => {
    // NOTE: deliberately NOT the unmodified CR142_TEXT — see task-4-report.md
    // "Deviations from the brief" for why. The shared CR142_TEXT/CR82_TEXT
    // fixture constants themselves are untouched.
    const io = buildPartsIo({ [NY_PART142_SOURCE.pdfUrl]: CR142_TEXT.replace('This Part shall apply to all employees.', 'This Part shall apply to all covered workers.') });
    await expect(captureNyPdfParts(io, { extractText: io.extract })).rejects.toThrow(/did not extract faithfully/);
  });
  test('a non-PDF download is refused before extraction', async () => {
    const io = buildPartsIo();
    io.fetchBinary = async () => new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]);
    await expect(captureNyPdfParts(io, { extractText: io.extract })).rejects.toThrow(/not a PDF/);
  });
});
