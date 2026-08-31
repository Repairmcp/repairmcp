/**
 * TDI Commissioner's Bulletin capture: plain HTML pages (the one Texas
 * surface that still is). The manifest pins each bulletin's VERIFIED page
 * URL because the filename does not always match the bulletin number —
 * B-0031-10 lives at 2010/cc30.html, B-0026-11 at 2011/cc25.html (older
 * bulletins used an internal filename scheme). Two tripwires: the page must
 * state its own bulletin number in its h1, and every mustContain needle must
 * appear in the extracted text.
 */
import { decodeEntities, type CaptureIo } from '@repairmcp/state-law';
import type { TxDomain, TxSection } from './schema.js';

export interface TdiBulletinSource {
  /** 'B-0031-10' — the public bulletin number, as printed. */
  cite: string;
  heading: string;
  domain: TxDomain;
  /** The issue date the bulletin states, cross-checked against the page. */
  issueDate: string;
  /** The verified page URL (filename ≠ bulletin number on older bulletins). */
  pageUrl: string;
  mustContain: readonly string[];
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseIssueDate(text: string): string | undefined {
  const match = /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(text);
  if (!match) return undefined;
  const month = MONTHS[match[1]!.toLowerCase()];
  if (!month) return undefined;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
}

export async function captureTdiBulletin(
  io: CaptureIo,
  source: TdiBulletinSource,
): Promise<{ section: TxSection; report: { warnings: string[] } }> {
  const html = await io.fetchText(source.pageUrl, { rawName: `bulletin-${source.cite}.html` });

  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const h1Text = h1 ? decodeEntities(h1[1]!.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
  if (!h1Text.includes(source.cite)) {
    throw new Error(
      `TDI Bulletin ${source.cite}: the page's title reads "${h1Text}" — it does not state the ` +
        'expected bulletin number. The URL may have been reused; verify the manifest.',
    );
  }

  // Content runs from the h1 to the end of the main content region.
  const start = html.indexOf(h1![0]);
  const endMarker = /<\/section>|<\/main>/i.exec(html.slice(start));
  const region = endMarker ? html.slice(start, start + endMarker.index) : html.slice(start);

  const lines = region
    .split(/<\/(?:p|h\d|li|div)>/i)
    .map((piece) => decodeEntities(piece.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
  const text = lines.join('\n');

  for (const needle of source.mustContain) {
    if (!text.includes(needle)) {
      throw new Error(
        `TDI Bulletin ${source.cite}: extracted text does not contain "${needle}" — the page ` +
          'did not extract faithfully. Inspect the saved raw; do not ship a garbled bulletin.',
      );
    }
  }

  // The date line sits directly under the h1; a mismatch with the pinned
  // issue date means the bulletin was reissued — a conscious update, not a
  // silent overwrite.
  const dateLine = lines.slice(1, 4).map(parseIssueDate).find((d) => d !== undefined);
  const warnings: string[] = [];
  if (dateLine && dateLine !== source.issueDate) {
    throw new Error(
      `TDI Bulletin ${source.cite}: the page states issue date ${dateLine} but the manifest ` +
        `pins ${source.issueDate} — reissued upstream; update the manifest consciously.`,
    );
  }
  if (!dateLine) {
    warnings.push(`TDI Bulletin ${source.cite}: no issue date parsed from the page; the pinned date is carried.`);
  }

  return {
    section: {
      cite: source.cite,
      code: 'TDI Bulletin',
      chapter: 'Auto',
      chapterTitle: "TDI Commissioner's Bulletins, Automobile",
      heading: source.heading,
      text,
      effectiveDate: source.issueDate,
      domain: source.domain,
      sourceUrl: source.pageUrl,
    },
    report: { warnings },
  };
}
