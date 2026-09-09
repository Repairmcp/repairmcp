/**
 * Florida's four fl_* tools: the descriptions (the model's routing signal)
 * plus the FL config handed to the shared builders. The KNOWN CAVEATS
 * paragraph is deliberate product surface: Florida law's honest absences
 * (no anti-steering statute in the California or Texas sense, no labor
 * rate rule, no prompt-payment interest on the claim itself, the property-
 * insurance placement of 627.70131, no state OSHA plan, almost no state
 * wage law) must be answered honestly, not filled in from model memory —
 * and its one genuine strength (624.155's private right of action) stated
 * plainly.
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
import type { FlItem } from './adapter.js';
import type { FlCorpus } from './corpus.js';
import { flStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { FL_DOMAINS, FlDomainSchema } from './schema.js';
import { FL_TOPICS, FlTopicSchema } from './taxonomy.js';

const FL_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: Florida has NO anti-steering statute in the California or Texas sense — Fla. Stat. 626.9743 regulates what an insurer that REQUIRES a particular shop owes (restoration to pre-loss condition at no additional cost, subsection (3)) and forbids pushing a third-party claimant onto their own policy (subsection (2)), but does not forbid recommending a shop; the regulatory hook is Fla. Admin. Code 69B-220.201(3)(a), which bars an adjuster from steering a claimant to anyone paying the adjuster for the referral; that rule's 2025 paragraph (3)(m) on estimate changes and electronic estimating programs applies ONLY to residential property coverage, not to auto claims — never cite it for a vehicle estimate. Florida HAS a statutory private right of action against an insurer: 624.155 lets any person damaged by a 626.9541(1)(i) violation or by an insurer's failure to attempt in good faith to settle bring a civil action, after the 60-day civil remedy notice filed with the Department of Financial Services — cite it, and say the notice is a condition precedent. There is NO labor rate statute or survey rule and NO paint and materials rule. There is NO prompt-payment deadline or interest on an open claim: 627.4265's 20 days and its 12 percent interest run only from a WRITTEN settlement agreement, and the consequence of blowing the claims-handling standards on an unsettled claim is 624.155, not interest. 627.70131 (acknowledge within 7 days, investigate) sits in ch. 627 pt. X, PROPERTY insurance contracts; its subsection (1) reads generally and shops cite it, but its (7) pay-or-deny clock is limited to residential and small commercial property claims, and whether (1) reaches a motor vehicle claim is a question for counsel — the motor vehicle analogs are 626.9541(1)(i)2–3 and 69O-166.024. 319.30(3) carries the 80 percent total loss threshold (repair cost against actual cash value). Florida has NO state OSHA plan — federal OSHA governs spray booths, respirators, and hazard communication, and this corpus holds no safety domain. Florida has almost NO state wage law: no final-paycheck statute, no meal or rest break statute, no state overtime law beyond 448.01's ten-hour legal day; the minimum wage is 448.110 and Article X, section 24 of the constitution, and federal law governs the rest. Florida statutes state no per-section effective dates; a statute citation carries the annual edition instead, and the history note lists the session laws.`;

const FL_SEARCH_AUTHORITY_DESCRIPTION = `Search Florida state law for collision repair facilities: insurance claims handling (Fla. Stat. 626.9743 motor vehicle claim settlement practices — parts at least equivalent in kind and quality, restoration to pre-loss condition when the insurer requires a shop, no pushing a third-party claimant onto their own policy, a copy of the estimate the settlement is based on, 72 hours' notice before authorized storage payments stop, total loss valuation methods with documented and itemized deductions, betterment and depreciation itemized, sales tax; 624.155 the civil remedy — bad faith with a private right of action after the 60-day notice; 626.9541(1)(i) the unfair claim settlement practices catalog; 626.877 and 626.878 adjustments per the contract and the adjuster code of ethics; 627.4265 payment of a settlement within 20 days; 627.70131 acknowledgment and investigation, a property-insurance section; 627.7288 no deductible on motor vehicle glass; 319.30 the 80 percent total loss threshold and salvage duties; Fla. Admin. Code 69B-220.201 the adjuster ethics rule — no steering for consideration, adjust strictly per the contract, no undisclosed financial interest, a breach is an unfair claims settlement practice; 69O-166.024 prompt acknowledgment and investigation standards), the Florida Motor Vehicle Repair Act (559.905 the written estimate over $150 and the check-one disclosure, 559.907 estimate charges and no waiver of rights, 559.909 no charges over the estimate without consent, no holding the vehicle for unauthorized charges, inspection and return of parts, 559.911 the invoice, 559.915 records, 559.916 signs and notice, 559.917 the bond to release the possessory lien, 559.919 lien enforcement restricted, 559.920 unlawful acts, 559.921 remedies, 559.904 registration), liens (713.58 the labor lien, 713.585 selling the vehicle to enforce it, 713.78 towing and storage charges and liens), aftermarket crash parts (501.32–501.34 identification and disclosure), the Deceptive and Unfair Trade Practices Act (501.204 unlawful acts, 501.211 the private remedy), and employment rules (448.110 the state minimum wage, 448.01 the ten-hour legal day, 448.08 fees for unpaid wages, 448.095 E-Verify, 448.101–448.103 the private whistleblower act, 440.02 employee and independent contractor definitions, 440.10 liability for compensation, 440.38 security, 440.105 prohibited acts, 440.107 stop-work orders).

USE THIS WHEN:
- A Florida claim issue needs the actual rule text: parts quality, shop choice and the restoration duty, total loss and the 80 percent test, storage cut-off, the estimate copy, betterment, settlement payment timing, bad faith and the civil remedy notice, adjuster conduct.
- A shop obligation or leverage question: the written estimate and disclosure, charges over the estimate, holding the vehicle, invoices and records, the possessory lien and the release bond, selling an unclaimed vehicle, towing and storage charges, registration exposure, deceptive practices.
- An HR question: minimum wage, the ten-hour day, unpaid wage claims, E-Verify, retaliation, 1099 technicians and workers' compensation, stop-work orders.
- You have a citation like "Fla. Stat. 626.9743", "s. 559.905", "F.S. 624.155", "Fla. Admin. Code 69B-220.201", or "Rule 69O-166.024" and want it directly.

${FL_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, the statutes edition or the rule's effective date, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const FL_GET_AUTHORITY_DESCRIPTION = `Fetch one Florida law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the history note, and the edition or effective date for a specific section.

INPUT: A citation in any common form: "Fla. Stat. 626.9743", "Fla. Stat. § 559.905", "F.S. 624.155", "s. 713.585", "Florida Statutes 319.30", "Fla. Admin. Code R. 69B-220.201", "F.A.C. 69O-166.024", "Rule 69B-220.201", "fla. stat.:626.9743", or a bare "626.9743" / "69B-220.201" (every captured section number is unique, so a bare cite resolves unambiguously). "Adjuster Code of Ethics" fetches 69B-220.201. This tool returns ONE section: to list a whole chapter or act ("Motor Vehicle Repair Act" for ch. 559 pt. IX, "FDUTPA" for ch. 501 pt. II, "Unfair Insurance Trade Practices Act" for ch. 626 pt. IX, "Crash Parts" for ch. 501 pt. I, "Workers' Compensation Law" for ch. 440), pass that name to fl_search_authority instead.

OUTPUT: The full verbatim section text (subsection numbering preserved), the catchline, chapter, the history note, the statutes edition or the rule's effective date, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const FL_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Florida law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, parts-quality or shop-choice conversation, total loss or storage conversation, settlement-payment follow-up, bad-faith notice discussion, adjuster-conduct complaint, or repair-lien question for a Florida claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, DRP pressure, deleted line items, lowball, aftermarket, storage cut-off) to statutory language that never uses those words.

${FL_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const FL_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Florida insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a Florida estimate dispute, short-pay, parts-quality, shop-choice and restoration, total loss, storage cut-off, settlement payment, or bad-faith notice conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-law and employment questions belong to fl_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, 624.155's civil remedy requires the 60-day notice as a condition precedent and the insurer can cure within it, and whether 627.70131 reaches a motor vehicle claim is a question for counsel.`;

const FL_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'fl',
  stateName: 'Florida',
  sourceSiteName: 'leg.state.fl.us (Online Sunshine) or flrules.org',
  descriptions: {
    search: FL_SEARCH_AUTHORITY_DESCRIPTION,
    get: FL_GET_AUTHORITY_DESCRIPTION,
    findSupporting: FL_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: FL_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: FL_DOMAINS,
  topics: FL_TOPICS,
  domainSchema: FlDomainSchema,
  topicSchema: FlTopicSchema,
  getInputDescription:
    'A citation such as "Fla. Stat. 626.9743", "s. 559.905", "F.S. 624.155", "Fla. Admin. Code 69B-220.201", "Rule 69O-166.024", "fla. stat.:626.9743", or a bare "626.9743". One section per call; to list a chapter or act ("Motor Vehicle Repair Act", "FDUTPA", "Unfair Insurance Trade Practices Act") use fl_search_authority.',
  identity: flStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildFlSearchAuthorityTool(corpus: FlCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, FL_TOOLS_CONFIG);
}

export function buildFlGetAuthorityTool(corpus: FlCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, FL_TOOLS_CONFIG);
}

export function buildFlFindSupportingAuthorityTool(corpus: FlCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, FL_TOOLS_CONFIG);
}

export function buildFlBuildRebuttalPacketTool(corpus: FlCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, FL_TOOLS_CONFIG);
}

/** Register the four fl_* tools. Pair with registerFlConnectorTools. */
export function registerFlTools(server: RepairMCPServer<FlItem>, corpus: FlCorpus): void {
  registerStateTools(server, corpus, FL_TOOLS_CONFIG);
}
