import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * Texas's tightened shapes. Three publishers, eight codes: six statute codes
 * (one per Texas code the manifest touches — the SPA's tcss backend serves
 * whole-chapter HTML per code+chapter), the TAC (SOS Appian portal), and TDI
 * Commissioner's Bulletins. Unlike Colorado's CRS, Texas statutes DO state
 * per-section effective dates — the session-law history notes carry
 * "eff. <Month D, YYYY>" and the newest one wins — so statute citations read
 * "Tex. Ins. Code 1952.301, effective 4/1/2007" rather than an edition.
 * Statute CURRENCY (which legislative session the text reflects) is still
 * corpus-level: meta.txStatutesCurrencyNote, pinned by TX_STATUTES_CURRENCY
 * in identity.ts so a Legislature rollover fails loudly at re-capture.
 */

export const TX_CODES = [
  'Tex. Ins. Code',
  'Tex. Lab. Code',
  'Tex. Occ. Code',
  'Tex. Prop. Code',
  'Tex. Bus. & Com. Code',
  'Tex. Transp. Code',
  '28 TAC',
  'TDI Bulletin',
] as const;
export const TxCodeSchema = z.enum(TX_CODES);
export type TxCode = z.infer<typeof TxCodeSchema>;

export const TX_DOMAINS = ['insurance', 'repair_law', 'employment'] as const;
export const TxDomainSchema = z.enum(TX_DOMAINS);
export type TxDomain = z.infer<typeof TxDomainSchema>;

export const TxSectionSchema = StateSectionSchema.extend({
  code: TxCodeSchema,
  domain: TxDomainSchema,
  /** TAC only: the Appian recordId the rule text was captured from. */
  tacRecordId: z.string().regex(/^\d+$/).optional(),
});
export type TxSection = z.infer<typeof TxSectionSchema>;

export const TxCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('TX'),
  /**
   * The statutes site's own currency sentence, verbatim from
   * api/GetProperty/StatutesCurrentMsg — pinned by TX_STATUTES_CURRENCY.
   */
  txStatutesCurrencyNote: z.string().min(1),
});
export type TxCorpusMeta = z.infer<typeof TxCorpusMetaSchema>;

export const TxCorpusFileSchema = z.object({
  meta: TxCorpusMetaSchema,
  sections: z.array(TxSectionSchema).min(1),
});
export type TxCorpusFile = z.infer<typeof TxCorpusFileSchema>;

export const TxAppliesToSchema = AppliesToSchema;
export type TxAppliesTo = z.infer<typeof TxAppliesToSchema>;
export const TxAnnotationSchema = StateAnnotationSchema;
export type TxAnnotation = z.infer<typeof TxAnnotationSchema>;
export const TxAnnotationsFileSchema = StateAnnotationsFileSchema;
export type TxAnnotationsFile = z.infer<typeof TxAnnotationsFileSchema>;
