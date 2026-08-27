/**
 * The live-source half of the freshness convention.
 *
 * DEG is a corpus: it has a cutoff, and core's `CorpusFreshness` machinery
 * states it three times. NHTSA's recall/complaint tools are the opposite —
 * every answer is queried from NHTSA at request time, so there is no cutoff
 * to state. What remains of the convention is failure honesty: an NHTSA
 * outage must read as an outage, never as "no records exist", and never as
 * silence. This module is that guarantee, in one place.
 *
 * Deliberately vertical-local, not core: one live vertical does not justify a
 * core abstraction. Promote alongside the second live source if the shape
 * holds (the I-CAR/NHTSA test from CLAUDE.md).
 */
import { NhtsaApiError } from './client.js';

/** Appended to every live tool description; the law tools state corpus freshness instead. */
export const LIVE_SENTENCE =
  'LIVE SOURCE: this tool queries NHTSA’s public data services at request time, so results are as current as NHTSA itself. Every payload carries retrievedAt. If the payload says nhtsaStatus "unavailable", NHTSA did not answer — that is an outage, not an empty result, and you must tell the user NHTSA is unreachable rather than conclude no records exist.';

export interface NhtsaUnavailablePayload {
  nhtsaStatus: 'unavailable';
  note: string;
  httpStatus?: number;
  retrievedAt: string;
  [key: string]: unknown;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function unavailablePayload(error: unknown): NhtsaUnavailablePayload {
  const detail =
    error instanceof NhtsaApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  return {
    nhtsaStatus: 'unavailable',
    note:
      `NHTSA is not answering right now (${detail}). This is an upstream outage, not an ` +
      'empty result — do not conclude that no recalls or complaints exist. Say plainly ' +
      'that NHTSA is unreachable and suggest trying again shortly.',
    ...(error instanceof NhtsaApiError && error.status > 0
      ? { httpStatus: error.status }
      : {}),
    retrievedAt: nowIso(),
  };
}

/**
 * Wrap one upstream call in the never-throw contract: tool handlers switch on
 * `ok` instead of try/catch at every call site, so no handler can forget and
 * let an NhtsaApiError escape as a protocol-level tool error.
 */
export async function callNhtsa<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; payload: NhtsaUnavailablePayload }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, payload: unavailablePayload(error) };
  }
}
