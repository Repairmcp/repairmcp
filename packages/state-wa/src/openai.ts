/**
 * Washington's ChatGPT connector surface: the two descriptions plus the WA
 * wiring of the shared connector registration (@repairmcp/state-law), with
 * `freshness` passed — pure corpus source. The document text template is
 * shared so states cannot drift.
 */
import type { ConnectorDocument, RepairMCPServer } from '@repairmcp/core';
import { makeStateItemToDocument, registerStateConnectorTools } from '@repairmcp/state-law';
import type { WaAdapter, WaItem } from './adapter.js';
import type { WaCorpus } from './corpus.js';
import { waStateIdentity } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';
import type { WaSection } from './schema.js';

const WA_CONNECTOR_SEARCH_DESCRIPTION = `Search Washington state law for collision repair facilities: insurance claims handling (WAC 284-30 unfair claims settlement practices, RCW 48.30 including the Insurance Fair Conduct Act), auto repair law (RCW 46.71 written estimates and aftermarket-parts disclosure, repair liens), WISHA workplace safety (spray finishing, respirators, hazard communication, hexavalent chromium), and employment rules (meal and rest breaks, overtime, paid sick leave, minors).

USE THIS WHEN:
- A Washington claim dispute needs the actual rule: short pay, estimate denial, steering, labor rate, supplement, total loss valuation, storage denial
- A shop obligation question: written estimates, invoice disclosure, liens
- A safety or HR question: spray booth rules, respirators, breaks, overtime, hiring minors

INPUT: query — one string. Shop phrasing works ("insurer denying storage charges"); so does a citation ("WAC 284-30-390").

OUTPUT: results — up to 10 matches, each { id, title, text, url }. text is a short excerpt. Call fetch with an id to read the full verbatim section before quoting it.`;

const WA_CONNECTOR_FETCH_DESCRIPTION = `Retrieve one Washington law section by id, e.g. "wac:284-30-390" or "rcw:46.71.025".

USE THIS WHEN: a search hit looks relevant and you need the complete verbatim section text before citing it.

INPUT: id — from a search result.

OUTPUT: { id, title, text, url, metadata }. text is the section verbatim, subsection numbering preserved, with its citation and effective date. Law sections quote the law; they are not legal advice.

CITATION DISCIPLINE: metadata.citation carries the correct short form, e.g. "WAC 284-30-330, effective 10/30/2016". Use it verbatim — never reformat the date, never drop the cite.`;

export const waItemToDocument: (item: WaItem) => ConnectorDocument = makeStateItemToDocument<
  WaSection,
  WaItem
>(waStateIdentity, LEGAL_ADVICE_NOTE);

/** Register the two OpenAI connector tools. Pair with registerWaTools. */
export function registerWaConnectorTools(
  server: RepairMCPServer<WaItem>,
  adapter: WaAdapter,
  corpus: WaCorpus,
): void {
  registerStateConnectorTools(server, adapter, corpus, waStateIdentity, {
    searchDescription: WA_CONNECTOR_SEARCH_DESCRIPTION,
    fetchDescription: WA_CONNECTOR_FETCH_DESCRIPTION,
    searchTitle: 'Search Washington law documents',
    fetchTitle: 'Fetch a Washington law document',
    legalAdviceNote: LEGAL_ADVICE_NOTE,
  });
}
