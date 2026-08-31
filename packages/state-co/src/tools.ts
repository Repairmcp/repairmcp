/**
 * Colorado's four co_* tools: the descriptions (the model's routing signal)
 * plus the CO config handed to the shared builders. The KNOWN CAVEATS
 * paragraph is deliberate product surface: Colorado law's open questions (no
 * private right of action under 10-3-1104, the Division's declined stance on
 * OEM-procedure refusals, the open COMPS "dealer" exemption question, no
 * state OSHA plan) must be answered honestly, not filled in from model
 * memory.
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
import type { CoItem } from './adapter.js';
import type { CoCorpus } from './corpus.js';
import { coStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { CO_DOMAINS, CoDomainSchema } from './schema.js';
import { CO_TOPICS, CoTopicSchema } from './taxonomy.js';

const CO_SEARCH_AUTHORITY_DESCRIPTION = `Search Colorado state law for collision repair facilities: insurance claims handling (CRS 10-4-120, the anti-steering statute whose subsection (3)(e) requires insurers to assume all reasonable repair costs including materials and parts; the CRS 10-3-1104 unfair claims practices catalog; the Model Quality Replacement Parts Act with its 10-3-1305 aftermarket-parts estimate disclosure; DOI Regulation 5-1-14 prompt payment and 5-2-15 total-loss valuation; DOI Bulletin B-5.04), the Motor Vehicle Repair Act (CRS Title 42 Article 9: written estimates, charges over the estimate, storage, parts return, invoices), towing rules (CRS 42-4-2103 and the PUC towing-carrier rules), and employment rules (the Wage Act and the COMPS Order: breaks, overtime, minimum wage, final pay, deductions).

USE THIS WHEN:
- A Colorado claim issue needs the actual rule text: steering, short-pay, OEM procedure payment, supplement, prompt payment, aftermarket parts disclosure, total loss valuation or sales tax, storage.
- A shop obligation question: written estimates and invoices, charges exceeding the estimate, returning replaced parts, storage charges, tow-in rules.
- An HR question: rest and meal breaks, the flag-hour overtime exemption question, final paycheck timing, payroll deductions for tools or equipment.
- You have a citation like "CRS 10-4-120", "3 CCR 702-5-1-14", "Reg 5-1-14", "COMPS Rule 5.2", or "B-5.04" and want it directly.

KNOWN CAVEATS, answer these honestly instead of inventing law: CRS 10-3-1104 carries NO private right of action (Division of Insurance enforcement; common-law bad faith is case law outside this corpus). The Division of Insurance has publicly declined to decide whether refusing a specific OEM procedure is "unreasonable" under 10-4-120 — the statute text is here, the agency's enforcement posture is a fact to state. The COMPS overtime exemption for salespersons, parts-persons, and mechanics says "dealers" — whether an independent body shop qualifies is an OPEN question, never settled. Colorado has NO state OSHA plan: spray booth, respirator, and hazard communication duties come from federal OSHA (29 CFR), outside this corpus. Repair-lien and mechanic's-lien statutes are not in this corpus. Bulletin B-5.04 is DIVISION GUIDANCE, not law.

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, effective dates on CCR rules, score details, and citations. CRS citations carry the edition instead of a date (Colorado statutes state no per-section effective dates). Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const CO_GET_AUTHORITY_DESCRIPTION = `Fetch one Colorado law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the history line, and (for CCR rules) the effective date for a specific section.

INPUT: A citation in any common form: "CRS 10-4-120", "3 CCR 702-5-1-14", "crs:10-4-120", or a bare "10-4-120" (hyphenated triples read as CRS; regulations and rules need their prefix; COMPS rules also resolve by their dotted number, "2.4.1").

OUTPUT: The full verbatim section text (subsection numbering preserved), heading, chapter, the history line, the CCR effective date where one exists, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const CO_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Colorado law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering or shop-of-choice conversation, OEM-procedure payment dispute, aftermarket-parts disclosure question, prompt-payment follow-up, total-loss valuation dispute, or storage-charge conversation for a Colorado claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, DRP pressure, deleted line items) to statutory language that never uses those words.

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const CO_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Colorado insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Colorado estimate dispute, short-pay, supplement, steering, OEM-procedure payment, prompt-payment, storage, or total loss conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair and employment questions belong to co_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, 10-3-1104 enforcement belongs to the Division of Insurance (no private right of action), and whether a specific OEM procedure refusal violates 10-4-120(3)(e) is a question the Division has declined to answer; both are questions for counsel.`;

const CO_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'co',
  stateName: 'Colorado',
  sourceSiteName: 'leg.colorado.gov or coloradosos.gov',
  descriptions: {
    search: CO_SEARCH_AUTHORITY_DESCRIPTION,
    get: CO_GET_AUTHORITY_DESCRIPTION,
    findSupporting: CO_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: CO_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: CO_DOMAINS,
  topics: CO_TOPICS,
  domainSchema: CoDomainSchema,
  topicSchema: CoTopicSchema,
  getInputDescription:
    'A citation such as "CRS 10-4-120", "3 CCR 702-5-1-14", "Reg 5-1-14", "COMPS Rule 5.2", "B-5.04", or "crs:10-4-120".',
  identity: coStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildCoSearchAuthorityTool(corpus: CoCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, CO_TOOLS_CONFIG);
}

export function buildCoGetAuthorityTool(corpus: CoCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, CO_TOOLS_CONFIG);
}

export function buildCoFindSupportingAuthorityTool(corpus: CoCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, CO_TOOLS_CONFIG);
}

export function buildCoBuildRebuttalPacketTool(corpus: CoCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, CO_TOOLS_CONFIG);
}

/** Register the four co_* tools. Pair with registerCoConnectorTools. */
export function registerCoTools(server: RepairMCPServer<CoItem>, corpus: CoCorpus): void {
  registerStateTools(server, corpus, CO_TOOLS_CONFIG);
}
