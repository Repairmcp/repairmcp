/**
 * The two booklet captures. One fetchBinary each, the %PDF- magic checked
 * on the bytes (a WAF page or a login wall arrives as a cheerful 200),
 * unpdf behind pdf-text.ts, then splitPartText. Cross-checks: the cite
 * list must equal the manifest exactly (order included — a reordered or
 * renumbered booklet fails), every mustContain string must appear, and
 * the CR-82 cover edition and CR 142 amendment date must be readable.
 * The CR-82 edition pin itself lives in identity.ts (NY_CR82_EDITION) and
 * is checked by capture.ts, so a reissue fails loudly and a human reads
 * the diff (the MT/CO/FL edition rule).
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { splitPartText } from './parse-pdf-part.js';
import { extractPdfText } from './pdf-text.js';
import type { NySection } from './schema.js';
import { NY_PDF_PART_SOURCES, readCr82Edition, readPart142EffectiveDate, type NyPdfPartSource } from './sources-parts.js';

function assertPdf(bytes: Uint8Array, label: string): void {
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error(`${label}: the download is not a PDF (it starts "${String.fromCharCode(...bytes.subarray(0, 8)).replace(/[^\x20-\x7e]/g, '.')}") — an error page or a challenge. Inspect the saved raw.`);
  }
}

export async function captureNyPdfParts(
  io: CaptureIo,
  opts: { extractText?: (bytes: Uint8Array) => Promise<string> } = {},
): Promise<{ sections: NySection[]; cr82Edition: string; part142EffectiveDate: string; report: { warnings: string[] } }> {
  if (!io.fetchBinary) throw new Error('PDF capture needs io.fetchBinary — wire makeCaptureIo.');
  const extract = opts.extractText ?? extractPdfText;
  const sections: NySection[] = [];
  let cr82Edition: string | undefined;
  let part142EffectiveDate: string | undefined;

  for (const source of NY_PDF_PART_SOURCES as readonly NyPdfPartSource[]) {
    const label = source.code;
    const bytes = await io.fetchBinary(source.pdfUrl, { rawName: `ny-${source.captureSource}-${source.chapter.replace(/\s+/g, '').toLowerCase()}.pdf.b64`, accept: 'application/pdf' });
    assertPdf(bytes, label);
    const text = await extract(bytes);
    for (const needle of source.mustContain) {
      if (!text.includes(needle)) throw new Error(`${label}: extracted text does not contain "${needle}" — the PDF did not extract faithfully. Do not ship it.`);
    }
    const split = splitPartText(text, source.split);
    const got = split.map((s) => s.cite);
    if (JSON.stringify(got) !== JSON.stringify(source.cites)) {
      throw new Error(`${label}: expected [${source.cites.join(', ')}] but the booklet yields [${got.join(', ')}] — renumbered, reissued, or mis-split. Reconcile the manifest against the booklet.`);
    }
    let effectiveDate: string | undefined;
    let historyNote: string;
    if (source.code === '15 NYCRR') {
      cr82Edition = readCr82Edition(text);
      historyNote = cr82Edition;
    } else {
      part142EffectiveDate = readPart142EffectiveDate(text);
      effectiveDate = part142EffectiveDate;
      historyNote = `As amended Effective ${part142EffectiveDate}`;
    }
    for (const s of split) {
      if (!s.text) throw new Error(`${label} ${s.cite}: empty section body.`);
      sections.push({
        cite: s.cite,
        code: source.code,
        chapter: source.chapter,
        chapterTitle: source.chapterTitle,
        heading: s.heading,
        text: s.text,
        ...(effectiveDate ? { effectiveDate } : {}),
        historyNote,
        domain: source.domain,
        sourceUrl: source.pageUrl,
        captureSource: source.captureSource,
      });
    }
  }
  if (!cr82Edition || !part142EffectiveDate) throw new Error('Both booklets must be captured.');
  return { sections, cr82Edition, part142EffectiveDate, report: { warnings: [] } };
}
