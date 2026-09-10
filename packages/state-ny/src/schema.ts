import { z } from 'zod';
import { StateCorpusMetaSchema, StateSectionSchema } from '@repairmcp/state-law';

/**
 * New York's tightened shapes. Five capture surfaces, ten codes. Statutes
 * come from the Senate's public site (server-rendered, one page per
 * section; the "most recent revision" banner is the effective date and New
 * York prints catchlines, so headings are source text). 15 NYCRR Part 82
 * and 12 NYCRR Part 142 come from the DMV's CR-82 and the DOL's CR 142
 * booklets (official PDFs, read through unpdf behind a dynamic import).
 * 11 NYCRR Part 216 (Regulation 64) comes from the Legal Information
 * Institute's mirror because the official NYCRR publisher (Westlaw) answers
 * every non-browser request with a Cloudflare challenge and DFS hosts no
 * text — the project owner's decision of 2026-09-10 (kickoff preface).
 * DFS guidance (OGC opinions, circular letters) comes from dfs.ny.gov.
 * Each section records which surface it came from (`captureSource`).
 *
 * Dates: statutes carry the Senate's revision date; Reg 64 carries the
 * newest Register `eff.` date LII prints; Part 142 carries the single
 * amendment date its cover states (meta.part142EffectiveDate); Part 82
 * prints NO dates, only the booklet edition (meta.cr82Edition, pinned by
 * NY_CR82_EDITION) — its citations carry the edition, the MT/CO rule.
 * Guidance carries its issue date; a withdrawn letter says so.
 */
export const NY_STATUTE_CODES = [
  'N.Y. Ins. Law',
  'N.Y. Veh. & Traf. Law',
  'N.Y. Gen. Bus. Law',
  'N.Y. Lien Law',
  'N.Y. Lab. Law',
  "N.Y. Workers' Comp. Law",
] as const;
export type NyStatuteCode = (typeof NY_STATUTE_CODES)[number];

export const NY_CODES = [...NY_STATUTE_CODES, '11 NYCRR', '15 NYCRR', '12 NYCRR', 'DFS Guidance'] as const;
export const NyCodeSchema = z.enum(NY_CODES);
export type NyCode = z.infer<typeof NyCodeSchema>;

export const NY_DOMAINS = ['insurance', 'repair_law', 'employment'] as const;
export const NyDomainSchema = z.enum(NY_DOMAINS);
export type NyDomain = z.infer<typeof NyDomainSchema>;

export const NY_CAPTURE_SOURCES = ['senate', 'dmv', 'dol', 'lii', 'dfs'] as const;
export const NyCaptureSourceSchema = z.enum(NY_CAPTURE_SOURCES);
export type NyCaptureSource = z.infer<typeof NyCaptureSourceSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const NySectionSchema = StateSectionSchema.extend({
  code: NyCodeSchema,
  domain: NyDomainSchema,
  captureSource: NyCaptureSourceSchema,
  /** DFS guidance only: whether the Department still stands behind the document. */
  dfsStatus: z.enum(['current', 'withdrawn']).optional(),
  /** DFS guidance only, when withdrawn: the withdrawal date the page states. */
  dfsWithdrawnDate: z.string().regex(ISO_DATE).optional(),
}).refine((s) => (s.dfsStatus === 'withdrawn') === (s.dfsWithdrawnDate !== undefined), {
  message: 'dfsWithdrawnDate is present exactly when dfsStatus is withdrawn',
});
export type NySection = z.infer<typeof NySectionSchema>;

export const NyCorpusMetaSchema = StateCorpusMetaSchema.extend({
  state: z.literal('NY'),
  /** "CR-82 (5/26)" as the DMV booklet cover prints it — pinned by NY_CR82_EDITION. */
  cr82Edition: z.string().min(1),
  /** The one amendment date the CR 142 cover states ("As amended Effective June 24, 2020"). */
  part142EffectiveDate: z.string().regex(ISO_DATE),
});
export type NyCorpusMeta = z.infer<typeof NyCorpusMetaSchema>;

export const NyCorpusFileSchema = z.object({
  meta: NyCorpusMetaSchema,
  sections: z.array(NySectionSchema).min(1),
});
export type NyCorpusFile = z.infer<typeof NyCorpusFileSchema>;
