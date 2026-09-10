/**
 * New York's SourceAdapter: the shared StateLawAdapter instantiated with the
 * NY identity, keeping the narrowed NyItem type flowing into
 * RepairMCPServer<NyItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { NyCorpus } from './corpus.js';
import { nyStateIdentity } from './identity.js';
import type { NyDomain, NySection } from './schema.js';

export interface NyItem extends StateLawItem<NySection> {
  metadata: {
    kind: 'law';
    record: NySection;
    domain: NyDomain;
    [key: string]: unknown;
  };
}

export class NyAdapter extends StateLawAdapter<NySection, NyItem> {
  constructor(corpus: NyCorpus) {
    super(corpus, nyStateIdentity);
  }
}
