/**
 * California's ChatGPT connector surface, with `freshness` passed — pure
 * corpus source. Descriptions carry the same honest-caveat discipline as
 * the ca_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { CaAdapter, CaItem } from './adapter.js';
import type { CaCorpus } from './corpus.js';
import { caStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const CA_CONNECTOR_SEARCH_DESCRIPTION = `Search California state law for collision repair facilities: insurance claims handling (Ins. Code 758.5 anti-steering with its written notice of the right to choose a shop, 758.6 the paint and materials anti-capping rule, the 790.03(h) unfair claims settlement practices catalog, the Fair Claims Settlement Practices Regulations at 10 CCR 2695 — 2695.5 and 2695.7 deadlines, 2695.8 automobile standards on total loss, shop choice, estimates, non-OEM parts, betterment, towing and storage, 2695.81 the labor rate survey rule, 2695.85 the Auto Body Repair Consumer Bill of Rights — insurer inspections, total loss definition and salvage duties), the Automotive Repair Act and Bureau of Automotive Repair rules (written estimates and authorization, teardown, invoices, replaced parts, the 16 CCR 3365 OEM-or-industry-specification repair standard, aftermarket crash parts, referral fees, misleading statements), the repair and storage lien and lien sale, Cal/OSHA orders (spray booths and spray coating, respirators, airborne contaminants, hazard communication, the injury and illness prevention program), and employment rules (final pay and waiting time, deductions, piece-rate rest and nonproductive time pay, meal and rest periods, overtime, expense reimbursement, commission agreements, workers' compensation, Wage Order 9).

USE THIS WHEN:
- A California claim dispute needs the actual rule: steering, the paint and materials cap, labor rate surveys, short-pay, supplement delay, response deadlines, parts choice, total loss, storage
- A shop obligation or leverage question: estimates and authorization, teardown, invoices, repair standards, holding a vehicle until paid, lien sale, BAR registration exposure
- A safety question: spray booths, respirators, isocyanates, hazard communication, the IIPP
- An HR question: final paycheck timing, deducting a comeback, flat-rate and piece-rate pay, breaks, overtime, tool reimbursement, commission plans

KNOWN CAVEATS, answer these honestly instead of inventing law: 790.03(h) and the Fair Claims regulations are enforced by the Department of Insurance, not by private lawsuit (Moradi-Shalal); California has no prompt-payment interest remedy, no statutory total-loss percentage, and no mandatory appraisal statute for auto claims; whether a flat-rate pay plan is piece-rate under Lab. Code 226.2 is a question for counsel; statute headings are editorial descriptors because California prints none; the 10 CCR and 16 CCR text and Wage Order 9 come from the Legal Information Institute's mirror of the CCR because the official publisher blocks automated access.

INPUT: query — one string. Shop phrasing works ("adjuster says the customer has to use their network shop"); so does a citation ("Ins. Code 758.5", "10 CCR 2695.8").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const CA_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one California law section by id, e.g. "cal. ins. code:758.5", "cal. bus. & prof. code:9884.9", "10 ccr:2695.8", or "8 ccr:5446".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. Sections carry the effective date their own history note states; statute headings are editorial descriptors, so quote the text, not the heading. These quote official California text (regulations via the LII mirror) and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "Cal. Ins. Code 758.5, effective 1/1/2010" or "16 CCR 3365, effective 11/19/1997". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerCaTools. */
export function registerCaConnectorTools(
  server: RepairMCPServer<CaItem>,
  adapter: CaAdapter,
  corpus: CaCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, caStateIdentity, {
    searchDescription: CA_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: CA_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search California law documents',
    fetchTitle: 'Fetch a California law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
