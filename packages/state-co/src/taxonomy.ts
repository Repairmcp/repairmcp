import { makePrefixTopicResolver } from '@repairmcp/state-law';
import { z } from 'zod';

/**
 * Colorado's topic taxonomy. A topic exists only if THIS corpus can answer
 * for it (the no-dead-topic test enforces that structurally). WA-shared ids
 * carry over where Colorado law answers; absent where it does not (no
 * safety topics — Colorado has no state OSHA plan; no repair_lien — lien
 * statutes are out of the v1 corpus). Colorado-specific additions:
 * prompt_payment (Reg 5-1-14's 60-day rule), written_estimate and
 * parts_return (the Motor Vehicle Repair Act), payroll_deductions and
 * final_paycheck (the Wage Act), consumer_protection (CCPA).
 */
export const CO_TOPICS = [
  // Insurance disputes (WA-shared ids)
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
  // Colorado insurance specifics
  'prompt_payment',
  'rental_reimbursement',
  // Repair / consumer law
  'consumer_protection',
  'written_estimate',
  'parts_return',
  // Employment (WA-shared where answerable)
  'meal_rest_breaks',
  'overtime',
  'minimum_wage',
  'final_paycheck',
  'payroll_deductions',
] as const;

export const CoTopicSchema = z.enum(CO_TOPICS);
export type CoTopic = z.infer<typeof CoTopicSchema>;

/**
 * Baseline topics by cite prefix, longest prefix wins. CRS cites (10-4-120),
 * CCR cites (702-5-1-14, 723-6-6511, 1103-1-5.2), and the bulletin (B-5.04)
 * occupy disjoint prefix spaces, so the map cannot collide across codes.
 */
export const CO_CITE_PREFIX_TOPICS: Record<string, readonly CoTopic[]> = {
  '10-3-11': ['fair_settlement'],
  '10-3-13': ['aftermarket_parts', 'consumer_protection'],
  '10-4-120': ['steering', 'repair_facility_choice', 'fair_settlement', 'short_pay'],
  '10-4-639': ['total_loss', 'storage_towing'],
  '702-5-1-14': ['prompt_payment', 'supplement_handling'],
  '702-5-2-12': ['fair_settlement', 'consumer_protection'],
  '702-5-2-15': ['total_loss', 'valuation_dispute', 'rental_reimbursement'],
  'B-5': ['fair_settlement', 'steering'],
  '42-9': ['consumer_protection', 'written_estimate'],
  '42-9-106': ['storage_towing', 'written_estimate'],
  '42-9-107': ['aftermarket_parts', 'consumer_protection'],
  '42-9-109': ['parts_return'],
  '6-1': ['consumer_protection', 'misrepresentation'],
  '42-4': ['storage_towing'],
  '723-6': ['storage_towing'],
  '8-4': ['final_paycheck', 'payroll_deductions'],
  '1103-1': ['overtime', 'minimum_wage', 'meal_rest_breaks'],
};

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export const baselineTopics = makePrefixTopicResolver(CO_CITE_PREFIX_TOPICS) as (
  cite: string,
) => readonly CoTopic[];
