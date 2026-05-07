import { z } from 'zod';

export const InformationProviderSchema = z.enum(['CCC', 'Mitchell', 'Audatex']);
export type InformationProvider = z.infer<typeof InformationProviderSchema>;

export const InquiryStatusSchema = z.enum(['pending', 'resolved', 'closed']);
export type InquiryStatus = z.infer<typeof InquiryStatusSchema>;

export const LaborTypeSchema = z.enum([
  'body',
  'paint',
  'mechanical',
  'frame',
  'refinish',
  'other',
]);
export type LaborType = z.infer<typeof LaborTypeSchema>;

export const DEGInquirySchema = z.object({
  // BaseItem fields
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  lastUpdated: z.coerce.date(),
  metadata: z.record(z.string(), z.unknown()),

  // DEG-specific fields
  inquiryNumber: z.string(),

  // Inferred from text content via classifyIP — null when classifier can't decide
  // (tie or no keyword match). Flag null records for manual review.
  ip: InformationProviderSchema.nullable(),

  // Structured "Inquiry type" page field (e.g. "Refinish Operations", "Body Operations").
  // Distinct from laborType, which is a coarser derived enum.
  inquiryType: z.string().optional(),
  areaOfVehicle: z.string().optional(),

  vehicleYear: z.number().int().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  body: z.string().optional(),

  laborType: LaborTypeSchema.optional(),

  issueSummary: z.string(),
  suggestedAction: z.string().optional(),
  resolution: z.string().optional(),

  status: InquiryStatusSchema,
  submittedAt: z.coerce.date(),
  resolvedAt: z.coerce.date().optional(),
});

export type DEGInquiry = z.infer<typeof DEGInquirySchema>;
