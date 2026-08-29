/**
 * DOI bulletin capture: one PDF, text-extracted, served as one section.
 * A bulletin is guidance, not law — the tool descriptions and annotations
 * say so; this module just captures it verbatim. unpdf loads via dynamic
 * import so no bundle path ever pulls it (this module is not in the barrel
 * anyway, same as every capture-* module). mustContain is the extraction
 * tripwire: PDF text extraction can silently garble, and a bulletin that
 * cannot state its own number did not extract.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import type { CoDomain, CoSection } from './schema.js';

export interface BulletinSource {
  cite: string;
  heading: string;
  chapter: string;
  chapterTitle: string;
  domain: CoDomain;
  /** The issue/reissue date the bulletin states. */
  effectiveDate: string;
  pdfUrl: string;
  /** The human landing page — becomes sourceUrl. */
  pageUrl: string;
  /** Extraction-fidelity tripwire: all must appear in the extracted text. */
  mustContain: readonly string[];
}

async function defaultExtractText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : String(text);
}

export async function captureBulletin(
  io: CaptureIo,
  source: BulletinSource,
  opts: { extractText?: (bytes: Uint8Array) => Promise<string> } = {},
): Promise<{ section: CoSection; report: { warnings: string[] } }> {
  if (!io.fetchBinary) {
    throw new Error('Bulletin capture needs io.fetchBinary (PDF) — wire makeCaptureIo.');
  }
  const extract = opts.extractText ?? defaultExtractText;
  const bytes = await io.fetchBinary(source.pdfUrl, {
    rawName: `bulletin-${source.cite}.pdf.b64`,
    accept: 'application/pdf',
  });
  const raw = await extract(bytes);
  const text = raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  for (const needle of source.mustContain) {
    if (!text.includes(needle)) {
      throw new Error(
        `Bulletin ${source.cite}: extracted text does not contain "${needle}" — the PDF did not ` +
          'extract faithfully. Inspect the saved raw; do not ship a garbled bulletin.',
      );
    }
  }

  return {
    section: {
      cite: source.cite,
      code: 'Colorado DOI Bulletin',
      chapter: source.chapter,
      chapterTitle: source.chapterTitle,
      heading: source.heading,
      text,
      effectiveDate: source.effectiveDate,
      domain: source.domain,
      sourceUrl: source.pageUrl,
    },
    report: { warnings: [] },
  };
}
