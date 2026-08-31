/**
 * The statutes capture pipeline: fetch the currency endpoint first (the
 * tripwire — a corpus that cannot state its currency is not captured), fetch
 * each distinct chapter file once, parse, and select per manifest entry.
 * Named cites hard-fail when absent or repealed.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { TX_STATUTES_CURRENCY } from './identity.js';
import {
  parseTxChapterHtml,
  parseTxStatutesCurrency,
  type ParsedTxStatuteSection,
} from './parse-statutes.js';
import type { TxSection } from './schema.js';
import {
  TX_STATUTES_BASE,
  TX_STATUTES_CURRENCY_URL,
  txStatuteSourceUrl,
  type TxStatuteCaptureSource,
} from './sources-statutes.js';

export interface TxStatutesCaptureResult {
  sections: TxSection[];
  currencyNote: string;
  sessionPhrase: string;
  report: { skippedEmpty: string[]; warnings: string[] };
}

export async function captureTxStatutes(
  io: CaptureIo,
  sources: readonly TxStatuteCaptureSource[],
): Promise<TxStatutesCaptureResult> {
  const warnings: string[] = [];

  const currencyBody = await io.fetchText(TX_STATUTES_CURRENCY_URL, {
    rawName: 'tx-statutes-currency.txt',
    accept: 'text/plain',
  });
  const currency = parseTxStatutesCurrency(currencyBody);
  if (currency.sessionPhrase !== TX_STATUTES_CURRENCY) {
    warnings.push(
      `Statutes currency rollover: the site states "${currency.sessionPhrase}" but the package ` +
        `pins "${TX_STATUTES_CURRENCY}" — update TX_STATUTES_CURRENCY in src/identity.ts ` +
        '(the pin test fails until you do).',
    );
  }

  const chapterKeys = [...new Set(sources.map((s) => `${s.abbr}.${s.chapter}`))];
  const parsedByChapter = new Map<string, ParsedTxStatuteSection[]>();
  for (const key of chapterKeys) {
    const [abbr, chapter] = key.split('.') as [string, string];
    const url = `${TX_STATUTES_BASE}/${abbr}/htm/${abbr}.${chapter}.htm`;
    const html = await io.fetchText(url, { rawName: `tx-${abbr}-${chapter}.htm` });
    const parsed = parseTxChapterHtml(html, { chapter });
    warnings.push(...parsed.warnings.map((w) => `${key}: ${w}`));
    parsedByChapter.set(key, parsed.sections);
  }

  const out: TxSection[] = [];
  for (const source of sources) {
    const parsed = parsedByChapter.get(`${source.abbr}.${source.chapter}`)!;
    // Last head wins on a duplicated cite (a dual-printed amendment) — the
    // parser has already warned about it.
    const byCite = new Map(parsed.map((s) => [s.cite, s]));

    for (const cite of source.cites) {
      const section = byCite.get(cite);
      if (!section) {
        throw new Error(
          `${source.code} ${cite} was requested by name but is absent from the ` +
            `${source.abbr}.${source.chapter} chapter file — renumbered or repealed upstream; ` +
            'reconcile the manifest consciously.',
        );
      }
      if (section.repealed) {
        throw new Error(
          `${source.code} ${cite} was requested by name but its catchline reads Repealed.`,
        );
      }
      out.push({
        cite: section.cite,
        code: source.code,
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: section.heading,
        text: section.text,
        ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
        ...(section.historyNote ? { historyNote: section.historyNote } : {}),
        domain: source.domain,
        sourceUrl: txStatuteSourceUrl(source.abbr, source.chapter),
      });
    }
  }

  return {
    sections: out,
    currencyNote: currency.currencyNote,
    sessionPhrase: currency.sessionPhrase,
    report: { skippedEmpty: [], warnings },
  };
}
