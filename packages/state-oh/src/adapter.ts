/**
 * Ohio's SourceAdapter: the shared StateLawAdapter instantiated with the OH
 * identity, keeping the narrowed OhItem type flowing into
 * RepairMCPServer<OhItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { OhCorpus } from './corpus.js';
import { ohStateIdentity } from './identity.js';
import type { OhDomain, OhSection } from './schema.js';

export interface OhItem extends StateLawItem<OhSection> {
  metadata: {
    kind: 'law';
    record: OhSection;
    domain: OhDomain;
    [key: string]: unknown;
  };
}

export class OhAdapter extends StateLawAdapter<OhSection, OhItem> {
  constructor(corpus: OhCorpus) {
    super(corpus, ohStateIdentity);
  }
}
