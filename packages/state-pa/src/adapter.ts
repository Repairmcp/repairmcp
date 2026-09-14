/**
 * Pennsylvania's SourceAdapter: the shared StateLawAdapter instantiated with
 * the PA identity, keeping the narrowed PaItem type flowing into
 * RepairMCPServer<PaItem>. Stays a CLASS — the Worker news it up.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { PaCorpus } from './corpus.js';
import { paStateIdentity } from './identity.js';
import type { PaDomain, PaSection } from './schema.js';

export interface PaItem extends StateLawItem<PaSection> {
  metadata: {
    kind: 'law';
    record: PaSection;
    domain: PaDomain;
    [key: string]: unknown;
  };
}

export class PaAdapter extends StateLawAdapter<PaSection, PaItem> {
  constructor(corpus: PaCorpus) {
    super(corpus, paStateIdentity);
  }
}
