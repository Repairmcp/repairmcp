import { z } from 'zod';
import { StateCorpusMetaSchema, StateSectionSchema } from '@repairmcp/state-law';

/**
 * Illinois's tightened shapes. One publisher (the General Assembly's
 * ilga.gov, which also serves the Administrative Code through the Joint
 * Committee on Administrative Rules), two codes, four domains, three
 * capture surfaces: a whole-act page, an article-range page of one of the
 * two big codes (the Insurance Code, the Vehicle Code), or a whole-Part
 * Administrative Code page.
 *
 * Dates are NOT guaranteed: a statute's source note names Public Acts and
 * carries an effective date only when the Legislature printed one
 * ("P.A. 90-426, eff. 1-1-98." has one; "P.A. 80-926." and "Laws 1921, p.
 * 508." do not) — the silence path is the normal case for pre-1990s acts.
 * An Administrative Code section carries its own Source line's date, or
 * inherits the Part's adoption date when it has never been amended
 * (`dateSource: "part"`).
 *
 * The ILCS database prints some sections in two or more complete versions
 * (a pending amendment, or two Public Acts not yet merged); the capture
 * keeps ONE per the kickoff's decision 4 and records every printed version
 * so the payload never hides that the Legislature printed two.
 */
export const IL_CODES = ['ILCS', 'Ill. Adm. Code'] as const;
export const IlCodeSchema = z.enum(IL_CODES);
export type IlCode = z.infer<typeof IlCodeSchema>;

export const IL_DOMAINS = ['insurance', 'repair_law', 'employment', 'safety'] as const;
export const IlDomainSchema = z.enum(IL_DOMAINS);
export type IlDomain = z.infer<typeof IlDomainSchema>;

export const IL_CAPTURE_SOURCES = ['act', 'article', 'part'] as const;
export const IlCaptureSourceSchema = z.enum(IL_CAPTURE_SOURCES);
export type IlCaptureSource = z.infer<typeof IlCaptureSourceSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const IlPrintedVersionSchema = z.object({
  /** "before amendment by P.A. 104-457", "from P.A. 104-480", or "only version". */
  label: z.string().min(1),
  publicActs: z.array(z.string().min(1)),
  effectiveDate: z.string().regex(ISO_DATE).optional(),
});
export type IlPrintedVersion = z.infer<typeof IlPrintedVersionSchema>;

export const IlSectionSchema = StateSectionSchema.extend({
  code: IlCodeSchema,
  domain: IlDomainSchema,
  captureSource: IlCaptureSourceSchema,
  /** Whether the heading is the printed catchline or the manifest's descriptor (Illinois prints no catchline on many older sections). */
  headingSource: z.enum(['section', 'manifest']),
  /** The source note verbatim: "(Source: P.A. 93-565, eff. 1-1-04.)" inner text, or the Administrative Code Source line, or the Part's SOURCE block when inherited. */
  sourceNote: z.string().min(1),
  /** ILCS only: every Public Act the source note names, in order. */
  publicActs: z.array(z.string().min(1)).optional(),
  /** ILCS codes only: "from Ch. 73, par. 766.6" — the pre-1993 cite, without the parentheses. */
  formerCite: z.string().min(1).optional(),
  /** ILCS only, when the site printed more than one version: every version, in page order. */
  printedVersions: z.array(IlPrintedVersionSchema).min(2).optional(),
  versionNote: z.string().min(1).optional(),
  /** ILCS only: the chosen version's effective date is after the capture date. */
  futureEffective: z.boolean().optional(),
  /** Ill. Adm. Code only: "26 Ill. Reg. 11915". */
  illRegCite: z.string().min(1).optional(),
  /** Ill. Adm. Code only: where the effective date came from. */
  dateSource: z.enum(['section', 'part']).optional(),
})
  .refine((s) => (s.code === 'ILCS') === (s.publicActs !== undefined), {
    message: 'publicActs is present exactly on ILCS sections',
  })
  .refine(
    (s) =>
      s.code === 'ILCS' ||
      (s.formerCite === undefined && s.printedVersions === undefined && s.versionNote === undefined && s.futureEffective === undefined),
    { message: 'formerCite, printedVersions, versionNote, and futureEffective exist only on ILCS sections' },
  )
  .refine((s) => (s.code === 'Ill. Adm. Code') === (s.dateSource !== undefined), {
    message: 'dateSource is present exactly on Ill. Adm. Code sections',
  })
  .refine((s) => s.code === 'Ill. Adm. Code' || s.illRegCite === undefined, {
    message: 'illRegCite exists only on Ill. Adm. Code sections',
  })
  .refine((s) => (s.printedVersions === undefined) === (s.versionNote === undefined), {
    message: 'printedVersions and versionNote travel together',
  })
  .refine((s) => s.dateSource !== 'part' || s.effectiveDate !== undefined, {
    message: 'an inherited date must exist',
  });
export type IlSection = z.infer<typeof IlSectionSchema>;

export const IlDualPrintedSchema = z.object({
  cite: z.string().min(1),
  chosen: z.string().min(1),
  printed: z.array(z.string().min(1)).min(2),
});
export type IlDualPrinted = z.infer<typeof IlDualPrintedSchema>;

export const IlCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('IL'),
  /** The newest per-section effective date in the corpus — ilga.gov states no currency line. */
  newestEffectiveDate: z.string().regex(ISO_DATE),
  /** Every section the site printed in more than one version at capture, and which one this corpus carries. */
  dualPrinted: z.array(IlDualPrintedSchema),
});
export type IlCorpusMeta = z.infer<typeof IlCorpusMetaSchema>;

export const IlCorpusFileSchema = z.object({
  meta: IlCorpusMetaSchema,
  sections: z.array(IlSectionSchema).min(1),
});
export type IlCorpusFile = z.infer<typeof IlCorpusFileSchema>;
