/**
 * Montana's four mt_* tools: the descriptions (the model's routing signal)
 * plus the MT config handed to the shared builders. The KNOWN ABSENCES
 * paragraph is deliberate product surface: Montana law's gaps (no
 * aftermarket-disclosure law, no adult break statute, federal-OSHA safety)
 * must be answered honestly, not filled in from model memory.
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
import type { MtItem } from './adapter.js';
import type { MtCorpus } from './corpus.js';
import { mtStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { MT_DOMAINS, MtDomainSchema } from './schema.js';
import { MT_TOPICS, MtTopicSchema } from './taxonomy.js';

const MT_SEARCH_AUTHORITY_DESCRIPTION = `Search Montana state law for collision repair facilities: insurance claims handling (MCA Title 33 ch. 18, the Unfair Trade Practices Act, including the body-shop steering statute 33-18-224 with its estimating-system clause and the 33-18-242 independent cause of action), repair and consumer law (repair estimates and unauthorized-repair rules under ARM 23.19, repair liens, towing and abandoned vehicles, salvage titles), the Montana Safety Culture Act, and employment rules (the Wrongful Discharge From Employment Act, final paychecks, overtime, minors).

USE THIS WHEN:
- A Montana claim issue needs the actual rule text: short-pay, estimate dispute, supplement, steering, glass steering, total loss valuation, storage, prompt payment, or an unreasonable denial.
- An adjuster removed repair operations that the estimating system both sides agreed to use identifies — 33-18-224 speaks to exactly that.
- A shop obligation question: written estimates and invoices, repair liens, tow and storage duties, salvage certificates.
- An HR question: discharge after probation (the WDEA), final paycheck timing, overtime, hiring minors, the safety program every employer must run.
- You have a citation like "MCA 33-18-201" or "ARM 6.6.1701" and want it directly.

KNOWN ABSENCES, answer these honestly instead of inventing law: Montana has NO aftermarket or OEM crash-parts disclosure statute, NO meal or rest break law for adult workers, and NO state technical safety standards for private shops — spray booth, respirator, and hazard communication duties come from federal OSHA (29 CFR), which is outside this corpus. MCA Title 50 ch. 71 is public-sector only; never cite it against a private shop.

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | safety | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, effective dates on ARM rules, score details, and citations. MCA citations carry the edition instead of a date (Montana statutes state no per-section effective dates). Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const MT_GET_AUTHORITY_DESCRIPTION = `Fetch one Montana law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the history line, and (for ARM rules) the effective date for a specific section.

INPUT: A citation in any common form: "MCA 33-18-224", "ARM 23.19.203", "mca:33-18-224", or a bare "33-18-224" (hyphens read as MCA, dots as ARM).

OUTPUT: The full verbatim section text (subsection numbering preserved), heading, chapter, the history line, the ARM effective date where one exists, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const MT_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Montana law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering or shop-of-choice conversation, storage answer, prompt-payment follow-up, or total-loss valuation dispute for a Montana claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, DRP pressure, deleted line items) to statutory language that never uses those words.

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const MT_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Montana insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Montana estimate dispute, short-pay, supplement, steering, prompt-payment, storage, or total loss conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair, safety, and employment questions belong to mt_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, whether conduct meets 33-18-201's general-business-practice threshold or supports a 33-18-242 action is a question for counsel.`;

const MT_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'mt',
  stateName: 'Montana',
  sourceSiteName: 'mca.legmt.gov or rules.mt.gov',
  descriptions: {
    search: MT_SEARCH_AUTHORITY_DESCRIPTION,
    get: MT_GET_AUTHORITY_DESCRIPTION,
    findSupporting: MT_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: MT_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: MT_DOMAINS,
  topics: MT_TOPICS,
  domainSchema: MtDomainSchema,
  topicSchema: MtTopicSchema,
  getInputDescription: 'A citation such as "MCA 33-18-224", "ARM 23.19.203", or "mca:33-18-224".',
  identity: mtStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildMtSearchAuthorityTool(corpus: MtCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, MT_TOOLS_CONFIG);
}

export function buildMtGetAuthorityTool(corpus: MtCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, MT_TOOLS_CONFIG);
}

export function buildMtFindSupportingAuthorityTool(corpus: MtCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, MT_TOOLS_CONFIG);
}

export function buildMtBuildRebuttalPacketTool(corpus: MtCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, MT_TOOLS_CONFIG);
}

/** Register the four mt_* tools. Pair with registerMtConnectorTools. */
export function registerMtTools(server: RepairMCPServer<MtItem>, corpus: MtCorpus): void {
  registerStateTools(server, corpus, MT_TOOLS_CONFIG);
}
