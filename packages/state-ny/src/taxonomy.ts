import { z } from 'zod';

/**
 * New York's topic taxonomy. A topic exists only if THIS corpus can answer
 * for it (the no-dead-topic test enforces that). No safety topics: New
 * York has no state OSHA plan for private employers. New York additions:
 * weekly_pay (Lab. Law 191, the headliner), third_party_claims (216.10),
 * dfs_guidance (the guidance code), one_day_rest / meal_periods (161, 162),
 * spread_of_hours (142-2.4), call_in_pay (142-2.3), wage_notice (195).
 */
export const NY_TOPICS = [
  'short_pay', 'fair_settlement', 'steering', 'estimate_dispute', 'supplement_handling', 'prompt_investigation',
  'claim_denial', 'misrepresentation', 'aftermarket_parts', 'total_loss', 'valuation_dispute', 'storage_towing',
  'repair_facility_choice', 'third_party_claims', 'dfs_guidance', 'inspection_photos',
  'estimate_authorization', 'replaced_parts', 'invoice_records', 'shop_registration', 'consumer_protection', 'repair_lien', 'quality_repairs',
  'wage_claims', 'weekly_pay', 'minimum_wage', 'overtime', 'deductions', 'wage_notice', 'meal_periods', 'one_day_rest',
  'spread_of_hours', 'call_in_pay', 'workers_comp', 'independent_contractor',
] as const;
export const NyTopicSchema = z.enum(NY_TOPICS);
export type NyTopic = z.infer<typeof NyTopicSchema>;

/** Exact-cite keys; regulation and guidance cites are keyed by full cite too. */
export const NY_CITE_PREFIX_TOPICS: Record<string, readonly NyTopic[]> = {
  // Ins. Law
  '2601': ['fair_settlement', 'misrepresentation', 'claim_denial', 'prompt_investigation', 'short_pay'],
  '2610': ['steering', 'repair_facility_choice', 'fair_settlement'],
  '3411': ['inspection_photos', 'total_loss', 'valuation_dispute', 'fair_settlement'],
  // 11 NYCRR 216
  '216.0': ['fair_settlement'], '216.1': ['fair_settlement'], '216.2': ['fair_settlement'],
  '216.3': ['misrepresentation', 'fair_settlement'],
  '216.4': ['prompt_investigation', 'supplement_handling', 'fair_settlement'],
  '216.5': ['prompt_investigation', 'claim_denial', 'fair_settlement'],
  '216.6': ['fair_settlement', 'claim_denial', 'short_pay', 'estimate_dispute'],
  '216.7': ['fair_settlement', 'estimate_dispute', 'short_pay', 'supplement_handling', 'aftermarket_parts', 'total_loss', 'valuation_dispute', 'storage_towing', 'prompt_investigation', 'repair_facility_choice', 'inspection_photos'],
  '216.8': ['inspection_photos', 'fair_settlement'], '216.9': ['third_party_claims', 'fair_settlement'],
  '216.10': ['third_party_claims', 'fair_settlement', 'prompt_investigation', 'estimate_dispute'],
  '216.11': ['fair_settlement'], '216.12': ['fair_settlement'],
  // DFS guidance
  'OGC Opinion 01-10-05': ['dfs_guidance', 'total_loss', 'valuation_dispute'],
  'OGC Opinion 02-12-20': ['dfs_guidance', 'fair_settlement'],
  'OGC Opinion 04-06-03': ['dfs_guidance', 'steering', 'repair_facility_choice'],
  'OGC Opinion 06-06-09': ['dfs_guidance', 'fair_settlement'],
  'Circular Letter 11 (1991)': ['dfs_guidance', 'fair_settlement'],
  'Circular Letter 16 (2000)': ['dfs_guidance', 'steering'],
  // Veh. & Traf. Law art. 12-A
  '398': ['shop_registration'], '398-A': ['shop_registration', 'consumer_protection'], '398-B': ['shop_registration'],
  '398-C': ['shop_registration'], '398-D': ['estimate_authorization', 'replaced_parts', 'invoice_records', 'consumer_protection'],
  '398-E': ['shop_registration', 'consumer_protection'], '398-F': ['shop_registration'], '398-G': ['shop_registration'], '398-H': ['shop_registration'],
  // 15 NYCRR 82
  '82.1': ['shop_registration'], '82.2': ['shop_registration', 'estimate_authorization'], '82.3': ['shop_registration'], '82.4': ['shop_registration'],
  '82.5': ['estimate_authorization', 'replaced_parts', 'invoice_records', 'consumer_protection'], '82.6': ['shop_registration', 'consumer_protection'],
  '82.7': ['shop_registration', 'consumer_protection'], '82.8': ['estimate_authorization', 'consumer_protection'], '82.9': ['invoice_records'],
  '82.10': ['consumer_protection'], '82.11': ['shop_registration'], '82.12': ['shop_registration'], '82.13': ['quality_repairs', 'consumer_protection'],
  '82.14': ['shop_registration'], '82.15': ['shop_registration'], '82.16': ['shop_registration'], '82.17': ['shop_registration'],
  '82.18': ['estimate_dispute', 'fair_settlement', 'inspection_photos', 'quality_repairs'], '82.19': ['consumer_protection', 'repair_lien'],
  // Gen. Bus. Law, Lien Law
  '349': ['consumer_protection', 'misrepresentation'], '350': ['consumer_protection', 'misrepresentation'],
  '184': ['repair_lien', 'storage_towing'], '200': ['repair_lien'], '201': ['repair_lien'], '202': ['repair_lien'],
  // Lab. Law
  '160': ['overtime', 'wage_claims'], '161': ['one_day_rest'], '162': ['meal_periods'],
  '190': ['wage_claims', 'weekly_pay'], '191': ['weekly_pay', 'wage_claims'], '193': ['deductions', 'wage_claims'],
  '195': ['wage_notice', 'wage_claims'], '198': ['wage_claims', 'weekly_pay'], '198-C': ['wage_claims'],
  '652': ['minimum_wage', 'wage_claims'], '663': ['wage_claims', 'minimum_wage'],
  // 12 NYCRR 142
  '142-1.1': ['minimum_wage'], '142-2.1': ['minimum_wage'], '142-2.2': ['overtime'], '142-2.3': ['call_in_pay'],
  '142-2.4': ['spread_of_hours'], '142-2.5': ['minimum_wage'], '142-2.6': ['wage_notice'], '142-2.7': ['wage_notice'],
  '142-2.8': ['wage_notice'], '142-2.9': ['wage_claims'], '142-2.10': ['deductions'], '142-2.11': ['minimum_wage'],
  '142-2.12': ['minimum_wage'], '142-2.13': ['minimum_wage'], '142-2.14': ['independent_contractor', 'minimum_wage'],
  '142-2.15': ['wage_claims'], '142-2.16': ['overtime'], '142-2.17': ['spread_of_hours'], '142-2.18': ['spread_of_hours'],
  '142-2.19': ['minimum_wage'], '142-2.20': ['minimum_wage'], '142-2.21': ['minimum_wage'], '142-2.22': ['deductions'], '142-2.23': ['minimum_wage'],
  // Workers' Comp. Law
  '2': ['workers_comp', 'independent_contractor'], '10': ['workers_comp'], '50': ['workers_comp'], '52': ['workers_comp'],
};

/**
 * Exact-key lookup, NOT prefix matching. `makePrefixTopicResolver` from
 * `@repairmcp/state-law` is longest-PREFIX, which would let the bare
 * Workers' Comp. Law key `'2'` swallow `'216.7'`, `'200'`, and `'2610'`.
 * `CorpusProfile.baselineTopics(cite)` receives only the cite, so an exact
 * `Map`-style lookup here is both correct and collision-free.
 */
export const baselineTopics = (cite: string): readonly NyTopic[] => NY_CITE_PREFIX_TOPICS[cite] ?? [];
