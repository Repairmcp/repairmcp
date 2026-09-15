/**
 * Illinois's ChatGPT connector surface, with `freshness` passed — pure
 * corpus source. Descriptions carry the same honest-caveat discipline as
 * the il_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { IlAdapter, IlItem } from './adapter.js';
import type { IlCorpus } from './corpus.js';
import { ilStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const IL_CONNECTOR_SEARCH_DESCRIPTION = `Search Illinois state law for collision repair facilities: insurance claims handling (215 ILCS 5/154.6 — a paint-and-materials cap is an improper claims practice, insurers must verify a designated repairer is licensed; 50 Ill. Adm. Code 919.80 — the insurer names a shop that will repair for its estimate or promises reimbursement in writing, no unreasonable travel to a recommended shop, notice before storage payments stop, all reasonable towing paid, betterment itemized with a $500 cap on wear and rust, like-kind-and-quality crash parts, the total loss methods and the 30-day right of recourse; 919.90 no abandoning salvage to a storage yard; Section 155 attorney fees for vexatious delay; 155.29 aftermarket crash parts disclosure; 154.9 total loss tax; 154.10 the written valuation explanation), the shop's own act (815 ILCS 308 — no work over $100 without authorization, the 10 percent rule, parts designated new/used/rebuilt/aftermarket, return of removed parts, the invoice, the sign, the lien barred for unauthorized work; the Consumer Fraud Act), holding a car (the Labor and Storage Lien Acts and the certified lienholder notice that must precede storage fees), repairer licensing and salvage certificates, employment rules (semi-monthly pay, final compensation, deductions only with express written consent, the damaged-property and required-equipment rules, the $15 minimum wage, overtime, the 20-minute meal period, paid leave, the non-compete floor, workers' compensation), and the Chicago-area and Metro East refinishing VOM rules.

USE THIS WHEN:
- An Illinois claim dispute needs the actual rule: a paint-and-materials cap, an estimate the car cannot be repaired for, steering, betterment, aftermarket parts, total loss valuation, storage cut off, claim deadlines, bad faith
- A shop obligation or leverage question: the estimate and authorization rules, parts return, the invoice, a car never picked up, the lienholder notice, the repairer license
- An HR or booth question: final pay, late wages, overtime, deductions, meal breaks, paid leave, 1099 technicians and workers' compensation, VOM limits and HVLP guns in the Chicago area or Metro East

KNOWN CAVEATS, answer these honestly instead of inventing law: the improper claims practices statute carries no private right of action and Illinois has no common-law bad faith tort (Section 155 is the first-party remedy); there is no statutory steering ban (the no-unreasonable-travel and name-a-shop-or-reimburse rules are the protections); no labor rate rule (the paint-and-materials protection is 154.6(j)); no total-loss percentage (the insurer's payment triggers the salvage certificate); the Automotive Repair Act does not apply to collision facilities (the Automotive Collision Repair Act does); storage fees are forfeited without certified notice to the lienholder; Illinois OSHA is public-only; the refinishing rules apply only in the Chicago area and Metro East counties; the mechanic overtime exemption is dealership-only; the Employee Classification Act is construction-only; no Department of Insurance bulletin addresses physical-damage claims; every citation carries the effective date the source note prints, none when it prints none, and a section the site printed in two versions says so.

INPUT: query — one string. Shop phrasing works ("insurer says they only pay so much an hour for paint and materials"); so does a citation ("50 Ill. Adm. Code 919.80", "815 ILCS 308/15").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const IL_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Illinois law section by id, e.g. "ilcs:215-5/154.6", "ilcs:815-308/15", "ilcs:770-45/1.5", "ilcs:820-115/9", "iac:50-919.80", or "iac:56-300.820".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. A section carries the effective date its source note prints, and none when the note prints none (the normal case for older Public Acts). These quote official Illinois text and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "215 ILCS 5/154.6, effective 7/1/2022", "50 Ill. Adm. Code 919.80, effective 7/22/2002", "815 ILCS 308/15, effective 1/1/2004", or "215 ILCS 5/155.29" (undated). Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerIlTools. */
export function registerIlConnectorTools(
  server: RepairMCPServer<IlItem>,
  adapter: IlAdapter,
  corpus: IlCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, ilStateIdentity, {
    searchDescription: IL_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: IL_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Illinois law documents',
    fetchTitle: 'Fetch an Illinois law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
