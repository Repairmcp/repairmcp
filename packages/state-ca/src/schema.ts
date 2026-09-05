import { z } from 'zod';
import {
  AppliesToSchema,
  StateAnnotationSchema,
  StateAnnotationsFileSchema,
  StateCorpusMetaSchema,
  StateSectionSchema,
} from '@repairmcp/state-law';

/**
 * California's tightened shapes. Three capture surfaces, eight codes: five
 * statute codes from the Legislature's own site (leginfo.legislature.ca.gov,
 * article/chapter text views), three CCR titles — Title 8 (Cal/OSHA) from the
 * Department of Industrial Relations' own HTML, Titles 10 and 16 (and 8 CCR
 * 11090, Wage Order 9) from the Legal Information Institute's mirror of the
 * CCR, because the official CCR publisher (Westlaw, under the OAL contract)
 * answers every non-browser fetch with a bot challenge. Each section says
 * which surface it came from (`captureSource`) so the /legal page's claim
 * about provenance is checkable against the data, not just asserted.
 *
 * California statutes print NO catchlines — leginfo renders a bare "758.5."
 * followed by text — so a statute's `heading` is the manifest's editorial
 * descriptor, never source text. `headingSource` records that; the citation
 * long form prints it in parentheses, and nothing quotes it. Regulation
 * headings are captured from the source.
 *
 * Dates: statutes carry the newest "Effective <date>" (or a later "operative"
 * date) their own history note states; regulations carry the newest operative
 * or effective date in their Register history, including the older "effective
 * thirtieth day thereafter" form computed from the filing date. Neither
 * publisher states a currency marker of its own, so currency is the capture
 * date (the Washington rule) — there is no edition pin to roll over.
 */

export const CA_CODES = [
  'Cal. Ins. Code',
  'Cal. Bus. & Prof. Code',
  'Cal. Lab. Code',
  'Cal. Veh. Code',
  'Cal. Civ. Code',
  '10 CCR',
  '16 CCR',
  '8 CCR',
] as const;
export const CaCodeSchema = z.enum(CA_CODES);
export type CaCode = z.infer<typeof CaCodeSchema>;

export const CA_DOMAINS = ['insurance', 'repair_law', 'safety', 'employment'] as const;
export const CaDomainSchema = z.enum(CA_DOMAINS);
export type CaDomain = z.infer<typeof CaDomainSchema>;

/** Where the text was captured from — the provenance the legal page states. */
export const CA_CAPTURE_SOURCES = ['leginfo', 'dir', 'lii'] as const;
export const CaCaptureSourceSchema = z.enum(CA_CAPTURE_SOURCES);
export type CaCaptureSource = z.infer<typeof CaCaptureSourceSchema>;

export const CaSectionSchema = StateSectionSchema.extend({
  code: CaCodeSchema,
  domain: CaDomainSchema,
  captureSource: CaCaptureSourceSchema,
  /**
   * 'source' when the heading is the publisher's own catchline (every CCR
   * section); 'manifest' when it is our editorial descriptor (every statute —
   * California codes print none). A manifest heading is routing help for the
   * model and a label for the citation long form; it is never source text.
   */
  headingSource: z.enum(['source', 'manifest']),
});
export type CaSection = z.infer<typeof CaSectionSchema>;

export const CaCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('CA'),
});
export type CaCorpusMeta = z.infer<typeof CaCorpusMetaSchema>;

export const CaCorpusFileSchema = z.object({
  meta: CaCorpusMetaSchema,
  sections: z.array(CaSectionSchema).min(1),
});
export type CaCorpusFile = z.infer<typeof CaCorpusFileSchema>;

export const CaAppliesToSchema = AppliesToSchema;
export type CaAppliesTo = z.infer<typeof CaAppliesToSchema>;
export const CaAnnotationSchema = StateAnnotationSchema;
export type CaAnnotation = z.infer<typeof CaAnnotationSchema>;
export const CaAnnotationsFileSchema = StateAnnotationsFileSchema;
export type CaAnnotationsFile = z.infer<typeof CaAnnotationsFileSchema>;
