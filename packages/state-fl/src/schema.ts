import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * Florida's tightened shapes. Two capture surfaces, two codes: the Florida
 * Statutes from the Legislature's own Online Sunshine site (one page per
 * section) and the Florida Administrative Code from the Department of
 * State's flrules.org (a rule card in HTML, the rule text as a Word
 * document behind it).
 *
 * Florida prints catchlines — "Written motor vehicle repair estimate and
 * disclosure statement required." — so every heading here is source text
 * (no headingSource field, unlike California). Florida prints NO per-section
 * effective dates for statutes: the history note is a session-law list
 * ("s. 1, ch. 80-139; … s. 29, ch. 2024-137") and the currency of the text is
 * the annual EDITION the site states above every page ("The 2026 Florida
 * Statutes", sometimes with a special-session suffix). That edition is
 * corpus-level (meta.statutesEdition, pinned by FL_STATUTES_EDITION) and
 * every statute citation carries it. FAC rules state real effective dates.
 *
 * `facNoticeId` is the Department of State notice id that versions a rule's
 * document on flrules.org (the `tid` in the download URL). It changes with
 * every amendment, which makes it the drift shortcut: an unchanged id skips
 * the document fetch — the Florida analog of Colorado's ccrRuleVersionId.
 */

export const FL_CODES = ['Fla. Stat.', 'Fla. Admin. Code'] as const;
export const FlCodeSchema = z.enum(FL_CODES);
export type FlCode = z.infer<typeof FlCodeSchema>;

export const FL_DOMAINS = ['insurance', 'repair_law', 'employment'] as const;
export const FlDomainSchema = z.enum(FL_DOMAINS);
export type FlDomain = z.infer<typeof FlDomainSchema>;

export const FlSectionSchema = StateSectionSchema.extend({
  code: FlCodeSchema,
  domain: FlDomainSchema,
  /** flrules.org's adopting-notice id for the captured document (FAC only). */
  facNoticeId: z.string().min(1).optional(),
});
export type FlSection = z.infer<typeof FlSectionSchema>;

export const FlCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('FL'),
  /** "The 2026 Florida Statutes" as Online Sunshine prints it — pinned by FL_STATUTES_EDITION. */
  statutesEdition: z.string().min(1),
});
export type FlCorpusMeta = z.infer<typeof FlCorpusMetaSchema>;

export const FlCorpusFileSchema = z.object({
  meta: FlCorpusMetaSchema,
  sections: z.array(FlSectionSchema).min(1),
});
export type FlCorpusFile = z.infer<typeof FlCorpusFileSchema>;

export const FlAppliesToSchema = AppliesToSchema;
export type FlAppliesTo = z.infer<typeof FlAppliesToSchema>;
export const FlAnnotationSchema = StateAnnotationSchema;
export type FlAnnotation = z.infer<typeof FlAnnotationSchema>;
export const FlAnnotationsFileSchema = StateAnnotationsFileSchema;
export type FlAnnotationsFile = z.infer<typeof FlAnnotationsFileSchema>;
