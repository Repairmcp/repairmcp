/**
 * The statutes pipeline: one Senate page per manifest cite at the io-wide
 * pause. The Senate site sits behind Cloudflare and answered one transient
 * 403 during the 2026-09-10 probe; a 403/429/5xx is retried ONCE after a
 * backoff and a second failure fails the run — a partial corpus is never
 * written (kickoff §3.1). Every page is cross-checked: the headline cite
 * against the manifest, the body lead against the headline (parser), and
 * the location line's ARTICLE against the manifest's chapter.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseSenateHtml } from './parse-senate.js';
import type { NySection } from './schema.js';
import { senateSectionUrl, type NyStatuteCaptureSource } from './sources-statutes.js';

export const SENATE_RETRY_DELAY_MS = 30_000;

export function statuteRawName(lawId: string, cite: string): string {
  return `ny-${lawId.toLowerCase()}-${cite.toUpperCase()}.html`;
}

/** "Insurance (ISC) CHAPTER 28, ARTICLE 26" → "art. 26"; "…, ARTICLE 12-A" → "art. 12-A". */
export function articleFromLocation(location: string): string {
  const m = /\bARTICLE\s+([0-9]+(?:-[A-Z]+)?)\b/.exec(location);
  if (!m) throw new Error(`No ARTICLE token in the location line "${location}".`);
  return `art. ${m[1]}`;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export async function captureNyStatutes(
  io: CaptureIo,
  sources: readonly NyStatuteCaptureSource[],
  opts: { retryDelayMs?: number } = {},
): Promise<{ sections: NySection[]; report: { warnings: string[] } }> {
  const warnings: string[] = [];
  const out: NySection[] = [];
  const retryDelayMs = opts.retryDelayMs ?? SENATE_RETRY_DELAY_MS;

  for (const source of sources) {
    for (const cite of source.cites) {
      const url = senateSectionUrl(source.lawId, cite);
      const label = `${source.code} ${cite}`;
      const rawName = statuteRawName(source.lawId, cite);
      let html: string;
      try {
        html = await io.fetchText(url, { rawName });
      } catch (first) {
        const msg = (first as Error).message;
        if (!/responded (403|429|5\d\d)/.test(msg)) throw first;
        io.log(`  ${label}: ${msg} — retrying once after ${retryDelayMs} ms`);
        await sleep(retryDelayMs);
        html = await io.fetchText(url, { rawName });
        warnings.push(`${label}: retried once after a transient block (${msg}).`);
      }
      let parsed;
      try {
        parsed = parseSenateHtml(html);
      } catch (err) {
        throw new Error(`${label}: ${(err as Error).message}`);
      }
      if (parsed.cite !== cite.toUpperCase()) {
        throw new Error(`${label}: the page prints section ${parsed.cite} — the URL delivered a different section.`);
      }
      const article = articleFromLocation(parsed.location);
      if (article !== source.chapter) {
        throw new Error(
          `${label}: the page sits in ${article} ("${parsed.location}") but the manifest expects ${source.chapter}. Correct the manifest after reading the page.`,
        );
      }
      out.push({
        cite: parsed.cite,
        code: source.code,
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: parsed.heading,
        text: parsed.text,
        effectiveDate: parsed.revisionDate,
        historyNote: `Viewing most recent revision (from ${parsed.revisionDate})`,
        domain: source.domain,
        sourceUrl: url,
        captureSource: 'senate',
      });
    }
  }
  return { sections: out, report: { warnings } };
}
