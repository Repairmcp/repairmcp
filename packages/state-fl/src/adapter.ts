/**
 * Florida's SourceAdapter: the shared StateLawAdapter instantiated with the
 * FL identity, keeping the narrowed FlItem type flowing into
 * RepairMCPServer<FlItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { FlCorpus } from './corpus.js';
import { flStateIdentity } from './identity.js';
import type { FlDomain, FlSection } from './schema.js';

export interface FlItem extends StateLawItem<FlSection> {
  metadata: {
    kind: 'law';
    record: FlSection;
    domain: FlDomain;
    [key: string]: unknown;
  };
}

export class FlAdapter extends StateLawAdapter<FlSection, FlItem> {
  constructor(corpus: FlCorpus) {
    super(corpus, flStateIdentity);
  }
}
