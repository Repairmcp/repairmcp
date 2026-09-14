import { z } from 'zod';

/**
 * Pennsylvania's topic taxonomy. A topic exists only if THIS corpus can
 * answer for it (the no-dead-topic test in corpus.test.ts enforces that).
 * No safety topics: no state OSHA plan for private employers. Pennsylvania
 * additions: appraiser_conduct (the 62.3 / 63 P.S. 861 headliner: the duty
 * sits on the appraiser's license), betterment (146.8(e)), bad_faith
 * (8371), salvage_title (ch. 11 subch. D), abandoned_vehicle (ch. 73),
 * storage_charges (301.5(4)(iii)), final_paycheck (260.5), liquidated_damages
 * (260.10). Keys are cites; every cite in the manifest is unique across
 * codes (identity.test.ts proves it), so an exact lookup is collision-free.
 */
export const PA_TOPICS = [
  'short_pay', 'fair_settlement', 'steering', 'appraiser_conduct', 'estimate_dispute', 'supplement_handling',
  'prompt_investigation', 'claim_denial', 'misrepresentation', 'aftermarket_parts', 'total_loss', 'valuation_dispute',
  'salvage_title', 'betterment', 'third_party_claims', 'inspection_photos', 'bad_faith', 'repair_facility_choice',
  'estimate_authorization', 'replaced_parts', 'invoice_records', 'storage_charges', 'consumer_protection', 'abandoned_vehicle', 'storage_towing',
  'wage_claims', 'final_paycheck', 'liquidated_damages', 'minimum_wage', 'overtime', 'deductions', 'wage_records', 'workers_comp', 'independent_contractor',
] as const;
export const PaTopicSchema = z.enum(PA_TOPICS);
export type PaTopic = z.infer<typeof PaTopicSchema>;

export const PA_CITE_TOPICS: Record<string, readonly PaTopic[]> = {
  // 31 Pa. Code 146
  '146.1': ['fair_settlement'], '146.2': ['fair_settlement', 'third_party_claims'], '146.3': ['fair_settlement', 'invoice_records'],
  '146.4': ['misrepresentation', 'fair_settlement'], '146.5': ['prompt_investigation', 'fair_settlement'],
  '146.6': ['prompt_investigation', 'fair_settlement', 'supplement_handling'], '146.7': ['claim_denial', 'prompt_investigation', 'fair_settlement', 'short_pay', 'third_party_claims'],
  '146.8': ['fair_settlement', 'estimate_dispute', 'short_pay', 'betterment', 'third_party_claims', 'total_loss', 'valuation_dispute', 'inspection_photos', 'repair_facility_choice'],
  '146.9': ['fair_settlement', 'claim_denial'], '146.10': ['third_party_claims', 'fair_settlement'],
  // 31 Pa. Code 62
  '62.1': ['appraiser_conduct', 'aftermarket_parts'], '62.2': ['appraiser_conduct'],
  '62.3': ['appraiser_conduct', 'steering', 'repair_facility_choice', 'aftermarket_parts', 'total_loss', 'valuation_dispute', 'estimate_dispute', 'supplement_handling', 'inspection_photos', 'storage_towing'],
  // 40 P.S. (UIPA)
  '1171.1': ['fair_settlement'], '1171.2': ['fair_settlement'], '1171.3': ['fair_settlement'], '1171.4': ['fair_settlement', 'misrepresentation'],
  '1171.5': ['fair_settlement', 'claim_denial', 'prompt_investigation', 'short_pay', 'misrepresentation', 'bad_faith'], '1171.9': ['fair_settlement'], '1171.11': ['fair_settlement'],
  // 63 P.S. (Appraiser Act)
  '851': ['appraiser_conduct'], '852': ['appraiser_conduct'], '853': ['appraiser_conduct'], '856': ['appraiser_conduct'], '859': ['appraiser_conduct'], '860': ['appraiser_conduct'],
  '861': ['appraiser_conduct', 'steering', 'repair_facility_choice', 'inspection_photos', 'supplement_handling', 'estimate_dispute'], '862': ['appraiser_conduct'],
  // 42 Pa.C.S. and 75 Pa.C.S. ch. 11
  '8371': ['bad_faith', 'fair_settlement', 'claim_denial', 'short_pay'],
  '1161': ['salvage_title', 'total_loss'], '1162': ['salvage_title'], '1163': ['salvage_title'], '1164': ['salvage_title'], '1165': ['salvage_title'], '1165.1': ['salvage_title'], '1166': ['salvage_title'], '1167': ['salvage_title'],
  // 37 Pa. Code 301 and 73 P.S.
  '301.1': ['consumer_protection'], '301.2': ['consumer_protection', 'misrepresentation'], '301.3': ['consumer_protection', 'replaced_parts'], '301.4': ['consumer_protection'],
  '301.5': ['estimate_authorization', 'replaced_parts', 'invoice_records', 'storage_charges', 'consumer_protection'], '301.6': ['consumer_protection'],
  '201-1': ['consumer_protection'], '201-2': ['consumer_protection', 'misrepresentation'], '201-3': ['consumer_protection'], '201-3.1': ['consumer_protection'], '201-9.2': ['consumer_protection'],
  // 75 Pa.C.S. ch. 73
  '7301': ['abandoned_vehicle', 'storage_towing'], '7304': ['abandoned_vehicle'], '7305': ['abandoned_vehicle'], '7306': ['abandoned_vehicle', 'storage_charges', 'storage_towing'],
  '7307': ['abandoned_vehicle'], '7308': ['abandoned_vehicle'], '7311': ['abandoned_vehicle', 'storage_charges'], '7312': ['abandoned_vehicle'],
  // 43 P.S. (WPCL, MWA), 34 Pa. Code 231 and 9, 77 P.S.
  '260.2a': ['wage_claims'], '260.3': ['wage_claims'], '260.4': ['wage_claims', 'wage_records'], '260.5': ['final_paycheck', 'wage_claims'], '260.6': ['wage_claims'], '260.7': ['wage_claims'],
  '260.8': ['wage_claims'], '260.9a': ['wage_claims', 'liquidated_damages'], '260.10': ['liquidated_damages', 'wage_claims', 'final_paycheck'], '260.11a': ['wage_claims'],
  '333.103': ['minimum_wage', 'overtime', 'independent_contractor'], '333.104': ['minimum_wage', 'overtime'], '333.105': ['overtime', 'minimum_wage'], '333.108': ['wage_records'], '333.112': ['minimum_wage'], '333.113': ['wage_claims', 'minimum_wage', 'overtime'],
  '231.1': ['minimum_wage', 'overtime'], '231.21': ['minimum_wage'], '231.22': ['deductions', 'minimum_wage'], '231.31': ['wage_records'], '231.36': ['wage_records'], '231.37': ['wage_records'],
  '231.41': ['overtime'], '231.42': ['overtime'], '231.43': ['overtime'],
  '9.1': ['deductions', 'wage_claims'], '9.2': ['deductions', 'minimum_wage'], '9.3': ['deductions'],
  '22': ['workers_comp', 'independent_contractor'], '431': ['workers_comp'], '461': ['workers_comp', 'independent_contractor'], '481': ['workers_comp'], '501': ['workers_comp'],
};

/** Exact-key lookup, NOT prefix matching (the NY rule): "22" must not swallow "22x". */
export const baselineTopics = (cite: string): readonly PaTopic[] => PA_CITE_TOPICS[cite] ?? [];
