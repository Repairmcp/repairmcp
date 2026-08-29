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
}>;

export interface CaptureIo {
  /** Fetch a text page (or read it from --from-dir when rawName is known there). */
  fetchText(url: string, opts?: { rawName?: string; accept?: string }): Promise<string>;
  /** Fetch a JSON endpoint; same raw-replay behavior via rawName. */
  fetchJson<T = unknown>(url: string, opts?: { rawName?: string }): Promise<T>;
  /**
   * Fetch raw bytes (DOCX, PDF). Optional so existing structural fakes stay
   * valid; makeCaptureIo always provides it. Raw replay stores base64 under
   * the rawName through the same saveRaw/readRaw as text.
   */
  fetchBinary?(url: string, opts?: { rawName?: string; accept?: string }): Promise<Uint8Array>;
  log(line: string): void;
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

  async function fetchRaw(url: string, accept: string, rawName?: string): Promise<string> {
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
      headers: { 'user-agent': opts.userAgent, accept },
    });
    if (!res.ok) {
      throw new Error(`${new URL(url).host} responded ${res.status} for ${url} — not capturing.`);
    }
    const body = await res.text();
    if (rawName && opts.saveRaw) opts.saveRaw(rawName, body);
    return body;
  }

  return {
    fetchText: (url, o) => fetchRaw(url, o?.accept ?? 'text/html', o?.rawName),
    fetchJson: async (url, o) => JSON.parse(await fetchRaw(url, 'application/json', o?.rawName)),
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
        headers: { 'user-agent': opts.userAgent, accept: o?.accept ?? 'application/octet-stream' },
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
