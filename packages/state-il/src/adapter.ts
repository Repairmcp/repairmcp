/**
 * Illinois's SourceAdapter: the shared StateLawAdapter instantiated with the
 * IL identity, keeping the narrowed IlItem type flowing into
 * RepairMCPServer<IlItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { IlCorpus } from './corpus.js';
import { ilStateIdentity } from './identity.js';
import type { IlDomain, IlSection } from './schema.js';

export interface IlItem extends StateLawItem<IlSection> {
  metadata: {
    kind: 'law';
    record: IlSection;
    domain: IlDomain;
    [key: string]: unknown;
  };
}

export class IlAdapter extends StateLawAdapter<IlSection, IlItem> {
  constructor(corpus: IlCorpus) {
    super(corpus, ilStateIdentity);
  }
}
