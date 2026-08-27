import { z } from 'zod';

export const NhtsaAuthorityTypeSchema = z.enum([
  'federal_safety_data',
  'federal_recall_campaign',
  'consumer_complaint',
  'ncap_safety_rating',
]);
export type NhtsaAuthorityType = z.infer<typeof NhtsaAuthorityTypeSchema>;

export const NhtsaVehicleIdentitySchema = z.object({
  vinLast6: z.string().length(6).optional(),
  modelYear: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  trim: z.string().optional(),
  bodyClass: z.string().optional(),
  vehicleType: z.string().optional(),
  plantCountry: z.string().optional(),
  restraintType: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).default({}),
});
export type NhtsaVehicleIdentity = z.infer<typeof NhtsaVehicleIdentitySchema>;

export const NhtsaRecallSchema = z.object({
  campaignNumber: z.string(),
  manufacturer: z.string().optional(),
  component: z.string().optional(),
  summary: z.string().optional(),
  consequence: z.string().optional(),
  remedy: z.string().optional(),
  notes: z.string().optional(),
  reportReceivedDate: z.string().optional(),
  // Stop-drive flags. "Park it" / "park outside" is exactly what a shop doing
  // a pre-delivery recall check must see, so they are first-class fields, not
  // buried in raw.
  parkIt: z.boolean().optional(),
  parkOutSide: z.boolean().optional(),
  overTheAirUpdate: z.boolean().optional(),
  // Only the by-campaign-number endpoint reports this; absent on by-vehicle.
  unitsAffected: z.number().int().optional(),
  sourceUrl: z.string().url(),
});
export type NhtsaRecall = z.infer<typeof NhtsaRecallSchema>;

export const NhtsaComplaintSchema = z.object({
  odiNumber: z.string(),
  modelYear: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  component: z.string().optional(),
  summary: z.string().optional(),
  crash: z.boolean().optional(),
  fire: z.boolean().optional(),
  injuryCount: z.number().int().optional(),
  deathCount: z.number().int().optional(),
  dateComplaintFiled: z.string().optional(),
  sourceUrl: z.string().url(),
  allegationCaveat: z.string(),
});
export type NhtsaComplaint = z.infer<typeof NhtsaComplaintSchema>;

export const NhtsaSafetyRatingVariantSchema = z.object({
  vehicleId: z.number().int(),
  modelYear: z.number().int(),
  make: z.string(),
  model: z.string(),
  vehicleDescription: z.string(),
  sourceUrl: z.string().url(),
});
export type NhtsaSafetyRatingVariant = z.infer<
  typeof NhtsaSafetyRatingVariantSchema
>;

export const NhtsaSafetyRatingDetailSchema = z.object({
  vehicleId: z.number().int(),
  overallRating: z.string().optional(),
  overallFrontCrashRating: z.string().optional(),
  frontCrashDriversideRating: z.string().optional(),
  frontCrashPassengersideRating: z.string().optional(),
  overallSideCrashRating: z.string().optional(),
  rolloverRating: z.string().optional(),
  sidePoleCrashRating: z.string().optional(),
  sourceUrl: z.string().url(),
  raw: z.record(z.string(), z.unknown()).default({}),
});
export type NhtsaSafetyRatingDetail = z.infer<
  typeof NhtsaSafetyRatingDetailSchema
>;

