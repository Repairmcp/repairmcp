// packages/state-law/test/capture-binary.test.ts
import { describe, expect, test } from 'bun:test';
import { makeCaptureIo, type FetchLike } from '../src/capture.js';

const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x7f]); // zip magic + junk

function fakeFetch(): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => 'not-used',
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  });
}

describe('fetchBinary', () => {
  test('returns the exact bytes', async () => {
    const io = makeCaptureIo({ userAgent: 'test', delayMs: 0, fetchImpl: fakeFetch(), log: () => {} });
    const got = await io.fetchBinary!('https://example.test/doc.docx');
    expect([...got]).toEqual([...bytes]);
  });
  test('round-trips through saveRaw/readRaw as base64', async () => {
    const store = new Map<string, string>();
    const io = makeCaptureIo({
      userAgent: 'test', delayMs: 0, fetchImpl: fakeFetch(), log: () => {},
      saveRaw: (name, body) => store.set(name, body),
      readRaw: (name) => store.get(name),
    });
    const first = await io.fetchBinary!('https://example.test/doc.docx', { rawName: 'doc.b64' });
    expect(store.has('doc.b64')).toBe(true);
    // Second call must replay from the store, not fetch.
    const replayIo = makeCaptureIo({
      userAgent: 'test', delayMs: 0, log: () => {},
      fetchImpl: async () => { throw new Error('must not fetch'); },
      readRaw: (name) => store.get(name),
    });
    const second = await replayIo.fetchBinary!('https://example.test/doc.docx', { rawName: 'doc.b64' });
    expect([...second]).toEqual([...first]);
  });
  test('a FetchLike without arrayBuffer throws a named error', async () => {
    const io = makeCaptureIo({
      userAgent: 'test', delayMs: 0, log: () => {},
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x' }),
    });
    await expect(io.fetchBinary!('https://example.test/doc.docx')).rejects.toThrow(/arrayBuffer/);
  });
});
