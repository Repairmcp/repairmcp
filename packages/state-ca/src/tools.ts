/**
 * California's four ca_* tools: the descriptions (the model's routing
 * signal) plus the CA config handed to the shared builders. The KNOWN
 * CAVEATS paragraph is deliberate product surface: California law's open
 * questions and honest absences (no private action under 790.03, no
 * prompt-payment interest remedy, no statutory total-loss percentage, no
 * mandatory appraisal statute for auto, the piece-rate question for
 * flat-rate techs, the CCR mirror provenance) must be answered honestly,
 * not filled in from model memory.
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
import type { CaItem } from './adapter.js';
import type { CaCorpus } from './corpus.js';
import { caStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { CA_DOMAINS, CaDomainSchema } from './schema.js';
import { CA_TOPICS, CaTopicSchema } from './taxonomy.js';

const CA_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: Ins. Code 790.03(h) and the Fair Claims Settlement Practices Regulations (10 CCR 2695) are enforced by the Department of Insurance, not by a shop's or claimant's lawsuit — California case law (Moradi-Shalal v. Fireman's Fund, 1988) denies a private right of action under 790.03; a complaint to the Department is the enforcement path, and any civil claim runs through the policy or common law, a question for counsel. California has NO prompt-payment interest remedy like Texas's; the deadlines are 2695.5 (15 days to respond) and 2695.7 (40 days to accept or deny, 30 days to pay), with penalties in 2695.12 and 790.035 payable to the Department. There is NO statutory total-loss percentage — Veh. Code 544 defines a total loss salvage vehicle by repair cost against value, and 10 CCR 2695.8(b) sets the valuation method. There is NO mandatory appraisal statute for auto claims — appraisal is a policy clause when the policy has one. Lab. Code 226.2's separate pay for rest periods and nonproductive time applies to PIECE-RATE employees; whether a given flat-rate body shop pay plan is piece-rate is a question for counsel, stated here, not decided. Body shops are automotive repair dealers under the Automotive Repair Act and fall within IWC Wage Order 9 (its definition includes the repairing and maintenance of vehicles). California statutes print no section headings; the headings shown for statutes are editorial descriptors, so quote the section text, never the heading. The 10 CCR and 16 CCR text (and Wage Order 9) was captured from the Legal Information Institute's mirror of the California Code of Regulations because the official publisher blocks automated access; each section carries its own Register history so its currency is visible.`;

const CA_SEARCH_AUTHORITY_DESCRIPTION = `Search California state law for collision repair facilities: insurance claims handling (Ins. Code 758.5 — no required or steered repair shop, written notice of the right to choose, restoration to pre-loss condition when the insurer's recommendation is accepted; 758.6 — no paint and materials payment unrelated to an accepted methodology; 790.03(h) the unfair claims settlement practices catalog; 10 CCR 2695.5 and 2695.7 response and decision deadlines; 2695.8 the automobile standards — total loss valuation, no steering on third-party claims, repair shop selection, partial-loss estimates per accepted trade standards, non-OEM parts warranted equal in kind and quality, betterment, towing and storage; 2695.81 the standardized auto body repair labor rate survey; 2695.85 the Auto Body Repair Consumer Bill of Rights; Ins. Code 1874.85–1874.87 insurer inspections and the bill of rights duty; Veh. Code 544 and 11515 total loss definition and salvage duties), the Automotive Repair Act and Bureau of Automotive Repair rules (Bus. & Prof. Code 9884.9 written estimate, authorization before work, additional authorization, teardown; 9884.8 invoices; 9884.10 return of replaced parts; 9884.7 grounds for discipline; 9884.16 an unregistered shop loses its lien and storage; 9875–9875.2 aftermarket crash parts; 16 CCR 3353–3356 estimate and invoice rules, 3365 auto body and frame repairs per OEM or nationally recognized specifications, 3368 referral fees and towing, 3371–3376 misleading statements, parts, and guarantees), the repair and storage lien and lien sale (Civ. Code 3068–3071), Cal/OSHA orders (8 CCR 5446 spray booths and the Article 137 spray coating orders, 5144 respirators, 5155 airborne contaminants, 5194 hazard communication, 3203 the injury and illness prevention program, 3380 protective equipment, 5162 eyewash, 6151 fire extinguishers), and employment rules (Lab. Code 201–203 final pay and waiting time, 221 and 224 deductions, 226.2 piece-rate rest and nonproductive time, 226.7 and 512 meal and rest periods, 510 overtime, 1194 unpaid wage recovery, 2751 commission agreements, 2802 expense reimbursement, 3700 workers' compensation; 8 CCR 11090, Wage Order 9).

USE THIS WHEN:
- A California claim issue needs the actual rule text: steering, the paint and materials cap, labor rate surveys, short-pay, supplement delay, response deadlines, parts choice, total loss, storage.
- A shop obligation or leverage question: written estimates and authorization, teardown, invoices, returned parts, repair standards, holding a vehicle until paid, lien sale, BAR registration exposure.
- A safety question: spray booth construction and ventilation, respirators, isocyanate exposure, hazard communication, the IIPP.
- An HR question: final paycheck timing, deducting a comeback, flat-rate and piece-rate pay, breaks, overtime, tool and expense reimbursement, commission plans.
- You have a citation like "Ins. Code 758.5", "10 CCR 2695.8", "B&P 9884.9", "16 CCR 3365", "8 CCR 5446", or "Labor Code 226.2" and want it directly.

${CA_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | safety | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, effective dates, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const CA_GET_AUTHORITY_DESCRIPTION = `Fetch one California law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the history note, and the effective date for a specific section.

INPUT: A citation in any common form: "Ins. Code 758.5", "Cal. Ins. Code § 758.5", "B&P 9884.9", "Bus. & Prof. Code 9884.9", "Labor Code 226.2", "Civ. Code 3068", "10 CCR 2695.8", "Cal. Code Regs. tit. 16, § 3353", "8 CCR 5446", "cal. ins. code:758.5", or a bare "758.5" / "2695.8" / "5446" (every captured section number is unique across codes, so a bare cite resolves unambiguously). "Wage Order 9" fetches 8 CCR 11090 and "Auto Body Repair Consumer Bill of Rights" fetches 10 CCR 2695.85. This tool returns ONE section: to list a whole chapter ("Automotive Repair Act" for Bus. & Prof. Code ch. 20.3, "Fair Claims Settlement Practices Regulations" for 10 CCR 2695), pass that name to ca_search_authority instead.

OUTPUT: The full verbatim section text (subsection numbering preserved), heading, chapter, the history note, the effective date where the source states one, topics, and citation forms — or found=false with guidance when the cite does not match. Statute headings are editorial descriptors (California prints none); regulation headings are the source's own.`;

const CA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find California law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering or shop-of-choice conversation, paint and materials cap rebuttal, labor rate survey question, response-deadline follow-up, OEM procedure or repair-standard dispute, storage-charge conversation, or repair-lien question for a California claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, DRP pressure, deleted line items, lowball, cap on materials) to statutory language that never uses those words.

${CA_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const CA_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational California insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a California estimate dispute, short-pay, supplement delay, steering, paint and materials cap, labor rate, repair standard, storage, or total loss conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-law, safety, and employment questions belong to ca_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, 790.03(h) and the Fair Claims regulations are enforced by the Department of Insurance rather than by a private lawsuit, and whether a policy carries an appraisal clause is a question for the policy itself.`;

const CA_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'ca',
  stateName: 'California',
  sourceSiteName: 'leginfo.legislature.ca.gov, dir.ca.gov, or the LII mirror of the CCR',
  descriptions: {
    search: CA_SEARCH_AUTHORITY_DESCRIPTION,
    get: CA_GET_AUTHORITY_DESCRIPTION,
    findSupporting: CA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: CA_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: CA_DOMAINS,
  topics: CA_TOPICS,
  domainSchema: CaDomainSchema,
  topicSchema: CaTopicSchema,
  getInputDescription:
    'A citation such as "Ins. Code 758.5", "B&P 9884.9", "Labor Code 226.2", "10 CCR 2695.8", "16 CCR 3365", "8 CCR 5446", "cal. ins. code:758.5", or a bare "758.5". One section per call; to list a chapter ("Automotive Repair Act", "Fair Claims Settlement Practices Regulations") use ca_search_authority.',
  identity: caStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildCaSearchAuthorityTool(corpus: CaCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, CA_TOOLS_CONFIG);
}

export function buildCaGetAuthorityTool(corpus: CaCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, CA_TOOLS_CONFIG);
}

export function buildCaFindSupportingAuthorityTool(corpus: CaCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, CA_TOOLS_CONFIG);
}

export function buildCaBuildRebuttalPacketTool(corpus: CaCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, CA_TOOLS_CONFIG);
}

/** Register the four ca_* tools. Pair with registerCaConnectorTools. */
export function registerCaTools(server: RepairMCPServer<CaItem>, corpus: CaCorpus): void {
  registerStateTools(server, corpus, CA_TOOLS_CONFIG);
}
