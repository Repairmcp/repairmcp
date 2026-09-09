/**
 * Florida's ChatGPT connector surface, with `freshness` passed — pure
 * corpus source. Descriptions carry the same honest-caveat discipline as
 * the fl_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { FlAdapter, FlItem } from './adapter.js';
import type { FlCorpus } from './corpus.js';
import { flStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const FL_CONNECTOR_SEARCH_DESCRIPTION = `Search Florida state law for collision repair facilities: insurance claims handling (Fla. Stat. 626.9743 motor vehicle claim settlement practices — parts at least equivalent in kind and quality, restoration to pre-loss condition when the insurer requires a shop, a copy of the estimate, 72 hours' notice before storage payments stop, total loss valuation methods and itemized deductions; 624.155 the civil remedy for bad faith with its 60-day notice; the 626.9541(1)(i) unfair claim settlement practices catalog; 627.4265 payment of a settlement within 20 days; 319.30 the 80 percent total loss threshold; the adjuster code of ethics at Fla. Admin. Code 69B-220.201 and the prompt-investigation standards at 69O-166.024), the Florida Motor Vehicle Repair Act (written estimates and the disclosure statement, charges over the estimate, holding the vehicle, invoices, records, the possessory lien and the release bond, unlawful acts and remedies, registration), the labor lien and vehicle sale, towing and storage liens, aftermarket crash parts disclosure, the Deceptive and Unfair Trade Practices Act, and employment rules (minimum wage, the ten-hour day, unpaid wage fees, E-Verify, the whistleblower act, workers' compensation and independent contractors, stop-work orders).

USE THIS WHEN:
- A Florida claim dispute needs the actual rule: parts quality, shop choice and the restoration duty, total loss and the 80 percent test, storage cut-off, the estimate copy, settlement payment timing, bad faith, adjuster conduct
- A shop obligation or leverage question: the written estimate and disclosure, charges over the estimate, holding the vehicle, invoices, the possessory lien and bond, selling an unclaimed vehicle, towing and storage charges, registration exposure
- An HR question: minimum wage, unpaid wages, E-Verify, retaliation, 1099 technicians and workers' compensation, stop-work orders

KNOWN CAVEATS, answer these honestly instead of inventing law: Florida has no anti-steering statute in the California or Texas sense (626.9743 governs what an insurer that requires a shop owes; 69B-220.201 bars an adjuster from steering for consideration); Florida HAS a statutory private right of action for bad faith (624.155, after the 60-day notice); there is no labor rate statute, no paint and materials rule, and no prompt-payment deadline on an open claim (627.4265's 20 days and 12 percent interest run only from a written settlement agreement); 627.70131 is a property-insurance section; there is no state OSHA plan, no final-paycheck statute, and no state break or overtime law; statute citations carry the annual edition because Florida prints no per-section effective dates.

INPUT: query — one string. Shop phrasing works ("insurer says the customer has to use their shop"); so does a citation ("Fla. Stat. 626.9743", "Rule 69B-220.201").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const FL_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Florida law section by id, e.g. "fla. stat.:626.9743", "fla. stat.:559.905", or "fla. admin. code:69B-220.201".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. Statutes carry the annual edition (Florida prints no per-section effective dates); rules carry the effective date their card states. These quote official Florida text and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "Fla. Stat. 626.9743, 2026 edition" or "Fla. Admin. Code 69B-220.201, effective 4/21/2025". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerFlTools. */
export function registerFlConnectorTools(
  server: RepairMCPServer<FlItem>,
  adapter: FlAdapter,
  corpus: FlCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, flStateIdentity, {
    searchDescription: FL_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: FL_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Florida law documents',
    fetchTitle: 'Fetch a Florida law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
