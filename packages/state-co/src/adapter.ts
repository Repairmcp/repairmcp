/**
 * Colorado's SourceAdapter: the shared StateLawAdapter instantiated with the
 * CO identity, keeping the narrowed CoItem type flowing into
 * RepairMCPServer<CoItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { CoCorpus } from './corpus.js';
import { coStateIdentity } from './identity.js';
import type { CoDomain, CoSection } from './schema.js';

export interface CoItem extends StateLawItem<CoSection> {
  metadata: {
    kind: 'law';
    record: CoSection;
    domain: CoDomain;
    [key: string]: unknown;
  };
}

export class CoAdapter extends StateLawAdapter<CoSection, CoItem> {
  constructor(corpus: CoCorpus) {
    super(corpus, coStateIdentity);
  }
}
