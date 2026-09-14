import { z } from 'zod';
import { StateCorpusMetaSchema, StateSectionSchema } from '@repairmcp/state-law';

/**
 * Pennsylvania's tightened shapes. Two publishers, three page shapes, ten
 * codes. Consolidated statutes (Pa.C.S.) and unconsolidated acts (P.S.)
 * come from the Legislature's static mirror (legis.state.pa.us/WU01) as
 * whole-chapter and whole-act pages; the Pennsylvania Code comes from the
 * Legislative Reference Bureau (pacodeandbulletin.gov) as whole-chapter
 * pages — the project owner's decision of 2026-09-14 to fetch it at a 10 s
 * floor despite its blanket robots Disallow (kickoff preface).
 *
 * Dates (kickoff §4): consolidated sections carry the newest history-note
 * EFFECTIVE date (computed from "eff. 60 days" and its kin, or inherited
 * from the subchapter/chapter Enactment note); P.S. sections carry the
 * newest amending act's APPROVAL date, labeled "amended", or the act's own
 * date labeled "enacted" — the page states no effective clause, so the
 * citation says what the page says (`dateKind`); Pa. Code sections carry
 * the newest Source-note effective date, inherited from the chapter-level
 * note when the section has none, silence when neither exists.
 *
 * P.S. numbers are not printed by the Legislature; the manifest asserts
 * them and `actSection` keeps the section number the page does print.
 */
export const PA_CONSOLIDATED_CODES = ['42 Pa.C.S.', '75 Pa.C.S.'] as const;
export const PA_ACT_CODES = ['40 P.S.', '43 P.S.', '63 P.S.', '73 P.S.', '77 P.S.'] as const;
export const PA_PACODE_CODES = ['31 Pa. Code', '34 Pa. Code', '37 Pa. Code'] as const;
export const PA_CODES = [...PA_CONSOLIDATED_CODES, ...PA_ACT_CODES, ...PA_PACODE_CODES] as const;
export const PaCodeSchema = z.enum(PA_CODES);
export type PaCode = z.infer<typeof PaCodeSchema>;
export type PaConsolidatedCode = (typeof PA_CONSOLIDATED_CODES)[number];
export type PaActCode = (typeof PA_ACT_CODES)[number];
export type PaPacodeCode = (typeof PA_PACODE_CODES)[number];

export const PA_DOMAINS = ['insurance', 'repair_law', 'employment'] as const;
export const PaDomainSchema = z.enum(PA_DOMAINS);
export type PaDomain = z.infer<typeof PaDomainSchema>;

export const PA_CAPTURE_SOURCES = ['legis', 'pacode'] as const;
export const PaCaptureSourceSchema = z.enum(PA_CAPTURE_SOURCES);
export type PaCaptureSource = z.infer<typeof PaCaptureSourceSchema>;

const isActCode = (code: string): boolean => (PA_ACT_CODES as readonly string[]).includes(code);

export const PaSectionSchema = StateSectionSchema.extend({
  code: PaCodeSchema,
  domain: PaDomainSchema,
  captureSource: PaCaptureSourceSchema,
  /** 'source' when the page prints a catchline; 'manifest' for the 1915 Workers' Compensation Act, which prints none. */
  headingSource: z.enum(['source', 'manifest']),
  /** P.S. sections only: the act section number the page prints ("5", "2.1", "301"). */
  actSection: z.string().min(1).optional(),
  /** P.S. sections only: what effectiveDate IS — the newest amending act's approval date, or the act's own. */
  dateKind: z.enum(['amended', 'enacted']).optional(),
})
  .refine((s) => isActCode(s.code) === (s.actSection !== undefined), {
    message: 'actSection is present exactly on P.S. (unconsolidated act) sections',
  })
  .refine((s) => isActCode(s.code) === (s.dateKind !== undefined), {
    message: 'dateKind is present exactly on P.S. (unconsolidated act) sections',
  });
export type PaSection = z.infer<typeof PaSectionSchema>;

export const PaCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('PA'),
  /** "56 Pa.B. 4026 (July 4, 2026)" — the LRB's own currency sentence, recorded (it rolls weekly), not pinned. */
  paCodeEffectiveThrough: z.string().min(1),
});
export type PaCorpusMeta = z.infer<typeof PaCorpusMetaSchema>;

export const PaCorpusFileSchema = z.object({
  meta: PaCorpusMetaSchema,
  sections: z.array(PaSectionSchema).min(1),
});
export type PaCorpusFile = z.infer<typeof PaCorpusFileSchema>;
