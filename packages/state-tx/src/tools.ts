/**
 * Texas's four tx_* tools: the descriptions (the model's routing signal)
 * plus the TX config handed to the shared builders. The KNOWN CAVEATS
 * paragraph is deliberate product surface: Texas law's open questions and
 * honest absences (no body shop licensing, no state OSHA plan, no state
 * overtime or break law, first-party-only prompt-payment deadlines,
 * third-party standing under ch. 541, the 1/1/2026 appraisal applicability)
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
import type { TxItem } from './adapter.js';
import type { TxCorpus } from './corpus.js';
import { txStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { TX_DOMAINS, TxDomainSchema } from './schema.js';
import { TX_TOPICS, TxTopicSchema } from './taxonomy.js';

const TX_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: The ch. 542 prompt-payment deadlines and the 18% interest remedy apply to FIRST-party claims only (542.051's definition) — a shop chasing a third-party claim cites 541.060 and ch. 1952, not 542 deadlines. Ch. 541's private action (541.151) belongs to the insured; Texas case law (Allstate v. Watson) denies third-party claimants standing — a question for counsel, stated, not decided here. The ch. 1813 mandatory appraisal provision applies to personal auto policies delivered, issued, or renewed on or after January 1, 2026 — check the policy date — and never to commercial auto or Texas Windstorm Insurance Association policies; older policies may still carry a discretionary appraisal clause in the policy form. Texas does NOT license collision repair shops (TxDMV's own consumer guidance says so); the Occupations Code ch. 2303 license is for vehicle STORAGE facilities. Texas has NO state OSHA plan: spray booth, respirator, and hazard communication duties come from federal OSHA (29 CFR), outside this corpus. Texas has NO state overtime law and NO meal or rest break law — the FLSA governs overtime, and no Texas statute requires breaks. No TDI bulletin names OEM repair procedures — that dispute runs through 541.060, the 542 deadlines, and the appraisal process.`;

const TX_SEARCH_AUTHORITY_DESCRIPTION = `Search Texas state law for collision repair facilities: insurance claims handling (Tex. Ins. Code ch. 1952 subch. G — 1952.301 bars limiting parts or facility choice, 1952.302 the prohibited-acts list covering referral fees, "must use a preferred shop" statements, unreasonable travel, and gag clauses on parts disclosure; ch. 1813, the 2025 mandatory appraisal chapter; ch. 542 subch. B prompt payment — 15-day acknowledgment, 15-business-day accept/reject, 5-business-day payment, and the 542.060 remedy of claim plus 18% annual interest plus attorney's fees; the 541.060 unfair settlement practices catalog with the 541.151 private action; 28 TAC 5.501 notice requirements and the 21.203 unfair claims settlement rules; TDI steering Bulletins B-0031-10 and B-0026-11), vehicle storage facility law (Occ. Code ch. 2303: notices, storage charges, payment by insurers, release), the possessory repair lien (Prop. Code ch. 70: retain the vehicle until paid, the 70.006 abandoned-vehicle sale path), the DTPA, the salvage-vehicle definitions (Transp. Code 501.091), and employment rules (the Payday Law: final pay, commissions, deductions, wage claims; minimum wage).

USE THIS WHEN:
- A Texas claim issue needs the actual rule text: steering, short-pay, appraisal, supplement delay, prompt payment, parts choice, total loss, storage.
- A shop obligation or leverage question: holding a vehicle until paid, selling an abandoned vehicle, storage facility notices and charges, deceptive trade practice exposure.
- An HR question: final paycheck timing, flag-hour commission pay, payroll deductions for tools or comebacks, filing a TWC wage claim, minimum wage.
- You have a citation like "Tex. Ins. Code 1952.301", "542.058", "28 TAC 5.501", or "B-0031-10" and want it directly.

${TX_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, effective dates, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const TX_GET_AUTHORITY_DESCRIPTION = `Fetch one Texas law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the session-law history note, and the effective date for a specific section.

INPUT: A citation in any common form: "Tex. Ins. Code 1952.301", "Insurance Code 1952.301", "28 TAC 5.501", "B-0031-10", "tex. ins. code:1952.301", or a bare "1952.301" / "5.501" (the captured chapters are disjoint across codes, so a bare dotted cite resolves unambiguously). A bare chapter number ("1952", "542") lists the chapter.

OUTPUT: The full verbatim section text (subsection numbering preserved), heading, chapter, the history note, the effective date where the source states one, topics, and citation forms — or found=false with guidance when the cite does not match. TDI bulletins are Department guidance, not law.`;

const TX_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Texas law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering or shop-of-choice conversation, appraisal invocation, prompt-payment follow-up (the 18% interest letter), storage-charge conversation, or abandoned-vehicle lien question for a Texas claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, DRP pressure, deleted line items, lowball) to statutory language that never uses those words.

${TX_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const TX_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Texas insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Texas estimate dispute, short-pay, supplement delay, steering, prompt-payment, appraisal, storage, or total loss conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-lien and employment questions belong to tx_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, the 542 deadlines are first-party only; third-party standing under ch. 541 is a question for counsel; ch. 1813 appraisal depends on the policy's issue/renewal date; and if a TDI bulletin appears among the authorities, it is Department guidance, not law.`;

const TX_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'tx',
  stateName: 'Texas',
  sourceSiteName: 'statutes.capitol.texas.gov, the SOS rules portal, or tdi.texas.gov',
  descriptions: {
    search: TX_SEARCH_AUTHORITY_DESCRIPTION,
    get: TX_GET_AUTHORITY_DESCRIPTION,
    findSupporting: TX_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: TX_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: TX_DOMAINS,
  topics: TX_TOPICS,
  domainSchema: TxDomainSchema,
  topicSchema: TxTopicSchema,
  getInputDescription:
    'A citation such as "Tex. Ins. Code 1952.301", "542.058", "28 TAC 5.501", "B-0031-10", or "tex. ins. code:1952.301". A bare chapter number ("1952") lists the chapter.',
  identity: txStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildTxSearchAuthorityTool(corpus: TxCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, TX_TOOLS_CONFIG);
}

export function buildTxGetAuthorityTool(corpus: TxCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, TX_TOOLS_CONFIG);
}

export function buildTxFindSupportingAuthorityTool(corpus: TxCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, TX_TOOLS_CONFIG);
}

export function buildTxBuildRebuttalPacketTool(corpus: TxCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, TX_TOOLS_CONFIG);
}

/** Register the four tx_* tools. Pair with registerTxConnectorTools. */
export function registerTxTools(server: RepairMCPServer<TxItem>, corpus: TxCorpus): void {
  registerStateTools(server, corpus, TX_TOOLS_CONFIG);
}
