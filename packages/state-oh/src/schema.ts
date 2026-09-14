import { z } from 'zod';
import { StateCorpusMetaSchema, StateSectionSchema } from '@repairmcp/state-law';

/**
 * Ohio's tightened shapes. One publisher (codes.ohio.gov, the Legislative
 * Service Commission), three codes, four domains, two capture surfaces: a
 * section captured from a whole-chapter page or from its own section page
 * (the manifest decides; the text is byte-identical on both — verified
 * 2026-09-14 for 3901.21).
 *
 * Every section has an effective date — the site prints "Effective:" on
 * every ORC section, OAC rule, and Constitution section — so unlike every
 * prior state there is no silence path. ORC sections also print "Latest
 * Legislation:" (the bill that produced the current text); OAC rules print a
 * Supplemental Information block (Authorized By, Amplifies, Five Year Review
 * Date, Prior Effective Dates). A bracketed status note in front of a
 * catchline ("[Governor's veto not reflected; see H.B. 434 status report]")
 * is kept per section and surfaced — see parse-codes.ts.
 */
export const OH_CODES = ['ORC', 'OAC', 'Ohio Const.'] as const;
export const OhCodeSchema = z.enum(OH_CODES);
export type OhCode = z.infer<typeof OhCodeSchema>;

export const OH_DOMAINS = ['insurance', 'repair_law', 'employment', 'safety'] as const;
export const OhDomainSchema = z.enum(OH_DOMAINS);
export type OhDomain = z.infer<typeof OhDomainSchema>;

export const OH_CAPTURE_SOURCES = ['chapter', 'section'] as const;
export const OhCaptureSourceSchema = z.enum(OH_CAPTURE_SOURCES);
export type OhCaptureSource = z.infer<typeof OhCaptureSourceSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const OhSectionSchema = StateSectionSchema.extend({
  code: OhCodeSchema,
  domain: OhDomainSchema,
  /** Required for Ohio: every page states one. */
  effectiveDate: z.string().regex(ISO_DATE),
  captureSource: OhCaptureSourceSchema,
  /** A bracketed note the site prints in front of the catchline, verbatim without the brackets. */
  statusNote: z.string().min(1).optional(),
  /** ORC only: "Senate Bill 40 - 135th General Assembly". */
  latestLegislation: z.string().min(1).optional(),
  /** OAC only, from the Supplemental Information block. */
  authorizedBy: z.string().min(1).optional(),
  amplifies: z.string().min(1).optional(),
  fiveYearReviewDate: z.string().regex(ISO_DATE).optional(),
  priorEffectiveDates: z.array(z.string().regex(ISO_DATE)).optional(),
})
  .refine((s) => (s.code === 'ORC') === (s.latestLegislation !== undefined), {
    message: 'latestLegislation is present exactly on ORC sections',
  })
  .refine(
    (s) => s.code === 'OAC' || (s.authorizedBy === undefined && s.amplifies === undefined && s.fiveYearReviewDate === undefined && s.priorEffectiveDates === undefined),
    { message: 'the Supplemental Information fields exist only on OAC rules' },
  );
export type OhSection = z.infer<typeof OhSectionSchema>;

export const OhCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('OH'),
  /** The newest per-section effective date in the corpus — the only currency signal the site offers (no edition, no "current through"). */
  newestEffectiveDate: z.string().regex(ISO_DATE),
});
export type OhCorpusMeta = z.infer<typeof OhCorpusMetaSchema>;

export const OhCorpusFileSchema = z.object({
  meta: OhCorpusMetaSchema,
  sections: z.array(OhSectionSchema).min(1),
});
export type OhCorpusFile = z.infer<typeof OhCorpusFileSchema>;
