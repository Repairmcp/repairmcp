// packages/state-law/test/capture-text-decode.test.ts
import { describe, expect, test } from 'bun:test';
import { decodeResponseBytes, makeCaptureIo, type FetchLike } from '../src/capture.js';

/**
 * These bytes are a REAL SLICE of the shape Colorado's OLLS serves: a
 * Word-filtered title file whose Content-Type carries no charset at all and
 * whose meta tag declares windows-1252. 0xA0 is the non-breaking space that
 * separates a section number from its catchline, 0xA7 is the section sign in
 * the Source line, 0x97 is the em dash. Decoded as UTF-8 all three become
 * U+FFFD — which is what made the first Colorado capture parse zero sections.
 */
function cp1252(text: string): Uint8Array {
  const map: Record<string, number> = { ' ': 0xa0, '§': 0xa7, '—': 0x97, '’': 0x92 };
  const out: number[] = [];
  for (const ch of text) out.push(map[ch] ?? ch.charCodeAt(0));
  return new Uint8Array(out);
}

const META_1252 = '<meta http-equiv=Content-Type content="text/html; charset=windows-1252">';
const SECTION_HEAD = '10-4-120.    Unfair or discriminatory trade practices.';
const SOURCE_LINE = 'Source: L. 2005: Entire section added, p. 345, § 1 — effective December 31.';
const PAGE_TEXT = `<html><head>${META_1252}</head><body><p>${SECTION_HEAD}</p><p>${SOURCE_LINE}</p></body></html>`;

function fetchReturning(
  bytes: Uint8Array,
  contentType: string | null,
): { impl: FetchLike; seen: { userAgent?: string } } {
  const seen: { userAgent?: string } = {};
  const impl: FetchLike = async (_url, init) => {
    seen.userAgent = init?.headers?.['user-agent'];
    return {
      ok: true,
      status: 200,
      text: async () => new TextDecoder('utf-8').decode(bytes),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    };
  };
  return { impl, seen };
}

describe('decodeResponseBytes', () => {
  test('UTF-8 decoding of the real windows-1252 shape loses the characters legal text needs', () => {
    const utf8 = new TextDecoder('utf-8').decode(cp1252(PAGE_TEXT));
    expect(utf8).toContain('�');
    expect(utf8).not.toContain('§');
  });

  test('the meta prescan recovers NBSP, section sign and em dash when no header charset exists', () => {
    const text = decodeResponseBytes(cp1252(PAGE_TEXT), 'text/html');
    expect(text).not.toContain('�');
    expect(text).toContain(SECTION_HEAD);
    expect(text).toContain(SOURCE_LINE);
  });

  test('a header charset wins over the document meta', () => {
    const bytes = cp1252(`<html><head>${META_1252}</head><body>café</body></html>`);
    // The header lies about UTF-8; we still honour it, because the header is
    // what the server is asserting right now.
    expect(decodeResponseBytes(bytes, 'text/html; charset=utf-8')).toContain('�');
    expect(decodeResponseBytes(bytes, 'text/html')).toContain('café');
  });

  test('iso-8859-1 decodes as windows-1252, per the encoding standard', () => {
    const bytes = new Uint8Array([0x97]); // em dash in cp1252, a C1 control in true latin-1
    expect(decodeResponseBytes(bytes, 'text/html; charset=iso-8859-1')).toBe('—');
  });

  test('UTF-8 pages are untouched — WA and MT declare utf-8 and must not change', () => {
    const bytes = new TextEncoder().encode('<html><body>§ 284-30-330 — café</body></html>');
    expect(decodeResponseBytes(bytes, 'text/html; charset=utf-8')).toContain('§ 284-30-330 — café');
    expect(decodeResponseBytes(bytes, null)).toContain('§ 284-30-330 — café');
  });

  test('an unknown charset label falls back to UTF-8 instead of throwing', () => {
    const bytes = new TextEncoder().encode('plain');
    expect(decodeResponseBytes(bytes, 'text/html; charset=x-nonsense')).toBe('plain');
  });
});

describe('makeCaptureIo text decoding and user-agent override', () => {
  test('fetchText decodes with the declared charset', async () => {
    const { impl } = fetchReturning(cp1252(PAGE_TEXT), 'text/html');
    const io = makeCaptureIo({ userAgent: 'test', delayMs: 0, fetchImpl: impl, log: () => {} });
    const body = await io.fetchText('https://olls.example/title.htm');
    expect(body).toContain(SECTION_HEAD);
    expect(body).not.toContain('�');
  });

  test('a FetchLike without arrayBuffer still works via text()', async () => {
    const io = makeCaptureIo({
      userAgent: 'test', delayMs: 0, log: () => {},
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<p>plain</p>' }),
    });
    expect(await io.fetchText('https://example.test/x')).toBe('<p>plain</p>');
  });

  test('the io-wide user agent is used by default and a per-fetch one overrides it', async () => {
    const a = fetchReturning(new TextEncoder().encode('ok'), 'text/html; charset=utf-8');
    const ioA = makeCaptureIo({ userAgent: 'io-wide', delayMs: 0, fetchImpl: a.impl, log: () => {} });
    await ioA.fetchText('https://example.test/x');
    expect(a.seen.userAgent).toBe('io-wide');

    const b = fetchReturning(new TextEncoder().encode('ok'), 'text/html; charset=utf-8');
    const ioB = makeCaptureIo({ userAgent: 'io-wide', delayMs: 0, fetchImpl: b.impl, log: () => {} });
    await ioB.fetchText('https://example.test/x', { userAgent: 'per-fetch' });
    expect(b.seen.userAgent).toBe('per-fetch');

    const c = fetchReturning(new TextEncoder().encode('ok'), null);
    const ioC = makeCaptureIo({ userAgent: 'io-wide', delayMs: 0, fetchImpl: c.impl, log: () => {} });
    await ioC.fetchBinary!('https://example.test/x.pdf', { userAgent: 'per-fetch' });
    expect(c.seen.userAgent).toBe('per-fetch');
  });
});
