import { z } from 'zod';

/**
 * The state-agnostic shapes every state-law vertical shares. `code` and
 * `domain` are open strings here — each state tightens them via `.extend()`
 * with its own enums (WAC/RCW for Washington, MCA/ARM for Montana), and the
 * state's CorpusProfile enforces membership at corpus construction. The
 * verbatim-capture discipline these shapes exist for is unchanged from the
 * Washington original: the exact wording IS the product, so the capture
 * pipeline preserves subsection numbering and quotes verbatim and nothing
 * paraphrases.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const StateSectionSchema = z.object({
  /** Cite as printed by the source, e.g. "284-30-330", "33-18-201", "6.6.1701". */
  cite: z.string().min(1),
  /** The body of law, e.g. "WAC", "RCW", "MCA", "ARM". States tighten to an enum. */
  code: z.string().min(1),
  /** Chapter the section belongs to, e.g. "284-30", "33-18", "6.6". */
  chapter: z.string().min(1),
  /** Chapter title from the capture config, eyeball-verified at capture. */
  chapterTitle: z.string().min(1),
  /** Heading/catchline as printed — this is source text. */
  heading: z.string().min(1),
  /** Full verbatim text, subsection numbering preserved, one paragraph per line. */
  text: z.string().min(1),
  /**
   * The date the CURRENT text took effect, when the source states one.
   * Absent when it does not (WA's RCW session-law notes, all of MCA):
   * silence over a guess, always.
   */
  effectiveDate: z.string().regex(ISO_DATE).optional(),
  /** The source's own history note, verbatim (tags stripped), for audit. */
  historyNote: z.string().optional(),
  /** Routing domain, e.g. "insurance" — states tighten to their enum. */
  domain: z.string().min(1),
  /** The human landing page for this section — the citation link. */
  sourceUrl: z.string().url(),
});
export type StateSection = z.infer<typeof StateSectionSchema>;

export const StateCorpusMetaSchema = z.object({
  state: z.string().regex(/^[A-Z]{2}$/),
  capturedAt: z.string().regex(ISO_DATE),
  currentThrough: z.string().regex(ISO_DATE),
  sourceNote: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type StateCorpusMeta = z.infer<typeof StateCorpusMetaSchema>;

export const StateCorpusFileSchema = z.object({
  meta: StateCorpusMetaSchema,
  sections: z.array(StateSectionSchema).min(1),
});
export type StateCorpusFile = z.infer<typeof StateCorpusFileSchema>;

/** The shop-law audiences an annotation can address. Not state concepts. */
export const AppliesToSchema = z.enum([
  'insurers',
  'repairers',
  'consumers',
  'claimants',
  'employers',
  'employees',
]);
export type AppliesTo = z.infer<typeof AppliesToSchema>;

/**
 * Hand-maintained annotation over one captured section, keyed by display
 * cite ("WAC 284-30-330", "MCA 33-18-224"). Annotations are derived routing
 * metadata, never text: `quoteSafeExcerpts` must be literal substrings of
 * the section's captured text (enforced by the corpus at construction and by
 * tests), and an annotation whose key matches no captured section fails
 * loudly — a renumbered section cannot silently orphan its annotation.
 */
export const StateAnnotationSchema = z.object({
  topics: z.array(z.string().min(1)).min(1),
  appliesTo: z.array(AppliesToSchema).min(1).optional(),
  claimUseCases: z.array(z.string().min(1)).min(1).optional(),
  quoteSafeExcerpts: z.array(z.string().min(1)).min(1).optional(),
});
export type StateAnnotation = z.infer<typeof StateAnnotationSchema>;

export const StateAnnotationsFileSchema = z.record(z.string().min(1), StateAnnotationSchema);
export type StateAnnotationsFile = z.infer<typeof StateAnnotationsFileSchema>;
