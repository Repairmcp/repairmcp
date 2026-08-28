import { z } from 'zod';

/**
 * The topic taxonomy: the May branch's 15 insurance-dispute topics, kept
 * verbatim, grown with safety and employment topics for the expanded scope.
 * Topics are routing metadata — they act as hard filters and never contribute
 * to a relevance score (the branch's topic score component was dead code in
 * production and is deliberately not ported; see docs/WA-VERTICAL-KICKOFF.md).
 */
export const WA_TOPICS = [
  // Insurance disputes (the original 15, order preserved from the branch)
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
  'photo_estimate',
  'storage_towing',
  'repair_facility_choice',
  // Repair law
  'repair_lien',
  // WISHA safety
  'spray_booth',
  'respiratory_protection',
  'hazcom',
  'hexavalent_chromium',
  'ppe',
  'safety_program',
  // Employment / HR
  'meal_rest_breaks',
  'overtime',
  'minimum_wage',
  'paid_sick_leave',
  'paid_family_leave',
  'discrimination',
  'workers_comp',
  'minor_workers',
] as const;

export const WaTopicSchema = z.enum(WA_TOPICS);
export type WaTopic = z.infer<typeof WaTopicSchema>;

/**
 * Baseline topics by cite prefix, longest prefix wins. This is what lets the
 * topic filter bite on un-annotated safety/employment sections: a section's
 * topics are the union of its prefix baseline and its hand annotation. Keys
 * are cite prefixes, not chapters, because chapter granularity is too coarse
 * for WAC 296-62 — its captured subsets are hexavalent chromium (-080…) and
 * spray-finishing ventilation (-11019), which are different topics.
 */
export const CITE_PREFIX_TOPICS: Record<string, readonly WaTopic[]> = {
  '284-30': ['fair_settlement'],
  '48.30': ['fair_settlement'],
  '46.71': ['estimate_dispute', 'aftermarket_parts'],
  '60.08': ['repair_lien'],
  '46.55': ['storage_towing'],
  '296-800': ['safety_program'],
  '296-24-370': ['spray_booth'],
  '296-62-080': ['hexavalent_chromium'],
  '296-62-110': ['spray_booth'],
  '296-842': ['respiratory_protection', 'ppe'],
  '296-901': ['hazcom'],
  '49.46': ['minimum_wage', 'overtime', 'paid_sick_leave'],
  '296-126': ['meal_rest_breaks'],
  '49.60': ['discrimination'],
  '50A.05': ['paid_family_leave'],
  '50A.10': ['paid_family_leave'],
  '51.12': ['workers_comp'],
  '51.14': ['workers_comp'],
  '296-125': ['minor_workers'],
};

/** Baseline topics for a cite, by longest matching prefix. Empty when none match. */
export function baselineTopics(cite: string): readonly WaTopic[] {
  let best: readonly WaTopic[] = [];
  let bestLen = -1;
  for (const [prefix, topics] of Object.entries(CITE_PREFIX_TOPICS)) {
    if (cite.startsWith(prefix) && prefix.length > bestLen) {
      best = topics;
      bestLen = prefix.length;
    }
  }
  return best;
}
