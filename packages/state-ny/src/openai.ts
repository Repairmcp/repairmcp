/**
 * New York's ChatGPT connector surface, with `freshness` passed — pure
 * corpus source. Descriptions carry the same honest-caveat discipline as
 * the ny_* tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { NyAdapter, NyItem } from './adapter.js';
import type { NyCorpus } from './corpus.js';
import { nyStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const NY_CONNECTOR_SEARCH_DESCRIPTION = `Search New York state law for collision repair facilities: insurance claims handling (Ins. Law 2610 no requiring or unrequested recommending of a repair shop; 2601 unfair claim settlement practices with no private right of action; 3411 physical damage provisions; Regulation 64, 11 NYCRR 216 — acknowledgment, prompt investigation, good-faith negotiation, aftermarket parts, total loss valuation, storage, third-party property damage claims; DFS guidance on steering and total loss, one withdrawn), the Motor Vehicle Repair Shop Registration Act and 15 NYCRR Part 82 (written estimates, authorization, parts return, invoices, quality repairs, the insurer-and-repair-shop rule), General Business Law 349 and 350, the bailee's lien and sale to enforce it, and employment rules (weekly pay for manual workers, deductions, wage notices, remedies, meal periods, one day of rest, call-in pay, spread of hours, minimum wage, workers' compensation and independent contractors).

USE THIS WHEN:
- A New York claim dispute needs the actual rule: acknowledgment and investigation timing, good-faith negotiation, aftermarket parts, total loss valuation, storage cut-off, third-party property damage claims, steering, bad faith
- A shop obligation or leverage question: the written estimate and authorization, parts return, invoices, quality repairs and subcontractors, the possessory lien and sale to enforce it
- An HR question: weekly pay, deductions, wage notices, meal periods, one day of rest, call-in pay, spread of hours, 1099 technicians and workers' compensation

KNOWN CAVEATS, answer these honestly instead of inventing law: Ins. Law 2601 carries no private right of action (the remedy is a DFS complaint); 2610(b)'s recommendation bar was narrowed by Allstate v. Serio (2d Cir. 2001) and Circular Letter 16 (2000) was withdrawn effective 12/4/2003 — cite OGC Opinion 04-06-03 instead; there is no standalone aftermarket crash parts statute (216.7 covers it), no statutory total-loss percentage, and no labor rate survey rule; New York has no state OSHA plan for private employers, so this corpus holds no safety domain; statutes carry the Senate site's revision date, 15 NYCRR Part 82 carries the DMV booklet edition, and Regulation 64 text comes from the Legal Information Institute's mirror because the official publisher blocks automated access.

INPUT: query — one string. Shop phrasing works ("adjuster is telling the customer to take it to their shop"); so does a citation ("Ins. Law 2610", "11 NYCRR 216.7").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const NY_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one New York law section by id, e.g. "n.y. ins. law:2610", "11 nycrr:216.7", "15 nycrr:82.5", or "dfs guidance:OGC Opinion 04-06-03".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. Statutes carry the revision date; 11 and 12 NYCRR carry an effective date; 15 NYCRR carries the DMV booklet edition; DFS guidance carries its issue date and, when withdrawn, the withdrawal date. These quote official New York text and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "N.Y. Ins. Law 2610, revised 6/23/2017", "11 NYCRR 216.7, effective 6/9/2021", "15 NYCRR 82.5, CR-82 (5/26)", or "DFS Guidance OGC Opinion 04-06-03, issued 6/8/2004". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerNyTools. */
export function registerNyConnectorTools(
  server: RepairMCPServer<NyItem>,
  adapter: NyAdapter,
  corpus: NyCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, nyStateIdentity, {
    searchDescription: NY_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: NY_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search New York law documents',
    fetchTitle: 'Fetch a New York law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
