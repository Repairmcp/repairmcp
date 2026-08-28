import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * Montana's tightened shapes over the shared state-law schemas. Two bodies
 * of law from two publishers: MCA (statutes, the Legislature at
 * mca.legmt.gov) and ARM (agency rules, the Secretary of State's API at
 * rules.mt.gov). ARM sections carry a real ISO effective date and the API's
 * own SHA-256 content hash; MCA sections carry neither — their currency is
 * the annual MCA edition, stated in meta.mcaEdition and in every citation.
 */

export const MT_CODES = ['MCA', 'ARM'] as const;
export const MtCodeSchema = z.enum(MT_CODES);
export type MtCode = z.infer<typeof MtCodeSchema>;

export const MT_DOMAINS = ['insurance', 'repair_law', 'safety', 'employment'] as const;
export const MtDomainSchema = z.enum(MT_DOMAINS);
export type MtDomain = z.infer<typeof MtDomainSchema>;

export const MtSectionSchema = StateSectionSchema.extend({
  code: MtCodeSchema,
  domain: MtDomainSchema,
  /** ARM only: the API's SHA-256 over the rule document — the drift shortcut. */
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export type MtSection = z.infer<typeof MtSectionSchema>;

export const MtCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('MT'),
  /** "Montana Code Annotated 2025" — extracted from every captured MCA page. */
  mcaEdition: z.string().min(1),
});
export type MtCorpusMeta = z.infer<typeof MtCorpusMetaSchema>;

export const MtCorpusFileSchema = z.object({
  meta: MtCorpusMetaSchema,
  sections: z.array(MtSectionSchema).min(1),
});
export type MtCorpusFile = z.infer<typeof MtCorpusFileSchema>;

export const MtAppliesToSchema = AppliesToSchema;
export type MtAppliesTo = z.infer<typeof MtAppliesToSchema>;

export const MtAnnotationSchema = StateAnnotationSchema;
export type MtAnnotation = z.infer<typeof MtAnnotationSchema>;

export const MtAnnotationsFileSchema = StateAnnotationsFileSchema;
export type MtAnnotationsFile = z.infer<typeof MtAnnotationsFileSchema>;
