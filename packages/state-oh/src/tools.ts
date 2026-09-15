/**
 * Ohio's four oh_* tools: the descriptions (the model's routing signal)
 * plus the OH config handed to the shared builders. The KNOWN CAVEATS
 * paragraph is deliberate product surface: Ohio law's honest absences
 * (kickoff §2.5) must be answered honestly, not filled in from model memory.
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
import type { OhItem } from './adapter.js';
import type { OhCorpus } from './corpus.js';
import { ohStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { OH_DOMAINS, OhDomainSchema } from './schema.js';
import { OH_TOPICS, OhTopicSchema } from './taxonomy.js';

const OH_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: Ohio's unfair and deceptive insurance practices statutes (ORC 3901.20, 3901.21) carry NO private right of action — enforcement is the Superintendent's and the Attorney General's under 3901.22, and bad faith is a common-law tort (Zoppo v. Homestead Ins. Co., 71 Ohio St.3d 552 (1994); Hoskins v. Aetna Life Ins. Co., 6 Ohio St.3d 272 (1983)). There is NO statutory steering ban: the protections are OAC 3901-1-54(H)(1) (the insurer pays the difference or names a shop that will repair for its written estimate, and ensures workmanlike repairs if it names only one), (H)(5) (an insurer that designates a shop restores the car to pre-loss condition), and (H)(8) (no unreasonable travel to a specific shop); nothing bars an insurer from recommending a shop. There is NO labor rate rule, NO paint-and-materials rule, and NO claims prompt-pay interest statute (ORC 1343.03 is the general rate). There is NO statutory total-loss percentage: ORC 4505.11 triggers on the insurer's "economically impractical to repair" determination and 3901-1-54(H)(7) governs the valuation. There is NO statutory garage keeper's lien for motor vehicles — ORC 1333.41(E) excludes them in its own words; the routes are ORC 4505.101 (title under $3,500 after fifteen days plus fifteen days of notice) and a 4513.60 complaint to the sheriff above it. Ohio licenses NO body shops (4738 licenses salvage dealers). Ohio has NO state OSHA plan for private employers (ORC 4167 is public-only; federal OSHA governs the spray booth); the BWC specific safety requirements (OAC 4123:1-5) are enforced through the VSSR additional award under ORC 4121.47, not inspections; the Ohio Fire Code's flammable-finishes text is the International Fire Code by reference and is not in this corpus; OAC 3745-21-18 applies only in sixteen named counties; OAC 3745-31-30 is an omnibus permit rule whose (C)(2)(f) is the auto body permit-by-rule. There is NO adult meal or rest break statute (ORC 4109.07 is minors). The twenty-factor employee test in ORC 4123.01 is scoped by the statute to construction contracts. ORC 4513.60 and 4513.61 carry the site's own note that a Governor's veto of H.B. 434 is not reflected in the text shown (statusNote). No Ohio Department of Insurance bulletin on auto physical damage claims was found (checked 2026-09-14). H.B. 636 (an OEM-parts option mandate) was pending in committee at capture and is not law. codes.ohio.gov states no currency line: every citation carries the effective date the site prints for the section's current text, fetched from the official site at a 10-second pace despite its robots.txt by the project owner's decision.`;

const OH_SEARCH_AUTHORITY_DESCRIPTION = `Search Ohio state law for collision repair facilities: insurance claims handling (OAC 3901-1-54 — the insurer supplies its written estimate and, when the claimant's repairs will exceed it, pays the difference or names a shop that will repair for that amount and ensures workmanlike repairs if it names only one; no unreasonable travel to inspect, to get an estimate, or to repair at a specific shop; restoration to pre-loss condition when the insurer designates a shop; betterment itemized and limited to a measurable decrease in market value; the total loss replacement-vehicle and cash-value methods with sales tax reimbursement and the 35-day renegotiation right; notice before storage payments stop; the deductible in subrogation; acknowledgment within 15 days, a decision within 21 days, payment within 10 days of acceptance; OAC 3901-1-07 the general unfair claims practices — a denial must cite the provision, no compelling suit by lowballing, 21 days to reply to Department inquiries; ORC 3901.20 through 3901.22 with no private right of action; ORC 1345.81 aftermarket crash parts — every estimate identifies each part and carries the ten-point notice the customer signs; ORC 4505.11 the salvage title within thirty business days of a total loss), the shop's own obligations (OAC 109:4-3-13 — the estimate-choice form when the job exceeds fifty dollars, the posted notice, authorization before additional work of ten per cent or more of the estimate, no charge for unauthorized work, disassembly and towing charge disclosure, the itemized invoice with new/used/remanufactured and who did the work, tender of replaced parts, subcontracting disclosure; ORC 1345.02, 1345.03, 1345.09 the Consumer Sales Practices Act and its treble damages), holding and disposing of a car (ORC 4505.101 the repair garage's title route under $3,500, ORC 4513.60 the sheriff's storage order on a garage's complaint, 4513.62 disposal, 4505.104 the towing facility route, ORC 1333.41 the bailee's lien that excludes motor vehicles), employment rules (ORC 4113.15 semimonthly pay and liquidated damages of six per cent or $200 after thirty days; 4113.19 no deductions for damaged tools without an express contract; 4111.03 overtime with 4111.031's travel-time exemption; Ohio Const. art. II, § 34a the indexed minimum wage with 4111.02 and 4111.14; 4111.08 records; ORC 4123.35, 4123.74, 4123.75, 4123.77 workers' compensation and the noncomplying employer's lost defenses; 4123.90 no retaliation; 4109.07 minors' hours), and safety (ORC 4121.47 the VSSR additional award; OAC 4123:1-5-12 grinding and buffing guards, 4123:1-5-13 blocking and cribbing a lifted vehicle, 4123:1-5-16 cutting and welding, 4123:1-5-17 PPE including spray-paint eye protection and respirators, 4123:1-5-18 air contaminants; OAC 3745-31-30 the auto body permit-by-rule; 3745-21-18 refinish VOC limits in sixteen counties).

USE THIS WHEN:
- An Ohio claim issue needs the actual rule text: an estimate the car cannot be repaired for, steering or DRP pressure, betterment, aftermarket parts, total loss valuation, storage cut off, acknowledgment and decision timing, a denial with no reason, bad faith.
- A shop obligation or leverage question: the estimate form, authorization for additional work, parts return, the invoice, teardown charges, a car never picked up, deceptive practices.
- An HR question: a tech's final paycheck, wages paid late, overtime for a flat-rate tech, deductions for a comeback or a broken tool, minimum wage, records, 1099 technicians and workers' compensation.
- A safety question: a VSSR claim, grinder guards, lift blocking, welding, respirators, booth ventilation, the air permit, VOC coatings.
- You have a citation like "ORC 4505.101", "R.C. 4113.15", "OAC 3901-1-54", "Ohio Adm.Code 109:4-3-13", "Article II, Section 34a", "CSPA", "VSSR", or "Chapter 4513" and want it directly.

${OH_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment | safety), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, the effective date, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const OH_GET_AUTHORITY_DESCRIPTION = `Fetch one Ohio law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL and the effective date for a specific section, and for Revised Code sections the bill that produced the current text.

INPUT: A citation in any common form: "ORC 4505.101", "R.C. § 4113.15", "Ohio Rev. Code 1345.81", "OAC 3901-1-54", "Ohio Adm.Code 109:4-3-13", "rule 4123:1-5-17", "Ohio Const. art. II, § 34a", "Section 34a", or an id like "orc:4505.101", "oac:109:4-3-13". Bare numbers resolve by shape: a dotted number is the Revised Code, a hyphenated one the Administrative Code. This tool returns ONE section: to list a whole chapter ("Chapter 4513", "CSPA", "Chapter 3901-1", "VSSR", "Workers' Compensation Act"), pass that name to oh_search_authority instead.

OUTPUT: The full verbatim section text (subsection numbering preserved), the catchline, chapter, the effective date, topics, and citation forms — plus a statusNote when the site prints one in front of the catchline (ORC 4513.60 and 4513.61: a Governor's veto not yet reflected) — or found=false with guidance when the cite does not match.`;

const OH_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Ohio law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, steering conversation, aftermarket-parts or total-loss conversation, betterment dispute, storage follow-up, claim-delay letter, bad-faith discussion, or unclaimed-vehicle question for an Ohio claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, DRP pressure, short pay, deleted line items, lowball, aftermarket, betterment, storage, teardown) to statutory and regulatory language that never uses those words.

${OH_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const OH_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Ohio insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for an Ohio estimate dispute, short-pay, steering, aftermarket-parts, betterment, total-loss, storage, or claim-delay conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-law, employment, and safety questions belong to oh_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, the unfair and deceptive practices statutes carry no private right of action, and the pay-the-difference-or-name-a-shop duty in OAC 3901-1-54(H)(1) is the rule, not a statute.`;

const OH_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'oh',
  stateName: 'Ohio',
  sourceSiteName: 'codes.ohio.gov',
  descriptions: {
    search: OH_SEARCH_AUTHORITY_DESCRIPTION,
    get: OH_GET_AUTHORITY_DESCRIPTION,
    findSupporting: OH_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: OH_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: OH_DOMAINS,
  topics: OH_TOPICS,
  domainSchema: OhDomainSchema,
  topicSchema: OhTopicSchema,
  getInputDescription:
    'A citation such as "ORC 4505.101", "R.C. 4113.15", "OAC 3901-1-54", "Ohio Adm.Code 109:4-3-13", "rule 4123:1-5-17", or "Article II, Section 34a". Bare numbers resolve by shape (dotted is the Revised Code, hyphenated is the Administrative Code). One section per call; to list a whole chapter ("Chapter 4513", "CSPA", "VSSR", "Chapter 3901-1") use oh_search_authority.',
  identity: ohStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildOhSearchAuthorityTool(corpus: OhCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, OH_TOOLS_CONFIG);
}
export function buildOhGetAuthorityTool(corpus: OhCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, OH_TOOLS_CONFIG);
}
export function buildOhFindSupportingAuthorityTool(corpus: OhCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, OH_TOOLS_CONFIG);
}
export function buildOhBuildRebuttalPacketTool(corpus: OhCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, OH_TOOLS_CONFIG);
}

/** Register the four oh_* tools. Pair with registerOhConnectorTools. */
export function registerOhTools(server: RepairMCPServer<OhItem>, corpus: OhCorpus): void {
  registerStateTools(server, corpus, OH_TOOLS_CONFIG);
}
