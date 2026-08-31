import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureBulletin, type BulletinSource } from '../src/capture-bulletin.js';

const source: BulletinSource = {
  cite: 'B-5.04',
  heading: 'Notice of the Provisions Pertaining to the Payment of Claims for the Repair of Damaged Property',
  chapter: 'B-5',
  chapterTitle: 'Division of Insurance Bulletins, Property and Casualty',
  domain: 'insurance',
  effectiveDate: '2016-09-19',
  pdfUrl: 'https://doi.example.test/b-5.04.pdf',
  pageUrl: 'https://doi.example.test/bulletins',
  mustContain: ['B-5.04', '10-4-120'],
};

/**
 * The magic-byte guard reads the fetched bytes, not the extracted text, so it
 * runs even when extractText is injected — which is the point. Fixtures that
 * stand in for a real download therefore have to start like one.
 */
const pdfBytes = (): Uint8Array => new TextEncoder().encode('%PDF-1.7\n…');

const fakeIo = (bytes: Uint8Array): CaptureIo => ({
  fetchText: async () => { throw new Error('unused'); },
  fetchJson: async () => { throw new Error('unused'); },
  fetchBinary: async () => bytes,
  log: () => {},
});

describe('captureBulletin', () => {
  test('extracted text becomes one verbatim section', async () => {
    const { section } = await captureBulletin(fakeIo(pdfBytes()), source, {
      extractText: async () => 'Bulletin B-5.04\nConcerning § 10-4-120, C.R.S.\nThe division reminds carriers…',
    });
    expect(section.cite).toBe('B-5.04');
    expect(section.code).toBe('Colorado DOI Bulletin');
    expect(section.effectiveDate).toBe('2016-09-19');
    expect(section.sourceUrl).toBe(source.pageUrl);
    expect(section.text).toContain('10-4-120');
  });
  test('missing mustContain strings hard-fail — extraction fidelity is the point', async () => {
    await expect(
      captureBulletin(fakeIo(pdfBytes()), source, { extractText: async () => 'garbled output' }),
    ).rejects.toThrow(/B-5\.04/);
  });
  test('a download that is not a PDF hard-fails, and the error shows the leading bytes', async () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><title>Access denied</title>');
    await expect(
      // The extractText injection must NOT let a non-PDF through: the guard
      // reads the bytes that were fetched.
      captureBulletin(fakeIo(html), source, { extractText: async () => 'B-5.04 10-4-120' }),
    ).rejects.toThrow(/not a PDF/i);
    await expect(captureBulletin(fakeIo(html), source)).rejects.toThrow(/<!DOCTYP/);
  });
  test('an io without fetchBinary throws a clear error', async () => {
    const io = { ...fakeIo(pdfBytes()) };
    delete (io as Record<string, unknown>).fetchBinary;
    await expect(captureBulletin(io as CaptureIo, source)).rejects.toThrow(/fetchBinary/);
  });
});
