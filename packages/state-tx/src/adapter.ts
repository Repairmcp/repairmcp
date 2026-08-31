/**
 * Texas's SourceAdapter: the shared StateLawAdapter instantiated with the
 * TX identity, keeping the narrowed TxItem type flowing into
 * RepairMCPServer<TxItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { TxCorpus } from './corpus.js';
import { txStateIdentity } from './identity.js';
import type { TxDomain, TxSection } from './schema.js';

export interface TxItem extends StateLawItem<TxSection> {
  metadata: {
    kind: 'law';
    record: TxSection;
    domain: TxDomain;
    [key: string]: unknown;
  };
}

export class TxAdapter extends StateLawAdapter<TxSection, TxItem> {
  constructor(corpus: TxCorpus) {
    super(corpus, txStateIdentity);
  }
}
