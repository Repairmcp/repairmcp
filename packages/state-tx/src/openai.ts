/**
 * Texas's ChatGPT connector surface, with `freshness` passed — pure corpus
 * source. Descriptions carry the same honest-caveat discipline as the tx_*
 * tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { TxAdapter, TxItem } from './adapter.js';
import type { TxCorpus } from './corpus.js';
import { txStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const TX_CONNECTOR_SEARCH_DESCRIPTION = `Search Texas state law for collision repair facilities: insurance claims handling (Tex. Ins. Code ch. 1952 subch. G anti-steering and parts/facility choice, ch. 1813 mandatory appraisal for 2026+ personal auto policies, ch. 542 prompt payment with the claim + 18% interest + attorney fees remedy, the 541.060 unfair settlement practices catalog and 541.151 private action, 28 TAC 5.501 and 21.203, TDI steering Bulletins B-0031-10 and B-0026-11), vehicle storage facility law (Occ. Code ch. 2303), the possessory repair lien (Prop. Code ch. 70), the DTPA, salvage-vehicle definitions (Transp. Code 501.091), and employment rules (the Payday Law and minimum wage).

USE THIS WHEN:
- A Texas claim dispute needs the actual rule: steering, short-pay, appraisal, supplement delay, prompt payment, parts choice, total loss, storage
- A shop obligation or leverage question: holding a vehicle until paid, selling an abandoned vehicle, storage notices and charges
- An HR question: final paycheck timing, flag-hour commission pay, payroll deductions, wage claims, minimum wage

KNOWN CAVEATS, answer these honestly instead of inventing law: the ch. 542 deadlines and 18% remedy are FIRST-party only; third-party claimants lack a 541.151 action under Texas case law (a question for counsel); ch. 1813 appraisal applies to personal auto policies delivered, issued, or renewed on or after January 1, 2026 and never to commercial auto or TWIA; Texas does not license body shops; Texas has no state OSHA plan (federal OSHA governs spray booths and respirators), no state overtime law, and no meal or rest break law; no TDI bulletin names OEM repair procedures.

INPUT: query — one string. Shop phrasing works ("adjuster says the customer has to use their network shop"); so does a citation ("Tex. Ins. Code 1952.301").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const TX_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Texas law section by id, e.g. "tex. ins. code:1952.301" or "28 tac:5.501".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. Sections carry the effective date their own source states; TDI bulletins carry their issue date and are Department guidance, not law. These quote official Texas text and are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "Tex. Ins. Code 1952.301, effective 4/1/2007" or "TDI Bulletin B-0031-10, issued 8/2/2010". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerTxTools. */
export function registerTxConnectorTools(
  server: RepairMCPServer<TxItem>,
  adapter: TxAdapter,
  corpus: TxCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, txStateIdentity, {
    searchDescription: TX_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: TX_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Texas law documents',
    fetchTitle: 'Fetch a Texas law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
