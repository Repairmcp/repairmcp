/**
 * Pennsylvania's four pa_* tools: the descriptions (the model's routing
 * signal) plus the PA config handed to the shared builders. The KNOWN
 * CAVEATS paragraph is deliberate product surface: Pennsylvania law's honest
 * absences (kickoff §2.4) must be answered honestly, not filled in from
 * model memory.
 */
import type { RepairMCPServer, ToolRegistrar } from '@repairmcp/core';
import {
  buildFindSupportingAuthorityTool,
  buildGetAuthorityTool,
  buildRebuttalPacketTool,
  buildSearchAuthorityTool,
  registerStateTools,
  type StateToolsConfig,
} from '@repairmcp/state-law';
import type { PaItem } from './adapter.js';
import type { PaCorpus } from './corpus.js';
import { paStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { PA_DOMAINS, PaDomainSchema } from './schema.js';
import { PA_TOPICS, PaTopicSchema } from './taxonomy.js';

const PA_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: Pennsylvania's Unfair Insurance Practices Act (40 P.S. 1171.5) carries NO private right of action (D'Ambrosio v. Pennsylvania National Mutual, Pa. 1981) — enforcement is the Insurance Commissioner's (1171.9, 1171.11) and 31 Pa. Code Chapter 146 defines the unfair claims settlement practices; the private bad-faith remedy is 42 Pa.C.S. 8371 (interest at prime plus 3 percent, punitive damages, costs and fees) and it belongs to the INSURED — a third-party claimant has no 8371 claim against the other driver's insurer. There is NO labor rate survey rule and NO paint-and-materials rule; 31 Pa. Code 146.8(d) is the standard (an insurer's appraisal must be an amount for which the damage can reasonably be expected to be repaired) with (f) restoration to pre-loss condition and (g) no cash settlement below repair cost. There is NO standalone aftermarket crash parts statute; the disclosure duty is 31 Pa. Code 62.3(c)(10)-(11) on the appraiser. Total loss is the 62.3(e) FORMULA (repair cost exceeds appraised value less salvage value), not a percentage. Pennsylvania has NO statutory garagekeeper's lien in usable form (the 1863 act is partly repealed and not served by the Legislature) — the possessory lien is common law and a question for counsel; 75 Pa.C.S. Chapter 73 (report, notice, costs, sale) is the statutory route. Pennsylvania licenses the APPRAISER (63 P.S. 853), not the body shop; shop conduct is 37 Pa. Code Chapter 301 under the Consumer Protection Law. No Insurance Department guidance on steering, parts, or total loss exists (checked 2026-09-14). Pennsylvania has NO state OSHA plan for private employers (federal OSHA governs the spray booth), NO adult meal or rest break statute, and a minimum wage at the federal $7.25; the 2020 salary threshold for overtime exemption was repealed in 2021. Statutes state no statewide currency line: consolidated citations carry the effective date computed from the section's history note, P.S. citations carry the amending act's approval date ("amended") or the act's own date ("enacted") because the page states no effective clause, and Pennsylvania Code citations carry the Source-note effective date (silence when none exists, as for 37 Pa. Code 301.3, 301.5, 301.6). The Pennsylvania Code was fetched from the official site at a 10-second pace despite its robots.txt, by the project owner's decision; the site's own "changes effective through" sentence is in corpusNote.`;

const PA_SEARCH_AUTHORITY_DESCRIPTION = `Search Pennsylvania state law for collision repair facilities: insurance claims handling (31 Pa. Code 62.3 — the appraiser may not name a repair shop without disclosing there is no requirement to use it, must review the appraisal with the shop the consumer chose, consumer consent before moving the car, aftermarket crash parts disclosure, the total loss formula and the guide-source, actual-cost, and dealer-quotation methods, salvage value disclosure; 63 P.S. 861 — no appraiser or employer may require repairs at a specified shop, inspection within six working days, disputed supplements need a personal inspection; 31 Pa. Code 146.5 acknowledgment within 10 working days, 146.6 investigation within 30 days, 146.7 acceptance or denial within 15 working days and the denial-must-cite-the-provision rule, 146.8 the automobile standards — no pushing a third-party claimant onto their own policy, no unreasonable travel, an appraisal the car can actually be repaired for, documented betterment, restoration to pre-loss condition, no cash settlement below repair cost; 40 P.S. 1171.5 the unfair claims catalog with no private right of action; 42 Pa.C.S. 8371 bad faith; 75 Pa.C.S. 1161 through 1167 salvage certificates and reconstructed vehicles), the shop's own obligations (37 Pa. Code 301.5 — the written record before work, no charging for unauthorized repairs, the oral-authorization record, posted disclosures for parts return, new/used/rebuilt parts, storage charges, and estimate fees, the 24-hour rule, free correction of defective work, the itemized invoice; 73 P.S. 201-2, 201-3, 201-9.2 the Consumer Protection Law and its private action), holding and disposing of a car (75 Pa.C.S. 7311 the garage keeper's 15-day report, 7305 notice, 7306 the reclaiming party pays towing and storage, 7307 and 7308 disposal and public sale), and employment rules (43 P.S. 260.5 final wages by the next payday, 260.10 liquidated damages of 25 percent or $500 on wages 30 days late, 260.3, 260.4, 260.9a; 43 P.S. 333.104 minimum wage and overtime with 34 Pa. Code 231.41 through 231.43; 231.21 the minimum wage regardless of piece-rate or commission pay; 34 Pa. Code 9.1 authorized deductions; 77 P.S. 22, 431, 461, 481, 501 workers' compensation).

USE THIS WHEN:
- A Pennsylvania claim issue needs the actual rule text: steering or a named shop on the appraisal, an appraisal written too low to repair, betterment, aftermarket parts, total loss valuation, salvage value, acknowledgment and investigation timing, a denial with no reason, a third-party claimant pushed onto their own policy, bad faith.
- A shop obligation or leverage question: written authorization, the oral-authorization record, parts return, storage-charge posting, the invoice, the 24-hour rule, a car never picked up, deceptive practices.
- An HR question: a tech's final paycheck, wages paid late, overtime for a salaried estimator or flat-rate tech, deductions for a comeback, records and pay statements, 1099 technicians and workers' compensation.
- You have a citation like "31 Pa. Code 62.3", "63 P.S. 861", "42 Pa.C.S. 8371", "43 P.S. 260.5", "Chapter 146", "UIPA", "Appraiser Act", or "WPCL" and want it directly.

${PA_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, the effective, amended, or enacted date, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const PA_GET_AUTHORITY_DESCRIPTION = `Fetch one Pennsylvania law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL and the effective, amended, or enacted date for a specific section.

INPUT: A citation in any common form: "31 Pa. Code 62.3", "31 Pa. Code § 146.8", "63 P.S. 861", "43 P.S. § 260.5", "42 Pa.C.S. § 8371", "75 Pa.C.S. 7311", "73 P.S. 201-9.2", "section 11 of the Appraiser Act", "UIPA § 5", "WPCL section 10", or an id like "31 pa. code:62.3". Bare numbers ("62.3", "8371", "260.5") resolve when exactly one captured code holds that number. This tool returns ONE section: to list a whole act or chapter ("UIPA", "Appraiser Act", "WPCL", "Minimum Wage Act", "Workers' Compensation Act", "Chapter 146", "Chapter 62", "Chapter 301", "Chapter 231", "abandoned vehicles"), pass that name to pa_search_authority instead.

OUTPUT: The full verbatim section text (subsection numbering preserved), the catchline (a manifest descriptor for the 1915 Workers' Compensation Act, which prints none), chapter or act, the effective, amended, or enacted date, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const PA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Pennsylvania law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering conversation, aftermarket-parts or total-loss conversation, betterment dispute, storage follow-up, third-party claimant conversation, bad-faith discussion, or unclaimed-vehicle question for a Pennsylvania claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, DRP pressure, short pay, deleted line items, lowball, aftermarket, betterment, storage) to statutory and regulatory language that never uses those words.

${PA_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const PA_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Pennsylvania insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Pennsylvania estimate dispute, short-pay, steering, aftermarket-parts, betterment, total-loss, storage, or third-party claimant conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-law and employment questions belong to pa_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, the Unfair Insurance Practices Act carries no private right of action, and 42 Pa.C.S. 8371 belongs to the insured, not a third-party claimant.`;

const PA_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'pa',
  stateName: 'Pennsylvania',
  sourceSiteName: 'legis.state.pa.us or pacodeandbulletin.gov',
  descriptions: {
    search: PA_SEARCH_AUTHORITY_DESCRIPTION,
    get: PA_GET_AUTHORITY_DESCRIPTION,
    findSupporting: PA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: PA_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: PA_DOMAINS,
  topics: PA_TOPICS,
  domainSchema: PaDomainSchema,
  topicSchema: PaTopicSchema,
  getInputDescription:
    'A citation such as "31 Pa. Code 62.3", "63 P.S. 861", "42 Pa.C.S. 8371", "43 P.S. 260.5", "section 11 of the Appraiser Act", or "UIPA § 5". Bare numbers resolve when exactly one captured code holds them. One section per call; to list a whole act or chapter ("UIPA", "Appraiser Act", "WPCL", "Chapter 146", "Chapter 301", "abandoned vehicles") use pa_search_authority.',
  identity: paStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildPaSearchAuthorityTool(corpus: PaCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, PA_TOOLS_CONFIG);
}
export function buildPaGetAuthorityTool(corpus: PaCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, PA_TOOLS_CONFIG);
}
export function buildPaFindSupportingAuthorityTool(corpus: PaCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, PA_TOOLS_CONFIG);
}
export function buildPaBuildRebuttalPacketTool(corpus: PaCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, PA_TOOLS_CONFIG);
}

/** Register the four pa_* tools. Pair with registerPaConnectorTools. */
export function registerPaTools(server: RepairMCPServer<PaItem>, corpus: PaCorpus): void {
  registerStateTools(server, corpus, PA_TOOLS_CONFIG);
}
