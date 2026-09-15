import { z } from 'zod';
import { OH_CONST_CITE } from './sources.js';

/**
 * Ohio's topic taxonomy. A topic exists only if THIS corpus can answer for
 * it (the no-dead-topic test in corpus.test.ts enforces that). Ohio
 * additions: interest (1343.03, the general rate), garage_lien (the ABSENCE
 * stated by 1333.41(E), and the two routes that exist), shop_licensing
 * (4738.01 and 1345.02's license clause), rest_breaks (4109.07, minors
 * only), retaliation (4111.14, 4123.90), and the safety set: vssr,
 * machine_guarding, vehicle_lifts, welding, ppe_respirators, ventilation,
 * air_permits, voc_coatings. Keys are cites; every cite in the manifest is
 * unique across codes (identity.test.ts proves it), so an exact lookup is
 * collision-free.
 */
export const OH_TOPICS = [
  'short_pay', 'fair_settlement', 'steering', 'repair_facility_choice', 'estimate_dispute', 'supplement_handling',
  'prompt_investigation', 'claim_denial', 'misrepresentation', 'aftermarket_parts', 'total_loss', 'valuation_dispute',
  'salvage_title', 'betterment', 'third_party_claims', 'storage_charges', 'bad_faith', 'interest',
  'estimate_authorization', 'replaced_parts', 'invoice_records', 'consumer_protection', 'abandoned_vehicle', 'storage_towing', 'garage_lien', 'shop_licensing',
  'wage_claims', 'final_paycheck', 'liquidated_damages', 'minimum_wage', 'overtime', 'deductions', 'wage_records', 'rest_breaks', 'workers_comp', 'independent_contractor', 'retaliation',
  'vssr', 'machine_guarding', 'vehicle_lifts', 'welding', 'ppe_respirators', 'ventilation', 'air_permits', 'voc_coatings',
] as const;
export const OhTopicSchema = z.enum(OH_TOPICS);
export type OhTopic = z.infer<typeof OhTopicSchema>;

export const OH_CITE_TOPICS: Record<string, readonly OhTopic[]> = {
  // insurance
  '3901.19': ['fair_settlement'], '3901.20': ['fair_settlement', 'misrepresentation'],
  '3901.21': ['fair_settlement', 'misrepresentation', 'third_party_claims'],
  '3901.22': ['fair_settlement', 'bad_faith', 'claim_denial'],
  '1345.81': ['aftermarket_parts', 'estimate_dispute', 'consumer_protection', 'invoice_records'],
  '4505.11': ['salvage_title', 'total_loss'],
  '1343.03': ['interest', 'short_pay'],
  '3901-1-07': ['fair_settlement', 'prompt_investigation', 'claim_denial', 'short_pay', 'misrepresentation', 'third_party_claims'],
  '3901-1-54': ['fair_settlement', 'estimate_dispute', 'short_pay', 'steering', 'repair_facility_choice', 'supplement_handling', 'prompt_investigation', 'claim_denial', 'betterment', 'aftermarket_parts', 'total_loss', 'valuation_dispute', 'storage_charges', 'storage_towing', 'third_party_claims', 'misrepresentation'],
  // repair_law
  '1345.01': ['consumer_protection'], '1345.02': ['consumer_protection', 'misrepresentation', 'shop_licensing'], '1345.03': ['consumer_protection'],
  '1345.09': ['consumer_protection'], '1345.13': ['consumer_protection'],
  '109:4-3-01': ['consumer_protection'],
  '109:4-3-13': ['estimate_authorization', 'replaced_parts', 'invoice_records', 'storage_charges', 'consumer_protection', 'misrepresentation', 'storage_towing'],
  '4505.101': ['abandoned_vehicle', 'garage_lien', 'storage_charges', 'storage_towing'], '4505.104': ['abandoned_vehicle', 'storage_towing'],
  '4513.60': ['abandoned_vehicle', 'garage_lien', 'storage_towing'], '4513.601': ['storage_towing'], '4513.61': ['abandoned_vehicle', 'storage_towing'],
  '4513.62': ['abandoned_vehicle', 'salvage_title'], '4513.63': ['abandoned_vehicle'],
  '1333.41': ['garage_lien', 'storage_charges'], '4738.01': ['shop_licensing', 'salvage_title'],
  // employment
  [OH_CONST_CITE]: ['minimum_wage'],
  '4111.01': ['minimum_wage', 'wage_claims'], '4111.02': ['minimum_wage'], '4111.03': ['overtime', 'minimum_wage'], '4111.031': ['overtime'],
  '4111.08': ['wage_records'], '4111.10': ['overtime', 'wage_claims'], '4111.14': ['minimum_wage', 'wage_records', 'wage_claims', 'retaliation'],
  '4113.15': ['final_paycheck', 'wage_claims', 'liquidated_damages'], '4113.19': ['deductions', 'wage_claims'], '4109.07': ['rest_breaks'],
  '4123.01': ['workers_comp', 'independent_contractor'], '4123.35': ['workers_comp', 'independent_contractor'], '4123.74': ['workers_comp'],
  '4123.75': ['workers_comp', 'independent_contractor'], '4123.77': ['workers_comp', 'independent_contractor'], '4123.90': ['workers_comp', 'retaliation'],
  // safety
  '4121.47': ['vssr', 'workers_comp'], '4123:1-5-01': ['vssr'], '4123:1-5-12': ['vssr', 'machine_guarding'], '4123:1-5-13': ['vssr', 'vehicle_lifts'],
  '4123:1-5-16': ['vssr', 'welding'], '4123:1-5-17': ['vssr', 'ppe_respirators'], '4123:1-5-18': ['vssr', 'ventilation'],
  '3745-31-30': ['air_permits', 'ventilation'], '3745-21-18': ['voc_coatings', 'air_permits'],
};

/** Exact-key lookup, NOT prefix matching: "4123.01" must not swallow "4123.010". */
export const baselineTopics = (cite: string): readonly OhTopic[] => OH_CITE_TOPICS[cite] ?? [];
