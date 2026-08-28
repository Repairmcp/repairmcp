/**
 * Washington's four wa_* tools: the descriptions (the model's routing
 * signal, in shop-floor language) plus the WA config handed to the shared
 * builders in @repairmcp/state-law. Payload shapes, field order, freshness
 * and caveat wiring live in the shared builders and reproduce the
 * pre-extraction wire format byte-for-byte — the golden payload fixture is
 * the proof.
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
import type { WaItem } from './adapter.js';
import type { WaCorpus } from './corpus.js';
import { waStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { WA_DOMAINS, WaDomainSchema } from './schema.js';
import { WA_TOPICS, WaTopicSchema } from './taxonomy.js';

const WA_SEARCH_AUTHORITY_DESCRIPTION = `Search Washington state law for collision repair facilities: insurance claims handling (WAC 284-30, RCW 48.30 including the Insurance Fair Conduct Act), auto repair law (RCW 46.71 estimates and parts disclosure, liens), WISHA workplace safety (spray booths, respirators, hazcom, hexavalent chromium), and employment rules (breaks, overtime, sick leave, minors).

USE THIS WHEN:
- A Washington claim, short-pay, estimate dispute, supplement, denial, steering, labor rate, total loss, storage charge, or chosen repair facility issue needs the actual rule text.
- A shop question about estimates, invoices, aftermarket parts disclosure, or repair liens.
- A safety or HR question: spray booth rules, respirator requirements, breaks, overtime, hiring minors.
- You have a citation like "WAC 284-30-330" or a chapter like "WAC 284-30" and want it directly.

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | safety | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, per-section effective dates, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const WA_GET_AUTHORITY_DESCRIPTION = `Fetch one Washington law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official leg.wa.gov URL, the effective date of the current text, and the history note for a specific section.

INPUT: A citation in any common form: "WAC 284-30-390", "RCW 46.71.025", "wac:284-30-390", or a bare "284-30-390".

OUTPUT: The full verbatim section text (subsection numbering preserved), heading, chapter, effective date when the history note states one, the history note itself, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const WA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Washington law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, storage-denial answer, steering conversation, or total-loss valuation dispute for a Washington claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, supplement) to regulatory language that never uses those words.

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const WA_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Washington insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Washington estimate dispute, short-pay, supplement, denial, steering, labor rate, storage denial, or total loss conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — safety and employment questions belong to wa_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice.`;

const WA_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'wa',
  stateName: 'Washington',
  sourceSiteName: 'leg.wa.gov',
  descriptions: {
    search: WA_SEARCH_AUTHORITY_DESCRIPTION,
    get: WA_GET_AUTHORITY_DESCRIPTION,
    findSupporting: WA_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: WA_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: WA_DOMAINS,
  topics: WA_TOPICS,
  domainSchema: WaDomainSchema,
  topicSchema: WaTopicSchema,
  getInputDescription:
    'A citation such as "WAC 284-30-390", "RCW 46.71.025", or "wac:284-30-390".',
  identity: waStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildWaSearchAuthorityTool(corpus: WaCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, WA_TOOLS_CONFIG);
}

export function buildWaGetAuthorityTool(corpus: WaCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, WA_TOOLS_CONFIG);
}

export function buildWaFindSupportingAuthorityTool(corpus: WaCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, WA_TOOLS_CONFIG);
}

export function buildWaBuildRebuttalPacketTool(corpus: WaCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, WA_TOOLS_CONFIG);
}

/** Register the four wa_* tools. Pair with registerWaConnectorTools. */
export function registerWaTools(server: RepairMCPServer<WaItem>, corpus: WaCorpus): void {
  registerStateTools(server, corpus, WA_TOOLS_CONFIG);
}
