import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * Colorado's tightened shapes. Three publishers, five codes: CRS (statutes,
 * OLLS whole-title files), three CCR titles (one SOS per-series PDF each — the
 * version the Secretary of State designates official), and the one DOI bulletin. CRS sections carry NO effective date — their
 * currency is the annual edition, stated in meta.crsEdition and every CRS
 * citation. CCR sections always carry a real effective date plus the SOS
 * ruleVersionId their text came from (the drift shortcut). The bulletin
 * carries its issue date.
 */

export const CO_CODES = ['CRS', '3 CCR', '4 CCR', '7 CCR', 'Colorado DOI Bulletin'] as const;
export const CoCodeSchema = z.enum(CO_CODES);
export type CoCode = z.infer<typeof CoCodeSchema>;

export const CO_DOMAINS = ['insurance', 'repair_law', 'employment'] as const;
export const CoDomainSchema = z.enum(CO_DOMAINS);
export type CoDomain = z.infer<typeof CoDomainSchema>;

export const CoSectionSchema = StateSectionSchema.extend({
  code: CoCodeSchema,
  domain: CoDomainSchema,
  /** CCR only: the SOS ruleVersionId the text was captured from. */
  ccrRuleVersionId: z.string().regex(/^\d+$/).optional(),
});
export type CoSection = z.infer<typeof CoSectionSchema>;

export const CoCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('CO'),
  /** "Colorado Revised Statutes 2026" — pinned by CRS_EDITION in identity.ts. */
  crsEdition: z.string().min(1),
  /** The OLLS download index's currency sentence, verbatim. */
  crsCurrencyNote: z.string().min(1),
});
export type CoCorpusMeta = z.infer<typeof CoCorpusMetaSchema>;

export const CoCorpusFileSchema = z.object({
  meta: CoCorpusMetaSchema,
  sections: z.array(CoSectionSchema).min(1),
});
export type CoCorpusFile = z.infer<typeof CoCorpusFileSchema>;

export const CoAppliesToSchema = AppliesToSchema;
export type CoAppliesTo = z.infer<typeof CoAppliesToSchema>;
export const CoAnnotationSchema = StateAnnotationSchema;
export type CoAnnotation = z.infer<typeof CoAnnotationSchema>;
export const CoAnnotationsFileSchema = StateAnnotationsFileSchema;
export type CoAnnotationsFile = z.infer<typeof CoAnnotationsFileSchema>;
