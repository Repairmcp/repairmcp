import { makePrefixTopicResolver } from '@repairmcp/state-law';
import { z } from 'zod';

/**
 * Florida's topic taxonomy. A topic exists only if THIS corpus can answer
 * for it (the no-dead-topic test enforces that structurally). No safety
 * topics: Florida has no state OSHA plan. Florida-specific additions:
 * bad_faith (624.155, the statutory civil remedy no other shipped state
 * pairs with a private right of action this cleanly), settlement_payment
 * (627.4265's 20 days), adjuster_conduct (626.877/.878 and the 69B-220.201
 * ethics rule), glass_claims (627.7288), invoice_records (559.911/.915),
 * whistleblower (448.101–.103), employment_eligibility (448.095), and
 * independent_contractor (440.02's definitions — the 1099-tech question).
 */
export const FL_TOPICS = [
  // Insurance disputes (shared ids)
  'short_pay',
  'fair_settlement',
  'steering',
  'estimate_dispute',
  'supplement_handling',
  'prompt_investigation',
  'claim_denial',
  'misrepresentation',
  'aftermarket_parts',
  'total_loss',
  'valuation_dispute',
  'storage_towing',
  'repair_facility_choice',
  // Florida insurance specifics
  'bad_faith',
  'settlement_payment',
  'adjuster_conduct',
  'glass_claims',
  // Repair law
  'estimate_authorization',
  'replaced_parts',
  'invoice_records',
  'shop_registration',
  'consumer_protection',
  'repair_lien',
  // Employment / HR
  'wage_claims',
  'minimum_wage',
  'overtime',
  'whistleblower',
  'employment_eligibility',
  'workers_comp',
  'independent_contractor',
] as const;

export const FlTopicSchema = z.enum(FL_TOPICS);
export type FlTopic = z.infer<typeof FlTopicSchema>;

/**
 * Baseline topics by cite. Every captured cite gets its own exact key —
 * Florida statute numbers share prefixes across chapters ("559.9" would
 * cover the whole Repair Act, which is fine, but "501.3" would also catch
 * nothing we want), so prefixes are used only for the FAC chapters.
 */
export const FL_CITE_PREFIX_TOPICS: Record<string, readonly FlTopic[]> = {
  // Insurance — Fla. Stat.
  '624.155': ['bad_faith', 'fair_settlement', 'claim_denial', 'short_pay'],
  '626.877': ['adjuster_conduct', 'fair_settlement'],
  '626.878': ['adjuster_conduct', 'fair_settlement'],
  '626.9541': ['fair_settlement', 'misrepresentation', 'claim_denial', 'prompt_investigation', 'short_pay', 'supplement_handling'],
  '626.9743': ['fair_settlement', 'aftermarket_parts', 'total_loss', 'valuation_dispute', 'storage_towing', 'repair_facility_choice', 'steering', 'estimate_dispute', 'short_pay'],
  '627.4265': ['settlement_payment', 'fair_settlement'],
  '627.70131': ['prompt_investigation', 'supplement_handling', 'fair_settlement'],
  '627.7288': ['glass_claims'],
  '319.30': ['total_loss', 'valuation_dispute'],
  // Insurance — Fla. Admin. Code
  '69O-166.021': ['fair_settlement'],
  '69O-166.024': ['prompt_investigation', 'supplement_handling', 'fair_settlement', 'claim_denial'],
  '69B-220.201': ['adjuster_conduct', 'steering', 'misrepresentation', 'estimate_dispute', 'fair_settlement'],
  // Repair law — the Motor Vehicle Repair Act
  '559.901': ['consumer_protection'],
  '559.902': ['consumer_protection', 'shop_registration'],
  '559.903': ['consumer_protection', 'estimate_authorization'],
  '559.904': ['shop_registration'],
  '559.905': ['estimate_authorization', 'consumer_protection'],
  '559.907': ['estimate_authorization', 'consumer_protection'],
  '559.909': ['estimate_authorization', 'supplement_handling', 'replaced_parts', 'repair_lien', 'consumer_protection'],
  '559.911': ['invoice_records', 'replaced_parts', 'aftermarket_parts'],
  '559.915': ['invoice_records'],
  '559.916': ['consumer_protection', 'shop_registration'],
  '559.917': ['repair_lien', 'storage_towing'],
  '559.919': ['repair_lien', 'shop_registration'],
  '559.920': ['consumer_protection', 'misrepresentation', 'estimate_authorization'],
  '559.921': ['consumer_protection', 'repair_lien', 'shop_registration'],
  // Repair law — liens
  '713.58': ['repair_lien', 'storage_towing'],
  '713.585': ['repair_lien', 'storage_towing'],
  '713.78': ['storage_towing', 'repair_lien', 'total_loss'],
  // Repair law — crash parts and FDUTPA
  '501.32': ['aftermarket_parts'],
  '501.33': ['aftermarket_parts', 'estimate_authorization'],
  '501.34': ['aftermarket_parts'],
  '501.204': ['consumer_protection', 'misrepresentation'],
  '501.211': ['consumer_protection'],
  // Employment
  '448.01': ['overtime', 'wage_claims'],
  '448.08': ['wage_claims'],
  '448.095': ['employment_eligibility'],
  '448.101': ['whistleblower'],
  '448.102': ['whistleblower'],
  '448.103': ['whistleblower'],
  '448.110': ['minimum_wage', 'wage_claims'],
  '440.02': ['workers_comp', 'independent_contractor'],
  '440.10': ['workers_comp', 'independent_contractor'],
  '440.105': ['workers_comp'],
  '440.107': ['workers_comp'],
  '440.38': ['workers_comp'],
} as const;

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export const baselineTopics = makePrefixTopicResolver(FL_CITE_PREFIX_TOPICS) as (
  cite: string,
) => readonly FlTopic[];
