/**
 * The state-law ChatGPT connector surface. Pure corpus sources, so
 * `freshness` goes to the core builders and every connector payload states
 * the capture cutoff. Descriptions arrive from the state config; the
 * document text template is shared so two states cannot drift.
 */
import {
  buildOpenAiFetchTool,
  buildOpenAiSearchTool,
  type ConnectorDocument,
  type RepairMCPServer,
} from '@repairmcp/core';
import type { StateLawAdapter, StateLawItem } from './adapter.js';
import type { StateLawCorpus } from './corpus.js';
import type { StateIdentity } from './identity.js';
import type { StateSection } from './schema.js';

function joinSections(parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null).join('\n\n');
}

export function makeStateItemToDocument<S extends StateSection, I extends StateLawItem<S>>(
  identity: StateIdentity,
  legalAdviceNote: string,
): (item: I) => ConnectorDocument {
  return (item: I) => {
    const section = item.metadata.record;
    const citation = identity.formatCitation(section);
    return {
      text: joinSections([
        `${identity.displayCite(section)} — ${section.heading}`,
        `Chapter ${section.chapter} ${section.code} (${section.chapterTitle}); domain: ${section.domain}`,
        section.text,
        `Citation: ${citation.shortForm}`,
        legalAdviceNote,
      ]),
      metadata: {
        citation: citation.shortForm,
        citationLong: citation.longForm,
        kind: 'law',
        cite: identity.displayCite(section),
        heading: section.heading,
        domain: section.domain,
        ...(section.effectiveDate ? { effectiveDate: section.effectiveDate } : {}),
        retrievedAt: new Date().toISOString(),
      },
    };
  };
}

export interface ConnectorToolsConfig {
  searchDescription: string;
  fetchDescription: string;
  searchTitle: string;
  fetchTitle: string;
  legalAdviceNote: string;
}

/** Register the two OpenAI connector tools. Pair with registerStateTools. */
export function registerStateConnectorTools<S extends StateSection, I extends StateLawItem<S>>(
  server: RepairMCPServer<I>,
  adapter: StateLawAdapter<S, I>,
  corpus: StateLawCorpus<S>,
  identity: StateIdentity,
  cfg: ConnectorToolsConfig,
): void {
  const freshness = corpus.freshness();
  const toDocument = makeStateItemToDocument<S, I>(identity, cfg.legalAdviceNote);
  server.registerCustomTool(
    buildOpenAiSearchTool(adapter, {
      description: cfg.searchDescription,
      title: cfg.searchTitle,
      toDocument,
      freshness,
    }),
  );
  server.registerCustomTool(
    buildOpenAiFetchTool(adapter, {
      description: cfg.fetchDescription,
      title: cfg.fetchTitle,
      toDocument,
      freshness,
    }),
  );
}
