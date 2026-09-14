/**
 * Pennsylvania's ChatGPT connector surface, with `freshness` passed — pure
 * corpus source. Descriptions carry the same honest-caveat discipline as
 * the pa_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { PaAdapter, PaItem } from './adapter.js';
import type { PaCorpus } from './corpus.js';
import { paStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const PA_CONNECTOR_SEARCH_DESCRIPTION = `Search Pennsylvania state law for collision repair facilities: insurance claims handling (31 Pa. Code 62.3 — the appraiser may not name a shop without disclosing there is no requirement to use it, reviews the appraisal with the shop the consumer chose, discloses aftermarket crash parts, applies the total loss formula; 63 P.S. 861 no requiring repairs at a specified shop and inspection within six working days; 31 Pa. Code 146.5 through 146.8 — acknowledgment, investigation, acceptance or denial deadlines, and the automobile settlement standards including an appraisal the car can actually be repaired for, documented betterment, restoration to pre-loss condition; the Unfair Insurance Practices Act; 42 Pa.C.S. 8371 bad faith; salvage certificates), the shop's own obligations (37 Pa. Code 301.5 written authorization, parts return, storage-charge posting, the itemized invoice; the Consumer Protection Law), the abandoned-vehicle chapter (the garage keeper's 15-day report, notice, costs, sale), and employment rules (final paycheck, liquidated damages on late wages, minimum wage and overtime, authorized deductions, workers' compensation).

USE THIS WHEN:
- A Pennsylvania claim dispute needs the actual rule: steering or a named shop, an appraisal too low to repair, betterment, aftermarket parts, total loss valuation, claim deadlines, a third-party claimant pushed onto their own policy, bad faith
- A shop obligation or leverage question: written authorization, parts return, storage charges, the invoice, a car never picked up
- An HR question: final pay, late wages, overtime, deductions, 1099 technicians and workers' compensation

KNOWN CAVEATS, answer these honestly instead of inventing law: the Unfair Insurance Practices Act carries no private right of action (the bad-faith remedy is 42 Pa.C.S. 8371 and it belongs to the insured, not a third-party claimant); there is no labor rate or paint-and-materials rule; aftermarket parts disclosure lives in 31 Pa. Code 62.3, not a standalone statute; total loss is a formula, not a percentage; there is no usable statutory garagekeeper's lien (the abandoned-vehicle chapter is the statutory route); Pennsylvania licenses appraisers, not shops; there is no state OSHA plan for private employers and no adult break statute; statute citations carry a computed effective date (consolidated) or the amending act's approval date (P.S., "amended" or "enacted"), and Pennsylvania Code citations carry the Source-note effective date or none.

INPUT: query — one string. Shop phrasing works ("the adjuster told my customer to take it to their DRP shop"); so does a citation ("31 Pa. Code 62.3", "63 P.S. 861").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const PA_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Pennsylvania law section by id, e.g. "31 pa. code:62.3", "63 p.s.:861", "42 pa.c.s.:8371", "43 p.s.:260.5", or "37 pa. code:301.5".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. Consolidated statutes and the Pennsylvania Code carry an effective date (silence when the source states none); P.S. sections carry the amending act's approval date ("amended") or the act's own date ("enacted"). These quote official Pennsylvania text and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "31 Pa. Code 62.3, effective 10/23/1999", "42 Pa.C.S. 8371, effective 7/1/1990", "43 P.S. 260.5, amended 7/14/1977", "63 P.S. 851, enacted 12/29/1972", or "37 Pa. Code 301.5". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerPaTools. */
export function registerPaConnectorTools(
  server: RepairMCPServer<PaItem>,
  adapter: PaAdapter,
  corpus: PaCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, paStateIdentity, {
    searchDescription: PA_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: PA_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Pennsylvania law documents',
    fetchTitle: 'Fetch a Pennsylvania law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
