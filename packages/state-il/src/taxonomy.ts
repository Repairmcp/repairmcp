import { z } from 'zod';

/**
 * Illinois's topic taxonomy. A topic exists only if THIS corpus can answer
 * for it (the no-dead-topic test in corpus.test.ts enforces that). Illinois
 * additions: paint_materials_cap (154.6(j) — no other shipped state has the
 * statute), repairer_licensing (5-301 and 154.6(p)/(q)), lienholder_notice
 * (the 45/1.5 and 50/1.5 forfeiture rule), paid_leave (PLAWA), noncompete
 * (the Freedom to Work Act), and the refinishing set (voc_coatings,
 * spray_equipment, work_practices). Keys are DISPLAY cites — every cite in
 * the manifest is unique (identity.test.ts proves it), so an exact lookup is
 * collision-free.
 */
export const IL_TOPICS = [
  'short_pay', 'fair_settlement', 'paint_materials_cap', 'steering', 'repair_facility_choice', 'repairer_licensing', 'estimate_dispute', 'supplement_handling',
  'prompt_investigation', 'claim_denial', 'misrepresentation', 'aftermarket_parts', 'total_loss', 'valuation_dispute',
  'salvage_title', 'betterment', 'third_party_claims', 'storage_charges', 'storage_towing', 'loss_of_use', 'bad_faith',
  'estimate_authorization', 'replaced_parts', 'invoice_records', 'warranty', 'consumer_protection', 'abandoned_vehicle', 'garage_lien', 'lienholder_notice',
  'wage_claims', 'final_paycheck', 'liquidated_damages', 'minimum_wage', 'overtime', 'deductions', 'expense_reimbursement', 'wage_records', 'rest_breaks', 'paid_leave', 'noncompete', 'workers_comp', 'independent_contractor', 'osha',
  'voc_coatings', 'spray_equipment', 'work_practices',
] as const;
export const IlTopicSchema = z.enum(IL_TOPICS);
export type IlTopic = z.infer<typeof IlTopicSchema>;

export const IL_CITE_TOPICS: Record<string, readonly IlTopic[]> = {
  // insurance — statutes
  '215 ILCS 5/143.13': ['fair_settlement'],
  '215 ILCS 5/154.5': ['fair_settlement', 'bad_faith'],
  '215 ILCS 5/154.6': ['fair_settlement', 'paint_materials_cap', 'short_pay', 'estimate_dispute', 'repairer_licensing', 'prompt_investigation', 'claim_denial', 'misrepresentation', 'third_party_claims', 'bad_faith', 'total_loss'],
  '215 ILCS 5/154.7': ['fair_settlement', 'bad_faith'],
  '215 ILCS 5/154.8': ['fair_settlement', 'bad_faith'],
  '215 ILCS 5/154.9': ['total_loss', 'valuation_dispute', 'third_party_claims'],
  '215 ILCS 5/154.10': ['total_loss', 'valuation_dispute'],
  '215 ILCS 5/155': ['bad_faith', 'claim_denial', 'prompt_investigation'],
  '215 ILCS 5/155.29': ['aftermarket_parts', 'estimate_dispute', 'consumer_protection', 'replaced_parts'],
  '215 ILCS 5/424': ['fair_settlement', 'misrepresentation', 'bad_faith'],
  // insurance — Part 919
  '50 Ill. Adm. Code 919.40': ['prompt_investigation', 'fair_settlement', 'claim_denial'],
  '50 Ill. Adm. Code 919.50': ['prompt_investigation', 'claim_denial', 'short_pay', 'fair_settlement', 'third_party_claims'],
  '50 Ill. Adm. Code 919.60': ['fair_settlement', 'claim_denial', 'misrepresentation'],
  '50 Ill. Adm. Code 919.80': ['fair_settlement', 'estimate_dispute', 'short_pay', 'supplement_handling', 'steering', 'repair_facility_choice', 'prompt_investigation', 'claim_denial', 'betterment', 'aftermarket_parts', 'total_loss', 'valuation_dispute', 'storage_charges', 'storage_towing', 'loss_of_use', 'third_party_claims', 'salvage_title'],
  '50 Ill. Adm. Code 919.90': ['storage_towing', 'storage_charges', 'salvage_title', 'third_party_claims', 'claim_denial'],
  '50 Ill. Adm. Code 919.EXHIBIT A': ['total_loss', 'valuation_dispute', 'betterment', 'salvage_title'],
  // repair_law — 815 ILCS 308
  '815 ILCS 308/5': ['consumer_protection'],
  '815 ILCS 308/10': ['aftermarket_parts', 'replaced_parts', 'consumer_protection'],
  '815 ILCS 308/15': ['estimate_authorization', 'estimate_dispute', 'aftermarket_parts', 'storage_charges', 'consumer_protection'],
  '815 ILCS 308/20': ['estimate_authorization', 'consumer_protection'],
  '815 ILCS 308/25': ['estimate_authorization', 'supplement_handling'],
  '815 ILCS 308/30': ['estimate_authorization', 'replaced_parts'],
  '815 ILCS 308/35': ['estimate_authorization'],
  '815 ILCS 308/40': ['invoice_records', 'replaced_parts'],
  '815 ILCS 308/45': ['warranty', 'consumer_protection'],
  '815 ILCS 308/50': ['consumer_protection', 'estimate_authorization'],
  '815 ILCS 308/55': ['invoice_records'],
  '815 ILCS 308/60': ['storage_charges', 'garage_lien', 'estimate_authorization'],
  '815 ILCS 308/65': ['garage_lien', 'estimate_authorization'],
  '815 ILCS 308/70': ['consumer_protection', 'misrepresentation', 'warranty', 'estimate_dispute'],
  '815 ILCS 308/75': ['consumer_protection'],
  '815 ILCS 308/80': ['consumer_protection'],
  // repair_law — 815 ILCS 306
  '815 ILCS 306/10': ['consumer_protection'],
  '815 ILCS 306/15': ['estimate_authorization', 'consumer_protection'],
  '815 ILCS 306/70': ['storage_charges', 'garage_lien'],
  '815 ILCS 306/75': ['garage_lien'],
  '815 ILCS 306/80': ['consumer_protection', 'misrepresentation'],
  '815 ILCS 306/83': ['consumer_protection'],
  '815 ILCS 306/85': ['consumer_protection'],
  '815 ILCS 505/2': ['consumer_protection', 'misrepresentation'],
  '815 ILCS 505/10a': ['consumer_protection'],
  // repair_law — Vehicle Code
  '625 ILCS 5/1-171.3': ['repairer_licensing'],
  '625 ILCS 5/3-117.1': ['salvage_title', 'total_loss'],
  '625 ILCS 5/4-201': ['abandoned_vehicle', 'storage_towing'],
  '625 ILCS 5/4-214': ['abandoned_vehicle', 'storage_charges', 'storage_towing'],
  '625 ILCS 5/5-301': ['repairer_licensing'],
  // repair_law — lien acts
  '770 ILCS 45/1': ['garage_lien', 'storage_charges'],
  '770 ILCS 45/1.5': ['lienholder_notice', 'storage_charges', 'garage_lien'],
  '770 ILCS 45/2': ['garage_lien'],
  '770 ILCS 50/1': ['garage_lien', 'storage_charges'],
  '770 ILCS 50/1.5': ['lienholder_notice', 'storage_charges', 'garage_lien'],
  '770 ILCS 50/2': ['garage_lien', 'abandoned_vehicle'],
  '770 ILCS 50/3': ['garage_lien', 'abandoned_vehicle'],
  // employment
  '820 ILCS 115/2': ['wage_claims'],
  '820 ILCS 115/3': ['wage_claims'],
  '820 ILCS 115/4': ['wage_claims', 'wage_records'],
  '820 ILCS 115/5': ['final_paycheck', 'wage_claims'],
  '820 ILCS 115/9': ['deductions', 'wage_claims'],
  '820 ILCS 115/9.5': ['expense_reimbursement', 'deductions'],
  '820 ILCS 115/14': ['wage_claims', 'liquidated_damages', 'final_paycheck'],
  '820 ILCS 105/3': ['minimum_wage', 'independent_contractor', 'overtime'],
  '820 ILCS 105/4': ['minimum_wage'],
  '820 ILCS 105/4a': ['overtime'],
  '820 ILCS 105/12': ['minimum_wage', 'overtime', 'liquidated_damages', 'wage_claims'],
  '820 ILCS 140/2': ['rest_breaks'],
  '820 ILCS 140/3': ['rest_breaks'],
  '820 ILCS 140/7': ['rest_breaks'],
  '820 ILCS 192/15': ['paid_leave'],
  '820 ILCS 90/10': ['noncompete'],
  '820 ILCS 305/4': ['workers_comp', 'independent_contractor'],
  '820 ILCS 219/15': ['osha'],
  '56 Ill. Adm. Code 300.600': ['wage_claims', 'wage_records'],
  '56 Ill. Adm. Code 300.720': ['deductions'],
  '56 Ill. Adm. Code 300.820': ['deductions'],
  '56 Ill. Adm. Code 300.850': ['deductions', 'expense_reimbursement'],
  '56 Ill. Adm. Code 210.440': ['overtime'],
  // safety
  '35 Ill. Adm. Code 218.103': ['voc_coatings'],
  '35 Ill. Adm. Code 218.780': ['voc_coatings'],
  '35 Ill. Adm. Code 218.782': ['voc_coatings', 'spray_equipment'],
  '35 Ill. Adm. Code 218.784': ['spray_equipment', 'voc_coatings'],
  '35 Ill. Adm. Code 218.786': ['voc_coatings', 'work_practices'],
  '35 Ill. Adm. Code 218.787': ['work_practices'],
  '35 Ill. Adm. Code 219.103': ['voc_coatings'],
  '35 Ill. Adm. Code 219.780': ['voc_coatings'],
  '35 Ill. Adm. Code 219.782': ['voc_coatings', 'spray_equipment'],
  '35 Ill. Adm. Code 219.784': ['spray_equipment', 'voc_coatings'],
  '35 Ill. Adm. Code 219.786': ['voc_coatings', 'work_practices'],
  '35 Ill. Adm. Code 219.787': ['work_practices'],
};

/** Exact-key lookup, NOT prefix matching: "815 ILCS 308/1" must not swallow "815 ILCS 308/15". */
export const baselineTopics = (cite: string): readonly IlTopic[] => IL_CITE_TOPICS[cite] ?? [];
