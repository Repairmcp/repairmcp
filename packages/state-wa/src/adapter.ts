/**
 * Washington's SourceAdapter: the shared StateLawAdapter
 * (@repairmcp/state-law) instantiated with the WA identity, keeping the
 * narrowed WaItem type flowing into RepairMCPServer<WaItem>. Stays a CLASS —
 * the Worker news it up. The four wa_* tools do NOT go through this adapter;
 * it exists so core's connector builders work unchanged.
 */
import { StateLawAdapter, type StateLawItem } from '@repairmcp/state-law';
import type { WaCorpus } from './corpus.js';
import { waStateIdentity } from './identity.js';
import type { WaDomain, WaSection } from './schema.js';

export interface WaItem extends StateLawItem<WaSection> {
  metadata: {
    kind: 'law';
    record: WaSection;
    domain: WaDomain;
    [key: string]: unknown;
  };
}

export class WaAdapter extends StateLawAdapter<WaSection, WaItem> {
  constructor(corpus: WaCorpus) {
    super(corpus, waStateIdentity);
  }
}
