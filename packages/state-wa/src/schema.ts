import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * Washington's tightened shapes over the shared state-law schemas. The
 * verbatim-capture discipline lives in @repairmcp/state-law; what is
 * Washington's here is the code enum (WAC/RCW), the domain enum, and the
 * state literal. Exported names are unchanged from before the extraction.
 */

export const WA_CODES = ['WAC', 'RCW'] as const;
export const WaCodeSchema = z.enum(WA_CODES);
export type WaCode = z.infer<typeof WaCodeSchema>;

export const WA_DOMAINS = ['insurance', 'repair_law', 'safety', 'employment'] as const;
export const WaDomainSchema = z.enum(WA_DOMAINS);
export type WaDomain = z.infer<typeof WaDomainSchema>;

export const WaSectionSchema = StateSectionSchema.extend({
  code: WaCodeSchema,
  domain: WaDomainSchema,
});
export type WaSection = z.infer<typeof WaSectionSchema>;

export const WaCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('WA'),
});
export type WaCorpusMeta = z.infer<typeof WaCorpusMetaSchema>;

export const WaCorpusFileSchema = z.object({
  meta: WaCorpusMetaSchema,
  sections: z.array(WaSectionSchema).min(1),
});
export type WaCorpusFile = z.infer<typeof WaCorpusFileSchema>;

export const WaAppliesToSchema = AppliesToSchema;
export type WaAppliesTo = z.infer<typeof WaAppliesToSchema>;

export const WaAnnotationSchema = StateAnnotationSchema;
export type WaAnnotation = z.infer<typeof WaAnnotationSchema>;

export const WaAnnotationsFileSchema = StateAnnotationsFileSchema;
export type WaAnnotationsFile = z.infer<typeof WaAnnotationsFileSchema>;
