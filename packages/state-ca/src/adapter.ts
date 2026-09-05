/**
 * California's SourceAdapter: the shared StateLawAdapter instantiated with
 * the CA identity, keeping the narrowed CaItem type flowing into
 * RepairMCPServer<CaItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { CaCorpus } from './corpus.js';
import { caStateIdentity } from './identity.js';
import type { CaDomain, CaSection } from './schema.js';

export interface CaItem extends StateLawItem<CaSection> {
  metadata: {
    kind: 'law';
    record: CaSection;
    domain: CaDomain;
    [key: string]: unknown;
  };
}

export class CaAdapter extends StateLawAdapter<CaSection, CaItem> {
  constructor(corpus: CaCorpus) {
    super(corpus, caStateIdentity);
  }
}
