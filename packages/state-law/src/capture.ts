/**
 * The capture contract between state packages and the generic scripts.
 * Deliberately IO-injected and filesystem-free: this module ships in the
 * Worker-safe barrel, and the scripts wire fs for --from-dir/--save-raw. The
 * `captureAll` shape is what lets Washington's chapter-page fetcher and
 * Montana's two pipelines (two-tier MCA crawl + ARM JSON API) live behind
 * one interface.
 */
import type { StateCorpusFile, StateCorpusMeta, StateSection } from './schema.js';

/** The minimal fetch shape this package uses — inject, never `typeof fetch`. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  /** Present on real fetch; binary capture requires it. */
  arrayBuffer?(): Promise<ArrayBuffer>;
  /** Present on real fetch; used to honour a declared response charset. */
  headers?: { get(name: string): string | null };
}>;

/**
 * Per-fetch knobs. `userAgent` overrides the io-wide agent for ONE host that
 * refuses the default — see CO's bulletin source, where doi.colorado.gov's WAF
 * answers the bare `RepairMCP-Bot/1.0 (…)` string with 403 but accepts the
 * conventional `Mozilla/5.0 (compatible; RepairMCP-Bot/1.0; …)` form. It is an
 * override, never a disguise: whatever a caller passes still has to name us.
 */
export interface FetchOpts {
  rawName?: string;
  accept?: string;
  userAgent?: string;
  /**
   * Extra request headers, merged last so they win. Added at TX: the SOS
   * Appian portal's data endpoint requires the client's own protocol headers
   * (X-Appian-Features and friends) or it answers 406 — see state-tx's
   * sources-tac.ts, the only package that passes this.
   */
  headers?: Record<string, string>;
}

export interface CaptureIo {
  /** Fetch a text page (or read it from --from-dir when rawName is known there). */
  fetchText(url: string, opts?: FetchOpts): Promise<string>;
  /** Fetch a JSON endpoint; same raw-replay behavior via rawName. */
  fetchJson<T = unknown>(url: string, opts?: FetchOpts): Promise<T>;
  /**
   * Fetch raw bytes (DOCX, PDF). Optional so existing structural fakes stay
   * valid; makeCaptureIo always provides it. Raw replay stores base64 under
   * the rawName through the same saveRaw/readRaw as text.
   */
  fetchBinary?(url: string, opts?: FetchOpts): Promise<Uint8Array>;
  log(line: string): void;
}

/**
 * Decode a fetched page as the SOURCE says it is encoded, not as the fetch
 * spec assumes. `Response.text()` is defined to run a UTF-8 decode whatever
 * the server declared, which is wrong for publishers still serving legacy
 * encodings: Colorado's OLLS ships Word-filtered `windows-1252` title files
 * (7.6 MB each) with NO charset on the Content-Type header at all, so every
 * `§`, em dash, curly quote and non-breaking space arrives as U+FFFD. That is
 * not cosmetic — a corpus of verbatim statute cannot contain replacement
 * characters, and the mangled NBSP after each section number was enough to
 * make the section splitter match nothing.
 *
 * The order is the browser's: the Content-Type header wins, then the
 * document's own meta prescan, then UTF-8. `iso-8859-1` deliberately decodes
 * as `windows-1252` — that is what the WHATWG Encoding Standard mandates and
 * what every browser does, and the difference is exactly the punctuation
 * range legal text lives in.
 */
export function decodeResponseBytes(
  bytes: Uint8Array,
  contentTypeHeader: string | null | undefined,
): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentTypeHeader ?? '')?.[1];
  const prescan = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(prescan)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=["']?([\w-]+)/i.exec(prescan)?.[1];
  const label = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function makeCaptureIo(opts: {
  userAgent: string;
  /** Delay before every fetch after the first. Default 2000 ms. */
  delayMs?: number;
  fetchImpl?: FetchLike;
  /** --from-dir: return saved content for a rawName, or undefined to fetch live. */
  readRaw?: (name: string) => string | undefined;
  /** --save-raw: persist fetched content under its rawName. */
  saveRaw?: (name: string, body: string) => void;
  log?: (line: string) => void;
}): CaptureIo {
  const delayMs = opts.delayMs ?? 2000;
  const fetchImpl: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const log = opts.log ?? ((line: string) => console.log(line));
  let fetchedOnce = false;
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

  async function fetchRaw(
    url: string,
    accept: string,
    rawName?: string,
    userAgent?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<string> {
    if (rawName && opts.readRaw) {
      const saved = opts.readRaw(rawName);
      if (saved !== undefined) {
        log(`reading ${rawName}`);
        return saved;
      }
    }
    if (fetchedOnce) await sleep(delayMs);
    fetchedOnce = true;
    log(`fetching ${url}`);
    const res = await fetchImpl(url, {
      headers: { 'user-agent': userAgent ?? opts.userAgent, accept, ...extraHeaders },
    });
    if (!res.ok) {
      throw new Error(`${new URL(url).host} responded ${res.status} for ${url} — not capturing.`);
    }
    // Decode as declared, not as assumed — see decodeResponseBytes. A fake
    // FetchLike with no arrayBuffer() keeps the old text() path.
    const body = res.arrayBuffer
      ? decodeResponseBytes(new Uint8Array(await res.arrayBuffer()), res.headers?.get('content-type'))
      : await res.text();
    if (rawName && opts.saveRaw) opts.saveRaw(rawName, body);
    return body;
  }

  return {
    fetchText: (url, o) =>
      fetchRaw(url, o?.accept ?? 'text/html', o?.rawName, o?.userAgent, o?.headers),
    fetchJson: async (url, o) =>
      JSON.parse(
        await fetchRaw(url, o?.accept ?? 'application/json', o?.rawName, o?.userAgent, o?.headers),
      ),
    fetchBinary: async (url, o) => {
      const rawName = o?.rawName;
      if (rawName && opts.readRaw) {
        const saved = opts.readRaw(rawName);
        if (saved !== undefined) {
          log(`reading ${rawName}`);
          return base64ToBytes(saved);
        }
      }
      if (fetchedOnce) await sleep(delayMs);
      fetchedOnce = true;
      log(`fetching ${url}`);
      const res = await fetchImpl(url, {
        headers: {
          'user-agent': o?.userAgent ?? opts.userAgent,
          accept: o?.accept ?? 'application/octet-stream',
        },
      });
      if (!res.ok) {
        throw new Error(`${new URL(url).host} responded ${res.status} for ${url} — not capturing.`);
      }
      if (!res.arrayBuffer) {
        throw new Error('This FetchLike has no arrayBuffer() — binary capture needs one.');
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (rawName && opts.saveRaw) opts.saveRaw(rawName, bytesToBase64(bytes));
      return bytes;
    },
    log,
  };
}

export interface CaptureReport {
  fetches: number;
  skippedEmpty: string[];
  duplicates: string[];
  warnings: string[];
}

export interface CaptureOutcome {
  file: {
    meta: StateCorpusMeta & Record<string, unknown>;
    sections: Array<StateSection & Record<string, unknown>>;
  };
  report: CaptureReport;
}

export interface StateCaptureProfile {
  /** 'WA' */
  state: string;
  /** 'Washington' */
  displayName: string;
  /** Repo-root-relative path of the committed corpus JSON. */
  corpusPath: string;
  /** The state's tightened schema — validates reads AND writes. */
  corpusFileSchema: { parse(data: unknown): StateCorpusFile };
  /** 'WA-LAW-ATTENTION.txt' — the drift checker's flag file name. */
  attentionFileName: string;
  /** The numbered refresh steps the attention file carries. */
  refreshChecklist: string;
  /** Whether --only <chapter> partial re-capture is supported. */
  supportsOnly?: boolean;
  captureAll(
    io: CaptureIo,
    opts?: {
      /** The served corpus — lets a pipeline skip unchanged content (ARM hashes). */
      previous?: CaptureOutcome['file'];
      /** Chapter filter for a partial re-capture, when supportsOnly. */
      only?: string;
    },
  ): Promise<CaptureOutcome>;
}
