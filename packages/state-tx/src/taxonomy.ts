import { makePrefixTopicResolver } from '@repairmcp/state-law';
import { z } from 'zod';

/**
 * Texas's topic taxonomy. A topic exists only if THIS corpus can answer for
 * it (the no-dead-topic test enforces that structurally). WA/CO-shared ids
 * carry over where Texas law answers; absent where it does not (no safety
 * topics — no state OSHA plan; no overtime or break topics — Texas has no
 * state overtime or meal/rest break law, and the tool descriptions say so
 * instead of pretending). Texas-specific additions: appraisal (ch. 1813, the
 * 2025 mandatory appraisal chapter) and repair_lien (Prop. Code ch. 70 — the
 * first shipped state to answer "the customer won't pay and the car is
 * sitting here").
 */
export const TX_TOPICS = [
  // Insurance disputes (shared ids)
  'short_pay',
  'fair_settlement',
  'steering',
  'estimate_dispute',
  'supplement_handling',
  'prompt_payment',
  'claim_denial',
  'misrepresentation',
  'aftermarket_parts',
  'total_loss',
  'valuation_dispute',
  'storage_towing',
  'repair_facility_choice',
  // Texas insurance specifics
  'appraisal',
  // Repair / consumer law
  'consumer_protection',
  'repair_lien',
  // Employment
  'final_paycheck',
  'payroll_deductions',
  'wage_claims',
  'minimum_wage',
] as const;

export const TxTopicSchema = z.enum(TX_TOPICS);
export type TxTopic = z.infer<typeof TxTopicSchema>;

/**
 * Baseline topics by cite prefix, longest prefix wins. Statute cites
 * (1952.301), TAC cites (5.501, 21.203), and bulletin cites (B-0031-10)
 * occupy disjoint prefix spaces because the captured chapter numbers are
 * disjoint across codes (see TX_CHAPTER_CODES), so the map cannot collide.
 */
export const TX_CITE_PREFIX_TOPICS: Record<string, readonly TxTopic[]> = {
  '1952.30': ['steering', 'repair_facility_choice', 'aftermarket_parts', 'short_pay'],
  '1813': ['appraisal', 'estimate_dispute', 'valuation_dispute'],
  '542.0': ['prompt_payment', 'supplement_handling', 'short_pay'],
  '541.0': ['fair_settlement', 'misrepresentation', 'claim_denial'],
  '541.1': ['fair_settlement', 'claim_denial'],
  '5.501': ['aftermarket_parts', 'repair_facility_choice', 'steering'],
  '21.20': ['fair_settlement', 'claim_denial'],
  'B-0': ['steering', 'repair_facility_choice', 'fair_settlement'],
  '2303': ['storage_towing'],
  '70.0': ['repair_lien'],
  '17.4': ['consumer_protection', 'misrepresentation'],
  '17.5': ['consumer_protection'],
  '61.0': ['wage_claims'],
  '61.014': ['final_paycheck', 'wage_claims'],
  '61.018': ['payroll_deductions', 'wage_claims'],
  '62.0': ['minimum_wage'],
  '501.091': ['total_loss', 'valuation_dispute'],
} as const;

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export const baselineTopics = makePrefixTopicResolver(TX_CITE_PREFIX_TOPICS) as (
  cite: string,
) => readonly TxTopic[];
