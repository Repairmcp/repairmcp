/**
 * New York's four ny_* tools: the descriptions (the model's routing signal)
 * plus the NY config handed to the shared builders. The KNOWN CAVEATS
 * paragraph is deliberate product surface: New York law's honest absences
 * (no private right of action under 2601, the narrowed reach of 2610(b)
 * after Allstate v. Serio, no standalone aftermarket-parts statute, no
 * statutory total-loss percentage, no labor rate survey rule, no state
 * OSHA plan) must be answered honestly, not filled in from model memory.
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
import type { NyItem } from './adapter.js';
import type { NyCorpus } from './corpus.js';
import { nyStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { NY_DOMAINS, NyDomainSchema } from './schema.js';
import { NY_TOPICS, NyTopicSchema } from './taxonomy.js';

const NY_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: New York's unfair claim settlement practices statute, Ins. Law 2601, carries NO private right of action (Rocanova v. Equitable Life, 1994) — the remedy is a complaint to the Department of Financial Services, which enforces Regulation 64 through examinations (11 NYCRR 216.11); bad-faith exposure is a contract question for counsel. Ins. Law 2610(a) bars an insurer from REQUIRING repairs at a particular place or shop; 2610(b) bars RECOMMENDING or suggesting a shop unless the insured asks, but the Department's 2000 reading of (b) was struck as a First Amendment violation in Allstate v. Serio (2d Cir. 2001) and Circular Letter 16 (2000) was WITHDRAWN effective 12/4/2003 — cite the statute, cite OGC Opinion 04-06-03 (an insurer may not push a manufacturer-certified shop without being asked), and say the reach of (b) has been narrowed by litigation. There is NO standalone aftermarket crash parts statute; the parts provisions live in 11 NYCRR 216.7. There is NO statutory total-loss percentage; 216.7(c) states the valuation method. There is NO labor rate survey rule; 216.7 governs negotiation. New York has NO state OSHA plan for private employers (PESH covers public employers), so this corpus holds no safety domain — federal OSHA governs the spray booth. Statute citations carry the Senate site's REVISION date, the date of the current text, not a session-law effective date; 15 NYCRR Part 82 citations carry the DMV booklet edition because Part 82 prints no per-section dates; 12 NYCRR Part 142 carries the single amendment date its cover states. Regulation 64 text comes from the Legal Information Institute's mirror of the NYCRR (the official publisher blocks automated access; DFS hosts no text) and every Part 216 section says so in captureSource — verify a freshly amended rule against the official publisher by hand. DFS guidance documents are NOT law.`;

const NY_SEARCH_AUTHORITY_DESCRIPTION = `Search New York state law for collision repair facilities: insurance claims handling (Ins. Law 2610 — no requiring, and no unrequested recommending, of a particular repair shop; 2601 the unfair claim settlement practices catalog with no private right of action; 3411 physical damage standard provisions and inspections; Regulation 64, 11 NYCRR 216.4 acknowledgment within 15 business days, 216.5 prompt investigation, 216.6 good-faith negotiation and claim denial, 216.7 inspection within six business days, aftermarket parts, labor, total loss valuation, storage, 216.10 third-party property damage claims; DFS guidance — OGC Opinion 04-06-03 steering, OGC Opinion 01-10-05 total loss, and other opinions and circular letters, one withdrawn and marked so), the Motor Vehicle Repair Shop Registration Act (Veh. & Traf. Law 398 through 398-h) and 15 NYCRR Part 82 (82.5 written estimates, authorization, parts return, invoices; 82.13 quality repairs and subcontractors; 82.18 insurers and repair shops; 82.19 the consumer's inspection right), General Business Law 349 and 350 (deceptive practices), the bailee's lien on a motor vehicle (Lien Law 184 possessory lien, 200 and 201 sale to enforce it, 202 notice), and employment rules (Lab. Law 191 weekly pay for manual workers, 193 deductions, 195 wage notices, 198 remedies and liquidated damages, 198-c, 161 one day of rest in seven, 162 meal periods, 160, 652, 663; 12 NYCRR 142-2.3 call-in pay, 142-2.4 spread of hours, 142-2.10 deductions; Workers' Comp. Law 2, 10, 50, 52).

USE THIS WHEN:
- A New York claim issue needs the actual rule text: acknowledgment and investigation timing, good-faith negotiation, aftermarket parts, total loss valuation, storage payments, third-party property damage claims, steering, bad faith.
- A shop obligation or leverage question: the written estimate and authorization, parts return, invoices, records, registration, quality repairs and subcontractors, the insurer-and-repair-shop rule, the possessory lien and sale to enforce it, deceptive practices.
- An HR question: weekly pay for manual workers, deductions, wage notices, remedies, meal periods, one day of rest, call-in pay, spread of hours, minimum wage, 1099 technicians and workers' compensation.
- You have a citation like "Ins. Law 2610", "11 NYCRR 216.7", "15 NYCRR 82.5", "Lab. Law 191", "Regulation 64", "Part 82", or "OGC Opinion 04-06-03" and want it directly.

${NY_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, the revision date, effective date, edition, or issue date, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const NY_GET_AUTHORITY_DESCRIPTION = `Fetch one New York law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the revision date, effective date, edition, or issue/withdrawal date for a specific section.

INPUT: A citation in any common form: "Ins. Law 2610", "N.Y. Ins. Law § 2610", "11 NYCRR 216.7", "Regulation 64 216.4", "15 NYCRR 82.5", "Lab. Law 191", "Workers' Comp. Law 52", "n.y. ins. law:2610", "OGC Opinion 04-06-03", or "Circular Letter 16 (2000)". Bare numbers like "191" resolve only when exactly one captured code claims that number — word the code for a statute ("Labor Law 191") when it does not. This tool returns ONE section: to list a whole part or article ("Regulation 64" or "Part 216" for 11 NYCRR Part 216, "Part 82" for 15 NYCRR, "Part 142" or "the Minimum Wage Order" for 12 NYCRR, "the Repair Shop Registration Act" or "Article 12-A" for Veh. & Traf. Law), pass that name to ny_search_authority instead.

OUTPUT: The full verbatim section text (subsection numbering preserved), the catchline, chapter, revision or effective date, edition, or issue/withdrawal date, topics, and citation forms — or found=false with guidance when the cite does not match.`;

const NY_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find New York law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering conversation, aftermarket-parts or total-loss conversation, storage-payment follow-up, third-party property damage claim, bad-faith discussion, or repair-lien question for a New York claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, short pay, DRP pressure, deleted line items, lowball, aftermarket, storage cut-off) to statutory and regulatory language that never uses those words.

${NY_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const NY_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational New York insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for a New York estimate dispute, short-pay, steering, aftermarket-parts, total-loss, storage cut-off, or third-party property damage conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-law and employment questions belong to ny_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, Ins. Law 2601 carries no private right of action, and the reach of 2610(b)'s recommendation bar has been narrowed by Allstate v. Serio.`;

const NY_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'ny',
  stateName: 'New York',
  sourceSiteName: 'nysenate.gov, dmv.ny.gov, dol.ny.gov, law.cornell.edu (11 NYCRR 216), or dfs.ny.gov',
  descriptions: {
    search: NY_SEARCH_AUTHORITY_DESCRIPTION,
    get: NY_GET_AUTHORITY_DESCRIPTION,
    findSupporting: NY_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: NY_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: NY_DOMAINS,
  topics: NY_TOPICS,
  domainSchema: NyDomainSchema,
  topicSchema: NyTopicSchema,
  getInputDescription:
    'A citation such as "Ins. Law 2610", "11 NYCRR 216.7", "15 NYCRR 82.5", "Lab. Law 191", "Regulation 64", "Part 82", or "OGC Opinion 04-06-03". Bare numbers resolve only when exactly one captured code holds them — word the code for a statute ("Labor Law 191") when it does not. One section per call; to list a whole part or article ("Regulation 64", "Part 82", "the Minimum Wage Order", "the Repair Shop Registration Act") use ny_search_authority.',
  identity: nyStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildNySearchAuthorityTool(corpus: NyCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, NY_TOOLS_CONFIG);
}

export function buildNyGetAuthorityTool(corpus: NyCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, NY_TOOLS_CONFIG);
}

export function buildNyFindSupportingAuthorityTool(corpus: NyCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, NY_TOOLS_CONFIG);
}

export function buildNyBuildRebuttalPacketTool(corpus: NyCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, NY_TOOLS_CONFIG);
}

/** Register the four ny_* tools. Pair with registerNyConnectorTools. */
export function registerNyTools(server: RepairMCPServer<NyItem>, corpus: NyCorpus): void {
  registerStateTools(server, corpus, NY_TOOLS_CONFIG);
}
