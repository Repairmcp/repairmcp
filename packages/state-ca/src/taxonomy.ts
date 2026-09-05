import { makePrefixTopicResolver } from '@repairmcp/state-law';
import { z } from 'zod';

/**
 * California's topic taxonomy. A topic exists only if THIS corpus can answer
 * for it (the no-dead-topic test enforces that structurally). The shared
 * ids carry over where California law answers; California has a state OSHA
 * plan, so the safety topics return for the first time since Washington,
 * and its employment law is the broadest of any shipped state. California-
 * specific additions: paint_materials (Ins. Code 758.6, the anti-capping
 * section), labor_rate (2695.81, the standardized survey), estimate_
 * authorization (9884.9 / 16 CCR 3353–3354, the written-estimate and
 * additional-authorization rules), repair_standards (16 CCR 3365, OEM or
 * nationally recognized specifications), replaced_parts (9884.10 / 3355),
 * shop_registration (BAR registration and its consequences), piece_rate
 * (Lab. Code 226.2 and Wage Order 9), expense_reimbursement (2802), and
 * commission_pay (2751).
 */
export const CA_TOPICS = [
  // Insurance disputes (shared ids)
  'short_pay',
  'fair_settlement',
  'labor_rate',
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
  // California insurance specifics
  'paint_materials',
  'consumer_rights',
  // Repair law
  'estimate_authorization',
  'repair_standards',
  'replaced_parts',
  'shop_registration',
  'consumer_protection',
  'repair_lien',
  // Cal/OSHA safety
  'spray_booth',
  'respiratory_protection',
  'hazcom',
  'ppe',
  'safety_program',
  'fire_protection',
  // Employment / HR
  'final_paycheck',
  'payroll_deductions',
  'wage_claims',
  'piece_rate',
  'meal_rest_breaks',
  'overtime',
  'minimum_wage',
  'expense_reimbursement',
  'commission_pay',
  'workers_comp',
] as const;

export const CaTopicSchema = z.enum(CA_TOPICS);
export type CaTopic = z.infer<typeof CaTopicSchema>;

/**
 * Baseline topics by cite, longest prefix wins. California cite numbers are
 * unique across codes (identity.ts) but SHARE PREFIXES across codes — "544"
 * (Veh. Code) is a prefix of "5446" (8 CCR) — so every captured cite gets
 * its own exact key and prefixes are used only where a whole family shares
 * a topic and no other code's cite starts the same way.
 */
export const CA_CITE_PREFIX_TOPICS: Record<string, readonly CaTopic[]> = {
  // Ins. Code
  '758': ['storage_towing', 'labor_rate', 'fair_settlement'],
  '758.5': ['steering', 'repair_facility_choice', 'consumer_rights'],
  '758.6': ['paint_materials', 'short_pay', 'estimate_dispute'],
  '790.03': ['fair_settlement', 'misrepresentation', 'claim_denial', 'prompt_investigation'],
  '790.035': ['fair_settlement'],
  '1874.85': ['fair_settlement', 'repair_standards'],
  '1874.86': ['fair_settlement'],
  '1874.87': ['consumer_rights', 'steering', 'repair_facility_choice'],
  // Veh. Code
  '544': ['total_loss', 'valuation_dispute'],
  '11515': ['total_loss'],
  // 10 CCR
  '2695.1': ['fair_settlement'],
  '2695.2': ['fair_settlement'],
  '2695.3': ['fair_settlement', 'prompt_investigation'],
  '2695.4': ['misrepresentation', 'fair_settlement'],
  '2695.5': ['prompt_investigation', 'supplement_handling', 'fair_settlement'],
  '2695.6': ['fair_settlement'],
  '2695.7': ['prompt_investigation', 'claim_denial', 'supplement_handling', 'short_pay', 'fair_settlement'],
  '2695.8': ['total_loss', 'valuation_dispute', 'steering', 'repair_facility_choice', 'aftermarket_parts', 'estimate_dispute', 'short_pay', 'storage_towing', 'fair_settlement'],
  '2695.12': ['fair_settlement'],
  '2695.13': ['fair_settlement'],
  '2695.14': ['fair_settlement'],
  '2695.81': ['labor_rate', 'short_pay', 'estimate_dispute'],
  '2695.85': ['consumer_rights', 'steering', 'repair_facility_choice', 'aftermarket_parts'],
  // Bus. & Prof. Code
  '9875': ['aftermarket_parts'],
  '9875.1': ['aftermarket_parts', 'estimate_authorization'],
  '9875.2': ['aftermarket_parts'],
  '9880.1': ['shop_registration'],
  '9884': ['shop_registration'],
  '9884.7': ['consumer_protection', 'repair_standards', 'estimate_authorization'],
  '9884.8': ['estimate_authorization', 'aftermarket_parts'],
  '9884.9': ['estimate_authorization', 'supplement_handling', 'aftermarket_parts'],
  '9884.10': ['replaced_parts'],
  '9884.11': ['shop_registration'],
  '9884.16': ['shop_registration', 'repair_lien', 'storage_towing'],
  '9884.17': ['shop_registration', 'consumer_protection'],
  '9884.19': ['shop_registration'],
  '9889.50': ['repair_standards'],
  '9889.51': ['shop_registration'],
  '9889.52': ['shop_registration', 'spray_booth'],
  '9889.53': ['shop_registration', 'fair_settlement'],
  // 16 CCR
  '3303': ['shop_registration'],
  '3352': ['estimate_authorization'],
  '3353': ['estimate_authorization', 'aftermarket_parts', 'supplement_handling'],
  '3354': ['estimate_authorization', 'supplement_handling'],
  '3355': ['replaced_parts'],
  '3356': ['estimate_authorization', 'aftermarket_parts'],
  '3357': ['estimate_authorization'],
  '3358': ['shop_registration'],
  '3360': ['repair_standards'],
  '3365': ['repair_standards', 'estimate_dispute', 'short_pay'],
  '3367': ['repair_standards'],
  '3368': ['steering', 'storage_towing', 'consumer_protection'],
  '3371': ['consumer_protection', 'misrepresentation'],
  '3372': ['consumer_protection', 'misrepresentation'],
  '3373': ['consumer_protection'],
  '3374': ['aftermarket_parts', 'consumer_protection'],
  '3375': ['consumer_protection'],
  '3376': ['consumer_protection'],
  // Civ. Code
  '3068': ['repair_lien', 'storage_towing'],
  '3068.1': ['repair_lien', 'storage_towing'],
  '3068.2': ['repair_lien', 'storage_towing'],
  '3071': ['repair_lien'],
  // Lab. Code
  '200': ['wage_claims'],
  '201': ['final_paycheck', 'wage_claims'],
  '202': ['final_paycheck', 'wage_claims'],
  '203': ['final_paycheck', 'wage_claims'],
  '204': ['wage_claims'],
  '221': ['payroll_deductions', 'wage_claims'],
  '224': ['payroll_deductions', 'wage_claims'],
  '226': ['wage_claims'],
  '226.2': ['piece_rate', 'meal_rest_breaks', 'wage_claims'],
  '226.7': ['meal_rest_breaks', 'wage_claims'],
  '510': ['overtime'],
  '512': ['meal_rest_breaks'],
  '1194': ['overtime', 'minimum_wage', 'wage_claims'],
  '2751': ['commission_pay', 'piece_rate'],
  '2802': ['expense_reimbursement', 'payroll_deductions'],
  '3700': ['workers_comp'],
  '3706': ['workers_comp'],
  '6401.7': ['safety_program'],
  // 8 CCR
  '11090': ['piece_rate', 'overtime', 'meal_rest_breaks', 'minimum_wage', 'payroll_deductions', 'expense_reimbursement'],
  '3203': ['safety_program'],
  '3380': ['ppe'],
  '3400': ['safety_program'],
  '5144': ['respiratory_protection', 'ppe'],
  '5153': ['spray_booth', 'respiratory_protection', 'ppe'],
  '5155': ['hazcom', 'respiratory_protection'],
  '5162': ['safety_program', 'ppe'],
  '5194': ['hazcom'],
  '5445': ['spray_booth'],
  '5446': ['spray_booth'],
  '5450': ['spray_booth'],
  '5451': ['spray_booth', 'fire_protection'],
  '5452': ['spray_booth', 'fire_protection'],
  '5453': ['spray_booth'],
  '5461': ['spray_booth', 'hazcom', 'respiratory_protection'],
  '6151': ['fire_protection'],
} as const;

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export const baselineTopics = makePrefixTopicResolver(CA_CITE_PREFIX_TOPICS) as (
  cite: string,
) => readonly CaTopic[];
