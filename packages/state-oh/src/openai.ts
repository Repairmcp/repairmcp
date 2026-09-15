/**
 * Ohio's ChatGPT connector surface, with `freshness` passed — pure corpus
 * source. Descriptions carry the same honest-caveat discipline as the
 * oh_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { OhAdapter, OhItem } from './adapter.js';
import type { OhCorpus } from './corpus.js';
import { ohStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const OH_CONNECTOR_SEARCH_DESCRIPTION = `Search Ohio state law for collision repair facilities: insurance claims handling (OAC 3901-1-54 — the insurer pays the difference or names a shop that will repair for its written estimate, no unreasonable travel to a specific shop, restoration to pre-loss condition when the insurer designates a shop, itemized betterment, the total loss valuation methods, notice before storage payments stop, 15-day acknowledgment and 21-day decision deadlines; OAC 3901-1-07 the general unfair claims practices; ORC 1345.81 aftermarket crash parts disclosure; ORC 4505.11 salvage titles), the shop's own obligations (OAC 109:4-3-13 the estimate form, authorization for additional work of ten per cent or more, no charge for unauthorized work, parts return, the itemized invoice; the Consumer Sales Practices Act), holding and disposing of a car (ORC 4505.101 the title route under $3,500, ORC 4513.60 the sheriff's storage order on a garage's complaint), employment rules (semimonthly pay and liquidated damages, no deductions for damaged tools without a contract, overtime, the constitutional minimum wage, workers' compensation), and safety (the VSSR statute, the BWC specific safety requirements, the auto body permit-by-rule).

USE THIS WHEN:
- An Ohio claim dispute needs the actual rule: an estimate the car cannot be repaired for, steering, betterment, aftermarket parts, total loss valuation, storage cut off, claim deadlines, bad faith
- A shop obligation or leverage question: the estimate form, authorization, parts return, the invoice, a car never picked up
- An HR or safety question: final pay, late wages, overtime, deductions, 1099 technicians and workers' compensation, a VSSR claim, respirators, the booth permit

KNOWN CAVEATS, answer these honestly instead of inventing law: the unfair and deceptive practices statutes carry no private right of action (bad faith is common law); there is no statutory steering ban (the rule's pay-the-difference-or-name-a-shop and no-unreasonable-travel duties are the protections); no labor rate or paint-and-materials rule; no total-loss percentage; no statutory garage keeper's lien for motor vehicles (the title route under $3,500 and the sheriff's storage order are the routes); no body shop licensing; no state OSHA plan for private employers (the BWC rules are enforced through the VSSR award); no adult break statute; the refinish VOC rule applies only in sixteen counties; ORC 4513.60 and 4513.61 carry the site's note that a Governor's veto is not reflected; every citation carries the effective date the site prints.

INPUT: query — one string. Shop phrasing works ("insurer wrote it for 20 hours and I can't repair it for that"); so does a citation ("OAC 3901-1-54", "ORC 4505.101").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const OH_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Ohio law section by id, e.g. "orc:4505.101", "oac:3901-1-54", "oac:109:4-3-13", "orc:4113.15", or "ohio const.:art. II, § 34a".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. Every section carries the effective date codes.ohio.gov prints for its current text. These quote official Ohio text and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "OAC 3901-1-54, effective 2/14/2022", "ORC 4505.101, effective 4/7/2023", "OAC 109:4-3-13, effective 3/21/2026", or "Ohio Const. art. II, § 34a, effective 12/8/2006". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerOhTools. */
export function registerOhConnectorTools(
  server: RepairMCPServer<OhItem>,
  adapter: OhAdapter,
  corpus: OhCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, ohStateIdentity, {
    searchDescription: OH_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: OH_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Ohio law documents',
    fetchTitle: 'Fetch an Ohio law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
