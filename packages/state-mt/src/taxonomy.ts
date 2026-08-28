import { makePrefixTopicResolver } from '@repairmcp/state-law';
import { z } from 'zod';

/**
 * Montana's topic taxonomy. Governed by the platform rule the Washington
 * audit established: a topic exists only if THIS state's corpus can answer
 * for it — and the no-dead-topic test enforces that structurally. So the
 * Washington ids Montana can answer for carry over (cross-state prompting
 * stays consistent), the ones Montana law cannot answer for are absent
 * (no aftermarket-disclosure law, no adult break law, no state technical
 * safety standards — those absences are stated in the tool descriptions,
 * not faked with empty topics), and Montana's own law adds topics no other
 * state has: the WDEA and the estimating-system-integrity clause of MCA
 * 33-18-224.
 */
export const MT_TOPICS = [
  // Insurance disputes (Washington-shared ids)
  'short_pay',
  'fair_settlement',
  'steering',
  'estimate_dispute',
  'supplement_handling',
  'prompt_investigation',
  'claim_denial',
  'misrepresentation',
  'total_loss',
  'valuation_dispute',
  'storage_towing',
  'repair_facility_choice',
  // Montana insurance specifics
  'estimating_system_integrity',
  'prompt_payment',
  'glass_steering',
  'utpa_private_action',
  // Consumer protection / repair law
  'consumer_protection',
  'repair_lien',
  'salvage_title',
  // Safety
  'safety_program',
  // Employment
  'wrongful_discharge',
  'final_paycheck',
  'overtime',
  'minimum_wage',
  'workers_comp',
  'minor_workers',
] as const;

export const MtTopicSchema = z.enum(MT_TOPICS);
export type MtTopic = z.infer<typeof MtTopicSchema>;

/**
 * Baseline topics by cite prefix, longest prefix wins. MCA cites are
 * hyphenated (33-18-201), ARM cites dotted (6.6.1701) — the two spaces
 * cannot collide.
 */
export const MT_CITE_PREFIX_TOPICS: Record<string, readonly MtTopic[]> = {
  '33-18': ['fair_settlement'],
  '33-23': ['total_loss', 'valuation_dispute'],
  '27-1': ['valuation_dispute'],
  '30-14': ['consumer_protection'],
  '6.6': ['fair_settlement'],
  '23.19': ['consumer_protection', 'estimate_dispute'],
  '23.6': ['storage_towing'],
  '71-3': ['repair_lien'],
  '61-12': ['storage_towing'],
  '61-8-9': ['storage_towing'],
  '61-3-2': ['salvage_title'],
  '39-2-9': ['wrongful_discharge'],
  '39-3-2': ['final_paycheck'],
  '39-3-4': ['minimum_wage', 'overtime'],
  '41-2': ['minor_workers'],
  '39-71-15': ['safety_program'],
  '39-71-4': ['workers_comp'],
};

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export const baselineTopics = makePrefixTopicResolver(MT_CITE_PREFIX_TOPICS) as (
  cite: string,
) => readonly MtTopic[];
