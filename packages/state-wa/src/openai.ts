/**
 * The WA ChatGPT connector surface: `search` and `fetch`.
 *
 * Unlike NHTSA (mixed live/corpus, which deliberately passes no freshness),
 * this is a PURE corpus source, so `freshness` goes to the core builders and
 * every connector payload states the capture cutoff — the same discipline as
 * DEG. ChatGPT never sees a `citation` object, so citation.shortForm rides in
 * fetch metadata and the description says to use it verbatim.
 */
import {
  buildOpenAiFetchTool,
  buildOpenAiSearchTool,
  type ConnectorDocument,
  type RepairMCPServer,
} from '@repairmcp/core';
import type { WaAdapter, WaItem } from './adapter.js';
import type { WaCorpus } from './corpus.js';
import { displayCite, formatWaCitation } from './identity.js';
import { LEGAL_ADVICE_NOTE } from './notes.js';

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

function joinSections(parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null).join('\n\n');
}

export function waItemToDocument(item: WaItem): ConnectorDocument {
  const section = item.metadata.record;
  const citation = formatWaCitation(section);
  return {
    text: joinSections([
      `${displayCite(section)} — ${section.heading}`,
      `Chapter ${section.chapter} ${section.code} (${section.chapterTitle}); domain: ${section.domain}`,
      section.text,
      `Citation: ${citation.shortForm}`,
      LEGAL_ADVICE_NOTE,
    ]),
    metadata: {
      citation: citation.shortForm,
      citationLong: citation.longForm,
      kind: 'law',
      cite: displayCite(section),
      heading: section.heading,
      domain: section.domain,
      ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
      retrievedAt: new Date().toISOString(),
    },
  };
}

/** Register the two OpenAI connector tools. Pair with registerWaTools. */
export function registerWaConnectorTools(
  server: RepairMCPServer<WaItem>,
  adapter: WaAdapter,
  corpus: WaCorpus,
): void {
  const freshness = corpus.freshness();
  server.registerCustomTool(
    buildOpenAiSearchTool(adapter, {
      description: WA_CONNECTOR_SEARCH_DESCRIPTION,
      title: 'Search Washington law',
      toDocument: waItemToDocument,
      freshness,
    }),
  );
  server.registerCustomTool(
    buildOpenAiFetchTool(adapter, {
      description: WA_CONNECTOR_FETCH_DESCRIPTION,
      title: 'Fetch Washington law section',
      toDocument: waItemToDocument,
      freshness,
    }),
  );
}
