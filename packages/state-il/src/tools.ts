/**
 * Illinois's four il_* tools: the descriptions (the model's routing signal)
 * plus the IL config handed to the shared builders. The KNOWN CAVEATS
 * paragraph is deliberate product surface: Illinois law's honest absences
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
import type { IlItem } from './adapter.js';
import type { IlCorpus } from './corpus.js';
import { ilStateIdentity } from './identity.js';
import { EDUCATIONAL_CAVEAT, EMPTY_SEARCH_HINT, LEGAL_ADVICE_NOTE } from './notes.js';
import { IL_DOMAINS, IlDomainSchema } from './schema.js';
import { IL_TOPICS, IlTopicSchema } from './taxonomy.js';

const IL_KNOWN_CAVEATS = `KNOWN CAVEATS, answer these honestly instead of inventing law: Illinois's improper claims practices statutes (215 ILCS 5/154.5, 154.6) carry NO private right of action and Illinois recognizes NO common-law bad faith tort (Cramer v. Insurance Exchange Agency, 174 Ill. 2d 513 (1996)) — the remedy is 215 ILCS 5/155 (attorney fees and a capped penalty for a vexatious and unreasonable delay or denial), which is first-party only; enforcement of 154.6 is the Director's under 154.7 and 154.8. There is NO statutory steering ban: 50 Ill. Adm. Code 919.80(d)(1)(B) bars requiring unreasonable travel to a recommended shop and 919.80(d)(6) requires the insurer to name a shop that will repair for its estimate or promise reimbursement in writing; nothing bars an insurer from recommending a shop; 154.6(p) and (q) require the insurer to verify a designated repairer is licensed under 625 ILCS 5/5-301 and to print the licensing notice on its estimates. There is NO labor rate rule; the paint-and-materials protection is 154.6(j), which makes an unreasonable cap or limit on paint or materials an improper claims practice. There is NO statutory total-loss percentage: 625 ILCS 5/3-117.1(b)(1) triggers on the insurer's payment of a total loss (the insurer becomes the owner and applies for the salvage certificate within 20 days, unless the car is 9 model years or older or hail-only and the owner keeps it by agreement); 919.80(c) governs the valuation and Exhibit A is the consumer notice. The Automotive Repair Act (815 ILCS 306) does NOT apply to a collision facility (306/83); the Automotive Collision Repair Act (815 ILCS 308) does. Anyone charging storage on a vehicle must send certified notice of the rate to the lienholder of record BEFORE the fees accrue or the storage fees are forfeited (770 ILCS 45/1.5 and 50/1.5) — a shop-facing trap, not an absence. Illinois OSHA (820 ILCS 219) covers public employers only; federal OSHA governs a private shop. The refinishing VOM rules (35 Ill. Adm. Code 218 and 219 Subpart HH) apply only in the Chicago area (Cook, DuPage, Kane, Lake, McHenry, and Will Counties plus Aux Sable and Goose Lake Townships in Grundy County and Oswego Township in Kendall County) and the Metro East (Madison, Monroe, and St. Clair Counties); a shop elsewhere in Illinois has no state refinish rule. The Minimum Wage Law's mechanic overtime exemption (820 ILCS 105/4a(2)(A)) reaches only a nonmanufacturing establishment primarily engaged in selling vehicles — a dealership, not an independent body shop. The Employee Classification Act (820 ILCS 185) is construction-only; a 1099 technician question is answered by 820 ILCS 305/4 and 105/3. No Illinois Department of Insurance company bulletin addresses physical-damage claims, steering, parts, storage, or total loss (all 158 bulletins checked 2026-09-15). ilga.gov states no currency line and prints some sections in more than one version; every citation carries the effective date the section's source note prints (none when the note prints none), and a section the site printed in two versions records every version and which one this corpus carries (versionNote). The text was fetched from the official site at the crawl delay its robots.txt requests.`;

const IL_SEARCH_AUTHORITY_DESCRIPTION = `Search Illinois state law for collision repair facilities: insurance claims handling (215 ILCS 5/154.6 — the improper claims practices catalog: (j) an unreasonable cap or limit on paint or materials when estimating vehicle repairs, (p) and (q) the insurer must verify a designated repairer is licensed and print the licensing notice on its estimates, (b)–(i) acknowledgment, investigation, and decision duties, (n) a denial must explain its basis; 154.7 and 154.8 the Director's enforcement; 155 attorney fees and a penalty for a vexatious and unreasonable delay; 155.29 aftermarket crash parts — no insurer may specify and no shop may install non-OEM crash parts without written disclosure, the estimate identifies each part, the maker's name on the part; 154.9 tax and title fees on a total loss; 154.10 the written explanation of a total loss determination; 424 unfair methods of competition; 50 Ill. Adm. Code 919.80 — the insurer's estimate must be reasonable and allow workmanlike repairs, and when the insured's own estimate exceeds it the insurer names a shop that will do the work for its number or gives written notice that reasonable costs above its estimate will be reimbursed; no unreasonable travel to obtain an estimate or to repair at a recommended shop; loss of use paid where liability is clear; reasonable notice before storage payments stop and all reasonable towing paid; betterment only for a measurable decrease in value, wear and rust capped at $500, itemized, and no requiring the insured to supply parts; replacement crash parts identified and of like kind and quality; a first-party collision claim unresolved 40 days requires a written explanation; total loss by replacement or cash settlement with the 30-day right of recourse, sales tax and title fees, no dealer-prep deductions; 919.50 affirm or deny within a reasonable time and pay within 30 days, a denial explained in writing; 919.40 a bona fide effort to communicate within 21 working days; 919.90 no abandoning salvage to a towing or storage yard in lieu of the charges; 919.EXHIBIT A the total loss consumer notice), the shop's own act (815 ILCS 308, the Automotive Collision Repair Act — no work over $100 without authorization after disclosure, a written estimate or price limit not exceeded by more than 10 percent without consent, parts designated new, used, rebuilt, or aftermarket, storage and administrative fees on the estimate, the teardown cost if the consumer walks, the three-signature consumer-rights statement, consent before exceeding the estimate with the phone-authorization notation, return of the car and its removed parts within 3 working days, the after-hours drop-off rule, the invoice with VIN and each major part identified, the written warranty, the posted sign, two years of records, what a consumer must pay to take the car, the lien barred for unauthorized parts or labor, the unlawful acts including a pattern of underestimating, the Consumer Fraud Act remedies; 815 ILCS 306 the Automotive Repair Act and its 306/83 exemption for collision facilities; 815 ILCS 505/2 and 10a the Consumer Fraud Act and its private action), holding and disposing of a car (770 ILCS 45 the Labor and Storage Lien Act — the lien, the 60-day lien notice, and the certified lienholder notice that must precede storage fees; 770 ILCS 50 the Small Amount Act — $2,000 or less, sale after 90 days on 30 days' notice; 625 ILCS 5/4-201 abandonment and the bailee exception; 4-214 the owner's 30-day storage liability after a tow), licensing and titles (625 ILCS 5/5-301 repairers must be licensed; 1-171.3 the definition; 3-117.1 salvage certificates on a total loss and the 9-model-year retention rule), employment rules (820 ILCS 115/3, 4 semi-monthly pay within 13 days; 115/5 final compensation by the next regular payday with earned vacation; 115/9 deductions only as required by law, for the employee's benefit, under a wage assignment, or with express written consent given freely at the time of the deduction; 56 Ill. Adm. Code 300.720, 300.820, 300.850 the six-month deduction agreement, damaged property, and required equipment rules; 115/9.5 expense reimbursement; 115/14 damages of 5 percent a month and penalties; 820 ILCS 105/4 the $15 minimum wage; 105/4a overtime over 40 with the dealership-only mechanic exemption; 105/12 treble damages; 105/3 definitions; 210.440 no daily overtime; 820 ILCS 140/3 the 20-minute meal period; 140/2 the day of rest; 140/7 penalties; 820 ILCS 192/15 paid leave; 820 ILCS 90/10 no non-compete under $75,000; 820 ILCS 305/4 workers' compensation insurance and penalties; 820 ILCS 219/15 Illinois OSHA is public-only), and the refinishing rules (35 Ill. Adm. Code 218 and 219 Subpart HH — VOM limits per coating category, the 90-percent control alternative, HVLP or electrostatic guns and enclosed gun cleaners, surface-prep limits, closed containers; 218.103 and 219.103 the counties).

USE THIS WHEN:
- An Illinois claim issue needs the actual rule text: a paint-and-materials cap, an estimate the car cannot be repaired for, steering or DRP pressure, betterment, aftermarket parts, total loss valuation, storage cut off, towing, loss of use, claim deadlines, a denial with no reason, bad faith.
- A shop obligation or leverage question: the estimate and authorization rules, the 10 percent rule, parts return, the invoice, the sign, teardown charges, a car never picked up, the lienholder notice, the repairer license, deceptive practices.
- An HR question: a tech's final paycheck, wages paid late, overtime for a flat-rate tech, deductions for a comeback or a broken tool, minimum wage, meal breaks, paid leave, a non-compete, 1099 technicians and workers' compensation.
- A booth question in the Chicago area or Metro East: VOM limits on refinish coatings, HVLP guns, gun cleaners.
- You have a citation like "215 ILCS 5/154.6", "50 Ill. Adm. Code 919.80", "815 ILCS 308/15", "770 ILCS 45/1.5", "Section 155", "Part 919", "Exhibit A", "Automotive Collision Repair Act", or "IWPCA" and want it directly.

${IL_KNOWN_CAVEATS}

INPUT: A plain-language query or a citation, optional domain (insurance | repair_law | employment | safety), optional topics, and result limit.

OUTPUT: Ranked sections with verbatim quote-safe excerpts where curated, snippets, the effective date when the source prints one, score details, and citations. Quote the text verbatim and use citation.shortForm exactly as given — never reformat it.`;

const IL_GET_AUTHORITY_DESCRIPTION = `Fetch one Illinois law section by citation, with its full verbatim text.

USE THIS WHEN:
- A citation appears in a search result, a packet, or a conversation and you need the complete section text before quoting it.
- You want the official source URL, the source note with its Public Acts, and the effective date for a specific section.

INPUT: A citation in any common form: "215 ILCS 5/154.6", "815 ILCS 308/15(b)", "50 Ill. Adm. Code 919.80", "50 IAC 919.80", "Section 154.6 of the Insurance Code", "Section 9 of the Wage Payment and Collection Act", "308/15", "154.6", "919.80", "Exhibit A", or an id like "ilcs:815-308/15", "iac:50-919.80". A bare section number resolves only when one captured section carries it ("154.6", "919.80", "3-117.1"); "15", "2", "10" and other numbers several acts share need the act. This tool returns ONE section: to list a whole act or Part ("815 ILCS 308", "Automotive Collision Repair Act", "Part 919", "IWPCA", "Labor and Storage Lien Act"), pass that name to il_search_authority instead.

OUTPUT: The full verbatim section text (subsection numbering preserved), the heading (the printed catchline, or the manifest's descriptor where Illinois prints none), the act or Part, the effective date when the source note prints one, topics, and citation forms — plus a versionNote when ilga.gov printed the section in more than one version at capture — or found=false with guidance when the cite does not match.`;

const IL_FIND_SUPPORTING_AUTHORITY_DESCRIPTION = `Find Illinois law that may support a repair claim dispute position.

USE THIS WHEN:
- Drafting an educational supplement response, short-pay rebuttal, paint-and-materials cap rebuttal, steering conversation, aftermarket-parts or total-loss conversation, betterment dispute, storage or towing follow-up, claim-delay letter, bad-faith discussion, or unclaimed-vehicle question for an Illinois claim.
- You have dispute facts in shop language and need the rules that speak to them — the matcher bridges shop vocabulary (steering, DRP pressure, short pay, deleted line items, lowball, P&M cap, aftermarket, betterment, storage, teardown) to statutory and regulatory language that never uses those words.

${IL_KNOWN_CAVEATS}

INPUT: Dispute text in the user's words, optional domain, optional topics, and result limit.

OUTPUT: Ranked sections with quote-safe excerpts, score details, and citations, plus an educational caveat. Review the verbatim text and the facts before using any authority.`;

const IL_BUILD_REBUTTAL_PACKET_DESCRIPTION = `Build an educational Illinois insurance-dispute rebuttal packet.

USE THIS WHEN:
- Preparing a careful, citation-backed issue outline for an Illinois estimate dispute, short-pay, paint-and-materials cap, steering, aftermarket-parts, betterment, total-loss, storage, towing, or claim-delay conversation with an insurer.
- You need the authorities, application notes, facts to verify, and citation short forms in one payload.

INPUT: Dispute text, optional known facts, optional topics, and result limit. Insurance domain only — repair-law, employment, and safety questions belong to il_search_authority.

OUTPUT: An educational packet: issue summary, supporting authorities with quote-safe excerpts, careful application notes, facts to verify, and a suggested citation list. This does not determine liability or provide legal advice — in particular, the improper claims practices statute carries no private right of action, Section 155 is the first-party remedy, and the name-a-shop-or-reimburse duty in 50 Ill. Adm. Code 919.80(d)(6) is the rule, not a statute.`;

const IL_TOOLS_CONFIG: StateToolsConfig = {
  prefix: 'il',
  stateName: 'Illinois',
  sourceSiteName: 'ilga.gov',
  descriptions: {
    search: IL_SEARCH_AUTHORITY_DESCRIPTION,
    get: IL_GET_AUTHORITY_DESCRIPTION,
    findSupporting: IL_FIND_SUPPORTING_AUTHORITY_DESCRIPTION,
    rebuttal: IL_BUILD_REBUTTAL_PACKET_DESCRIPTION,
  },
  domains: IL_DOMAINS,
  topics: IL_TOPICS,
  domainSchema: IlDomainSchema,
  topicSchema: IlTopicSchema,
  getInputDescription:
    'A citation such as "215 ILCS 5/154.6", "815 ILCS 308/15", "50 Ill. Adm. Code 919.80", "50 IAC 919.80", "Section 154.6 of the Insurance Code", "308/15", "154.6", "919.80", or "Exhibit A". A bare section number resolves only when one captured section carries it; numbers several acts share ("15", "2", "10") need the act. One section per call; to list a whole act or Part ("815 ILCS 308", "Automotive Collision Repair Act", "Part 919", "IWPCA") use il_search_authority.',
  identity: ilStateIdentity,
  notes: {
    legalAdviceNote: LEGAL_ADVICE_NOTE,
    educationalCaveat: EDUCATIONAL_CAVEAT,
    emptySearchHint: EMPTY_SEARCH_HINT,
  },
  rebuttalDomain: 'insurance',
};

export function buildIlSearchAuthorityTool(corpus: IlCorpus): ToolRegistrar {
  return buildSearchAuthorityTool(corpus, IL_TOOLS_CONFIG);
}
export function buildIlGetAuthorityTool(corpus: IlCorpus): ToolRegistrar {
  return buildGetAuthorityTool(corpus, IL_TOOLS_CONFIG);
}
export function buildIlFindSupportingAuthorityTool(corpus: IlCorpus): ToolRegistrar {
  return buildFindSupportingAuthorityTool(corpus, IL_TOOLS_CONFIG);
}
export function buildIlBuildRebuttalPacketTool(corpus: IlCorpus): ToolRegistrar {
  return buildRebuttalPacketTool(corpus, IL_TOOLS_CONFIG);
}

/** Register the four il_* tools. Pair with registerIlConnectorTools. */
export function registerIlTools(server: RepairMCPServer<IlItem>, corpus: IlCorpus): void {
  registerStateTools(server, corpus, IL_TOOLS_CONFIG);
}
