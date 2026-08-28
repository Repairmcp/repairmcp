/**
 * Montana's SourceAdapter: the shared StateLawAdapter instantiated with the
 * MT identity, keeping the narrowed MtItem type flowing into
 * RepairMCPServer<MtItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { MtCorpus } from './corpus.js';
import { mtStateIdentity } from './identity.js';
import type { MtDomain, MtSection } from './schema.js';

export interface MtItem extends StateLawItem<MtSection> {
  metadata: {
    kind: 'law';
    record: MtSection;
    domain: MtDomain;
    [key: string]: unknown;
  };
}

export class MtAdapter extends StateLawAdapter<MtSection, MtItem> {
  constructor(corpus: MtCorpus) {
    super(corpus, mtStateIdentity);
  }
}
