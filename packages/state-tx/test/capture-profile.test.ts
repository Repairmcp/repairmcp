import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { TX_BULLETIN_SOURCES, TX_CAPTURE_PROFILE } from '../src/capture.js';
import { TX_STATUTES_CURRENCY } from '../src/identity.js';
import { TX_STATUTE_SOURCES } from '../src/sources-statutes.js';
import { TX_TAC_SOURCES, tacBrowseUrl, tacRuleUrl } from '../src/sources-tac.js';
import { TX_STATUTES_BASE, TX_STATUTES_CURRENCY_URL } from '../src/sources-statutes.js';

/**
 * Full-manifest fixtures for TX_CAPTURE_PROFILE.captureAll. captureAll
 * hardcodes the real TX_STATUTE_SOURCES, TX_TAC_SOURCES and
 * TX_BULLETIN_SOURCES, so these fixtures must satisfy the ENTIRE production
 * manifest: every chapter file with every named cite, every TAC browse page
 * and rule summary, and both bulletins. Shapes are the ones the first real
 * capture found (2026-08-31).
 */

const CURRENCY_BODY =
  'The statutes available on this website are current through the ' +
  `${TX_STATUTES_CURRENCY}. The constitutional provisions found on this website are current ` +
  'through the amendments approved by voters in November 2025.';

function statuteSection(cite: string): string {
  return (
    `<p class="left"><a name="${cite}"></a><a name="1.2"></a></p>` +
    `<p style="text-indent:7ex;" class="left"><a target="_blank" ` +
    `href="https://statutes.capitol.texas.gov/x#${cite}" ` +
    `style="color:inherit;font-weight:bold;">Sec.&nbsp;${cite}.&nbsp;&nbsp;HEADING FOR ${cite}.</a>  (a)  Body for ${cite}.</p>` +
    `<p class="left">Added by Acts 2005, 79th Leg., Ch. 727, Sec. 2, eff. April 1, 2007.</p>`
  );
}

function chapterHtml(cites: readonly string[]): string {
  return `<html><body>${cites.map(statuteSection).join('\n')}</body></html>`;
}

function browseDoc(rules: Array<{ cite: string; heading: string; recordId: string }>): string {
  return JSON.stringify({
    contents: rules.map((rule) => [
      { value: { '#v': `§${rule.cite}` } },
      {
        link: {
          label: rule.heading,
          uri: `https://x/?recordId=${rule.recordId}&interface=VIEW_TAC_SUMMARY`,
        },
      },
    ]),
  });
}

function summaryDoc(cite: string): string {
  const embed = (richText: string): string =>
    JSON.stringify({ protocolVersion: 1, action: 'NEW_VALUE', value: { richText } });
  return JSON.stringify({
    breadcrumb: { '#v': `Rule §${cite}` },
    body: embed(`<p>(a) Rule text for ${cite}.</p>`),
    note: embed(
      `<p><strong>Source Note: </strong>The provisions of this &sect;${cite} adopted to be effective July 12, 1998; amended to be effective October 12, 2006.</p>`,
    ),
  });
}

function bulletinHtml(cite: string, date: string): string {
  return (
    '<html><body><main class="standard wrapper"><section class="mainContent col9">' +
    `<header class="pageHeading underline"><h1 class="pageTitle">Commissioner's Bulletin # ${cite}</h1></header>` +
    `<p>${date} </p>` +
    '<p><strong>Re:</strong> Automobile Repair Facilities</p>' +
    '<p>The purpose of this bulletin is to remind insurers about repair facility choice.</p>' +
    '</section></main><footer>chrome that must not be captured</footer></body></html>'
  );
}

function buildIo(overrides: Record<string, string> = {}): CaptureIo {
  const pages = new Map<string, string>();
  pages.set(TX_STATUTES_CURRENCY_URL, CURRENCY_BODY);
  const byChapter = new Map<string, string[]>();
  for (const source of TX_STATUTE_SOURCES) {
    const key = `${source.abbr}.${source.chapter}`;
    byChapter.set(key, [...(byChapter.get(key) ?? []), ...source.cites]);
  }
  for (const [key, cites] of byChapter) {
    const [abbr, chapter] = key.split('.') as [string, string];
    pages.set(`${TX_STATUTES_BASE}/${abbr}/htm/${abbr}.${chapter}.htm`, chapterHtml(cites));
  }
  let nextRecord = 1000;
  for (const source of TX_TAC_SOURCES) {
    const rules = source.ruleCites.map((cite) => ({
      cite,
      heading: `Heading for ${cite}`,
      recordId: String(nextRecord++),
    }));
    pages.set(tacBrowseUrl(source), browseDoc(rules));
    for (const rule of rules) {
      // The capture stamps today's queryAsDate; mirror it.
      const now = new Date();
      const queryAsDate = `${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}/${now.getUTCFullYear()}`;
      pages.set(tacRuleUrl(rule.recordId, queryAsDate), summaryDoc(rule.cite));
    }
  }
  const dateText: Record<string, string> = {
    'B-0031-10': 'August 2, 2010',
    'B-0026-11': 'June 20, 2011',
  };
  for (const source of TX_BULLETIN_SOURCES) {
    pages.set(source.pageUrl, bulletinHtml(source.cite, dateText[source.cite]!));
  }
  for (const [url, body] of Object.entries(overrides)) pages.set(url, body);

  return {
    async fetchText(url) {
      const body = pages.get(url);
      if (body === undefined) throw new Error(`fake io: no text fixture for ${url}`);
      return body;
    },
    async fetchJson(url) {
      const body = pages.get(url);
      if (body === undefined) throw new Error(`fake io: no json fixture for ${url}`);
      return JSON.parse(body);
    },
    log: () => {},
  };
}

describe('TX_CAPTURE_PROFILE', () => {
  test('is shaped for the registry: TX, real corpus/attention paths, not supportsOnly', () => {
    expect(TX_CAPTURE_PROFILE.state).toBe('TX');
    expect(TX_CAPTURE_PROFILE.corpusPath).toBe('packages/state-tx/data/tx-law-corpus.json');
    expect(TX_CAPTURE_PROFILE.attentionFileName).toBe('TX-LAW-ATTENTION.txt');
    expect(TX_CAPTURE_PROFILE.supportsOnly).toBe(false);
  });

  test('captureAll composes statutes + TAC + bulletins with no overlap, meta carries the currency note', async () => {
    const outcome = await TX_CAPTURE_PROFILE.captureAll(buildIo());

    const statuteCount = TX_STATUTE_SOURCES.reduce((n, s) => n + s.cites.length, 0);
    const tacCount = TX_TAC_SOURCES.reduce((n, s) => n + s.ruleCites.length, 0);
    expect(outcome.file.sections).toHaveLength(statuteCount + tacCount + TX_BULLETIN_SOURCES.length);

    const keys = outcome.file.sections.map((s) => `${s.code}:${s.cite}`);
    expect(new Set(keys).size).toBe(keys.length);

    expect(outcome.file.meta.state).toBe('TX');
    expect(outcome.file.meta.txStatutesCurrencyNote).toContain(TX_STATUTES_CURRENCY);
    expect(outcome.report.warnings).toEqual([]);
  });

  test('TAC sections carry the recordId and the Source Note effective date', async () => {
    const outcome = await TX_CAPTURE_PROFILE.captureAll(buildIo());
    const rule = outcome.file.sections.find((s) => s.cite === '5.501')!;
    expect(rule.tacRecordId).toMatch(/^\d+$/);
    expect(rule.effectiveDate).toBe('2006-10-12');
    expect(rule.sourceUrl).toContain(`recordId=${rule.tacRecordId}`);
  });

  test('a currency rollover is a warning naming the pin, not a silent capture', async () => {
    const outcome = await TX_CAPTURE_PROFILE.captureAll(
      buildIo({
        [TX_STATUTES_CURRENCY_URL]:
          'The statutes available on this website are current through the 90th Legislative Session, 2027.',
      }),
    );
    expect(outcome.report.warnings.some((w) => w.includes('TX_STATUTES_CURRENCY'))).toBe(true);
  });

  test('a bulletin page that no longer states its number hard-fails', async () => {
    await expect(
      TX_CAPTURE_PROFILE.captureAll(
        buildIo({
          [TX_BULLETIN_SOURCES[0]!.pageUrl]: bulletinHtml('B-9999-99', 'August 2, 2010'),
        }),
      ),
    ).rejects.toThrow(/does not state the expected bulletin number/);
  });

  test('a reissued bulletin (date mismatch) hard-fails rather than silently overwriting', async () => {
    await expect(
      TX_CAPTURE_PROFILE.captureAll(
        buildIo({
          [TX_BULLETIN_SOURCES[0]!.pageUrl]: bulletinHtml('B-0031-10', 'January 5, 2027'),
        }),
      ),
    ).rejects.toThrow(/reissued/);
  });

  test('bulletin capture never swallows the site chrome past the content region', async () => {
    const outcome = await TX_CAPTURE_PROFILE.captureAll(buildIo());
    for (const bulletin of outcome.file.sections.filter((s) => s.code === 'TDI Bulletin')) {
      expect(bulletin.text).not.toContain('chrome that must not be captured');
    }
  });
});
