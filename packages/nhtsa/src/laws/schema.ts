import { z } from 'zod';

/**
 * One section of 49 U.S.C. Chapter 301 (Motor Vehicle Safety), captured from
 * the Office of the Law Revision Counsel (uscode.house.gov) — the office that
 * prepares the United States Code. The exact wording IS the product here: an
 * appraiser pastes it into a dispute letter, so the capture pipeline preserves
 * subsection lettering and quotes verbatim and nothing paraphrases.
 */
export const NhtsaLawSectionSchema = z.object({
  /** Section number as printed, e.g. "30122" or "30120A". */
  section: z.string().min(1),
  /** Heading as printed, e.g. "Making safety devices and elements inoperative". */
  heading: z.string().min(1),
  /** e.g. "SUBCHAPTER II", from the OLRC item path. */
  subchapter: z.string().optional(),
  /** Full statute text, subsection lettering preserved, one paragraph per line. */
  text: z.string().min(1),
  /** Stable OLRC per-section URL — the citation link. */
  sourceUrl: z.string().url(),
});
export type NhtsaLawSection = z.infer<typeof NhtsaLawSectionSchema>;

/**
 * The corpus's own statement about how current it is. `currentThrough` and
 * `publicLaw` come from OLRC's embedded `currentthrough:YYYYMMDD_PPP-NN`
 * marker — the source states its own currency, nothing here guesses. The
 * capture script hard-fails if the marker is missing.
 */
export const NhtsaLawCorpusMetaSchema = z.object({
  title: z.literal(49),
  chapter: z.literal(301),
  chapterName: z.string().min(1),
  /** `YYYY-MM-DD` — the date OLRC states the text is current through. */
  currentThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** e.g. "P.L. 119-87" — the last public law reflected in the text. */
  publicLaw: z.string().min(1),
  /** `YYYY-MM-DD` — when we captured it (the corpus "synced" date). */
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Where the capture came from, for audit. */
  sourceUrl: z.string().url(),
});
export type NhtsaLawCorpusMeta = z.infer<typeof NhtsaLawCorpusMetaSchema>;

export const NhtsaLawCorpusFileSchema = z.object({
  meta: NhtsaLawCorpusMetaSchema,
  sections: z.array(NhtsaLawSectionSchema).min(1),
});
export type NhtsaLawCorpusFile = z.infer<typeof NhtsaLawCorpusFileSchema>;
