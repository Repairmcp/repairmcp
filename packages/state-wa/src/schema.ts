import { z } from 'zod';

/**
 * One section of the Washington Administrative Code or the Revised Code of
 * Washington, captured verbatim from app.leg.wa.gov — the legislature's own
 * publication of current law. The exact wording IS the product: a shop pastes
 * it into a dispute letter or an L&I conversation, so the capture pipeline
 * preserves subsection numbering and quotes verbatim and nothing paraphrases.
 * The May 2026 prototype corpus was model-written paraphrase with legally
 * material drift; this schema exists so that can never ship again.
 */

export const WA_CODES = ['WAC', 'RCW'] as const;
export const WaCodeSchema = z.enum(WA_CODES);
export type WaCode = z.infer<typeof WaCodeSchema>;

export const WA_DOMAINS = ['insurance', 'repair_law', 'safety', 'employment'] as const;
export const WaDomainSchema = z.enum(WA_DOMAINS);
export type WaDomain = z.infer<typeof WaDomainSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const WaSectionSchema = z.object({
  /** Cite as printed in the source anchor, e.g. "284-30-330" or "46.71.025". */
  cite: z.string().min(1),
  code: WaCodeSchema,
  /** Chapter the section came from, e.g. "284-30" or "46.71". */
  chapter: z.string().min(1),
  /** Chapter title from the capture config, eyeball-verified at capture. */
  chapterTitle: z.string().min(1),
  /** Section heading as printed (em dashes and all — this is source text). */
  heading: z.string().min(1),
  /** Full verbatim text, subsection numbering preserved, one paragraph per line. */
  text: z.string().min(1),
  /**
   * The date the CURRENT text of this section took effect — the newest
   * "effective" date in the history note, not the oldest. Absent when the
   * history note carries no effective date (the normal case for RCW, whose
   * notes are session-law citations): silence over a guess.
   */
  effectiveDate: z.string().regex(ISO_DATE).optional(),
  /** The bracketed history note, verbatim (tags stripped), for audit. */
  historyNote: z.string().optional(),
  domain: WaDomainSchema,
  /** The human landing page for this section on leg.wa.gov — the citation link. */
  sourceUrl: z.string().url(),
});
export type WaSection = z.infer<typeof WaSectionSchema>;

/**
 * leg.wa.gov has no self-stated currency marker (unlike OLRC's
 * `currentthrough`). The honest statement is therefore: the legislature's site
 * publishes current law, and we captured it on `capturedAt` — so
 * `currentThrough` and `capturedAt` are the same date, and `sourceNote` says
 * why. If capture ever finds a real currency marker, it goes here instead.
 */
export const WaCorpusMetaSchema = z.object({
  state: z.literal('WA'),
  capturedAt: z.string().regex(ISO_DATE),
  currentThrough: z.string().regex(ISO_DATE),
  sourceNote: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type WaCorpusMeta = z.infer<typeof WaCorpusMetaSchema>;

export const WaCorpusFileSchema = z.object({
  meta: WaCorpusMetaSchema,
  sections: z.array(WaSectionSchema).min(1),
});
export type WaCorpusFile = z.infer<typeof WaCorpusFileSchema>;

export const WaAppliesToSchema = z.enum(['insurers', 'repairers', 'consumers', 'claimants', 'employers', 'employees']);
export type WaAppliesTo = z.infer<typeof WaAppliesToSchema>;

/**
 * Hand-maintained annotation over one captured section, keyed by display cite
 * ("WAC 284-30-330") in wa-annotations.json. Annotations are derived routing
 * metadata, never text: `quoteSafeExcerpts` must be literal substrings of the
 * section's captured text (enforced by WaCorpus at construction and by tests),
 * and an annotation whose key matches no captured section fails loudly — a
 * renumbered section cannot silently orphan its annotation.
 */
export const WaAnnotationSchema = z.object({
  topics: z.array(z.string().min(1)).min(1),
  appliesTo: z.array(WaAppliesToSchema).min(1).optional(),
  claimUseCases: z.array(z.string().min(1)).min(1).optional(),
  quoteSafeExcerpts: z.array(z.string().min(1)).min(1).optional(),
});
export type WaAnnotation = z.infer<typeof WaAnnotationSchema>;

export const WaAnnotationsFileSchema = z.record(z.string().min(1), WaAnnotationSchema);
export type WaAnnotationsFile = z.infer<typeof WaAnnotationsFileSchema>;
