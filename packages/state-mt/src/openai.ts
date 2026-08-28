/**
 * Montana's ChatGPT connector surface, with `freshness` passed — pure corpus
 * source. Descriptions carry the same honest-absence discipline as the mt_*
 * tools.
 */
import type { RepairMCPServer } from '@repairmcp/core';
import { registerStateConnectorTools } from '@repairmcp/state-law';
import type { MtAdapter, MtItem } from './adapter.js';
import type { MtCorpus } from './corpus.js';
import { mtStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

const MT_CONNECTOR_SEARCH_DESCRIPTION = `Search Montana state law for collision repair facilities: insurance claims handling (MCA Title 33 ch. 18 unfair trade practices, including the 33-18-224 body-shop steering statute with its estimating-system clause and the 33-18-242 independent cause of action), repair and consumer law (repair estimate rules under ARM 23.19, repair liens, towing, salvage titles), the Montana Safety Culture Act, and employment rules (the Wrongful Discharge From Employment Act, final paychecks, overtime, minors).

USE THIS WHEN:
- A Montana claim dispute needs the actual rule: steering, deleted estimating-system operations, short pay, supplement, prompt payment, total loss valuation, storage
- A shop obligation question: written estimates and invoices, repair liens, tow and storage duties, salvage certificates
- An HR question: discharge and probation (the WDEA), final paycheck timing, overtime, hiring minors

KNOWN ABSENCES, answer honestly: Montana has NO aftermarket crash-parts disclosure law, NO adult meal or rest break statute, and NO state technical safety standards for private shops (those are federal OSHA, outside this corpus).

INPUT: query — one string. Shop phrasing works ("adjuster deleted operations from the estimating system"); so does a citation ("MCA 33-18-224").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const MT_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Montana law section by id, e.g. "mca:33-18-224" or "arm:23.19.203".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation. ARM rules carry their effective date; MCA statutes carry the edition. Law sections quote the law; they are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "MCA 33-18-224, 2025 edition" or "ARM 6.6.1701, effective 10/28/1983". Use it verbatim — never reformat it.`;

/** Register the two OpenAI connector tools. Pair with registerMtTools. */
export function registerMtConnectorTools(
  server: RepairMCPServer<MtItem>,
  adapter: MtAdapter,
  corpus: MtCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, mtStateIdentity, {
    searchDescription: MT_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: MT_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Montana law',
    fetchTitle: 'Fetch Montana law section',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
